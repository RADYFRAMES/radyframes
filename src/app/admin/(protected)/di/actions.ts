'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export type DiActionState = { status: 'idle' | 'success' | 'error'; message: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checkStatuses = new Set(['not_started', 'in_progress', 'passed', 'needs_correction', 'not_applicable']);

export async function saveDiChecklistTemplates(
  _previous: DiActionState,
  formData: FormData,
): Promise<DiActionState> {
  const { supabase } = await requireAdmin();
  if (formData.get('approved') !== 'on') return { status: 'error', message: 'Approve the checklist changes before saving.' };
  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get('templates') ?? ''));
  } catch {
    return { status: 'error', message: 'Checklist changes could not be read.' };
  }
  if (!Array.isArray(submitted) || submitted.length > 100) {
    return { status: 'error', message: 'Checklist must contain at most 100 items.' };
  }
  const labels = new Set<string>();
  const templates: { id: string | null; label: string; sort_order: number; project_id: string | null; adoption_id: string | null }[] = [];
  for (const [index, item] of submitted.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { status: 'error', message: 'A checklist item is invalid.' };
    const row = item as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const rawId = typeof row.id === 'string' ? row.id : '';
    const id = rawId.startsWith('new-') ? null : rawId || null;
    if (!label || label.length > 200 || (id && !uuidPattern.test(id))) {
      return { status: 'error', message: 'Each item needs a label of up to 200 characters and a valid ID.' };
    }
    const projectId = typeof row.project_id === 'string' && row.project_id ? row.project_id : null;
    const adoptionId = typeof row.adoption_id === 'string' && row.adoption_id ? row.adoption_id : null;
    if ((projectId && !uuidPattern.test(projectId)) || (adoptionId && !uuidPattern.test(adoptionId)) || (adoptionId && !projectId)) {
      return { status: 'error', message: 'Checklist assignment must use a valid project and adoption version.' };
    }
    const normalised = `${projectId ?? 'global'}:${adoptionId ?? 'parent'}:${label.toLocaleLowerCase()}`;
    if (labels.has(normalised)) return { status: 'error', message: `Duplicate checklist item: ${label}.` };
    labels.add(normalised);
    templates.push({ id, label, sort_order: (index + 1) * 10, project_id: projectId, adoption_id: adoptionId });
  }
  const { error } = await supabase.rpc('save_di_checklist_templates', { p_templates: templates });
  if (error) {
    console.error('Unable to save DI checklist configuration.', error);
    return { status: 'error', message: 'Checklist was not saved. Confirm that the reviewed Stage 1 migration has been applied.' };
  }
  revalidatePath('/admin/di');
  return { status: 'success', message: 'Approved DI checklist saved.' };
}

export async function saveDiReview(
  _previous: DiActionState,
  formData: FormData,
): Promise<DiActionState> {
  const { supabase, user } = await requireAdmin();
  if (formData.get('approved') !== 'on') return { status: 'error', message: 'Approve this private DI review before saving.' };
  const projectId = String(formData.get('project_id') ?? '');
  const adoptionId = String(formData.get('adoption_id') ?? '') || null;
  const reviewDate = String(formData.get('review_date') ?? '') || null;
  const finalApproved = formData.get('final_approved') === 'on';
  const internalNotes = String(formData.get('internal_notes') ?? '').trim();
  if (!uuidPattern.test(projectId) || (adoptionId && !uuidPattern.test(adoptionId))) {
    return { status: 'error', message: 'Choose a valid project or adoption version.' };
  }
  if (reviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
    return { status: 'error', message: 'Enter the review date using the date picker.' };
  }
  if (internalNotes.length > 10000) return { status: 'error', message: 'Internal notes must be 10,000 characters or fewer.' };

  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get('checks') ?? ''));
  } catch {
    return { status: 'error', message: 'Review checklist could not be read.' };
  }
  if (!Array.isArray(submitted) || submitted.length > 100) return { status: 'error', message: 'Review checklist is invalid.' };
  const checks: { template_id: string; status: string; internal_notes: string }[] = [];
  for (const item of submitted) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { status: 'error', message: 'A review check is invalid.' };
    const row = item as Record<string, unknown>;
    const templateId = typeof row.template_id === 'string' ? row.template_id : '';
    const status = typeof row.status === 'string' ? row.status : '';
    const notes = typeof row.internal_notes === 'string' ? row.internal_notes : '';
    if (!uuidPattern.test(templateId) || !checkStatuses.has(status) || notes.length > 2000) {
      return { status: 'error', message: 'A checklist status, ID or internal note is invalid.' };
    }
    checks.push({ template_id: templateId, status, internal_notes: notes });
  }
  if (finalApproved && (!checks.length || checks.some((check) => check.status !== 'passed' && check.status !== 'not_applicable'))) {
    return { status: 'error', message: 'Final DI approval requires every checklist item to be Passed or Not Applicable.' };
  }
  const { error } = await supabase.rpc('save_di_review', {
    p_project_id: projectId,
    p_adoption_id: adoptionId,
    p_checks: checks,
    p_internal_notes: internalNotes,
    p_review_date: reviewDate,
    p_final_approved: finalApproved,
    p_reviewer: user.email ?? 'Admin',
  });
  if (error) {
    console.error('Unable to save DI review.', error);
    return { status: 'error', message: 'DI review was not saved. Confirm that the project, adoption source and reviewed Stage 1 migration are valid.' };
  }
  revalidatePath('/admin/di');
  return { status: 'success', message: 'Approved DI review saved privately.' };
}
