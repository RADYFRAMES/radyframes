'use client';

import { useState, useTransition } from 'react';
import {
  validateHeroPosterUrl,
  validateHeroVideoUrl,
  getLatestSavedAfterSave,
  getHeroVideoEmbedUrl,
  type HeroVideoSettings,
} from '@/lib/portfolio/hero';
import { saveHeroVideoSettings, type HeroVideoActionState } from './hero-actions';

const initialActionState: HeroVideoActionState = { status: 'idle', message: '' };

export default function HeroVideoSettingsEditor({
  initialSettings,
  canManage,
}: {
  initialSettings: HeroVideoSettings;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [latestSaved, setLatestSaved] = useState(initialSettings);
  const [actionState, setActionState] = useState(initialActionState);
  const [pending, startTransition] = useTransition();

  function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = { ...settings };
    const formData = new FormData(event.currentTarget);
    formData.set('settings', JSON.stringify(submitted));
    startTransition(() => {
      void saveHeroVideoSettings(initialActionState, formData).then((result) => {
        setActionState(result);
        setLatestSaved((current) =>
          getLatestSavedAfterSave(current, submitted, result.status === 'success' ? 'success' : 'error'),
        );
      });
    });
  }

  const videoFeedback = settings.videoUrl
    ? validateHeroVideoUrl(settings.videoUrl)
      ? 'Valid MP4, WebM, or YouTube source.'
      : 'Use an HTTPS MP4/WebM URL, YouTube URL, or same-origin /public video path.'
    : 'A video URL is required while the hero is enabled.';
  const posterFeedback = settings.posterUrl
    ? validateHeroPosterUrl(settings.posterUrl)
      ? 'Valid poster image.'
      : 'Use an HTTPS JPEG/PNG/WebP URL or a same-origin /public image path.'
    : '';
  const previewSource = validateHeroVideoUrl(settings.videoUrl);
  const previewEmbedUrl = getHeroVideoEmbedUrl(previewSource);
  const previewPoster = validateHeroPosterUrl(settings.posterUrl);

  return (
    <section className="card heroVideoSettings" aria-labelledby="hero-video-settings-title">
      <div className="adminPageTitle">
        <div>
          <p className="eyebrow">HOME PAGE / CINEMATIC HERO</p>
          <h2 id="hero-video-settings-title">Hero video settings</h2>
        </div>
        <span className="mut">{settings.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>

      {!canManage && (
        <p className="reviewDatabaseNotice" role="status">
          Read-only access. Only super admins can change the homepage hero video.
        </p>
      )}

      <form onSubmit={submitSettings} className="adminForm">
        <input type="hidden" name="settings" value={JSON.stringify(settings)} />
        <label className="showcaseEnable">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!canManage || pending}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
          />
          Enable cinematic hero video
        </label>

        <div className="adminFormGrid">
          <label>
            Video URL
            <input
              type="text"
              value={settings.videoUrl}
              disabled={!canManage || pending}
              placeholder="/hero-film.mp4 or https://youtube.com/watch?v=..."
              onChange={(event) => setSettings((current) => ({ ...current, videoUrl: event.target.value }))}
            />
            <small className={settings.enabled && !validateHeroVideoUrl(settings.videoUrl) ? 'err' : 'mut'}>
              {videoFeedback}
            </small>
          </label>
          <label>
            Poster URL (optional)
            <input
              type="text"
              value={settings.posterUrl ?? ''}
              disabled={!canManage || pending}
              placeholder="/hero-poster.webp"
              onChange={(event) => setSettings((current) => ({
                ...current,
                posterUrl: event.target.value || undefined,
              }))}
            />
            {posterFeedback && <small className={validateHeroPosterUrl(settings.posterUrl) ? 'mut' : 'err'}>{posterFeedback}</small>}
          </label>
        </div>

        <div className="heroVideoPreview" aria-label="Hero video preview">
          {previewSource && settings.enabled ? (
            previewEmbedUrl ? (
              <iframe
                src={previewEmbedUrl}
                title="Hero video preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                src={previewSource}
                poster={previewPoster ?? undefined}
                controls
                muted
                playsInline
                preload="metadata"
              />
            )
          ) : (
            <div className="heroVideoPreviewFallback">
              <span>Static hero fallback</span>
              <p>{settings.enabled ? 'Enter a valid video URL to preview.' : 'The homepage hero will remain static while disabled.'}</p>
            </div>
          )}
        </div>

        {actionState.message && (
          <p className={actionState.status === 'error' ? 'err' : 'ok'} role={actionState.status === 'error' ? 'alert' : 'status'}>
            {actionState.message}
          </p>
        )}

        <div className="showcaseFormActions">
          <button
            className="btn"
            type="submit"
            disabled={!canManage || pending || (settings.enabled && !validateHeroVideoUrl(settings.videoUrl)) || Boolean(settings.posterUrl && !validateHeroPosterUrl(settings.posterUrl))}
          >
            {pending ? 'Saving…' : 'Save hero video'}
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={pending}
            onClick={() => setSettings(latestSaved)}
          >
            Cancel / reset
          </button>
        </div>
      </form>
    </section>
  );
}
