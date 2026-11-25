'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { saveHeroVideoSettingsForRole } from '@/lib/portfolio/homepage-settings-actions';

export type HeroVideoActionState = { status: 'idle' | 'success' | 'error'; message: string };

export async function saveHeroVideoSettings(
  _previous: HeroVideoActionState,
  formData: FormData,
): Promise<HeroVideoActionState> {
  const { supabase, role } = await requireAdmin();
  const result = await saveHeroVideoSettingsForRole(role, supabase, formData);
  if (result.status === 'success') {
    revalidatePath('/');
    revalidatePath('/admin/showcase');
  }
  return result;
}
