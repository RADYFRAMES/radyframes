import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { STUDIO_CONTENT_KEY } from '@/lib/studio-content';
import DashboardRetryButton from './DashboardRetryButton';

export const dynamic = 'force-dynamic';

const projectStatuses = [
  ['pending_review', 'Pending review'],
  ['published', 'Published'],
  ['draft', 'Draft'],
  ['archived', 'Archived'],
] as const;

function displayStatus(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countSavedServices(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 0;
  const services = (value as Record<string, unknown>).services;
  return Array.isArray(services)
    ? services.filter((service): service is string => typeof service === 'string' && service.trim().length > 0).length
    : 0;
}

export default async function Dashboard() {
  const { supabase } = await requireAdmin();
  const countProjects = async (status?: string) => {
    let query = supabase.from('projects').select('id', { count: 'exact', head: true });
    if (status) query = query.eq('status', status);
    const result = await query;
    return { value: result.error ? null : result.count ?? 0, error: result.error };
  };
  const [
    totalResult,
    pendingResult,
    publishedResult,
    draftResult,
    archivedResult,
    categoryResult,
    studioResult,
    activityResult,
    recentProjectsResult,
  ] = await Promise.all([
    countProjects(),
    countProjects('pending_review'),
    countProjects('published'),
    countProjects('draft'),
    countProjects('archived'),
    supabase.from('categories').select('id', { count: 'exact', head: true }),
    supabase.from('site_settings').select('value').eq('key', STUDIO_CONTENT_KEY).maybeSingle(),
    supabase.from('activity_log').select('id,action,entity,entity_id,created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('projects').select('id,title,youtube_id,status,updated_at').order('updated_at', { ascending: false }).limit(5),
  ]);
  const statusResults = [pendingResult, publishedResult, draftResult, archivedResult];

  const serviceCount = studioResult.error
    ? null
    : countSavedServices(studioResult.data?.value);
  const statusCounts = new Map(projectStatuses.map(([status], index) => [status, statusResults[index]]));
  const projectCountsUnavailable = [totalResult, ...statusResults].some((result) => result.error);
  const supportingDataUnavailable = [
    categoryResult.error,
    studioResult.error,
    activityResult.error,
    recentProjectsResult.error,
  ].some(Boolean);

  const stats = [
    { label: 'Total projects', value: totalResult.value, href: '/admin/projects' },
    ...projectStatuses.map(([status, label]) => ({
      label,
      value: statusCounts.get(status)?.value ?? null,
      href: `/admin/projects?status=${status}`,
    })),
    { label: 'Categories', value: categoryResult.error ? null : categoryResult.count ?? 0, href: '/admin/projects#categories' },
    { label: 'Saved services', value: serviceCount, href: '/admin/studio' },
  ];

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">STUDIO OVERVIEW</p><h1>Dashboard</h1></div>
        <p className="mut">Live counts and recent updates from Supabase.</p>
      </div>

      {projectCountsUnavailable && (
        <div className="reviewDatabaseNotice dashboardDataNotice" role="status">
          <span>Project counts could not be loaded. Unavailable counts are shown as dashes; check admin access to the projects table if this continues.</span>
          <DashboardRetryButton />
        </div>
      )}
      {supportingDataUnavailable && (
        <div className="reviewDatabaseNotice dashboardDataNotice" role="status">
          <span>Some supporting dashboard data could not be loaded. Check admin access to categories, studio settings, activity log and projects if this continues.</span>
          <DashboardRetryButton />
        </div>
      )}

      <section className="stats dashboardStats" aria-label="Portfolio statistics">
        {stats.map((item) => (
          <Link className="card dashboardStat" href={item.href} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value ?? '—'}</strong>
            <small>Open workspace <span aria-hidden="true">↗</span></small>
          </Link>
        ))}
      </section>

      <div className="dashboardRecentGrid">
        <section className="card dashboardRecent" aria-labelledby="recent-activity-title">
          <div className="dashboardSectionHead">
            <div><p className="eyebrow">AUDIT TRAIL</p><h2 id="recent-activity-title">Recent activity</h2></div>
          </div>
          {activityResult.error ? (
            <p className="mut">Activity could not be loaded. Check the activity log table and admin read policy.</p>
          ) : activityResult.data.length ? (
            <ul className="dashboardRecentList">
              {activityResult.data.map((item) => (
                <li key={item.id}>
                  <div><strong>{displayStatus(item.action)}</strong><span>{item.entity || 'Workspace'}{item.entity_id ? ` · ${item.entity_id}` : ''}</span></div>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time>
                </li>
              ))}
            </ul>
          ) : <p className="mut">No activity has been recorded yet.</p>}
        </section>

        <section className="card dashboardRecent" aria-labelledby="recent-projects-title">
          <div className="dashboardSectionHead">
            <div><p className="eyebrow">PORTFOLIO</p><h2 id="recent-projects-title">Recent project updates</h2></div>
            <Link href="/admin/projects" className="dashboardTextLink">All projects ↗</Link>
          </div>
          {recentProjectsResult.error ? (
            <p className="mut">Project updates could not be loaded. Check the projects table and admin read policy.</p>
          ) : recentProjectsResult.data.length ? (
            <ul className="dashboardRecentList">
              {recentProjectsResult.data.map((project) => (
                <li key={project.id}>
                  <div><strong>{project.title || project.youtube_id || 'Untitled project'}</strong><span>{displayStatus(project.status)}</span></div>
                  <time dateTime={project.updated_at}>{new Date(project.updated_at).toLocaleDateString()}</time>
                </li>
              ))}
            </ul>
          ) : <p className="mut">No project records are available yet.</p>}
        </section>
      </div>

      <section className="dashboardToolsSection" aria-labelledby="workspaces-title">
        <div className="dashboardSectionHead"><div><p className="eyebrow">ADMINISTRATION</p><h2 id="workspaces-title">Workspaces</h2></div></div>
        <nav className="dashboardTools" aria-label="Admin workspaces">
          <Link className="card dashboardTool" href="/admin/projects"><strong>Projects / videos</strong><span>Edit metadata and publication status.</span></Link>
          <Link className="card dashboardTool" href="/admin/review"><strong>Portfolio review</strong><span>Review imported source records without changing their provenance.</span></Link>
          <Link className="card dashboardTool" href="/admin/showcase"><strong>Four-video showcase</strong><span>Choose and preview the homepage sequence.</span></Link>
          <Link className="card dashboardTool" href="/admin/studio"><strong>Website content</strong><span>Edit approved studio copy, services and social links.</span></Link>
          <Link className="card dashboardTool" href="/admin/adoptions"><strong>Adoption formats</strong><span>Manage verified alternate source formats.</span></Link>
          <Link className="card dashboardTool" href="/admin/di"><strong>DI quality review</strong><span>Track private checks for parent videos and adoptions.</span></Link>
          <Link className="card dashboardTool" href="/admin/guestbook"><strong>Guestbook moderation</strong><span>Review messages before publication.</span></Link>
          <Link className="card dashboardTool" href="/admin/account"><strong>Account & theme</strong><span>Manage your password and display preference.</span></Link>
        </nav>
      </section>
    </>
  );
}
