'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export type InventoryReviewActionState = { status: 'idle' | 'success' | 'error'; message: string };

function field(data: FormData, key: string) {
  return String(data.get(key) ?? '').trim();
}

export async function reviewInventoryRecord(
  _previous: InventoryReviewActionState,
  formData: FormData,
): Promise<InventoryReviewActionState> {
  const { supabase, user } = await requireAdmin();
  const id = field(formData, 'project_id');
  const intent = field(formData, 'intent');
  if (!id) return { status: 'error', message: 'The imported project ID is missing.' };

  const values: {
    category_id?: string | null;
    status?: 'pending_review' | 'approved' | 'rejected';
    reviewed_at?: string | null;
    reviewed_by?: string | null;
  } = {};

  if (intent === 'category') {
    values.category_id = field(formData, 'category_id') || null;
  } else if (intent === 'approved' || intent === 'rejected') {
    values.status = intent;
    values.reviewed_at = new Date().toISOString();
    values.reviewed_by = user.id;
  } else if (intent === 'pending_review') {
    values.status = 'pending_review';
    values.reviewed_at = null;
    values.reviewed_by = null;
  } else {
    return { status: 'error', message: 'Choose a category or a valid review decision.' };
  }

  const { data, error } = await supabase
    .from('projects')
    .update(values)
    .eq('id', id)
    .not('import_batch_id', 'is', null)
    .select('id')
    .maybeSingle();

  if (error) return { status: 'error', message: `Could not save this review: ${error.message}` };
  if (!data) return { status: 'error', message: 'This record is not in an imported inventory batch.' };

  revalidatePath('/admin/review');
  revalidatePath('/admin');
  return {
    status: 'success',
    message: intent === 'category'
      ? 'Category saved. The review status is unchanged.'
      : intent === 'pending_review'
        ? 'Record returned to Pending Review.'
        : `Record marked ${intent}.`,
  };
}
