import { createClient } from '@/lib/supabase/server';
import inventory from '@/data/portfolio-inventory.json';
import type { PortfolioCategory, PortfolioProject } from './types';
import { parseShowcaseSettings, SHOWCASE_SETTING_KEY, type ShowcaseSettings } from './showcase';
import {
  HERO_VIDEO_SETTING_KEY,
  parseHeroVideoSettings,
  type HeroVideoSettingResult,
} from './hero';
import { isThumbnailPathColumnMissing } from './thumbnail';

export type PublishedPortfolioResult =
  | { state: 'not-configured'; projects: []; categories: [] }
  | { state: 'error'; projects: []; categories: [] }
  | { state: 'empty'; projects: []; categories: []; excludedUnavailableCount: number }
  | {
    state: 'local-preview';
    previewReason: 'supabase-not-configured' | 'tables-unavailable';
    projects: PortfolioProject[];
    categories: PortfolioCategory[];
    excludedUnavailableCount: number;
  }
  | { state: 'ready'; projects: PortfolioProject[]; categories: PortfolioCategory[] };

const unavailableVideoIds = new Set(['aQDQvh3wDnA', 'N7m9yo3WyVo', 'qaW_yYPqVLs']);

type PublishedProjectRow = {
  id: string;
  youtube_id: string | null;
  thumbnail_path?: string | null;
  original_url: string;
  kind: string | null;
  category_id: string | null;
  topic: string | null;
  client: string | null;
  title: string | null;
  description: string | null;
  ratio_raw: string | null;
  ratio: string | null;
  status: PortfolioProject['status'];
};

export async function getPortfolioShowcaseSettings(): Promise<ShowcaseSettings | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', SHOWCASE_SETTING_KEY)
    .maybeSingle();
  if (error) {
    console.error('Unable to load public portfolio showcase settings.');
    return null;
  }
  if (!data) return null;
  const settings = parseShowcaseSettings(data.value);
  if (!settings) console.error('Portfolio showcase settings are invalid and were not displayed.');
  if (settings) {
    const unavailableIds = new Set(inventory.link_checks
      .filter((check) => !check.reachable)
      .map((check) => check.youtube_id));
    const conflictIds = new Set(inventory.duplicate_metadata_conflicts.map((conflict) => conflict.youtube_id));
    if (settings.videoIds.some((id) => unavailableIds.has(id) || conflictIds.has(id))) {
      console.error('Portfolio showcase contains an unavailable or conflicted video and was not displayed.');
      return null;
    }
  }
  return settings;
}

export async function getPortfolioHeroVideoSettings(): Promise<HeroVideoSettingResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { state: 'missing' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', HERO_VIDEO_SETTING_KEY)
    .maybeSingle();
  if (error) {
    console.error('Unable to load public cinematic hero settings.');
    return { state: 'invalid' };
  }
  if (!data) return { state: 'missing' };
  const settings = parseHeroVideoSettings(data.value);
  if (!settings) {
    console.error('Cinematic hero settings are invalid and were not displayed.');
    return { state: 'invalid' };
  }
  return { state: 'valid', settings };
}

function makeLocalPreview(
  previewReason: 'supabase-not-configured' | 'tables-unavailable',
): Extract<PublishedPortfolioResult, { state: 'local-preview' }> {
  const categories: PortfolioCategory[] = inventory.categories.map((name) => ({
    id: `local:${name}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  }));
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]));
  const conflictIds = new Set(inventory.duplicate_metadata_conflicts.map((conflict) => conflict.youtube_id));
  const projects: PortfolioProject[] = inventory.videos
    .filter((video) => !unavailableVideoIds.has(video.youtube_id))
    .map((video) => ({
      id: `local:${video.youtube_id}`,
      youtube_id: video.youtube_id,
      original_url: video.original_url,
      kind: video.kind === 'short' || video.kind === 'video' ? video.kind : null,
      category_id: video.category ? categoryIds.get(video.category) ?? null : null,
      category: video.category,
      topic: video.topic,
      client: video.client,
      title: video.title,
      description: null,
      ratio_raw: video.ratio_raw,
      ratio: video.ratio === '16:9' || video.ratio === '1:1' || video.ratio === '4:5' || video.ratio === '9:16' ? video.ratio : null,
      status: 'pending_review',
      local_preview: true,
      metadata_conflict: conflictIds.has(video.youtube_id),
    }));

  return {
    state: 'local-preview',
    previewReason,
    projects,
    categories,
    excludedUnavailableCount: inventory.unique_video_ids - projects.length,
  };
}

export async function getPublishedPortfolio(): Promise<PublishedPortfolioResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (process.env.NODE_ENV === 'development') return makeLocalPreview('supabase-not-configured');
    return { state: 'not-configured', projects: [], categories: [] };
  }

  const supabase = await createClient();
  const thumbnailColumnResult = await supabase.from('projects').select('thumbnail_path').limit(0);
  if (thumbnailColumnResult.error && !isThumbnailPathColumnMissing(thumbnailColumnResult.error)) {
    console.error('Unable to verify public thumbnail data.', thumbnailColumnResult.error);
    return { state: 'error', projects: [], categories: [] };
  }
  const hasThumbnailColumn = !thumbnailColumnResult.error;
  const projectColumns: string = hasThumbnailColumn
    ? 'id,youtube_id,thumbnail_path,original_url,kind,category_id,topic,client,title,description,ratio_raw,ratio,status'
    : 'id,youtube_id,original_url,kind,category_id,topic,client,title,description,ratio_raw,ratio,status';
  const [projectResult, categoryResult] = await Promise.all([
    supabase
      .from('projects')
      .select(projectColumns)
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase.from('categories').select('id,name,slug').eq('visible', true).order('sort_order', { ascending: true }),
  ]);

  if (projectResult.error || categoryResult.error) {
    const errors = [projectResult.error, categoryResult.error].filter((error) => error !== null);
    if (process.env.NODE_ENV === 'development' && errors.every((error) => error.code === 'PGRST205')) {
      console.warn('Portfolio tables are unavailable; using the labeled local development preview.');
      return makeLocalPreview('tables-unavailable');
    }
    console.error('Unable to load public portfolio data.', projectResult.error ?? categoryResult.error);
    return { state: 'error', projects: [], categories: [] };
  }

  const projectRows = projectResult.data as unknown as PublishedProjectRow[];
  const projectIds = projectRows.map((project) => project.id);
  const adoptionResult = projectIds.length
    ? await supabase
      .from('project_adoptions')
      .select('id,project_id,ratio,source_url')
      .in('project_id', projectIds)
      .order('sort_order', { ascending: true })
    : { data: [], error: null };
  if (adoptionResult.error) {
    console.error('Adoption-format sources could not be loaded. Apply the reviewed Stage 1 migration to enable them.', adoptionResult.error);
  }
  const adoptionsByProject = new Map<string, NonNullable<PortfolioProject['adoption_versions']>>();
  for (const adoption of adoptionResult.data ?? []) {
    if (adoption.ratio !== '16:9' && adoption.ratio !== '1:1' && adoption.ratio !== '4:5' && adoption.ratio !== '9:16') continue;
    const adoptionVersions = adoptionsByProject.get(adoption.project_id) ?? [];
    adoptionVersions.push({ id: adoption.id, ratio: adoption.ratio, source_url: adoption.source_url });
    adoptionsByProject.set(adoption.project_id, adoptionVersions);
  }

  const excludedUnavailableCount = projectRows
    .filter((row) => row.youtube_id && unavailableVideoIds.has(row.youtube_id)).length;
  const availableRows = projectRows.filter((row) => !row.youtube_id || !unavailableVideoIds.has(row.youtube_id));
  if (!availableRows.length) {
    return { state: 'empty', projects: [], categories: [], excludedUnavailableCount };
  }

  const categoryNames = new Map(categoryResult.data.map((category) => [category.id, category.name]));
  const conflictIds = new Set(inventory.duplicate_metadata_conflicts.map((conflict) => conflict.youtube_id));
  const projects: PortfolioProject[] = availableRows.map((row) => {
    return {
      id: row.id,
      youtube_id: row.youtube_id,
      thumbnail_path: 'thumbnail_path' in row && typeof row.thumbnail_path === 'string' ? row.thumbnail_path : null,
      original_url: row.original_url,
      kind: row.kind === 'short' || row.kind === 'video' ? row.kind : null,
      category_id: row.category_id,
      category: row.category_id ? categoryNames.get(row.category_id) ?? null : null,
      topic: row.topic,
      client: row.client,
      title: row.title,
      description: row.description,
      ratio_raw: row.ratio_raw,
      ratio: row.ratio === '16:9' || row.ratio === '1:1' || row.ratio === '4:5' || row.ratio === '9:16' ? row.ratio : null,
      status: row.status,
      adoption_versions: adoptionsByProject.get(row.id) ?? [],
      metadata_conflict: row.youtube_id ? conflictIds.has(row.youtube_id) : false,
    };
  });

  const usedCategoryIds = new Set(projects.map((project) => project.category_id).filter((id): id is string => Boolean(id)));
  const categories = categoryResult.data.filter((category) => usedCategoryIds.has(category.id));
  if (!projects.length) return { state: 'empty', projects: [], categories: [], excludedUnavailableCount };
  return { state: 'ready', projects, categories };
}
