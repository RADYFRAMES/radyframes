'use client';

import { useActionState, useState } from 'react';
import type { PortfolioProject, VideoAdoption, VideoRatio } from '@/lib/portfolio/types';
import { saveProjectAdoptions, type AdoptionActionState } from './actions';

const ratios: Exclude<VideoRatio, null>[] = ['1:1', '4:5', '16:9', '9:16'];
const initialState: AdoptionActionState = { status: 'idle', message: '' };

function sourcesFor(project: PortfolioProject, adoptions: VideoAdoption[]) {
  return ratios.map((ratio) => ({
    ratio,
    source_url: adoptions.find((item) => item.ratio === ratio)?.source_url
      ?? (project.ratio === ratio ? project.original_url : ''),
  }));
}

function ProjectAdoptionsForm({
  project,
  adoptions,
}: {
  project: PortfolioProject;
  adoptions: VideoAdoption[];
}) {
  const [versions, setVersions] = useState(() => sourcesFor(project, adoptions));
  const [approved, setApproved] = useState(false);
  const [state, action, pending] = useActionState(saveProjectAdoptions, initialState);

  function updateSource(ratio: Exclude<VideoRatio, null>, source_url: string) {
    setApproved(false);
    setVersions((current) => current.map((item) => item.ratio === ratio ? { ...item, source_url } : item));
  }

  return (
    <details className="card adoptionProject">
      <summary><span><strong>{project.title || project.topic || project.client || project.youtube_id || 'Untitled project'}</strong><small>{project.category ?? 'Uncategorized'} · {adoptions.length} saved alternate source(s)</small></span><b aria-hidden="true">+</b></summary>
      <form action={action} className="adminForm adoptionForm">
        <input type="hidden" name="project_id" value={project.id} />
        <input type="hidden" name="versions" value={JSON.stringify(versions)} />
        <p className="mut">One parent card can point to up to four distinct source URLs. The original source is prefilled only when its aspect ratio is known.</p>
        <div className="adminFormGrid">
          {versions.map((version) => (
            <label key={version.ratio}>{version.ratio} source
              <input
                type="url"
                value={version.source_url}
                placeholder={project.ratio === version.ratio ? 'Original source' : 'Optional; leave blank if unavailable'}
                onChange={(event) => updateSource(version.ratio, event.target.value)}
              />
            </label>
          ))}
        </div>
        <label className="showcaseEnable">
          <input type="checkbox" name="approved" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
          I approve these adoption URLs for the project
        </label>
        {state.message && <p className={state.status === 'error' ? 'err' : 'ok'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
        <button className="btn" disabled={!approved || pending}>{pending ? 'Saving…' : 'Save approved formats'}</button>
      </form>
    </details>
  );
}

export default function ProjectAdoptionsEditor({
  projects,
  adoptionsByProject,
}: {
  projects: PortfolioProject[];
  adoptionsByProject: Record<string, VideoAdoption[]>;
}) {
  return (
    <div className="adoptionProjectList">
      {projects.map((project) => (
        <ProjectAdoptionsForm
          key={project.id}
          project={project}
          adoptions={adoptionsByProject[project.id] ?? []}
        />
      ))}
      {!projects.length && <p className="mut">Add a project before configuring adoption formats.</p>}
    </div>
  );
}
