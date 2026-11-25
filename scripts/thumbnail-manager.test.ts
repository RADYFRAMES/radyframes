import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import { canManageThumbnails } from '../src/lib/auth/thumbnail-authorization';
import {
  getGitHubThumbnailConfig,
  GitHubIntegrationError,
  GitHubThumbnailRepository,
  type GitHubThumbnailConfig,
} from '../src/lib/github/thumbnail-repository';
import { getProjectThumbnailSources } from '../src/lib/portfolio/thumbnail';
import { MultipartBodyTooLargeError, withMultipartBodyLimit } from '../src/lib/thumbnails/multipart';
import {
  MAX_THUMBNAIL_UPLOAD_BYTES,
  optimizeThumbnail,
  ThumbnailValidationError,
} from '../src/lib/thumbnails/validation';
import {
  reconcileThumbnailPathSave,
  uploadAndAssignThumbnail,
  type ThumbnailStorage,
} from '../src/lib/thumbnails/upload-workflow';

const projectId = 'c2557ad6-0e61-4d58-ae9a-3bd92a61a0cc';
const githubBytes = Buffer.from('optimized image');
const contentHash = createHash('sha256').update(githubBytes).digest('hex');

function config(): GitHubThumbnailConfig {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return {
    appId: '12345',
    privateKey,
    installationId: '98765',
    owner: 'radyframes',
    repository: 'website',
    branch: 'main',
  };
}

async function imageBytes(width = 640, height = 360) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 45, g: 44, b: 42 },
    },
  }).png().toBuffer();
}

function githubTokenResponse() {
  return new Response(JSON.stringify({ token: 'mock-installation-token' }), { status: 201 });
}

function githubFileResponse(bytes: Buffer) {
  const body = new ArrayBuffer(bytes.length);
  new Uint8Array(body).set(bytes);
  return new Response(body, { status: 200 });
}

test('optimizes a signature-verified PNG into WebP', async () => {
  const result = await optimizeThumbnail(await imageBytes(), 'image/png');
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(result.width, 640);
  assert.equal(result.height, 360);
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
});

test('rejects unsupported image signatures and declared MIME mismatches', async () => {
  await assert.rejects(
    optimizeThumbnail(Buffer.from('not an image'), 'image/png'),
    (error: unknown) => error instanceof ThumbnailValidationError && error.code === 'unsupported_type',
  );
  await assert.rejects(
    optimizeThumbnail(await imageBytes(), 'image/jpeg'),
    (error: unknown) => error instanceof ThumbnailValidationError && error.code === 'mime_mismatch',
  );
  await assert.rejects(
    optimizeThumbnail(await imageBytes(), 'image/png', 'cover.jpg'),
    (error: unknown) => error instanceof ThumbnailValidationError && error.code === 'extension_mismatch',
  );
  await assert.rejects(
    optimizeThumbnail(await imageBytes(), 'image/png', 'png'),
    (error: unknown) => error instanceof ThumbnailValidationError && error.code === 'extension_mismatch',
  );
});

test('rejects oversized and undersized images before storage', async () => {
  await assert.rejects(
    optimizeThumbnail(Buffer.alloc(MAX_THUMBNAIL_UPLOAD_BYTES + 1), ''),
    (error: unknown) => error instanceof ThumbnailValidationError && error.code === 'too_large',
  );
  await assert.rejects(
    optimizeThumbnail(await imageBytes(100, 100), 'image/png'),
    (error: unknown) => error instanceof ThumbnailValidationError && error.code === 'invalid_dimensions',
  );
});

test('bounds streamed multipart request bodies before parsing', async () => {
  const allowed = new Request('https://radyframes.example/upload', {
    method: 'POST',
    body: 'small-body',
  });
  assert.equal(await withMultipartBodyLimit(allowed, 10).text(), 'small-body');

  const oversized = new Request('https://radyframes.example/upload', {
    method: 'POST',
    body: 'larger-than-limit',
  });
  await assert.rejects(
    withMultipartBodyLimit(oversized, 4).arrayBuffer(),
    (error: unknown) => error instanceof MultipartBodyTooLargeError,
  );
});

test('only super_admin passes thumbnail authorization', () => {
  assert.equal(canManageThumbnails('super_admin'), true);
  assert.equal(canManageThumbnails('editor'), false);
  assert.equal(canManageThumbnails(null), false);
});

test('reports missing GitHub configuration names without values', () => {
  const result = getGitHubThumbnailConfig({});
  assert.equal(result.config, null);
  assert.deepEqual(result.missing, [
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_APP_INSTALLATION_ID',
    'GITHUB_REPOSITORY_OWNER',
    'GITHUB_REPOSITORY_NAME',
    'GITHUB_DEPLOYMENT_BRANCH',
  ]);
});

test('refuses duplicate GitHub paths without attempting an overwrite', async () => {
  const configValue = config();
  let puts = 0;
  const repo = new GitHubThumbnailRepository(configValue, async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') puts += 1;
    return githubFileResponse(Buffer.from('different existing image'));
  });
  await assert.rejects(
    repo.createThumbnail(projectId, contentHash, githubBytes),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'file_exists',
  );
  assert.equal(puts, 0);
});

test('reuses an existing file only when its content matches the hash', async () => {
  let puts = 0;
  const repo = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') puts += 1;
    return githubFileResponse(githubBytes);
  });
  const result = await repo.createThumbnail(projectId, contentHash, githubBytes);
  assert.equal(result.publicPath, `/thumbnails/${projectId}-${contentHash}.webp`);
  assert.equal(puts, 0);
});

test('marks a confirmed GitHub create as owned by this upload', async () => {
  const repo = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') return new Response('{}', { status: 201 });
    return new Response('', { status: 404 });
  });
  const result = await repo.createThumbnail(projectId, contentHash, githubBytes);
  assert.equal(result.created, true);
});

test('surfaces GitHub authentication and branch conflicts safely', async () => {
  const authFailure = new GitHubThumbnailRepository(config(), async () =>
    new Response('{}', { status: 401 }),
  );
  await assert.rejects(
    authFailure.createThumbnail(projectId, contentHash, githubBytes),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'authentication',
  );

  const branchConflict = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') return new Response('{}', { status: 409 });
    return new Response('', { status: 404 });
  });
  await assert.rejects(
    branchConflict.createThumbnail(projectId, contentHash, githubBytes),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'branch_conflict',
  );
});

test('reconciles a lost GitHub create response when the exact file is found', async () => {
  let gets = 0;
  let puts = 0;
  const repo = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') {
      puts += 1;
      throw new TypeError('mock connection dropped after commit');
    }
    gets += 1;
    return gets === 1 ? new Response('', { status: 404 }) : githubFileResponse(githubBytes);
  });
  const result = await repo.createThumbnail(projectId, contentHash, githubBytes);
  assert.equal(result.publicPath, `/thumbnails/${projectId}-${contentHash}.webp`);
  assert.equal(puts, 1);
  assert.equal(gets, 2);
});

test('reports confirmed absence after an ambiguous GitHub create without retrying or deleting', async () => {
  let puts = 0;
  let gets = 0;
  const repo = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') {
      puts += 1;
      throw new TypeError('mock connection dropped before commit');
    }
    gets += 1;
    return new Response('', { status: 404 });
  });
  await assert.rejects(
    repo.createThumbnail(projectId, contentHash, githubBytes),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'not_created',
  );
  assert.equal(puts, 1);
  assert.equal(gets, 2);
});

test('does not accept an ambiguous GitHub create when the existing content hash differs', async () => {
  let gets = 0;
  const repo = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') throw new TypeError('mock connection dropped after commit');
    gets += 1;
    return gets === 1
      ? new Response('', { status: 404 })
      : githubFileResponse(Buffer.from('different existing content'));
  });
  await assert.rejects(
    repo.createThumbnail(projectId, contentHash, githubBytes),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'file_exists',
  );
  assert.equal(gets, 2);
});

test('retains an unknown GitHub create outcome when verification is unavailable', async () => {
  let gets = 0;
  let puts = 0;
  const repo = new GitHubThumbnailRepository(config(), async (input, init) => {
    if (String(input).includes('/access_tokens')) return githubTokenResponse();
    if (init?.method === 'PUT') {
      puts += 1;
      throw new TypeError('mock connection dropped after commit');
    }
    gets += 1;
    if (gets === 1) return new Response('', { status: 404 });
    throw new TypeError('mock verification connection failure');
  });
  await assert.rejects(
    repo.createThumbnail(projectId, contentHash, githubBytes),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'outcome_unknown',
  );
  assert.equal(puts, 1);
  assert.equal(gets, 2);
});

test('rejects a GitHub filename hash that does not match the uploaded bytes', async () => {
  const repo = new GitHubThumbnailRepository(config(), async () => {
    throw new Error('fetch must not be called for mismatched content');
  });
  await assert.rejects(
    repo.createThumbnail(projectId, contentHash, Buffer.from('different bytes')),
    (error: unknown) => error instanceof GitHubIntegrationError && error.code === 'content_mismatch',
  );
});

test('reconciles a lost Supabase update response when the new path is present', async () => {
  const nextPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const result = await reconcileThumbnailPathSave({
    previousPath: null,
    newPath: nextPath,
    update: async () => { throw new Error('mock response lost after commit'); },
    readCurrentPath: async () => nextPath,
  });
  assert.equal(result, 'saved');
});

test('cleans up only after reread confirms the Supabase update did not commit', async () => {
  const nextPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const removed: string[] = [];
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath: nextPath, created: true }),
    deleteThumbnail: async (_id, path) => { removed.push(path); return true; },
  };
  const saveResult = await reconcileThumbnailPathSave({
    previousPath: null,
    newPath: nextPath,
    update: async () => false,
    readCurrentPath: async () => null,
  });
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: null,
    contentHash,
    bytes: Buffer.from('image'),
    storage,
    savePath: async () => saveResult,
  });
  assert.deepEqual(result, { status: 'failed' });
  assert.deepEqual(removed, [nextPath]);
});

test('preserves the GitHub file when Supabase assignment state is indeterminate', async () => {
  const nextPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const removed: string[] = [];
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath: nextPath, created: true }),
    deleteThumbnail: async (_id, path) => { removed.push(path); return true; },
  };
  const saveResult = await reconcileThumbnailPathSave({
    previousPath: null,
    newPath: nextPath,
    update: async () => { throw new Error('mock response lost'); },
    readCurrentPath: async () => undefined,
  });
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: null,
    contentHash,
    bytes: Buffer.from('image'),
    storage,
    savePath: async () => saveResult,
  });
  assert.deepEqual(result, { status: 'assignment_indeterminate', publicPath: nextPath });
  assert.deepEqual(removed, []);
});

test('does not delete a verified pre-existing GitHub image after assignment failure', async () => {
  const nextPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const removed: string[] = [];
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath: nextPath, created: false }),
    deleteThumbnail: async (_id, path) => { removed.push(path); return true; },
  };
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: null,
    contentHash,
    bytes: githubBytes,
    storage,
    savePath: async () => 'not_saved',
  });
  assert.deepEqual(result, { status: 'assignment_failed_retained', publicPath: nextPath });
  assert.deepEqual(removed, []);
});

test('cleans up a new GitHub asset if the project update fails', async () => {
  const publicPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const removed: string[] = [];
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath, created: true }),
    deleteThumbnail: async (_id, path) => { removed.push(path); return true; },
  };
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: null,
    contentHash,
    bytes: Buffer.from('image'),
    storage,
    savePath: async () => 'not_saved',
  });
  assert.deepEqual(result, { status: 'failed' });
  assert.deepEqual(removed, [publicPath]);
});

test('reports the exact new-file orphan if database rollback cleanup fails', async () => {
  const publicPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath, created: true }),
    deleteThumbnail: async () => { throw new Error('mock GitHub cleanup failure'); },
  };
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: null,
    contentHash,
    bytes: Buffer.from('image'),
    storage,
    savePath: async () => 'not_saved',
  });
  assert.deepEqual(result, { status: 'failed', orphanedPath: publicPath });
});

test('reports an old-file orphan when replacement cleanup fails after a successful database update', async () => {
  const previousPath = `/thumbnails/${projectId}-${'b'.repeat(64)}.webp`;
  const nextPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath: nextPath, created: true }),
    deleteThumbnail: async () => { throw new Error('mock cleanup failure'); },
  };
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: previousPath,
    contentHash,
    bytes: Buffer.from('image'),
    storage,
    savePath: async () => 'saved',
  });
  assert.deepEqual(result, { status: 'saved_with_orphan', publicPath: nextPath, orphanedPath: previousPath });
});

test('does not report a missing old file as an orphan after replacement', async () => {
  const previousPath = `/thumbnails/${projectId}-${'b'.repeat(64)}.webp`;
  const nextPath = `/thumbnails/${projectId}-${contentHash}.webp`;
  const storage: ThumbnailStorage = {
    createThumbnail: async () => ({ publicPath: nextPath, created: true }),
    deleteThumbnail: async () => false,
  };
  const result = await uploadAndAssignThumbnail({
    projectId,
    currentPath: previousPath,
    contentHash,
    bytes: Buffer.from('image'),
    storage,
    savePath: async () => 'saved',
  });
  assert.deepEqual(result, { status: 'saved', publicPath: nextPath });
});

test('prefers a valid custom thumbnail and safely falls back to YouTube', () => {
  const project = {
    id: projectId,
    youtube_id: 'dQw4w9WgXcQ',
    original_url: 'https://youtu.be/dQw4w9WgXcQ',
    thumbnail_path: `/thumbnails/${projectId}-${contentHash}.webp`,
  };
  assert.deepEqual(getProjectThumbnailSources(project), {
    custom: project.thumbnail_path,
    youtube: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  });
  assert.equal(getProjectThumbnailSources({ ...project, thumbnail_path: '/thumbnails/../../unsafe' }).custom, null);
  assert.equal(getProjectThumbnailSources({ ...project, thumbnail_path: '/thumbnails/../../unsafe' }).youtube, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});
