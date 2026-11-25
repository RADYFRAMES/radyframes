'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export type GuestbookModerationState = { status: 'idle' | 'success' | 'error'; message: string };

export async function moderateGuestbookEntry(
  _previous: GuestbookModerationState,
  formData: FormData,
): Promise<GuestbookModerationState> {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { status: 'error', message: 'Guestbook entry ID is invalid.' };
  }
  if (status !== 'approved' && status !== 'hidden' && status !== 'pending') {
    return { status: 'error', message: 'Choose a valid moderation status.' };
  }
  const { data: updatedEntry, error } = await supabase.from('guestbook_entries').update({
    status,
    moderated_at: status === 'pending' ? null : new Date().toISOString(),
    moderated_by: status === 'pending' ? null : user.id,
  }).eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('Unable to moderate guestbook entry.', error);
    return { status: 'error', message: 'Moderation change was not saved. Confirm that the reviewed Stage 1 migration has been applied.' };
  }
  if (!updatedEntry) return { status: 'error', message: 'Guestbook entry no longer exists. Refresh the list before trying again.' };
  const { error: auditError } = await supabase.from('activity_log').insert({
    user_id: user.id,
    action: 'moderate_guestbook_entry',
    entity: 'guestbook_entry',
    entity_id: id,
    detail: { status },
  });
  if (auditError) console.error('Guestbook moderation was saved, but its audit record could not be written.', auditError);
  revalidatePath('/about');
  revalidatePath('/admin/guestbook');
  return { status: 'success', message: `Guestbook entry marked ${status}.` };
}
