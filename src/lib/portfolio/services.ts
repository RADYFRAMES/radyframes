import type { PortfolioProject } from './types';

export const PORTFOLIO_SERVICES = [
  'Video Editing',
  'Motion Graphics',
  'CGI / 3D',
  'VFX',
  'Color Grading',
  'Cinematography',
  'Short Films',
  'Feature Films',
  'Showreels',
] as const;

export type PortfolioService = (typeof PORTFOLIO_SERVICES)[number];

export function isUncategorizedCategory(category: string | null): boolean {
  return !category?.trim() || category.trim().toLocaleLowerCase() === 'uncategorized';
}

const serviceTerms: Record<Exclude<PortfolioService, 'Short Films'>, RegExp> = {
  'Video Editing': /\b(?:video\s+)?edit(?:ing|ed|or)?\b/i,
  'Motion Graphics': /\b(?:motion\s+graphics?|motion\s+design)\b/i,
  'CGI / 3D': /\b(?:cgi|3d|computer[- ]generated)\b/i,
  VFX: /\b(?:vfx|visual\s+effects?)\b/i,
  'Color Grading': /\b(?:colou?r\s+grad(?:e|ing)|colou?r\s+correction)\b/i,
  Cinematography: /\b(?:cinematograph(?:y|er)|director\s+of\s+photography|camera\s+work)\b/i,
  'Feature Films': /\bfeature\s+films?\b/i,
  Showreels: /\bshowreels?\b/i,
};

export function projectMatchesService(project: PortfolioProject, service: PortfolioService): boolean {
  if (isUncategorizedCategory(project.category)) return false;

  // `kind` identifies a YouTube URL format, not a short-film genre.
  const metadata = [project.category, project.title, project.topic, project.description]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  if (service === 'Short Films') return /\bshort\s+films?\b/i.test(metadata);
  return serviceTerms[service].test(metadata);
}
