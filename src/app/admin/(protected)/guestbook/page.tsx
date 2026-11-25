import { requireAdmin } from '@/lib/auth/requireAdmin';
import GuestbookModeration from './GuestbookModeration';

export const dynamic = 'force-dynamic';

export default async function GuestbookAdminPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('guestbook_entries')
    .select('id,public_name,message,status,created_at')
    .order('created_at', { ascending: false });

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">PUBLIC MESSAGES / MODERATION</p><h1>Guestbook</h1></div>
        <p className="mut">Only approved entries appear on the public About page.</p>
      </div>
      {error ? (
        <p className="reviewDatabaseNotice" role="status">Guestbook storage is unavailable. Review and apply <code>005_stage1_studio_workflows.sql</code> to enable moderation. No database changes were made by the workspace.</p>
      ) : (
        <GuestbookModeration entries={data} />
      )}
    </>
  );
}
