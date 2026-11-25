export const SHOWCASE_SETTING_KEY = 'homepage_four_video_showcase';
import { getYoutubeVideoId } from './youtube';
import type { PortfolioProject } from './types';

export const SHOWCASE_ANIMATION_STYLES = [
  { value: 'cinematic-slider', label: 'Cinematic Slider' },
  { value: 'horizontal-showcase', label: 'Smooth Horizontal Showcase' },
  { value: 'staggered-reveal', label: 'Staggered Reveal' },
  { value: 'elegant-fade', label: 'Elegant Fade Transition' },
] as const;

export type ShowcaseAnimationStyle = (typeof SHOWCASE_ANIMATION_STYLES)[number]['value'];

export interface ShowcaseSettings {
  enabled: boolean;
  videoIds: string[];
  animationStyle: ShowcaseAnimationStyle;
  transitionSeconds: number;
  autoRotate: boolean;
  rotationIntervalSeconds: number;
}

export const DEFAULT_SHOWCASE_SETTINGS: ShowcaseSettings = {
  enabled: false,
  videoIds: [],
  animationStyle: 'cinematic-slider',
  transitionSeconds: 0.8,
  autoRotate: false,
  rotationIntervalSeconds: 7,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isYouTubeIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id));
}

function isAnimationStyle(value: unknown): value is ShowcaseAnimationStyle {
  return SHOWCASE_ANIMATION_STYLES.some((style) => style.value === value);
}

export function parseShowcaseSettings(value: unknown): ShowcaseSettings | null {
  if (!isRecord(value)) return null;
  const videoIds = value.videoIds;
  const animationStyle = value.animationStyle;
  const transitionSeconds = value.transitionSeconds;
  const rotationIntervalSeconds = value.rotationIntervalSeconds;

  if (
    typeof value.enabled !== 'boolean'
    || !isYouTubeIdList(videoIds)
    || videoIds.length !== 4
    || new Set(videoIds).size !== 4
    || !isAnimationStyle(animationStyle)
    || typeof transitionSeconds !== 'number'
    || !Number.isFinite(transitionSeconds)
    || transitionSeconds < 0.4
    || transitionSeconds > 2.4
    || typeof value.autoRotate !== 'boolean'
    || typeof rotationIntervalSeconds !== 'number'
    || !Number.isInteger(rotationIntervalSeconds)
    || rotationIntervalSeconds < 3
    || rotationIntervalSeconds > 30
  ) {
    return null;
  }

  return {
    enabled: value.enabled,
    videoIds,
    animationStyle,
    transitionSeconds,
    autoRotate: value.autoRotate,
    rotationIntervalSeconds,
  };
}

export function validatePublishedShowcaseSelection(
  videoIds: string[],
  projects: Pick<PortfolioProject, 'youtube_id' | 'original_url' | 'status'>[],
): boolean {
  if (videoIds.length !== 4 || new Set(videoIds).size !== 4) return false;
  const byVideoId = new Map(projects
    .filter((project) => project.youtube_id)
    .map((project) => [project.youtube_id as string, project]));
  return videoIds.every((videoId) => {
    const project = byVideoId.get(videoId);
    return Boolean(
      project
      && project.status === 'published'
      && getYoutubeVideoId(project.original_url) === videoId
    );
  });
}

export function filterPublishedShowcaseProjects(
  settings: ShowcaseSettings | null,
  projects: PortfolioProject[],
): PortfolioProject[] {
  if (!settings || settings.videoIds.length !== 4) return [];
  const byVideoId = new Map(projects.map((project) => [project.youtube_id, project]));
  const filtered = settings.videoIds
    .map((videoId) => byVideoId.get(videoId))
    .filter((project): project is PortfolioProject =>
      Boolean(
        project
        && project.status === 'published'
        && !project.metadata_conflict
        && project.youtube_id
        && getYoutubeVideoId(project.original_url) === project.youtube_id
      )
    );
  return filtered.length === 4 ? filtered : [];
}
