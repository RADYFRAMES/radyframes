import PasswordForm from '@/components/PasswordForm';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function UpdatePasswordPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/admin/login?error=config');
  }
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect('/admin/login?error=link');
  return <main className="adminAuthShell"><PasswordForm title="Set a new password" /></main>;
}
