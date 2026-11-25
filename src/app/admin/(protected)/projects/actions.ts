'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getYoutubeVideoId } from '@/lib/portfolio/youtube';

export type ProjectActionState = { status: 'idle' | 'success' | 'error'; message: string };
const ratios = new Set(['', '16:9', '1:1', '4:5', '9:16']);
const statuses = new Set(['pending_review', 'approved', 'rejected', 'draft', 'published', 'archived']);
const kinds = new Set(['', 'short', 'video']);

function field(data: FormData, key: string) {
  return String(data.get(key) ?? '').trim();
}

function displayOrder(data: FormData) {
  const raw = field(data, 'sort_order');
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

function invalidatePortfolio() {
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/projects');
}

export async function createProject(_previous: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const { supabase } = await requireAdmin();
  const originalUrl = field(formData, 'original_url');
  const youtubeId = getYoutubeVideoId(originalUrl);
  if (!youtubeId) return { status: 'error', message: 'Enter a valid YouTube video, Shorts, or youtu.be URL.' };
  const ratio = field(formData, 'ratio');
  const kind = field(formData, 'kind');
  const sortOrder = displayOrder(formData);
  if (!ratios.has(ratio)) return { status: 'error', message: 'Choose a supported aspect ratio.' };
  if (!kinds.has(kind)) return { status: 'error', message: 'Choose a valid video format.' };
  if (sortOrder === null) return { status: 'error', message: 'Display order must be a whole number between 0 and 1,000,000.' };

  const { error } = await supabase.from('projects').insert({
    youtube_id: youtubeId,
    original_url: originalUrl,
    title: field(formData, 'title') || null,
    topic: field(formData, 'topic') || null,
    client: field(formData, 'client') || null,
    description: field(formData, 'description') || null,
    category_id: field(formData, 'category_id') || null,
    ratio: ratio || null,
    ratio_raw: field(formData, 'ratio_raw') || ratio || null,
    kind: kind || null,
    status: 'pending_review',
    sort_order: sortOrder,
  });
  if (error) return { status: 'error', message: `Could not create project: ${error.message}` };
  invalidatePortfolio();
  return { status: 'success', message: 'Project saved as Pending Review.' };
}

export async function updateProject(_previous: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const { supabase, user } = await requireAdmin();
  const id = field(formData, 'id');
  const originalUrl = field(formData, 'original_url');
  const youtubeId = getYoutubeVideoId(originalUrl);
  const ratio = field(formData, 'ratio');
  const kind = field(formData, 'kind');
  const status = field(formData, 'status');
  const sortOrder = displayOrder(formData);
  if (!id) return { status: 'error', message: 'Project ID is missing.' };
  if (!youtubeId) return { status: 'error', message: 'Enter a valid YouTube video, Shorts, or youtu.be URL.' };
  if (!ratios.has(ratio)) return { status: 'error', message: 'Choose a supported aspect ratio.' };
  if (!kinds.has(kind)) return { status: 'error', message: 'Choose a valid video format.' };
  if (!statuses.has(status)) return { status: 'error', message: 'Choose a valid review status.' };
  if (sortOrder === null) return { status: 'error', message: 'Display order must be a whole number between 0 and 1,000,000.' };

  const { data: existingProject, error: existingError } = await supabase
    .from('projects')
    .select('id,status,import_batch_id')
    .eq('id', id)
    .maybeSingle();
  if (existingError) return { status: 'error', message: 'Could not verify the current project status. No changes were saved.' };
  if (!existingProject) return { status: 'error', message: 'This project no longer exists. Refresh the list before editing.' };
  if (existingProject.import_batch_id && (status === 'approved' || status === 'rejected') && status !== existingProject.status) {
    return { status: 'error', message: 'Use Portfolio Review to approve or reject imported projects.' };
  }
  const hasReviewDecision = status === 'approved' || status === 'rejected';
  if (hasReviewDecision) {
    const { error: reviewMetadataError } = await supabase
      .from('projects')
      .select('reviewed_at,reviewed_by')
      .limit(0);
    if (reviewMetadataError) {
      return {
        status: 'error',
        message: 'Approval and rejection are unavailable until the database owner confirms and applies the portfolio review schema. No changes were saved.',
      };
    }
  }
  if (status === 'published' && existingProject.status !== 'approved' && existingProject.status !== 'published') {
    return { status: 'error', message: 'Approve this project in Portfolio Review before publishing it.' };
  }

  const reviewMetadata = hasReviewDecision
    ? { reviewed_at: new Date().toISOString(), reviewed_by: user.id }
    : {};
  const { data: updatedProject, error } = await supabase.from('projects').update({
    youtube_id: youtubeId,
    original_url: originalUrl,
    title: field(formData, 'title') || null,
    topic: field(formData, 'topic') || null,
    client: field(formData, 'client') || null,
    description: field(formData, 'description') || null,
    category_id: field(formData, 'category_id') || null,
    ratio: ratio || null,
    ratio_raw: field(formData, 'ratio_raw') || ratio || null,
    kind: kind || null,
    status,
    sort_order: sortOrder,
    ...reviewMetadata,
  }).eq('id', id).select('id').maybeSingle();
  if (error) return { status: 'error', message: `Could not update project: ${error.message}` };
  if (!updatedProject) return { status: 'error', message: 'This project was not updated. Refresh the list and try again.' };
  invalidatePortfolio();
  return { status: 'success', message: 'Project changes saved.' };
}

export async function deleteProject(_previous: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const { supabase } = await requireAdmin();
  const id = field(formData, 'id');
  if (!id) return { status: 'error', message: 'Project ID is missing.' };
  const { data: deletedProject, error } = await supabase.from('projects').delete().eq('id', id).select('id').maybeSingle();
  if (error) return { status: 'error', message: `Could not delete project: ${error.message}` };
  if (!deletedProject) return { status: 'error', message: 'This project no longer exists. Refresh the list before deleting.' };
  invalidatePortfolio();
  return { status: 'success', message: 'Project deleted.' };
}

export async function createCategory(_previous: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const { supabase } = await requireAdmin();
  const name = field(formData, 'name');
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!name || !slug) return { status: 'error', message: 'Enter a category name.' };
  const { error } = await supabase.from('categories').insert({ name, slug, sort_order: 100, visible: true });
  if (error) return { status: 'error', message: `Could not create category: ${error.message}` };
  revalidatePath('/admin/projects');
  return { status: 'success', message: 'Category created.' };
}

