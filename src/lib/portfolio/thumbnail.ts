import { getYoutubeVideoId } from './youtube';

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectThumbnailPath(path: unknown, projectId: string): path is string {
  if (typeof path !== 'string' || !projectIdPattern.test(projectId)) return false;
  const escapedId = projectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^/thumbnails/${escapedId}-[a-f0-9]{64}\\.webp$`, 'i').test(path);
}

export function isThumbnailPathColumnMissing(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return (
    (error.code === '42703' || error.code === 'PGRST204')
    && message.includes('thumbnail_path')
  ) || (
    message.includes('thumbnail_path')
    && (message.includes('does not exist') || message.includes('schema cache') || message.includes('could not find'))
  );
}

export function getProjectThumbnailSources(project: {
  id: string;
  thumbnail_path?: string | null;
  youtube_id: string | null;
  original_url: string;
}) {
  const custom = isProjectThumbnailPath(project.thumbnail_path, project.id)
    ? project.thumbnail_path
    : null;
  const parsedVideoId = getYoutubeVideoId(project.original_url);
  const youtube = parsedVideoId && parsedVideoId === project.youtube_id
    ? `https://i.ytimg.com/vi/${parsedVideoId}/hqdefault.jpg`
    : null;
  return { custom, youtube };
}
