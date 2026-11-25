'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  createCategory,
  createProject,
  deleteProject,
  updateProject,
  type ProjectActionState,
} from './actions';
import type { PortfolioCategory, PortfolioProject } from '@/lib/portfolio/types';
import ProjectThumbnailImage from '@/components/ProjectThumbnailImage';
const initialProjectActionState: ProjectActionState = { status: 'idle', message: '' };
const statusOptions = [
  ['pending_review', 'Pending Review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['draft', 'Draft'],
  ['published', 'Published'],
  ['archived', 'Archived'],
] as const;

function ActionMessage({ state }: { state: { status: string; message: string } }) {
  if (!state.message) return null;
  return <p className={state.status === 'error' ? 'err' : 'ok'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>;
}

function ProjectThumbnail({ project }: { project: PortfolioProject }) {
  return (
    <div className="adminProjectThumbnail">
      <ProjectThumbnailImage project={project} sizes="160px" fallback={<span>Thumbnail unavailable</span>} />
    </div>
  );
}

export function NewCategoryForm() {
  const [state, action, pending] = useActionState(createCategory, initialProjectActionState);
  return (
    <form action={action} className="card adminForm" id="categories">
      <h2>Add category</h2>
      <label>Category name<input name="name" required maxLength={100} /></label>
      <ActionMessage state={state} />
      <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Create category'}</button>
    </form>
  );
}

export function NewProjectForm({ categories }: { categories: PortfolioCategory[] }) {
  const [state, action, pending] = useActionState(createProject, initialProjectActionState);
  return (
    <form action={action} className="card adminForm">
      <h2>Add video project</h2>
      <label>YouTube URL<input name="original_url" type="url" required placeholder="https://youtu.be/…" /></label>
      <div className="adminFormGrid">
        <label>Title<input name="title" /></label>
        <label>Topic<input name="topic" /></label>
        <label>Brand / client<input name="client" /></label>
        <label>Category<select name="category_id" defaultValue=""><option value="">Uncategorized / To Classify</option>{categories.filter((category) => category.slug !== 'uncategorized').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Aspect ratio<select name="ratio" defaultValue=""><option value="">Not verified</option><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label>
        <label>Raw ratio from source<input name="ratio_raw" /></label>
        <label>Format<select name="kind" defaultValue=""><option value="">Not classified</option><option value="short">Short</option><option value="video">Regular video</option></select></label>
        <label>Display order<input name="sort_order" type="number" min="0" max="1000000" step="1" defaultValue="100" required /></label>
      </div>
      <label>Description<textarea name="description" rows={3} /></label>
      <ActionMessage state={state} />
      <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Add as Pending Review'}</button>
    </form>
  );
}

function ExistingProjectRow({
  project,
  categories,
  reviewWorkflowAvailable,
}: {
  project: PortfolioProject;
  categories: PortfolioCategory[];
  reviewWorkflowAvailable: boolean;
}) {
  const [updateState, updateAction, updating] = useActionState(updateProject, initialProjectActionState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteProject, initialProjectActionState);
  const availableStatusOptions = reviewWorkflowAvailable
    ? statusOptions
    : statusOptions.filter(([value]) => value !== 'approved' && value !== 'rejected');
  return (
    <article className="card adminProject">
      <div className="adminProjectSummary">
        <ProjectThumbnail project={project} />
        <div>
          <p className="portfolioMeta">{project.category ?? 'Uncategorized / To Classify'} · {project.status.replace('_', ' ')}</p>
          <h3>{project.title || project.topic || project.client || project.youtube_id || 'Untitled project'}</h3>
          <a className="watchLink" href={project.original_url} target="_blank" rel="noreferrer">Open YouTube source ↗</a>
        </div>
      </div>
      <form action={updateAction} className="adminForm">
        <input type="hidden" name="id" value={project.id} />
        <div className="adminFormGrid">
          <label>Original URL<input name="original_url" type="url" required defaultValue={project.original_url} /></label>
          <label>Title<input name="title" defaultValue={project.title ?? ''} /></label>
          <label>Topic<input name="topic" defaultValue={project.topic ?? ''} /></label>
          <label>Brand / client<input name="client" defaultValue={project.client ?? ''} /></label>
          <label>Category<select name="category_id" defaultValue={project.category_id ?? ''}><option value="">Uncategorized / To Classify</option>{categories.filter((category) => category.slug !== 'uncategorized').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Aspect ratio<select name="ratio" defaultValue={project.ratio ?? ''}><option value="">Not verified</option><option>9:16</option><option>16:9</option><option>1:1</option><option>4:5</option></select></label>
          <label>Raw ratio<input name="ratio_raw" defaultValue={project.ratio_raw ?? ''} /></label>
          <label>Format<select name="kind" defaultValue={project.kind ?? ''}><option value="">Not classified</option><option value="short">Short</option><option value="video">Regular video</option></select></label>
          <label>Display order<input name="sort_order" type="number" min="0" max="1000000" step="1" defaultValue={project.sort_order ?? 0} required /></label>
          <label>Status<select name="status" defaultValue={project.status}>{availableStatusOptions.map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={
                ((value === 'approved' || value === 'rejected') && Boolean(project.import_batch_id) && project.status !== value)
                || (value === 'published' && project.status !== 'approved' && project.status !== 'published')
              }
            >{label}</option>
          ))}</select></label>
        </div>
        <label>Description<textarea name="description" rows={2} defaultValue={project.description ?? ''} /></label>
        <ActionMessage state={updateState} />
        <div className="adminProjectFormActions">
          <button className="btn" disabled={updating}>{updating ? 'Saving…' : 'Save project'}</button>
          <button className="btn ghost" type="reset" disabled={updating}>Cancel edits</button>
        </div>
      </form>
      <form action={deleteAction} className="deleteProjectForm">
        <input type="hidden" name="id" value={project.id} />
        <ActionMessage state={deleteState} />
        <button className="btn danger" disabled={deleting} onClick={(event) => {
          if (!window.confirm('Delete this project record? Its workbook import-row history will remain.')) event.preventDefault();
        }}>{deleting ? 'Deleting…' : 'Delete project'}</button>
      </form>
    </article>
  );
}

export function ExistingProjects({
  projects,
  categories,
  initialStatus,
  reviewWorkflowAvailable,
}: {
  projects: PortfolioProject[];
  categories: PortfolioCategory[];
  initialStatus: string;
  reviewWorkflowAvailable: boolean;
}) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState(initialStatus);
  const availableStatusOptions = reviewWorkflowAvailable
    ? statusOptions
    : statusOptions.filter(([value]) => value !== 'approved' && value !== 'rejected');
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      if (status !== 'all' && project.status !== status) return false;
      if (categoryId === 'uncategorized' && project.category_id
        && categories.find((category) => category.id === project.category_id)?.slug !== 'uncategorized') return false;
      if (categoryId !== 'all' && categoryId !== 'uncategorized' && project.category_id !== categoryId) return false;
      if (!query) return true;
      return [project.title, project.topic, project.client, project.youtube_id]
        .some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [categories, categoryId, projects, search, status]);

  return (
    <section className="adminProjectsWorkspace" aria-label="Existing video projects">
      <div className="adminProjectsFilters">
        <label>Search projects
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, topic, client, or YouTube ID" />
        </label>
        <label>Category
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="all">All categories</option>
            <option value="uncategorized">Uncategorized / To Classify</option>
            {categories.filter((category) => category.slug !== 'uncategorized').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {availableStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="btn ghost" type="button" onClick={() => { setSearch(''); setCategoryId('all'); setStatus('all'); }}>Clear filters</button>
      </div>
      <p className="mut adminProjectResultCount" aria-live="polite">Showing {filteredProjects.length} of {projects.length} projects</p>
      <div className="adminProjectList">
        {filteredProjects.map((project) => (
          <ExistingProjectRow
            key={project.id}
            project={project}
            categories={categories}
            reviewWorkflowAvailable={reviewWorkflowAvailable}
          />
        ))}
        {!projects.length && <p className="card mut">No project records in Supabase yet.</p>}
        {projects.length > 0 && !filteredProjects.length && <p className="card mut">No projects match these filters.</p>}
      </div>
    </section>
  );
}
