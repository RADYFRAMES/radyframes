export const HERO_VIDEO_SETTING_KEY = 'homepage_hero_video';
const HERO_YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export interface HeroVideoSettings {
  enabled: boolean;
  videoUrl: string;
  posterUrl?: string;
}

export const DEFAULT_HERO_VIDEO_SETTINGS: HeroVideoSettings = {
  enabled: false,
  videoUrl: '',
};

export type HeroVideoSettingResult =
  | { state: 'missing' }
  | { state: 'valid'; settings: HeroVideoSettings }
  | { state: 'invalid' };

export function resolveHeroVideoSource(
  result: HeroVideoSettingResult,
  environmentFallback?: string,
): { videoUrl: string | undefined; posterUrl: string | undefined } {
  if (result.state === 'valid') {
    return result.settings.enabled
      ? { videoUrl: result.settings.videoUrl, posterUrl: result.settings.posterUrl }
      : { videoUrl: undefined, posterUrl: undefined };
  }
  if (result.state === 'missing') {
    return { videoUrl: environmentFallback, posterUrl: undefined };
  }
  return { videoUrl: undefined, posterUrl: undefined };
}

export function getLatestSavedAfterSave<T>(
  latestSaved: T,
  submitted: T,
  status: 'success' | 'error',
): T {
  return status === 'success' ? submitted : latestSaved;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getHeroYouTubeVideoId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (!source) return null;
  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || url.hash
    ) return null;

    let videoId: string | null = null;
    const hostname = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    if (hostname === 'youtu.be') {
      if (segments.length !== 1) return null;
      videoId = segments[0];
    } else if (hostname === 'www.youtube.com') {
      if (url.pathname === '/watch') {
        if (url.searchParams.getAll('v').length !== 1) return null;
        videoId = url.searchParams.get('v');
      } else if (segments[0] === 'embed' || segments[0] === 'shorts') {
        if (segments.length !== 2) return null;
        videoId = segments[1];
      } else {
        return null;
      }
    } else {
      return null;
    }
    return videoId && HERO_YOUTUBE_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function getHeroVideoEmbedUrl(value: unknown, origin?: string): string | null {
  const videoId = getHeroYouTubeVideoId(value);
  if (!videoId) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    controls: '1',
    mute: '1',
    enablejsapi: '1',
  });
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.protocol !== 'https:'
        && !(parsedOrigin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname))
      ) return null;
      params.set('origin', parsedOrigin.origin);
    } catch {
      return null;
    }
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function validateHeroVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (!source) return null;
  if (getHeroYouTubeVideoId(source)) return source;
  if (source.startsWith('/') && !source.startsWith('//')) {
    if (source.includes('\\') || source.includes('?') || source.includes('#')) return null;
    const normalized = source.startsWith('/public/') ? source.slice('/public'.length) : source;
    return /\.(mp4|webm)$/i.test(normalized) ? normalized : null;
  }

  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
      || !/\.(mp4|webm)$/i.test(url.pathname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function validateHeroPosterUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (!source) return null;
  if (source.startsWith('/') && !source.startsWith('//')) {
    if (source.includes('\\') || source.includes('?') || source.includes('#')) return null;
    const normalized = source.startsWith('/public/') ? source.slice('/public'.length) : source;
    return /\.(jpe?g|png|webp)$/i.test(normalized) ? normalized : null;
  }
  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
      || !/\.(jpe?g|png|webp)$/i.test(url.pathname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseHeroVideoSettings(value: unknown): HeroVideoSettings | null {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') return null;
  if (!value.enabled && typeof value.videoUrl === 'string') {
    if (value.videoUrl && !validateHeroVideoUrl(value.videoUrl)) return null;
    const videoUrl = value.videoUrl;
    if (value.posterUrl !== undefined) {
      const posterUrl = validateHeroPosterUrl(value.posterUrl);
      if (!posterUrl) return null;
      return { enabled: false, videoUrl, posterUrl };
    }
    return { enabled: false, videoUrl };
  }
  if (value.enabled) {
    const videoUrl = validateHeroVideoUrl(value.videoUrl);
    if (!videoUrl) return null;
    const posterUrl = value.posterUrl === undefined
      ? undefined
      : validateHeroPosterUrl(value.posterUrl);
    if (value.posterUrl !== undefined && !posterUrl) return null;
    return { enabled: true, videoUrl, ...(posterUrl ? { posterUrl } : {}) };
  }
  return null;
}
