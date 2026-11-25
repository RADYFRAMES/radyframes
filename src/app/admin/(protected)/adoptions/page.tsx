import { requireAdmin } from '@/lib/auth/requireAdmin';
import type { PortfolioCategory, PortfolioProject, VideoAdoption } from '@/lib/portfolio/types';
import ProjectAdoptionsEditor from './ProjectAdoptionsEditor';

export const dynamic = 'force-dynamic';

export default async function ProjectAdoptionsPage() {
  const { supabase } = await requireAdmin();
  const [projectResult, categoryResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id,youtube_id,original_url,kind,category_id,topic,client,title,description,ratio_raw,ratio,status')
      .order('created_at', { ascending: false }),
    supabase.from('categories').select('id,name,slug').order('sort_order', { ascending: true }),
  ]);
  if (projectResult.error) throw new Error(`Could not load projects: ${projectResult.error.message}`);
  if (categoryResult.error) throw new Error(`Could not load categories: ${categoryResult.error.message}`);

  const projectIds = projectResult.data.map((project) => project.id);
  const adoptionResult = projectIds.length
    ? await supabase.from('project_adoptions').select('id,project_id,ratio,source_url').in('project_id', projectIds).order('sort_order')
    : { data: [], error: null };
  const categories: PortfolioCategory[] = categoryResult.data;
  const projects: PortfolioProject[] = projectResult.data.map((project) => ({
    ...project,
    category: categories.find((category) => category.id === project.category_id)?.name ?? null,
    kind: project.kind === 'short' || project.kind === 'video' ? project.kind : null,
    ratio: project.ratio === '16:9' || project.ratio === '1:1' || project.ratio === '4:5' || project.ratio === '9:16' ? project.ratio : null,
    status: project.status,
  }));
  const adoptionsByProject: Record<string, VideoAdoption[]> = {};
  for (const adoption of adoptionResult.data ?? []) {
    if (adoption.ratio !== '16:9' && adoption.ratio !== '1:1' && adoption.ratio !== '4:5' && adoption.ratio !== '9:16') continue;
    adoptionsByProject[adoption.project_id] ??= [];
    adoptionsByProject[adoption.project_id].push({ id: adoption.id, ratio: adoption.ratio, source_url: adoption.source_url });
  }

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">PORTFOLIO / SOURCE FORMATS</p><h1>Adoption formats</h1></div>
        <p className="mut">{projects.length} parent projects · no duplicate cards are created</p>
      </div>
      {adoptionResult.error ? (
        <p className="reviewDatabaseNotice" role="status">Adoption storage is not available. Review and apply <code>005_stage1_studio_workflows.sql</code> before saving format sources. The database has not been changed by this workspace.</p>
      ) : (
        <ProjectAdoptionsEditor projects={projects} adoptionsByProject={adoptionsByProject} />
      )}
    </>
  );
}
