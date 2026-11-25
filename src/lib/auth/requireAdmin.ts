import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Call at the top of every protected page / server action. RLS enforces the same rule in the database.
export async function requireAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/admin/login?error=config');
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') {
    console.error('Unable to verify the admin authentication session.');
    redirect('/admin/login?error=auth');
  }
  if (!user) redirect('/admin/login');
  const { data, error } = await supabase.from('admins').select('role').eq('user_id', user.id).maybeSingle();
  if (error) {
    console.error('Unable to verify admin authorization.');
    redirect(error.code === 'PGRST205' ? '/admin/login?error=admin-schema' : '/admin/login?error=admin-check');
  }
  if (!data) redirect('/admin/login?error=unauthorized');
  if (data.role !== 'super_admin' && data.role !== 'editor') {
    redirect('/admin/login?error=unauthorized');
  }
  return { supabase, user, role: data.role };
}
