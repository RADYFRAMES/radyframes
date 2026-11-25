import { requireAdmin } from '@/lib/auth/requireAdmin';
import DIReviewEditor from './DIReviewEditor';

export const dynamic = 'force-dynamic';

export default async function DIReviewPage() {
  const { supabase } = await requireAdmin();
  const projectResult = await supabase
    .from('projects')
    .select('id,youtube_id,title,topic,client,original_url,ratio,status')
    .order('created_at', { ascending: false });
  if (projectResult.error) throw new Error(`Could not load projects for DI review: ${projectResult.error.message}`);
  const projectIds = projectResult.data.map((project) => project.id);
  const [adoptionResult, templateResult, checkResult, sessionResult] = await Promise.all([
    projectIds.length
      ? supabase.from('project_adoptions').select('id,project_id,ratio,source_url').in('project_id', projectIds).order('sort_order')
      : Promise.resolve({ data: [], error: null }),
    supabase.from('di_checklist_templates').select('id,label,sort_order,project_id,adoption_id').eq('active', true).order('sort_order'),
    projectIds.length
      ? supabase.from('di_review_checks').select('project_id,adoption_id,template_id,status,internal_notes').in('project_id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from('di_review_sessions').select('project_id,adoption_id,internal_notes,review_date,final_approved').in('project_id', projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const setupError = adoptionResult.error || templateResult.error || checkResult.error || sessionResult.error;
  const adoptions = adoptionResult.data ?? [];
  const targets = projectResult.data.flatMap((project) => {
    const projectName = project.title || project.topic || project.client || project.youtube_id || 'Untitled project';
    const projectAdoptions = adoptions.filter((item) => item.project_id === project.id);
    return [
      { projectId: project.id, adoptionId: null, projectName, ratio: '', adoptions: projectAdoptions },
      ...projectAdoptions.map((item) => ({
        projectId: project.id,
        adoptionId: item.id,
        projectName,
        ratio: item.ratio,
        adoptions: projectAdoptions,
      })),
    ];
  });
  const checksByTarget: Record<string, { template_id: string; status: 'not_started' | 'in_progress' | 'passed' | 'needs_correction' | 'not_applicable'; internal_notes: string }[]> = {};
  for (const item of checkResult.data ?? []) {
    const key = `${item.project_id}:${item.adoption_id ?? 'parent'}`;
    checksByTarget[key] ??= [];
    if (item.status === 'not_started' || item.status === 'in_progress' || item.status === 'passed' || item.status === 'needs_correction' || item.status === 'not_applicable') {
      checksByTarget[key].push({ template_id: item.template_id, status: item.status, internal_notes: item.internal_notes });
    }
  }
  const sessionsByTarget: Record<string, { internal_notes: string; review_date: string | null; final_approved: boolean }> = {};
  for (const item of sessionResult.data ?? []) {
    sessionsByTarget[`${item.project_id}:${item.adoption_id ?? 'parent'}`] = {
      internal_notes: item.internal_notes,
      review_date: item.review_date,
      final_approved: item.final_approved,
    };
  }

  return (
    <>
      <div className="adminPageTitle">
        <div><p className="eyebrow">INTERNAL / QUALITY ASSURANCE</p><h1>DI review</h1></div>
        <p className="mut">Checklist statuses and notes are private to admins.</p>
      </div>
      {setupError ? (
        <p className="reviewDatabaseNotice" role="status">DI review storage is unavailable. Review and apply <code>005_stage1_studio_workflows.sql</code> to enable private review records. No database changes were made by the workspace.</p>
      ) : (
        <DIReviewEditor
          targets={targets}
          templates={templateResult.data}
          checksByTarget={checksByTarget}
          sessionsByTarget={sessionsByTarget}
        />
      )}
    </>
  );
}
