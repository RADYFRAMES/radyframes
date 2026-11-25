import inventory from '@/data/portfolio-inventory.json';
import { canManageHomepageSettings } from '@/lib/auth/homepage-settings-authorization';
import {
  HERO_VIDEO_SETTING_KEY,
  parseHeroVideoSettings,
  type HeroVideoSettings,
} from './hero';
import {
  parseShowcaseSettings,
  SHOWCASE_SETTING_KEY,
  validatePublishedShowcaseSelection,
  type ShowcaseSettings,
} from './showcase';

export type HeroVideoActionState = { status: 'idle' | 'success' | 'error'; message: string };
export type ShowcaseActionState = { status: 'idle' | 'success' | 'error'; message: string };

export async function saveHeroVideoSettingsForRole(
  role: unknown,
  supabase: unknown,
  formData: FormData,
): Promise<HeroVideoActionState> {
  if (!canManageHomepageSettings(role)) {
    return { status: 'error', message: 'Only super admins can change the homepage hero video.' };
  }
  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get('settings') ?? ''));
  } catch {
    return { status: 'error', message: 'The hero video settings could not be read.' };
  }
  const settings = parseHeroVideoSettings(submitted);
  if (!settings) {
    return { status: 'error', message: 'Enter a valid enabled hero video URL or disable the hero video.' };
  }
  const client = supabase as {
    from: (table: string) => {
      upsert: (row: unknown, options: unknown) => Promise<{ error: unknown }>;
    };
  };
  const { error } = await client
    .from('site_settings')
    .upsert({ key: HERO_VIDEO_SETTING_KEY, value: settings }, { onConflict: 'key' });
  if (error) {
    return { status: 'error', message: 'Hero video settings could not be saved. Check the site_settings admin policy.' };
  }
  return { status: 'success', message: 'Cinematic hero video settings saved.' };
}

function getShowcaseSettings(formData: FormData): ShowcaseSettings | null {
  try {
    return parseShowcaseSettings(JSON.parse(String(formData.get('settings') ?? '')) as unknown);
  } catch {
    return null;
  }
}

export async function saveShowcaseSettingsForRole(
  role: unknown,
  supabase: unknown,
  formData: FormData,
): Promise<ShowcaseActionState> {
  if (!canManageHomepageSettings(role)) {
    return { status: 'error', message: 'Only super admins can change the homepage four-video showcase.' };
  }
  const settings = getShowcaseSettings(formData);
  if (!settings) {
    return { status: 'error', message: 'Choose exactly four unique videos and valid animation settings.' };
  }
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          in: (column: string, values: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
        };
      };
      upsert: (row: unknown, options: unknown) => Promise<{ error: unknown }>;
    };
  };
  const { data: selectedProjects, error: projectsError } = await client
    .from('projects')
    .select('youtube_id,original_url,status')
    .eq('status', 'published')
    .in('youtube_id', settings.videoIds);
  if (projectsError) {
    return { status: 'error', message: 'Could not verify the selected portfolio videos.' };
  }
  const unavailableIds = new Set(inventory.link_checks
    .filter((check) => !check.reachable)
    .map((check) => check.youtube_id));
  const conflictIds = new Set(inventory.duplicate_metadata_conflicts.map((conflict) => conflict.youtube_id));
  const invalidSelection = settings.videoIds.some((videoId) =>
    unavailableIds.has(videoId) || conflictIds.has(videoId)
  ) || !validatePublishedShowcaseSelection(settings.videoIds, (selectedProjects ?? []) as Array<{
    youtube_id: string | null;
    original_url: string;
    status: 'published';
  }>);
  if (invalidSelection) {
    return { status: 'error', message: 'Choose exactly four currently published, verified videos. Pending, rejected, draft, archived, conflicted and unavailable videos cannot be selected.' };
  }
  const { error } = await client
    .from('site_settings')
    .upsert({ key: SHOWCASE_SETTING_KEY, value: settings }, { onConflict: 'key' });
  if (error) {
    return { status: 'error', message: 'Showcase settings could not be saved. Check the existing site_settings policy.' };
  }
  return { status: 'success', message: 'Four-video showcase settings saved.' };
}
