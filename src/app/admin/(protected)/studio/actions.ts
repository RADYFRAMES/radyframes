'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { AVATAR_LANGUAGES, parseStudioContent, STUDIO_CONTENT_KEY, type StudioContent } from '@/lib/studio-content';

export type StudioActionState = { status: 'idle' | 'success' | 'error'; message: string };

function isSafeWebUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateContent(content: StudioContent) {
  const urls = [
    content.about.profileImageUrl,
    ...content.socialLinks.map((item) => item.url),
  ];
  if (urls.some((url) => !isSafeWebUrl(url))) return 'Use complete HTTP or HTTPS URLs for profile images and social links.';
  if (content.about.introduction.length > 5000) return 'The studio introduction must be 5,000 characters or fewer.';
  if (content.services.length > 100 || content.skills.length > 100 || content.socialLinks.length > 50) {
    return 'Reduce the number of items before saving.';
  }
  if (content.feedback.length > 50 || content.process.length > 30) return 'Reduce feedback or process items before saving.';
  if (content.socialLinks.some((item) => item.label.length > 80 || item.url.length > 2048)
    || content.feedback.some((item) => item.client.length > 160 || item.project.length > 200 || item.quote.length > 2000)
    || content.process.some((item) => item.title.length > 160 || item.description.length > 1200)) {
    return 'One or more social, feedback or process fields exceed their length limit.';
  }
  for (const language of AVATAR_LANGUAGES) {
    const dialogue = content.avatar[language.code];
    if (dialogue.greeting.length > 800 || dialogue.introduction.length > 1500 || dialogue.closing.length > 800
      || dialogue.lines.length > 100 || dialogue.lines.some((line) => line.length > 1500)) {
      return `The ${language.label} dialogue exceeds its content limits.`;
    }
  }
  return '';
}

function validContentShape(value: unknown): value is StudioContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.about !== 'object' || record.about === null || Array.isArray(record.about)
    || typeof record.avatar !== 'object' || record.avatar === null || Array.isArray(record.avatar)
    || !Array.isArray(record.skills) || !record.skills.every((item) => typeof item === 'string')
    || !Array.isArray(record.services) || !record.services.every((item) => typeof item === 'string')
    || !Array.isArray(record.socialLinks) || !Array.isArray(record.feedback) || !Array.isArray(record.process)
    || typeof record.guestbookEnabled !== 'boolean') return false;
  const about = record.about as Record<string, unknown>;
  if (typeof about.role !== 'string' || typeof about.introduction !== 'string' || typeof about.profileImageUrl !== 'string') return false;
  const avatar = record.avatar as Record<string, unknown>;
  if (!AVATAR_LANGUAGES.every(({ code }) => {
    const dialogue = avatar[code];
    if (typeof dialogue !== 'object' || dialogue === null || Array.isArray(dialogue)) return false;
    const item = dialogue as Record<string, unknown>;
    return typeof item.enabled === 'boolean' && typeof item.greeting === 'string'
      && typeof item.introduction === 'string' && Array.isArray(item.lines)
      && item.lines.every((line) => typeof line === 'string') && typeof item.closing === 'string';
  })) return false;
  const hasStringFields = (items: unknown[], keys: string[]) => items.every((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return keys.every((key) => typeof item[key] === 'string');
  });
  return hasStringFields(record.socialLinks, ['label', 'url'])
    && hasStringFields(record.feedback, ['client', 'project', 'quote'])
    && hasStringFields(record.process, ['title', 'description']);
}

export async function saveStudioContent(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  const { supabase } = await requireAdmin();
  if (formData.get('approved') !== 'on') {
    return { status: 'error', message: 'Confirm that you approve these changes before saving.' };
  }
  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get('content') ?? ''));
  } catch {
    return { status: 'error', message: 'The studio content could not be read. Review the draft and try again.' };
  }
  if (!validContentShape(submitted)) {
    return { status: 'error', message: 'The draft is incomplete or invalid. No settings were changed.' };
  }
  const validationMessage = validateContent(submitted);
  if (validationMessage) return { status: 'error', message: validationMessage };
  const content = parseStudioContent(submitted);

  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: STUDIO_CONTENT_KEY, value: content }, { onConflict: 'key' });
  if (error) {
    console.error('Unable to save approved studio content.', error);
    return { status: 'error', message: 'Studio content was not saved. Check the Supabase site_settings table and admin policy.' };
  }
  revalidatePath('/');
  revalidatePath('/about');
  revalidatePath('/admin/studio');
  return { status: 'success', message: 'Approved studio content saved and published.' };
}
