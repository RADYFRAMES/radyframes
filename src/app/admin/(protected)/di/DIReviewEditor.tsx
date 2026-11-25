'use client';

import { useActionState, useMemo, useState } from 'react';
import type { VideoAdoption } from '@/lib/portfolio/types';
import { saveDiChecklistTemplates, saveDiReview, type DiActionState } from './actions';

type CheckStatus = 'not_started' | 'in_progress' | 'passed' | 'needs_correction' | 'not_applicable';
interface ChecklistTemplate {
  id: string;
  label: string;
  sort_order: number;
  project_id: string | null;
  adoption_id: string | null;
}
interface ReviewCheck { template_id: string; status: CheckStatus; internal_notes: string }
interface ReviewSession { internal_notes: string; review_date: string | null; final_approved: boolean }
interface ReviewTarget {
  projectId: string;
  adoptionId: string | null;
  projectName: string;
  ratio: string;
  adoptions: VideoAdoption[];
}

const initialState: DiActionState = { status: 'idle', message: '' };
const statuses: { value: CheckStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'passed', label: 'Passed' },
  { value: 'needs_correction', label: 'Needs Correction' },
  { value: 'not_applicable', label: 'Not Applicable' },
];

function targetKey(projectId: string, adoptionId: string | null) {
  return `${projectId}:${adoptionId ?? 'parent'}`;
}

function targetLabel(target: ReviewTarget) {
  return `${target.projectName}${target.ratio ? ` · ${target.ratio}` : ' · Parent video'}`;
}

function ChecklistManager({
  initialTemplates,
  targets,
}: {
  initialTemplates: ChecklistTemplate[];
  targets: ReviewTarget[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [approved, setApproved] = useState(false);
  const [state, action, pending] = useActionState(saveDiChecklistTemplates, initialState);

  function updateTemplate(id: string, update: Partial<ChecklistTemplate>) {
    setApproved(false);
    setTemplates((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  function moveTemplate(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= templates.length) return;
    setApproved(false);
    setTemplates((current) => {
      const reordered = [...current];
      [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
      return reordered;
    });
  }

  return (
    <form action={action} className="card adminForm diTemplateManager">
      <input type="hidden" name="templates" value={JSON.stringify(templates)} />
      <div><p className="eyebrow">CHECKLIST / CONFIGURATION</p><h2>Review items</h2></div>
      <p className="mut">Items apply to projects and adoption versions. Removing an item also removes its saved checks.</p>
      {templates.map((item, index) => (
        <div className="diTemplateRow" key={item.id}>
          <label className="srOnly" htmlFor={`di-template-${item.id}`}>Checklist item {index + 1}</label>
          <input id={`di-template-${item.id}`} maxLength={200} value={item.label} onChange={(event) => updateTemplate(item.id, { label: event.target.value })} />
          <label className="srOnly" htmlFor={`di-scope-${item.id}`}>Assignment for {item.label}</label>
          <select
            id={`di-scope-${item.id}`}
            className="diTemplateScope"
            value={item.project_id ? targetKey(item.project_id, item.adoption_id) : 'global'}
            onChange={(event) => {
              const target = targets.find((entry) => targetKey(entry.projectId, entry.adoptionId) === event.target.value);
              updateTemplate(item.id, { project_id: target?.projectId ?? null, adoption_id: target?.adoptionId ?? null });
            }}
          >
            <option value="global">All videos</option>
            {targets.map((target) => (
              <option value={targetKey(target.projectId, target.adoptionId)} key={targetKey(target.projectId, target.adoptionId)}>
                {targetLabel(target)}
              </option>
            ))}
          </select>
          <button type="button" className="btn ghost" onClick={() => moveTemplate(index, -1)} disabled={index === 0} aria-label={`Move ${item.label} up`}>↑</button>
          <button type="button" className="btn ghost" onClick={() => moveTemplate(index, 1)} disabled={index === templates.length - 1} aria-label={`Move ${item.label} down`}>↓</button>
          <button type="button" className="btn danger" onClick={() => {
            if (!window.confirm(`Delete "${item.label}" and its saved review checks?`)) return;
            setApproved(false);
            setTemplates((current) => current.filter((entry) => entry.id !== item.id));
          }}>Delete</button>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => {
        setApproved(false);
        setTemplates((current) => [...current, {
          id: `new-${crypto.randomUUID()}`,
          label: '',
          sort_order: (current.length + 1) * 10,
          project_id: null,
          adoption_id: null,
        }]);
      }}>Add checklist item</button>
      <label className="showcaseEnable">
        <input type="checkbox" name="approved" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
        I approve these checklist changes
      </label>
      {state.message && <p className={state.status === 'error' ? 'err' : 'ok'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
      <button className="btn" disabled={!approved || pending}>{pending ? 'Saving…' : 'Save approved checklist'}</button>
    </form>
  );
}

export default function DIReviewEditor({
  targets,
  templates,
  checksByTarget,
  sessionsByTarget,
}: {
  targets: ReviewTarget[];
  templates: ChecklistTemplate[];
  checksByTarget: Record<string, ReviewCheck[]>;
  sessionsByTarget: Record<string, ReviewSession>;
}) {
  const firstTarget = targets[0];
  const [targetValue, setTargetValue] = useState(firstTarget ? targetKey(firstTarget.projectId, firstTarget.adoptionId) : '');
  const [checkDrafts, setCheckDrafts] = useState(checksByTarget);
  const [sessionDrafts, setSessionDrafts] = useState(sessionsByTarget);
  const [approved, setApproved] = useState(false);
  const [reviewState, reviewAction, reviewPending] = useActionState(saveDiReview, initialState);
  const target = targets.find((item) => targetKey(item.projectId, item.adoptionId) === targetValue);
  const applicableTemplates = useMemo(
    () => templates.filter((template) => !template.project_id
      || (template.project_id === target?.projectId && template.adoption_id === target?.adoptionId)),
    [target?.adoptionId, target?.projectId, templates],
  );
  const currentChecks = useMemo(() => {
    const saved = target ? checkDrafts[targetValue] ?? [] : [];
    return applicableTemplates.map((template) => saved.find((check) => check.template_id === template.id) ?? {
      template_id: template.id,
      status: 'not_started' as const,
      internal_notes: '',
    });
  }, [applicableTemplates, checkDrafts, target, targetValue]);
  const canApproveFinal = currentChecks.length > 0
    && currentChecks.every((check) => check.status === 'passed' || check.status === 'not_applicable');
  const currentSession = target ? sessionDrafts[targetValue] ?? { internal_notes: '', review_date: '', final_approved: false } : null;
  const publicAdoptions = targets.filter((item) => item.adoptionId !== null);
  const parentTargets = targets.filter((item) => item.adoptionId === null);

  function updateCheck(templateId: string, update: Partial<ReviewCheck>) {
    if (!target) return;
    setApproved(false);
    setCheckDrafts((current) => ({
      ...current,
      [targetValue]: currentChecks.map((check) => check.template_id === templateId ? { ...check, ...update } : check),
    }));
  }

  function updateSession(update: Partial<ReviewSession>) {
    if (!target) return;
    setApproved(false);
    setSessionDrafts((current) => ({
      ...current,
      [targetValue]: { ...(current[targetValue] ?? { internal_notes: '', review_date: '', final_approved: false }), ...update },
    }));
  }

  return (
    <div className="diAdminLayout">
      <ChecklistManager
        key={templates.map((item) => item.id).join(':')}
        initialTemplates={templates}
        targets={targets}
      />
      <section className="card diReviewPanel">
        <div><p className="eyebrow">PRIVATE / INTERNAL ONLY</p><h2>Project quality review</h2></div>
        {!targets.length ? <p className="mut">No project records are available for review.</p> : (
          <form action={reviewAction} className="adminForm">
            <label>Project and adoption version
              <select value={targetValue} onChange={(event) => { setTargetValue(event.target.value); setApproved(false); }}>
                {parentTargets.map((item) => <option value={targetKey(item.projectId, item.adoptionId)} key={targetKey(item.projectId, item.adoptionId)}>{targetLabel(item)}</option>)}
                {publicAdoptions.map((item) => <option value={targetKey(item.projectId, item.adoptionId)} key={targetKey(item.projectId, item.adoptionId)}>{targetLabel(item)}</option>)}
              </select>
            </label>
            {target && <>
              <input type="hidden" name="project_id" value={target.projectId} />
              <input type="hidden" name="adoption_id" value={target.adoptionId ?? ''} />
              <input type="hidden" name="checks" value={JSON.stringify(currentChecks)} />
              <div className="diChecks">
                {applicableTemplates.map((template) => {
                  const check = currentChecks.find((item) => item.template_id === template.id);
                  if (!check) return null;
                  return (
                    <fieldset className="diCheckRow" key={template.id}>
                      <legend>{template.label}</legend>
                      <label>Status
                        <select value={check.status} onChange={(event) => updateCheck(template.id, { status: event.target.value as CheckStatus })}>
                          {statuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}
                        </select>
                      </label>
                      <label>Internal note<textarea rows={2} maxLength={2000} value={check.internal_notes} onChange={(event) => updateCheck(template.id, { internal_notes: event.target.value })} /></label>
                    </fieldset>
                  );
                })}
                {!applicableTemplates.length && <p className="mut">No checklist items are assigned to this target. Assign a global item or add one for this project/version.</p>}
              </div>
              <div className="adminFormGrid">
                <label>Review date<input type="date" name="review_date" value={currentSession?.review_date ?? ''} onChange={(event) => updateSession({ review_date: event.target.value })} /></label>
                <label className="showcaseEnable"><input type="checkbox" name="final_approved" checked={canApproveFinal && (currentSession?.final_approved ?? false)} disabled={!canApproveFinal} onChange={(event) => updateSession({ final_approved: event.target.checked })} /> Mark final DI approval</label>
              </div>
              {!canApproveFinal && <p className="mut" role="status">Final approval is available after every assigned check is Passed or Not Applicable.</p>}
              <label>Internal review notes<textarea name="internal_notes" rows={4} maxLength={10000} value={currentSession?.internal_notes ?? ''} onChange={(event) => updateSession({ internal_notes: event.target.value })} /></label>
              <p className="mut">Reviewer is recorded from the signed-in admin account. These notes and statuses are not public.</p>
              <label className="showcaseEnable"><input type="checkbox" name="approved" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> I approve saving this private review</label>
              {reviewState.message && <p className={reviewState.status === 'error' ? 'err' : 'ok'} role={reviewState.status === 'error' ? 'alert' : 'status'}>{reviewState.message}</p>}
              <button className="btn" disabled={!approved || reviewPending || !applicableTemplates.length}>{reviewPending ? 'Saving…' : 'Save approved review'}</button>
            </>}
          </form>
        )}
      </section>
    </div>
  );
}
