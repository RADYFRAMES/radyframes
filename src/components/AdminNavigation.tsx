'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const groups = [
  {
    label: 'Overview',
    links: [{ href: '/admin', label: 'Dashboard', icon: 'dashboard', exact: true }],
  },
  {
    label: 'Portfolio',
    links: [
      { href: '/admin/projects', label: 'Projects / Videos', icon: 'projects' },
      { href: '/admin/review', label: 'Portfolio review', icon: 'review' },
      { href: '/admin/adoptions', label: 'Adoption formats', icon: 'adoptions' },
    ],
  },
  {
    label: 'Homepage',
    links: [
      { href: '/admin/showcase', label: 'Hero & showcase', icon: 'showcase' },
      { href: '/admin/studio', label: 'Website content', icon: 'studio' },
    ],
  },
  {
    label: 'Studio',
    links: [
      { href: '/admin/di', label: 'DI quality review', icon: 'quality' },
      { href: '/admin/guestbook', label: 'Guestbook moderation', icon: 'messages' },
      { href: '/admin/account', label: 'Account & theme', icon: 'account' },
    ],
  },
] as const;

type IconName = (typeof groups)[number]['links'][number]['icon'];

function NavigationIcon({ name }: { name: IconName }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    projects: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4" /></>,
    review: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    adoptions: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    showcase: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m10 9 5 3-5 3V9Z" /></>,
    studio: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
    quality: <><path d="M8 4h8l3 3v13H5V4h3Z" /><path d="M9 4v4h6V4m-4 9 2 2 4-4" /></>,
    messages: <><path d="M4 5h16v12H9l-5 4V5Z" /><path d="M8 10h8M8 13h5" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  } satisfies Record<IconName, React.ReactNode>;

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

export default function AdminNavigation({ className }: { className: string }) {
  const pathname = usePathname();

  return (
    <nav className={className} aria-label="Admin workspace">
      {groups.map((group) => (
        <div className="adminNavGroup" key={group.label}>
          <span className="adminNavGroupLabel">{group.label}</span>
          {group.links.map((item) => {
            const active = 'exact' in item && item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link href={item.href} key={item.href} aria-current={active ? 'page' : undefined}>
                <span className="adminNavIcon"><NavigationIcon name={item.icon} /></span>
                <span className="adminNavText">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
