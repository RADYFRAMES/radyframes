'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getYoutubeVideoId } from '@/lib/portfolio/youtube';

export type AdoptionActionState = { status: 'idle' | 'success' | 'error'; message: string };
const ratios = new Set(['1:1', '4:5', '16:9', '9:16']);

export async function saveProjectAdoptions(
  _previous: AdoptionActionState,
  formData: FormData,
): Promise<AdoptionActionState> {
  const { supabase } = await requireAdmin();
  const projectId = String(formData.get('project_id') ?? '');
  if (formData.get('approved') !== 'on') {
    return { status: 'error', message: 'Confirm that you approve these adoption-source changes before saving.' };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    return { status: 'error', message: 'Select a valid project before saving adoption sources.' };
  }
  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get('versions') ?? ''));
  } catch {
    return { status: 'error', message: 'Adoption sources could not be read. Review the draft and try again.' };
  }
  if (!Array.isArray(submitted)) return { status: 'error', message: 'Adoption sources must be a list.' };
  const versions: { ratio: string; source_url: string; sort_order: number }[] = [];
  for (const [index, item] of submitted.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { status: 'error', message: 'An adoption source is invalid.' };
    }
    const row = item as Record<string, unknown>;
    if (typeof row.ratio !== 'string' || !ratios.has(row.ratio)) {
      return { status: 'error', message: 'Choose a supported aspect ratio for each source.' };
    }
    const sourceUrl = typeof row.source_url === 'string' ? row.source_url.trim() : '';
    if (!sourceUrl) continue;
    if (!getYoutubeVideoId(sourceUrl)) {
      return { status: 'error', message: `Enter a verified YouTube URL for the ${row.ratio} source.` };
    }
    if (versions.some((version) => version.ratio === row.ratio)) {
      return { status: 'error', message: 'Choose only one source for each aspect ratio.' };
    }
    versions.push({ ratio: row.ratio, source_url: sourceUrl, sort_order: index });
  }

  const { error } = await supabase.rpc('save_project_adoptions', {
    p_project_id: projectId,
    p_versions: versions,
  });
  if (error) {
    console.error('Unable to save project adoption sources.', error);
    return { status: 'error', message: 'Adoption sources were not saved. Confirm that the reviewed Stage 1 migration has been applied.' };
  }
  revalidatePath('/');
  revalidatePath('/about');
  revalidatePath('/admin/adoptions');
  revalidatePath('/admin/di');
  return { status: 'success', message: 'Approved adoption sources saved.' };
}
