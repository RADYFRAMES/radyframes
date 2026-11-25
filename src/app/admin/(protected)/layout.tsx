import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import AdminNavigation from '@/components/AdminNavigation';
import AdminHeader from '@/components/AdminHeader';

async function logout() {
  'use server';
  const { error } = await (await createClient()).auth.signOut();
  if (error) {
    console.error('Unable to fully clear the admin authentication session.');
    redirect('/admin/login?error=logout');
  }
  redirect('/admin/login');
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireAdmin();
  return (
    <div className="adminShell">
      <aside className="adminSidebar">
        <a className="adminBrand" href="/admin" aria-label="Radyframes admin dashboard">
          <span>RADY</span><strong>FRAMES</strong><small>STUDIO ADMIN</small>
        </a>
        <AdminNavigation className="adminSidebarNav" />
        <div className="adminSidebarAccount">
          <span className="adminAccountLabel">SIGNED IN</span>
          <strong>{user.email ?? 'Authenticated admin'}</strong>
          <span>{role.replace('_', ' ')}</span>
        </div>
      </aside>
      <div className="adminMain">
        <AdminHeader role={role} logoutAction={logout} />
        <main className="wrap adminContent">{children}</main>
      </div>
    </div>
  );
}
