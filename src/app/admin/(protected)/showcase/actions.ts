'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { saveShowcaseSettingsForRole } from '@/lib/portfolio/homepage-settings-actions';

export type ShowcaseActionState = { status: 'idle' | 'success' | 'error'; message: string };

export async function saveShowcaseSettings(
  _previous: ShowcaseActionState,
  formData: FormData,
): Promise<ShowcaseActionState> {
  const { supabase, role } = await requireAdmin();
  const result = await saveShowcaseSettingsForRole(role, supabase, formData);
  if (result.status === 'success') {
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/admin/showcase');
  }
  return result;
}
