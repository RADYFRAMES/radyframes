'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PortfolioProject } from '@/lib/portfolio/types';
import type { ShowcaseSettings } from '@/lib/portfolio/showcase';
import { getYoutubeVideoId } from '@/lib/portfolio/youtube';
import ProjectThumbnailImage from './ProjectThumbnailImage';

function projectName(project: PortfolioProject) {
  return project.title || project.topic || project.client || 'Untitled video';
}

export default function PortfolioShowcase({
  projects,
  settings,
  previewMode = false,
}: {
  projects: PortfolioProject[];
  settings: ShowcaseSettings | null;
  previewMode?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PortfolioProject | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeSettings = settings;
  const orderedProjects = useMemo(() => {
    if (!settings || projects.length !== 4) return [];
    return projects.slice(offset).concat(projects.slice(0, offset));
  }, [offset, projects, settings]);

  useEffect(() => {
    if (!settings?.autoRotate || projects.length !== 4) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) return;
    const timer = window.setInterval(
      () => setOffset((current) => (current + 1) % 4),
      settings.rotationIntervalSeconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [projects.length, settings]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  const ready = Boolean(
    activeSettings
    && activeSettings.videoIds.length === 4
    && new Set(activeSettings.videoIds).size === 4
    && projects.length === 4
    && projects.every((project) => project.status === 'published')
    && projects.every((project, index) =>
      project.youtube_id === activeSettings.videoIds[index]
      && getYoutubeVideoId(project.original_url) === project.youtube_id
    )
  );
  const shouldShowCards = ready && (previewMode || Boolean(activeSettings?.enabled));

  return (
    <section className={previewMode ? 'fourShowcase isPreview' : 'fourShowcase'} aria-labelledby={previewMode ? 'showcase-preview-title' : 'showcase-title'}>
      {!previewMode && (
        <div className="fourShowcaseHeading" data-reveal="up">
          <div>
            <p className="eyebrow">SELECTED / FOUR FRAMES</p>
            <h2 id="showcase-title">A moving point<br /><span>of view.</span></h2>
          </div>
          <p>Four selected films. One considered sequence.</p>
        </div>
      )}
      {previewMode && <h3 id="showcase-preview-title" className="showcasePreviewTitle">Unsaved showcase preview</h3>}
      {shouldShowCards ? (
        <div
          className={`fourShowcaseGrid showcase-${activeSettings?.animationStyle}`}
          style={{ '--showcase-duration': `${activeSettings?.transitionSeconds ?? 0.8}s` } as CSSProperties}
          aria-label="Four selected portfolio videos"
        >
          {orderedProjects.map((project, index) => {
            const videoId = project.youtube_id && getYoutubeVideoId(project.original_url) === project.youtube_id
              ? project.youtube_id
              : null;
            return (
              <article className="fourShowcaseCard" key={project.id} style={{ animationDelay: `${index * 70}ms` }}>
                <button
                  type="button"
                  className="fourShowcasePoster"
                  aria-label={`Play ${projectName(project)}`}
                  onClick={() => videoId && setSelected(project)}
                  disabled={!videoId}
                >
                  <div className="fourShowcaseImage" style={{ aspectRatio: project.ratio?.replace(':', ' / ') ?? '16 / 9' }}>
                    <ProjectThumbnailImage
                      project={{ ...project, youtube_id: videoId }}
                      sizes="(max-width: 700px) 90vw, (max-width: 1000px) 45vw, 24vw"
                      fallback={<span className="fourShowcaseFallback">{videoId ? projectName(project) : 'Verified YouTube link unavailable'}</span>}
                    />
                    <span className="fourShowcasePlay" aria-hidden="true">PLAY <b>↗</b></span>
                    <span className="fourShowcaseIndex">{String(index + 1).padStart(2, '0')} / 04</span>
                  </div>
                </button>
                <div className="fourShowcaseMeta">
                  <span>{project.category ?? 'Uncategorized'}</span>
                  {project.kind && <span>{project.kind === 'short' ? 'Short' : 'Video'}</span>}
                </div>
                <h3>{projectName(project)}</h3>
                {project.client && <p>{project.client}</p>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="fourShowcaseEmpty" role="status">
          <span className="eyebrow">{previewMode ? 'PREVIEW NOT READY' : 'SHOWCASE NOT CONFIGURED'}</span>
          <p>{previewMode
            ? `Select exactly four published videos to preview. ${projects.length} currently selected.`
            : !settings
              ? 'The studio has not configured this showcase yet.'
              : !settings.enabled
                ? 'The studio has temporarily disabled the four-video showcase.'
                : `Four published videos are required. ${projects.length} selected videos are currently published.`}</p>
        </div>
      )}
      {settings?.autoRotate && (
        <p className="showcaseRotationNote">Automatic rotation pauses when reduced motion is enabled.</p>
      )}
      <dialog
        ref={dialogRef}
        className="videoDialog"
        aria-label={selected ? `Video player: ${projectName(selected)}` : 'Video player'}
        onClose={() => setSelected(null)}
        onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}
      >
        {selected && selected.youtube_id && (
          <>
            <div className="dialogTop">
              <div>
                <p className="portfolioMeta">{selected.category ?? 'Uncategorized'}</p>
                <h3>{projectName(selected)}</h3>
              </div>
              <button type="button" className="dialogClose" onClick={() => dialogRef.current?.close()} aria-label="Close video player">×</button>
            </div>
            <div className="videoFrame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${selected.youtube_id}?controls=1&rel=0`}
                title={projectName(selected)}
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            <a className="watchLink" href={selected.original_url} target="_blank" rel="noreferrer">Open original YouTube link ↗</a>
          </>
        )}
      </dialog>
    </section>
  );
}
