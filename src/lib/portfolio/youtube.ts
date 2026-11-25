const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function getYoutubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.port) return null;
    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const id = url.hostname.endsWith('youtu.be')
      ? segments[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : ['shorts', 'embed', 'live', 'v'].includes(segments[0]) ? segments[1] : null;
    return id && VIDEO_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}
