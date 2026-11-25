import { requireAdmin } from '@/lib/auth/requireAdmin';
import {
  DEFAULT_HERO_VIDEO_SETTINGS,
  HERO_VIDEO_SETTING_KEY,
  parseHeroVideoSettings,
} from '@/lib/portfolio/hero';
import { DEFAULT_SHOWCASE_SETTINGS, parseShowcaseSettings, SHOWCASE_SETTING_KEY } from '@/lib/portfolio/showcase';
import type { PortfolioCategory, PortfolioProject } from '@/lib/portfolio/types';
import { getYoutubeVideoId } from '@/lib/portfolio/youtube';
import HeroVideoSettingsEditor from './HeroVideoSettingsEditor';
import ShowcaseSettingsEditor from './ShowcaseSettingsEditor';

export const dynamic = 'force-dynamic';

export default async function ShowcaseSettingsPage() {
  const { supabase, role } = await requireAdmin();
  const [projectResult, categoryResult, settingResult, heroSettingResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id,youtube_id,original_url,kind,category_id,topic,client,title,description,ratio_raw,ratio,status')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase.from('categories').select('id,name,slug').order('sort_order', { ascending: true }),
    supabase.from('site_settings').select('value').eq('key', SHOWCASE_SETTING_KEY).maybeSingle(),
    supabase.from('site_settings').select('value').eq('key', HERO_VIDEO_SETTING_KEY).maybeSingle(),
  ]);
  if (projectResult.error) throw new Error(`Could not load published videos: ${projectResult.error.message}`);
  if (categoryResult.error) throw new Error(`Could not load categories: ${categoryResult.error.message}`);
  if (settingResult.error) throw new Error(`Could not load showcase settings: ${settingResult.error.message}`);
  if (heroSettingResult.error) throw new Error(`Could not load hero video settings: ${heroSettingResult.error.message}`);

  const categories: PortfolioCategory[] = categoryResult.data;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projects: PortfolioProject[] = projectResult.data
    .filter((project) => project.youtube_id && getYoutubeVideoId(project.original_url) === project.youtube_id)
    .map((project) => ({
      ...project,
      category: project.category_id ? categoryNames.get(project.category_id) ?? null : null,
      kind: project.kind === 'short' || project.kind === 'video' ? project.kind : null,
      ratio: project.ratio === '16:9' || project.ratio === '1:1' || project.ratio === '4:5' || project.ratio === '9:16' ? project.ratio : null,
      status: 'published',
    }));

  const savedValue = settingResult.data?.value;
  const settings = savedValue ? parseShowcaseSettings(savedValue) : null;
  const settingsWarning = savedValue && !settings
    ? 'The stored showcase configuration is invalid. Review the selection and save a new configuration.'
    : undefined;
  const heroSettings = heroSettingResult.data?.value
    ? parseHeroVideoSettings(heroSettingResult.data.value)
    : null;
  const heroSettingsWarning = heroSettingResult.data?.value && !heroSettings
    ? 'The stored hero video configuration is invalid. Review or disable it before saving.'
    : undefined;

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">SUPER ADMIN / PUBLIC CONTENT</p><h1>Homepage video settings</h1></div>
        <p className="mut">{projects.length} published, verified videos</p>
      </div>
      {heroSettingsWarning && <p className="err" role="alert">{heroSettingsWarning}</p>}
      <HeroVideoSettingsEditor
        key={JSON.stringify(heroSettings ?? DEFAULT_HERO_VIDEO_SETTINGS)}
        initialSettings={heroSettings ?? DEFAULT_HERO_VIDEO_SETTINGS}
        canManage={role === 'super_admin'}
      />
      <ShowcaseSettingsEditor
        key={JSON.stringify(settings ?? DEFAULT_SHOWCASE_SETTINGS)}
        projects={projects}
        initialSettings={settings ?? DEFAULT_SHOWCASE_SETTINGS}
        settingsWarning={settingsWarning}
        canManage={role === 'super_admin'}
      />
    </>
  );
}
