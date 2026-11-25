import 'server-only';
import { isProjectThumbnailPath } from '@/lib/portfolio/thumbnail';

export type ThumbnailStorage = {
  createThumbnail(projectId: string, contentHash: string, bytes: Buffer): Promise<{
    publicPath: string;
    created: boolean;
  }>;
  deleteThumbnail(projectId: string, publicPath: string): Promise<boolean>;
};

export type ThumbnailUploadResult =
  | { status: 'saved'; publicPath: string }
  | { status: 'saved_with_orphan'; publicPath: string; orphanedPath: string }
  | { status: 'assignment_indeterminate'; publicPath: string }
  | { status: 'assignment_failed_retained'; publicPath: string }
  | { status: 'failed'; orphanedPath?: string };

export type ThumbnailPathSaveResult = 'saved' | 'not_saved' | 'indeterminate';

export async function reconcileThumbnailPathSave({
  previousPath,
  newPath,
  update,
  readCurrentPath,
}: {
  previousPath: string | null;
  newPath: string;
  update: () => Promise<boolean>;
  readCurrentPath: () => Promise<string | null | undefined>;
}): Promise<ThumbnailPathSaveResult> {
  try {
    if (await update()) return 'saved';
  } catch {
    // The update may have committed even if its response was lost.
  }

  try {
    const currentPath = await readCurrentPath();
    if (currentPath === newPath) return 'saved';
    if (currentPath === previousPath) return 'not_saved';
  } catch {
    return 'indeterminate';
  }
  return 'indeterminate';
}

export async function uploadAndAssignThumbnail({
  projectId,
  currentPath,
  contentHash,
  bytes,
  storage,
  savePath,
}: {
  projectId: string;
  currentPath: string | null;
  contentHash: string;
  bytes: Buffer;
  storage: ThumbnailStorage;
  savePath: (path: string) => Promise<ThumbnailPathSaveResult>;
}): Promise<ThumbnailUploadResult> {
  const { publicPath, created } = await storage.createThumbnail(projectId, contentHash, bytes);
  let saveResult: ThumbnailPathSaveResult;
  try {
    saveResult = await savePath(publicPath);
  } catch {
    saveResult = 'indeterminate';
  }

  if (saveResult === 'indeterminate') {
    return { status: 'assignment_indeterminate', publicPath };
  }

  if (saveResult === 'not_saved') {
    if (!created) return { status: 'assignment_failed_retained', publicPath };
    try {
      await storage.deleteThumbnail(projectId, publicPath);
      return { status: 'failed' };
    } catch {
      return { status: 'failed', orphanedPath: publicPath };
    }
  }

  if (currentPath && currentPath !== publicPath && isProjectThumbnailPath(currentPath, projectId)) {
    try {
      await storage.deleteThumbnail(projectId, currentPath);
    } catch {
      return { status: 'saved_with_orphan', publicPath, orphanedPath: currentPath };
    }
  }

  return { status: 'saved', publicPath };
}
