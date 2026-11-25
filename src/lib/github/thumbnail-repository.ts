import 'server-only';
import { createHash, createSign } from 'node:crypto';

export const GITHUB_THUMBNAIL_ENV_NAMES = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_REPOSITORY_OWNER',
  'GITHUB_REPOSITORY_NAME',
  'GITHUB_DEPLOYMENT_BRANCH',
] as const;

export type GitHubThumbnailConfig = {
  appId: string;
  privateKey: string;
  installationId: string;
  owner: string;
  repository: string;
  branch: string;
};

export type GitHubThumbnailConfigResult =
  | { config: GitHubThumbnailConfig; missing: [] }
  | { config: null; missing: string[] };

export type GitHubIntegrationErrorCode =
  | 'configuration'
  | 'authentication'
  | 'network'
  | 'request'
  | 'file_exists'
  | 'branch_conflict'
  | 'content_mismatch'
  | 'not_created'
  | 'outcome_unknown';

export class GitHubIntegrationError extends Error {
  constructor(
    readonly code: GitHubIntegrationErrorCode,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'GitHubIntegrationError';
  }
}

function isValidBranch(branch: string) {
  return branch.split('/').every((part) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)
    && !part.endsWith('.lock')
    && part !== '.'
    && part !== '..',
  );
}

export function getGitHubThumbnailConfig(
  env: Record<string, string | undefined> = process.env,
): GitHubThumbnailConfigResult {
  const missing = GITHUB_THUMBNAIL_ENV_NAMES.filter((name) => !env[name]?.trim());
  if (missing.length) return { config: null, missing: [...missing] };

  const appId = env.GITHUB_APP_ID!.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY!;
  const installationId = env.GITHUB_APP_INSTALLATION_ID!.trim();
  const owner = env.GITHUB_REPOSITORY_OWNER!.trim();
  const repository = env.GITHUB_REPOSITORY_NAME!.trim();
  const branch = env.GITHUB_DEPLOYMENT_BRANCH!.trim();
  if (
    !/^\d+$/.test(appId)
    || !/^\d+$/.test(installationId)
    || !/^[A-Za-z0-9-]+$/.test(owner)
    || !/^[A-Za-z0-9._-]+$/.test(repository)
    || !isValidBranch(branch)
  ) {
    throw new GitHubIntegrationError('configuration');
  }

  return {
    config: { appId, privateKey, installationId, owner, repository, branch },
    missing: [],
  };
}

export function buildThumbnailRepositoryPath(projectId: string, contentHash: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(projectId) || !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new GitHubIntegrationError('configuration');
  }
  return `public/thumbnails/${projectId.toLowerCase()}-${contentHash}.webp`;
}

function createAppJwt(config: GitHubThumbnailConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: config.appId })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  try {
    const privateKey = config.privateKey.replace(/\\n/g, '\n').trim();
    return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
  } catch {
    throw new GitHubIntegrationError('configuration');
  }
}

type GitHubJson = { token?: unknown; sha?: unknown };

export class GitHubThumbnailRepository {
  private installationToken: Promise<string> | null = null;

  constructor(
    private readonly config: GitHubThumbnailConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(url: string, init: RequestInit) {
    try {
      return await this.fetcher(url, init);
    } catch {
      throw new GitHubIntegrationError('network');
    }
  }

  private async getInstallationToken() {
    if (this.installationToken) return this.installationToken;
    this.installationToken = (async () => {
      const response = await this.request(
        `https://api.github.com/app/installations/${encodeURIComponent(this.config.installationId)}/access_tokens`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${createAppJwt(this.config)}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            repositories: [this.config.repository],
            permissions: { contents: 'write' },
          }),
        },
      );
      if (!response.ok) {
        throw new GitHubIntegrationError(
          response.status === 401 || response.status === 403 ? 'authentication' : 'request',
          response.status,
        );
      }
      let payload: GitHubJson;
      try {
        payload = await response.json() as GitHubJson;
      } catch {
        throw new GitHubIntegrationError('authentication', response.status);
      }
      if (typeof payload.token !== 'string' || !payload.token) {
        throw new GitHubIntegrationError('authentication', response.status);
      }
      return payload.token;
    })();
    return this.installationToken;
  }

  private contentsUrl(path: string) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}/contents/${encodedPath}`;
  }

  private async getFileSha(path: string, token: string) {
    const response = await this.request(
      `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.config.branch)}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new GitHubIntegrationError('request', response.status);
    let payload: GitHubJson;
    try {
      payload = await response.json() as GitHubJson;
    } catch {
      throw new GitHubIntegrationError('request', response.status);
    }
    if (typeof payload.sha !== 'string' || !payload.sha) {
      throw new GitHubIntegrationError('request', response.status);
    }
    return payload.sha;
  }

  private async getFileContentHash(path: string, token: string, expectedHash: string) {
    const response = await this.request(
      `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.config.branch)}`,
      {
        headers: {
          Accept: 'application/vnd.github.raw+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (response.status === 404) return 'missing' as const;
    if (!response.ok) throw new GitHubIntegrationError('request', response.status);

    let bytes: ArrayBuffer;
    try {
      bytes = await response.arrayBuffer();
    } catch {
      throw new GitHubIntegrationError('network');
    }
    const actualHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
    return actualHash === expectedHash ? 'matches' as const : 'mismatch' as const;
  }

  private async reconcileAmbiguousCreate(path: string, token: string, contentHash: string) {
    let state: 'missing' | 'matches' | 'mismatch';
    try {
      state = await this.getFileContentHash(path, token, contentHash);
    } catch {
      throw new GitHubIntegrationError('outcome_unknown');
    }
    if (state === 'matches') return;
    if (state === 'missing') throw new GitHubIntegrationError('not_created');
    throw new GitHubIntegrationError('file_exists', 409);
  }

  async createThumbnail(projectId: string, contentHash: string, bytes: Buffer) {
    const path = buildThumbnailRepositoryPath(projectId, contentHash);
    if (createHash('sha256').update(bytes).digest('hex') !== contentHash) {
      throw new GitHubIntegrationError('content_mismatch');
    }
    const token = await this.getInstallationToken();
    const existing = await this.getFileContentHash(path, token, contentHash);
    if (existing === 'matches') {
      return {
        repositoryPath: path,
        publicPath: `/${path.replace(/^public\//, '')}`,
        created: false,
      };
    }
    if (existing === 'mismatch') throw new GitHubIntegrationError('file_exists', 409);

    let response: Response;
    try {
      response = await this.request(this.contentsUrl(path), {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add thumbnail for project ${projectId}`,
          content: bytes.toString('base64'),
          branch: this.config.branch,
        }),
      });
    } catch (error) {
      if (error instanceof GitHubIntegrationError && error.code === 'network') {
        await this.reconcileAmbiguousCreate(path, token, contentHash);
        return {
          repositoryPath: path,
          publicPath: `/${path.replace(/^public\//, '')}`,
          created: false,
        };
      }
      throw error;
    }
    if (response.status >= 500) {
      await this.reconcileAmbiguousCreate(path, token, contentHash);
      return {
        repositoryPath: path,
        publicPath: `/${path.replace(/^public\//, '')}`,
        created: false,
      };
    }
    if (!response.ok) {
      throw new GitHubIntegrationError(
        response.status === 409 || response.status === 422 ? 'branch_conflict' : 'request',
        response.status,
      );
    }
    return {
      repositoryPath: path,
      publicPath: `/${path.replace(/^public\//, '')}`,
      created: true,
    };
  }

  async deleteThumbnail(projectId: string, publicPath: string) {
    const expectedPrefix = `/thumbnails/${projectId.toLowerCase()}-`;
    if (!publicPath.startsWith(expectedPrefix) || !/^\/thumbnails\/[0-9a-f-]{36}-[a-f0-9]{64}\.webp$/i.test(publicPath)) {
      throw new GitHubIntegrationError('configuration');
    }
    const path = `public${publicPath}`;
    const token = await this.getInstallationToken();
    const sha = await this.getFileSha(path, token);
    if (!sha) return false;

    const response = await this.request(this.contentsUrl(path), {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Remove replaced thumbnail for project ${projectId}`,
        sha,
        branch: this.config.branch,
      }),
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new GitHubIntegrationError(
        response.status === 409 || response.status === 422 ? 'branch_conflict' : 'request',
        response.status,
      );
    }
    return true;
  }
}
