'use client';

import { useMemo, useState, useTransition } from 'react';
import PortfolioShowcase from '@/components/PortfolioShowcase';
import type { PortfolioProject } from '@/lib/portfolio/types';
import { getYoutubeVideoId } from '@/lib/portfolio/youtube';
import { getLatestSavedAfterSave } from '@/lib/portfolio/hero';
import {
  DEFAULT_SHOWCASE_SETTINGS,
  SHOWCASE_ANIMATION_STYLES,
  type ShowcaseSettings,
} from '@/lib/portfolio/showcase';
import { saveShowcaseSettings, type ShowcaseActionState } from './actions';

const initialActionState: ShowcaseActionState = { status: 'idle', message: '' };

function isSelectable(project: PortfolioProject) {
  return Boolean(
    project.youtube_id
    && project.status === 'published'
    && !project.metadata_conflict
    && getYoutubeVideoId(project.original_url) === project.youtube_id,
  );
}

export default function ShowcaseSettingsEditor({
  projects,
  initialSettings,
  settingsWarning,
  canManage,
}: {
  projects: PortfolioProject[];
  initialSettings: ShowcaseSettings;
  settingsWarning?: string;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [latestSaved, setLatestSaved] = useState(initialSettings);
  const [actionState, setActionState] = useState(initialActionState);
  const [pending, startTransition] = useTransition();
  const [selectionError, setSelectionError] = useState('');
  const selectableProjects = useMemo(() => projects.filter(isSelectable), [projects]);
  const selectedProjects = useMemo(
    () => settings.videoIds
      .map((id) => selectableProjects.find((project) => project.youtube_id === id))
      .filter((project): project is PortfolioProject => Boolean(project)),
    [selectableProjects, settings.videoIds],
  );
  const categoryCount = new Set(selectedProjects.map((project) => project.category).filter(Boolean)).size;
  const selectionReady = settings.videoIds.length === 4 && selectedProjects.length === 4;

  function toggleProject(projectId: string, checked: boolean) {
    setSelectionError('');
    if (checked && settings.videoIds.length >= 4) {
      setSelectionError('The showcase is limited to exactly four videos.');
      return;
    }
    setSettings((current) => {
      if (checked) {
        return { ...current, videoIds: [...current.videoIds, projectId] };
      }
      return { ...current, videoIds: current.videoIds.filter((id) => id !== projectId) };
    });
  }

  function moveProject(projectId: string, direction: -1 | 1) {
    setSettings((current) => {
      const from = current.videoIds.indexOf(projectId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.videoIds.length) return current;
      const videoIds = [...current.videoIds];
      [videoIds[from], videoIds[to]] = [videoIds[to], videoIds[from]];
      return { ...current, videoIds };
    });
  }

  function updateSetting<Key extends keyof ShowcaseSettings>(key: Key, value: ShowcaseSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = { ...settings, videoIds: [...settings.videoIds] };
    const formData = new FormData(event.currentTarget);
    formData.set('settings', JSON.stringify(submitted));
    startTransition(() => {
      void saveShowcaseSettings(initialActionState, formData).then((result) => {
        setActionState(result);
        setLatestSaved((current) =>
          getLatestSavedAfterSave(current, submitted, result.status === 'success' ? 'success' : 'error'),
        );
      });
    });
  }

  return (
    <div className="showcaseAdmin">
      {selectableProjects.length < 4 && (
        <p className="reviewDatabaseNotice" role="status">
          Only {selectableProjects.length} currently published, verified videos are available. Four eligible published records are required.
        </p>
      )}
      {!canManage && (
        <p className="reviewDatabaseNotice" role="status">
          Read-only access. Only super admins can modify the homepage showcase.
        </p>
      )}
      {settingsWarning && <p className="err" role="alert">{settingsWarning}</p>}
      <div className="showcaseAdminGrid">
        <section className="card showcaseSettingsPanel" aria-labelledby="showcase-settings-title">
          <div className="adminPageTitle">
            <div><p className="eyebrow">HOME PAGE / FEATURED VIDEO STRIP</p><h2 id="showcase-settings-title">Four-video showcase</h2></div>
            <span className="mut">{settings.videoIds.length} / 4 selected</span>
          </div>
          <form onSubmit={submitSettings} className="adminForm">
            <input type="hidden" name="settings" value={JSON.stringify(settings)} />
            <label className="showcaseEnable">
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={!canManage}
                onChange={(event) => updateSetting('enabled', event.target.checked)}
              />
              Enable animated showcase on the public homepage
            </label>
            <div className="adminFormGrid">
              <label>Animation style
                <select
                  value={settings.animationStyle}
                  disabled={!canManage}
                  onChange={(event) => updateSetting('animationStyle', event.target.value as ShowcaseSettings['animationStyle'])}
                >
                  {SHOWCASE_ANIMATION_STYLES.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
                </select>
              </label>
              <label>Transition duration (seconds)
                <input
                  type="number"
                  min="0.4"
                  max="2.4"
                  step="0.1"
                  value={settings.transitionSeconds}
                  disabled={!canManage}
                  onChange={(event) => updateSetting('transitionSeconds', Number(event.target.value))}
                />
              </label>
              <label className="showcaseEnable">
                <input
                  type="checkbox"
                  checked={settings.autoRotate}
                  disabled={!canManage}
                  onChange={(event) => updateSetting('autoRotate', event.target.checked)}
                />
                Automatically rotate the four-card order
              </label>
              <label>Rotation interval (seconds)
                <input
                  type="number"
                  min="3"
                  max="30"
                  step="1"
                  disabled={!canManage || !settings.autoRotate}
                  value={settings.rotationIntervalSeconds}
                  onChange={(event) => updateSetting('rotationIntervalSeconds', Number(event.target.value))}
                />
              </label>
            </div>

            <div className="showcaseSelected">
              <div>
                <h3>Selected order</h3>
                <p className="mut">Choose four distinct published records. Category variety is recommended.</p>
              </div>
              {selectedProjects.map((project, index) => (
                <div className="showcaseSelectedRow" key={project.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{project.title || project.topic || project.client || project.youtube_id}</strong><small>{project.category ?? 'Uncategorized'} · {project.status.replace('_', ' ')}</small></div>
                  <button type="button" className="btn ghost" onClick={() => project.youtube_id && moveProject(project.youtube_id, -1)} disabled={!canManage || index === 0} aria-label={`Move ${project.title || project.youtube_id} up`}>↑</button>
                  <button type="button" className="btn ghost" onClick={() => project.youtube_id && moveProject(project.youtube_id, 1)} disabled={!canManage || index === selectedProjects.length - 1} aria-label={`Move ${project.title || project.youtube_id} down`}>↓</button>
                </div>
              ))}
              {selectionReady && categoryCount < 4 && (
                <p className="mut">These videos cover {categoryCount} distinct categories. You can still save, but different categories make a more varied showcase.</p>
              )}
            </div>

            <fieldset className="showcaseVideoPicker">
              <legend>Portfolio inventory</legend>
              {projects.map((project) => {
                const videoId = project.youtube_id;
                const checked = videoId ? settings.videoIds.includes(videoId) : false;
                return (
                  <label className="showcaseVideoOption" key={project.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canManage || !isSelectable(project)}
                      onChange={(event) => videoId && toggleProject(videoId, event.target.checked)}
                    />
                    <span><strong>{project.title || project.topic || project.client || project.youtube_id || 'Untitled video'}</strong>
                      <small>{!isSelectable(project) ? 'Video link or source metadata needs review' : `${project.category ?? 'Uncategorized'} · ${project.kind === 'short' ? 'Short' : project.kind === 'video' ? 'Video' : 'Format not classified'} · ${project.status.replace('_', ' ')}`}</small>
                    </span>
                  </label>
                );
              })}
              {!projects.length && <p className="mut">No eligible inventory records are available to select.</p>}
            </fieldset>
            {selectionError && <p className="err" role="alert">{selectionError}</p>}
            {actionState.message && (
              <p className={actionState.status === 'error' ? 'err' : 'ok'} role={actionState.status === 'error' ? 'alert' : 'status'}>
                {actionState.message}
              </p>
            )}
            <div className="showcaseFormActions">
              <button className="btn" type="submit" disabled={!canManage || pending || !selectionReady}>
                {pending ? 'Saving…' : 'Save showcase'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => { setSettings(latestSaved); setSelectionError(''); }}
              >
                Cancel changes
              </button>
            </div>
          </form>
        </section>
        <aside className="showcasePreviewPanel">
          <p className="eyebrow">LIVE PREVIEW / UNSAVED</p>
          <PortfolioShowcase projects={selectedProjects} settings={settings} previewMode />
        </aside>
      </div>
    </div>
  );
}
