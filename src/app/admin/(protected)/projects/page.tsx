import { requireAdmin } from '@/lib/auth/requireAdmin';
import type { PortfolioCategory, PortfolioProject } from '@/lib/portfolio/types';
import { getGitHubThumbnailConfig } from '@/lib/github/thumbnail-repository';
import { isThumbnailPathColumnMissing } from '@/lib/portfolio/thumbnail';
import { ExistingProjects, NewCategoryForm, NewProjectForm } from './ProjectForms';
import ThumbnailManager from './ThumbnailManager';

export const dynamic = 'force-dynamic';

type AdminProjectRow = {
  id: string;
  youtube_id: string | null;
  thumbnail_path?: string | null;
  original_url: string;
  kind: string | null;
  category_id: string | null;
  import_batch_id: string | null;
  topic: string | null;
  client: string | null;
  title: string | null;
  description: string | null;
  ratio_raw: string | null;
  ratio: string | null;
  status: PortfolioProject['status'];
  sort_order: number;
};

const baseProjectStatuses = new Set(['pending_review', 'draft', 'published', 'archived']);
const reviewProjectStatuses = new Set(['approved', 'rejected']);

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const { supabase, role } = await requireAdmin();
  const [categoryResult, reviewMetadataResult, thumbnailPathProbe] = await Promise.all([
    supabase.from('categories').select('id,name,slug').order('sort_order', { ascending: true }),
    supabase.from('projects').select('reviewed_at,reviewed_by').limit(0),
    supabase.from('projects').select('thumbnail_path').limit(0),
  ]);
  if (categoryResult.error) throw new Error(`Could not load categories: ${categoryResult.error.message}`);

  const reviewWorkflowAvailable = !reviewMetadataResult.error;
  const hasThumbnailColumn = !thumbnailPathProbe.error;
  const availableStatuses = reviewWorkflowAvailable
    ? new Set([...baseProjectStatuses, ...reviewProjectStatuses])
    : baseProjectStatuses;
  const initialStatus = params.status && availableStatuses.has(params.status) ? params.status : 'all';
  const projectColumns: string = hasThumbnailColumn
    ? 'id,youtube_id,thumbnail_path,original_url,kind,category_id,import_batch_id,topic,client,title,description,ratio_raw,ratio,status,sort_order'
    : 'id,youtube_id,original_url,kind,category_id,import_batch_id,topic,client,title,description,ratio_raw,ratio,status,sort_order';
  const projectResult = await supabase
    .from('projects')
    .select(projectColumns)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (projectResult.error) throw new Error(`Could not load projects: ${projectResult.error.message}`);

  const categories: PortfolioCategory[] = categoryResult.data;
  const projectRows = projectResult.data as unknown as AdminProjectRow[];
  const projects: PortfolioProject[] = projectRows.map((project) => ({
    ...project,
    thumbnail_path: hasThumbnailColumn && 'thumbnail_path' in project && typeof project.thumbnail_path === 'string'
      ? project.thumbnail_path
      : null,
    category: categories.find((category) => category.id === project.category_id)?.name ?? null,
    kind: project.kind === 'short' || project.kind === 'video' ? project.kind : null,
    ratio: project.ratio === '16:9' || project.ratio === '1:1' || project.ratio === '4:5' || project.ratio === '9:16' ? project.ratio : null,
    status: project.status,
    sort_order: project.sort_order,
  }));
  let githubStorageAvailable = false;
  try {
    githubStorageAvailable = Boolean(getGitHubThumbnailConfig().config);
  } catch {
    githubStorageAvailable = false;
  }
  const thumbnailDisabledReason = thumbnailPathProbe.error
    ? isThumbnailPathColumnMissing(thumbnailPathProbe.error)
      ? 'Custom thumbnail storage is unavailable until the owner-approved migration 006 is applied.'
      : 'The thumbnail schema could not be verified. Uploads are disabled until the database can be checked.'
    : role !== 'super_admin'
      ? 'Only super admins can upload or replace project thumbnails.'
    : !githubStorageAvailable
      ? 'GitHub App storage is not configured or valid on this server. Thumbnail uploads are disabled.'
      : null;

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">SUPER ADMIN</p><h1>Portfolio projects</h1></div>
        <p className="mut">{projects.length} records · database-backed</p>
      </div>
      {!reviewWorkflowAvailable && (
        <p className="reviewDatabaseNotice" role="status">
          Approval and rejection are unavailable because Supabase does not expose the project review fields. Ask the database owner to confirm and approve <code>004_portfolio_review.sql</code>; no project records were changed.
        </p>
      )}
      <div className="adminPortfolioForms">
        <NewProjectForm categories={categories} />
        <NewCategoryForm />
      </div>
      <ThumbnailManager
        projects={projects}
        enabled={role === 'super_admin' && hasThumbnailColumn && githubStorageAvailable}
        disabledReason={thumbnailDisabledReason}
      />
      <h2 className="adminSectionTitle">Existing records</h2>
      <ExistingProjects
        projects={projects}
        categories={categories}
        initialStatus={initialStatus}
        reviewWorkflowAvailable={reviewWorkflowAvailable}
      />
    </>
  );
}
