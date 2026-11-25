'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminNavigation from '@/components/AdminNavigation';
import ThemeToggle from '@/components/ThemeToggle';

const pages = [
  { href: '/admin', title: 'Dashboard', section: 'Overview', exact: true },
  { href: '/admin/projects', title: 'Projects / Videos', section: 'Portfolio' },
  { href: '/admin/review', title: 'Portfolio review', section: 'Portfolio' },
  { href: '/admin/adoptions', title: 'Adoption formats', section: 'Portfolio' },
  { href: '/admin/showcase', title: 'Hero & showcase', section: 'Homepage' },
  { href: '/admin/studio', title: 'Website content', section: 'Homepage' },
  { href: '/admin/di', title: 'DI quality review', section: 'Studio' },
  { href: '/admin/guestbook', title: 'Guestbook moderation', section: 'Studio' },
  { href: '/admin/account', title: 'Account & theme', section: 'Studio' },
] as const;

export default function AdminHeader({
  role,
  logoutAction,
}: {
  role: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const page = pages.find((item) => 'exact' in item && item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const title = page?.title ?? 'Admin workspace';
  const section = page?.section ?? 'Workspace';

  return (
    <header className="adminTopbar">
      <div className="adminHeaderCopy">
        <nav className="adminBreadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li><Link href="/admin">Workspace</Link></li>
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
        <p className="adminHeaderSection">{section}</p>
      </div>
      <details className="adminMobileMenu">
        <summary><span aria-hidden="true">☰</span> Menu</summary>
        <AdminNavigation className="adminMobileNav" />
      </details>
      <div className="adminTopbarActions">
        <span className="adminRolePill">{role.replace('_', ' ')}</span>
        <ThemeToggle />
        <form action={logoutAction}>
          <button className="btn ghost" type="submit">Log out</button>
        </form>
      </div>
    </header>
  );
}
