import { createClient } from '@/lib/supabase/server';
import { DEFAULT_STUDIO_CONTENT, parseStudioContent, STUDIO_CONTENT_KEY, type StudioContent } from './studio-content';

export interface StudioContentResult {
  content: StudioContent;
  unavailable: boolean;
}

export async function getStudioContent(): Promise<StudioContentResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { content: DEFAULT_STUDIO_CONTENT, unavailable: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', STUDIO_CONTENT_KEY)
    .maybeSingle();
  if (error) {
    console.error('Unable to load public studio content.', error);
    return { content: DEFAULT_STUDIO_CONTENT, unavailable: true };
  }
  return { content: data ? parseStudioContent(data.value) : DEFAULT_STUDIO_CONTENT, unavailable: false };
}

export interface GuestbookEntry {
  id: string;
  public_name: string;
  message: string;
  created_at: string;
}

export async function getPublicGuestbook(): Promise<{ entries: GuestbookEntry[]; unavailable: boolean }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { entries: [], unavailable: true };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('guestbook_entries')
    .select('id,public_name,message,created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) {
    console.error('Unable to load public guestbook entries. Apply the reviewed Stage 1 migration to enable the guestbook.', error);
    return { entries: [], unavailable: true };
  }
  return { entries: data, unavailable: false };
}
