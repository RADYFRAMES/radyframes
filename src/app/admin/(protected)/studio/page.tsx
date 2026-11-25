import { requireAdmin } from '@/lib/auth/requireAdmin';
import { DEFAULT_STUDIO_CONTENT, parseStudioContent, STUDIO_CONTENT_KEY } from '@/lib/studio-content';
import StudioContentEditor from './StudioContentEditor';

export const dynamic = 'force-dynamic';

export default async function StudioContentPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', STUDIO_CONTENT_KEY)
    .maybeSingle();
  if (error) throw new Error(`Could not load studio content: ${error.message}`);

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">PUBLIC SITE / DRAFT-FIRST EDITOR</p><h1>Studio content</h1></div>
        <p className="mut">Changes stay in this draft until you approve and save them.</p>
      </div>
      <StudioContentEditor initialContent={data ? parseStudioContent(data.value) : DEFAULT_STUDIO_CONTENT} />
    </>
  );
}
