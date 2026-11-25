'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PortfolioCategory, PortfolioProject } from '@/lib/portfolio/types';
import type { VideoAdoption, VideoRatio } from '@/lib/portfolio/types';
import { getYoutubeVideoId } from '@/lib/portfolio/youtube';
import { isUncategorizedCategory, projectMatchesService, type PortfolioService } from '@/lib/portfolio/services';
import ProjectThumbnailImage from './ProjectThumbnailImage';

type PlaybackEntry = {
  project: PortfolioProject;
  sourceUrl: string;
  ratio: VideoRatio;
  videoId: string;
};

type YouTubePlayer = {
  destroy: () => void;
  loadVideoById: (videoId: string | { videoId: string }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
        onAutoplayBlocked?: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; CUED: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('The YouTube player API did not initialize.'));
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    script.addEventListener('error', () => {
      youtubeApiPromise = null;
      reject(new Error('The YouTube player API could not be loaded.'));
    }, { once: true });
  });

  return youtubeApiPromise;
}

function youtubePlaybackError(code: number) {
  if (code === 2) return 'This video has an invalid YouTube ID.';
  if (code === 5) return 'YouTube could not play this video in the embedded player.';
  if (code === 100) return 'This video is unavailable or private on YouTube.';
  if (code === 101 || code === 150) return 'The owner does not allow this video to play on other websites.';
  if (code === 153) return 'YouTube could not verify the player request. Open the video directly on YouTube.';
  return 'This video could not be played. Open it directly on YouTube.';
}

function projectLabel(project: PortfolioProject) {
  return project.title || project.topic || project.client || 'Video project';
}

function Thumbnail({ project, sourceUrl, ratio }: { project: PortfolioProject; sourceUrl: string; ratio: VideoRatio }) {
  const aspectRatio = ratio?.replace(':', ' / ') ?? '16 / 9';
  const label = projectLabel(project);
  const thumbnailProject = {
    ...project,
    original_url: sourceUrl,
    youtube_id: getYoutubeVideoId(sourceUrl),
  };
  return (
    <div className="portfolioThumb" data-reveal="image" style={{ aspectRatio }}>
      <ProjectThumbnailImage
        project={thumbnailProject}
        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
        fallback={<span className="thumbnailFallback" aria-hidden="true"><span>RADYFRAMES / VIDEO STILL</span><strong>{label}</strong></span>}
      />
      <span className="playBadge" aria-hidden="true"><span>PLAY</span><b>↗</b></span>
    </div>
  );
}

export default function PortfolioGallery({
  projects,
  categories,
  hideFilters = false,
  serviceFilter = null,
  onClearService,
}: {
  projects: PortfolioProject[];
  categories: PortfolioCategory[];
  hideFilters?: boolean;
  serviceFilter?: PortfolioService | null;
  onClearService?: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [playlist, setPlaylist] = useState<PlaybackEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [selectedAdoptions, setSelectedAdoptions] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const playerTargetRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerReadyRef = useRef(false);
  const playlistRef = useRef<PlaybackEntry[]>([]);
  const selectedIndexRef = useRef(selectedIndex);
  const selected = playlist[selectedIndex] ?? null;
  const selectedVideoId = selected?.videoId ?? null;

  useEffect(() => {
    playlistRef.current = playlist;
    selectedIndexRef.current = selectedIndex;
  }, [playlist, selectedIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  useEffect(() => () => {
    playerRef.current?.destroy();
    playerRef.current = null;
    playerReadyRef.current = false;
  }, []);

  useEffect(() => {
    if (!selectedVideoId) return;
    let cancelled = false;

    if (playerRef.current) {
      if (playerReadyRef.current) {
        playerRef.current.mute();
        playerRef.current.loadVideoById(selectedVideoId);
      }
      return;
    }

    loadYouTubeApi().then((youtube) => {
      if (cancelled || !playerTargetRef.current) return;
      playerReadyRef.current = false;
      playerRef.current = new youtube.Player(playerTargetRef.current, {
        videoId: selectedVideoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: ({ target }) => {
            playerRef.current = target;
            target.mute();
            playerReadyRef.current = true;
            const activeVideoId = playlistRef.current[selectedIndexRef.current]?.videoId;
            if (activeVideoId && activeVideoId !== selectedVideoId) target.loadVideoById(activeVideoId);
            else target.playVideo();
            setPlayerReady(true);
          },
          onStateChange: ({ data }) => {
            if (data === youtube.PlayerState.PLAYING) {
              setIsPlaying(true);
              setIsCompleted(false);
              setAutoplayBlocked(false);
              return;
            }
            if (data === youtube.PlayerState.PAUSED || data === youtube.PlayerState.CUED) setIsPlaying(false);
            if (data === youtube.PlayerState.ENDED) {
              setIsPlaying(false);
              const nextIndex = selectedIndexRef.current + 1;
              if (nextIndex < playlistRef.current.length) {
                selectedIndexRef.current = nextIndex;
                setSelectedIndex(nextIndex);
              } else {
                setIsCompleted(true);
              }
            }
          },
          onError: ({ data }) => {
            playerReadyRef.current = true;
            setPlayerError(youtubePlaybackError(data));
            setIsPlaying(false);
            setPlayerReady(true);
          },
          onAutoplayBlocked: () => {
            setAutoplayBlocked(true);
            setIsPlaying(false);
          },
        },
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setPlayerError(error instanceof Error ? error.message : 'The YouTube player could not be loaded.');
    });

    return () => { cancelled = true; };
  }, [selectedVideoId]);

  const hasUncategorized = projects.some((project) => isUncategorizedCategory(project.category));
  function getAvailableAdoptions(project: PortfolioProject): VideoAdoption[] {
    const savedAdoptions = project.adoption_versions ?? [];
    if (!project.ratio || savedAdoptions.some((adoption) => adoption.ratio === project.ratio)) return savedAdoptions;
    return [{ id: `original:${project.id}`, ratio: project.ratio, source_url: project.original_url }, ...savedAdoptions];
  }

  function getSelectedAdoption(project: PortfolioProject): VideoAdoption | null {
    const adoptions = getAvailableAdoptions(project);
    return adoptions.find((adoption) => adoption.id === selectedAdoptions[project.id]) ?? adoptions[0] ?? null;
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      const matchesService = !serviceFilter || projectMatchesService(project, serviceFilter);
      const matchesCategory = Boolean(serviceFilter) || activeCategory === 'all'
        || (activeCategory === 'uncategorized' ? isUncategorizedCategory(project.category) : project.category === activeCategory);
      const searchable = [project.title, project.topic, project.client, project.description, project.category, project.original_url]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return matchesService && matchesCategory && (!term || searchable.includes(term));
    });
  }, [activeCategory, projects, search, serviceFilter]);

  function handleOpenPlaylist(project: PortfolioProject) {
    const entries = filtered.flatMap((item) => {
      const adoption = getSelectedAdoption(item);
      const sourceUrl = adoption?.source_url ?? item.original_url;
      const videoId = getYoutubeVideoId(sourceUrl);
      return adoption && videoId
        ? [{ project: item, sourceUrl, ratio: adoption.ratio, videoId }]
        : [];
    });
    const index = entries.findIndex((entry) => entry.project.id === project.id);
    if (index < 0) return;
    setPlaylist(entries);
    setSelectedIndex(index);
    setPlayerReady(false);
    setIsPlaying(false);
    setIsCompleted(false);
    setAutoplayBlocked(false);
    setPlayerError('');
  }

  function handleClosePlayer() {
    playerRef.current?.destroy();
    playerRef.current = null;
    playerReadyRef.current = false;
    setPlayerReady(false);
    setIsPlaying(false);
    setIsCompleted(false);
    setAutoplayBlocked(false);
    setPlayerError('');
    setSelectedIndex(-1);
    setPlaylist([]);
  }

  function handleGoToPlaylistIndex(index: number) {
    if (index < 0 || index >= playlist.length) return;
    setIsCompleted(false);
    setAutoplayBlocked(false);
    setPlayerError('');
    setSelectedIndex(index);
  }

  return (
    <div className="portfolioBrowser">
      {!hideFilters && <div className="portfolioTools">
        {serviceFilter ? (
          <div className="activeServiceFilter" role="status">
            <span>VIEWING SERVICE</span>
            <strong>{serviceFilter}</strong>
            <div className="serviceFilterActions">
              <button type="button" onClick={() => { setActiveCategory('all'); onClearService?.(); }}>Clear Filter</button>
              <button type="button" onClick={() => { setActiveCategory('all'); setSearch(''); onClearService?.(); }}>View All Videos</button>
            </div>
          </div>
        ) : (
          <div className="categoryFilters" aria-label="Filter projects by category">
            <button type="button" className={activeCategory === 'all' ? 'filterButton active' : 'filterButton'} onClick={() => setActiveCategory('all')}>All</button>
            {categories.map((category) => (
              <button type="button" key={category.id} className={activeCategory === category.name ? 'filterButton active' : 'filterButton'} onClick={() => setActiveCategory(category.name)}>
                {category.name}
              </button>
            ))}
            {hasUncategorized && (
              <button type="button" className={activeCategory === 'uncategorized' ? 'filterButton active' : 'filterButton'} onClick={() => setActiveCategory('uncategorized')}>
                Uncategorized
              </button>
            )}
          </div>
        )}
        <label className="portfolioSearch">
          <span className="srOnly">Search portfolio</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search videos, brands, categories..." />
        </label>
      </div>}

      {filtered.length ? (
        <div className="portfolioGrid" aria-live="polite">
          {filtered.map((project, index) => (
            (() => {
              const adoption = getSelectedAdoption(project);
              const sourceUrl = adoption?.source_url ?? project.original_url;
              const sourceVideoId = getYoutubeVideoId(sourceUrl);
              const sourceRatio = adoption?.ratio ?? project.ratio;
              const selectableAdoptions = getAvailableAdoptions(project);
              return <article
                className="portfolioCard"
                key={project.id}
                style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }}
              >
                <button
                  className="previewButton"
                  type="button"
                  onClick={() => handleOpenPlaylist(project)}
                  aria-label={`Play ${projectLabel(project)}${adoption ? ` in ${adoption.ratio} format` : ''}`}
                  disabled={!adoption || !sourceVideoId}
                >
                  <Thumbnail project={project} sourceUrl={sourceUrl} ratio={sourceRatio} />
                </button>
                {selectableAdoptions.length > 1 && (
                  <div className="adoptionChoices" role="group" aria-label={`${projectLabel(project)} adoption formats`}>
                    <span>FORMAT</span>
                    {selectableAdoptions.map((version) => (
                      <button
                        type="button"
                        key={version.id}
                        className={adoption?.id === version.id ? 'adoptionChoice active' : 'adoptionChoice'}
                        aria-pressed={adoption?.id === version.id}
                        onClick={() => setSelectedAdoptions((current) => ({ ...current, [project.id]: version.id }))}
                      >
                        {version.ratio}
                      </button>
                    ))}
                  </div>
                )}
              <div className="portfolioCardText">
                <div>
                  <p className="portfolioMeta">{project.category ?? 'Uncategorized'}{project.kind ? ` · ${project.kind === 'short' ? 'Short' : 'Video'}` : ''}</p>
                  <h3>{sourceVideoId
                    ? <a href={sourceUrl} target="_blank" rel="noreferrer">{projectLabel(project)}</a>
                    : projectLabel(project)}</h3>
                  {project.client && <p className="mut">{project.client}</p>}
                  {project.metadata_conflict && <p className="portfolioConflictFlag">Source metadata conflict · review before use</p>}
                  {project.local_preview && <p className="portfolioPreviewFlag">Local preview · pending review</p>}
                </div>
                <span className="ratioLabel">{adoption?.ratio ?? project.ratio_raw ?? 'Aspect ratio not recorded'}</span>
                {sourceVideoId
                  ? <a className="watchLink" href={sourceUrl} target="_blank" rel="noreferrer">Watch on YouTube ↗</a>
                  : <span className="ratioLabel">YouTube link needs verification</span>}
              </div>
              </article>;
            })()
          ))}
        </div>
      ) : (
        <div className="emptyState portfolioEmpty" role="status">
          <p>{serviceFilter
            ? `No ${serviceFilter} videos are available yet.`
            : projects.length
              ? projects.some((project) => project.local_preview) ? 'No local-preview videos match this filter.' : 'No published videos match this filter.'
              : 'No approved videos are published yet.'}</p>
          <span>{serviceFilter
            ? 'Only explicitly matching categories and project metadata appear here. Uncategorized videos are not included.'
            : projects.some((project) => project.local_preview)
            ? 'The local preview uses only the approved workbook inventory and does not publish records.'
            : 'Imported videos remain private until an administrator approves and publishes them.'}</span>
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="videoDialog"
        aria-label={selected ? `Video playlist: ${projectLabel(selected.project)}` : 'Video playlist'}
        onClose={handleClosePlayer}
        onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}
      >
        {selected && (
          <>
            <div className="dialogTop">
              <div>
                <p className="portfolioMeta">{selected.project.category ?? 'Uncategorized'}{selected.project.client ? ` · ${selected.project.client}` : ''} · {selected.ratio}</p>
                <h3>{projectLabel(selected.project)}</h3>
              </div>
              <button type="button" className="dialogClose" onClick={() => dialogRef.current?.close()} aria-label="Close video player">×</button>
            </div>
            <div
              className="videoFrame playlistVideoFrame"
              style={{
                aspectRatio: selected.ratio?.replace(':', ' / ') ?? '16 / 9',
                width: selected.ratio === '9:16' ? 'min(100%, 36.56vh)' : selected.ratio === '1:1' ? 'min(100%, 65vh)' : selected.ratio === '4:5' ? 'min(100%, 52vh)' : '100%',
              }}
            >
              <div ref={playerTargetRef} title={`${projectLabel(selected.project)} (${selected.ratio})`} />
            </div>
            <div className="playlistToolbar">
              <span className="playlistPosition">VIDEO {selectedIndex + 1} OF {playlist.length}</span>
              <div className="playlistControls" role="group" aria-label="Video playlist controls">
                <button type="button" onClick={() => handleGoToPlaylistIndex(selectedIndex - 1)} disabled={selectedIndex <= 0}>Previous</button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) playerRef.current?.pauseVideo();
                    else {
                      playerRef.current?.playVideo();
                      setAutoplayBlocked(false);
                    }
                  }}
                  disabled={!playerReady || Boolean(playerError)}
                >{isPlaying ? 'Pause' : 'Play'}</button>
                <button type="button" onClick={() => handleGoToPlaylistIndex(selectedIndex + 1)} disabled={selectedIndex >= playlist.length - 1}>Next</button>
              </div>
              <span className="playlistMutedNote">Starts muted</span>
            </div>
            {autoplayBlocked && (
              <div className="playlistNotice" role="status">
                <span>Playback needs your permission.</span>
                {selectedIndex < playlist.length - 1 ? (
                  <button type="button" onClick={() => handleGoToPlaylistIndex(selectedIndex + 1)}>Play Next</button>
                ) : (
                  <button type="button" onClick={() => { playerRef.current?.playVideo(); setAutoplayBlocked(false); }}>Play video</button>
                )}
              </div>
            )}
            {playerError && <p className="playlistNotice playlistError" role="alert">{playerError}</p>}
            {isCompleted && <p className="playlistComplete" role="status">Playlist complete. You&apos;ve reached the final video.</p>}
            <a className="watchLink" href={selected.sourceUrl} target="_blank" rel="noreferrer">Open this adoption source on YouTube ↗</a>
          </>
        )}
      </dialog>
    </div>
  );
}
