'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getHeroVideoEmbedUrl,
  getHeroYouTubeVideoId,
  validateHeroPosterUrl,
  validateHeroVideoUrl,
} from '@/lib/portfolio/hero';
import {
  shouldHideHeroText,
  YouTubePlayerBridge,
  YOUTUBE_NOCOOKIE_ORIGIN,
} from '@/lib/portfolio/youtube-player-bridge';

type VideoState = 'loading' | 'ready' | 'playing' | 'ended' | 'unavailable';

function getSafeVideoSource(value: string | undefined) {
  return validateHeroVideoUrl(value);
}

export default function CinematicHero({ videoUrl, posterUrl }: { videoUrl?: string; posterUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerBridgeRef = useRef<YouTubePlayerBridge | null>(null);
  const restartHandshakeRef = useRef<() => void>(() => {});
  const source = getSafeVideoSource(videoUrl);
  const isYouTubeSource = getHeroYouTubeVideoId(source) !== null;
  const youtubeEmbedUrl = getHeroVideoEmbedUrl(source);
  const poster = validateHeroPosterUrl(posterUrl);
  const [videoState, setVideoState] = useState<VideoState>(source ? 'loading' : 'unavailable');
  const [muted, setMuted] = useState(true);
  const [playbackMessage, setPlaybackMessage] = useState('');
  const [heroTextHidden, setHeroTextHidden] = useState(false);

  useEffect(() => {
    if (!isYouTubeSource) return;
    const bridge = new YouTubePlayerBridge(
      (message, targetOrigin) => iframeRef.current?.contentWindow?.postMessage(message, targetOrigin),
      (state) => {
        setHeroTextHidden((current) => shouldHideHeroText(current, state));
        if (state === 'unavailable') {
          setVideoState('unavailable');
          setPlaybackMessage('The YouTube hero video could not be initialized.');
        } else {
          setVideoState(state === 'paused' ? 'ready' : state);
          if (state === 'ready') setPlaybackMessage('');
        }
      },
      setMuted,
      () => {
        setVideoState('unavailable');
        setPlaybackMessage('The YouTube hero video reported a playback error.');
      },
    );
    playerBridgeRef.current = bridge;
    let handshake: number | null = null;
    const startHandshake = () => {
      if (handshake !== null) return;
      bridge.startListening();
      handshake = window.setInterval(() => bridge.startListening(), 400);
    };
    restartHandshakeRef.current = startHandshake;
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== YOUTUBE_NOCOOKIE_ORIGIN
        || event.source !== iframeRef.current?.contentWindow
      ) return;
      bridge.handleMessage(event.data);
      if (bridge.isReady() && handshake !== null) {
        window.clearInterval(handshake);
        handshake = null;
      }
    };
    window.addEventListener('message', onMessage);
    const iframe = iframeRef.current;
    const originAwareUrl = getHeroVideoEmbedUrl(source, window.location.origin);
    if (iframe && originAwareUrl && iframe.src !== originAwareUrl) iframe.src = originAwareUrl;
    startHandshake();
    return () => {
      if (handshake !== null) window.clearInterval(handshake);
      window.removeEventListener('message', onMessage);
      restartHandshakeRef.current = () => {};
      if (playerBridgeRef.current === bridge) playerBridgeRef.current = null;
    };
  }, [isYouTubeSource, source]);

  useEffect(() => {
    if (!source || videoState !== 'loading') return;
    const timer = window.setTimeout(() => {
      setVideoState('unavailable');
      setHeroTextHidden(false);
      setPlaybackMessage('The hero film is taking too long to load. The static fallback is being shown.');
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [source, videoState]);

  async function togglePlayback() {
    if (youtubeEmbedUrl && playerBridgeRef.current?.isReady()) {
      setPlaybackMessage('');
      if (playerBridgeRef.current.isPlaying()) playerBridgeRef.current.pause();
      else playerBridgeRef.current.play();
      return;
    }
    const video = videoRef.current;
    if (!video || !source || videoState === 'unavailable' || videoState === 'loading') return;

    setPlaybackMessage('');
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setPlaybackMessage('Playback could not start. Try again or check the video source.');
      }
    } else {
      video.pause();
    }
  }

  function toggleSound() {
    if (youtubeEmbedUrl && playerBridgeRef.current?.isReady()) {
      if (playerBridgeRef.current.isMuted()) playerBridgeRef.current.unmute();
      else playerBridgeRef.current.mute();
      return;
    }
    const video = videoRef.current;
    if (!video || !source || videoState === 'unavailable' || videoState === 'loading') return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  const statusLabel = !source
    ? 'Hero film unavailable'
    : videoState === 'loading'
      ? 'Loading film'
      : videoState === 'unavailable'
        ? 'Video unavailable'
        : videoState === 'playing'
          ? 'Now playing'
          : 'Ready to play';

  return (
    <section className={`hero cinematicHero${videoState === 'playing' ? ' isVideoPlaying' : ''}`} aria-labelledby="hero-title">
      <div className="heroMedia">
        {source ? (
          isYouTubeSource ? (
            <iframe
              ref={iframeRef}
              className="heroVideo heroYouTube"
              src={youtubeEmbedUrl ?? undefined}
              title="Cinematic hero video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onLoad={() => {
                setHeroTextHidden(false);
                playerBridgeRef.current?.reset();
                restartHandshakeRef.current();
              }}
            />
          ) : (
            <video
              ref={videoRef}
              className="heroVideo"
              src={source}
              poster={poster ?? undefined}
              muted
              playsInline
              preload="metadata"
              onLoadStart={() => setVideoState('loading')}
              onCanPlay={() => setVideoState((current) => current === 'unavailable' ? current : current === 'playing' ? current : 'ready')}
              onWaiting={() => setVideoState((current) => current === 'unavailable' ? current : 'loading')}
              onStalled={() => setPlaybackMessage('The hero film is stalled. Waiting for playback data.')}
              onPlay={() => {
                setVideoState('playing');
                setHeroTextHidden((current) => shouldHideHeroText(current, 'playing'));
              }}
              onPause={() => {
                setVideoState((current) => current === 'unavailable' ? current : 'ready');
                setHeroTextHidden((current) => shouldHideHeroText(current, 'paused'));
              }}
              onEnded={() => {
                setVideoState('ended');
                setHeroTextHidden((current) => shouldHideHeroText(current, 'ended'));
              }}
              onError={() => {
                setVideoState('unavailable');
                setHeroTextHidden((current) => shouldHideHeroText(current, 'unavailable'));
                setPlaybackMessage('The configured hero film could not be loaded. Check its URL and video format.');
              }}
            />
          )
        ) : (
          <div className="heroUnavailableArt">
            <span className="heroUnavailableFrame" aria-hidden="true">RF</span>
          </div>
        )}
      </div>
      <div className="heroScrim" aria-hidden="true" />
      <div className="heroGlow" aria-hidden="true" />
      <div
        className={`heroContent${heroTextHidden ? ' isPlaybackHidden' : ''}`}
        aria-hidden={heroTextHidden}
        inert={heroTextHidden}
      >
        <div className="heroKicker">
          <p className="eyebrow">RADYFRAMES / CREATIVE MEDIA / COIMBATORE</p>
          <span className={`heroVideoStatus${videoState === 'playing' ? ' isPlaying' : ''}`} role="status">
            <i aria-hidden="true" />{statusLabel}
          </span>
        </div>
        <h1 id="hero-title">
          <span>WE CRAFT</span>
          <span className="accent">VISUAL</span>
          <span>STORIES<em className="accent">.</em></span>
        </h1>
        <p className="heroCopy">Video editing, filmmaking and creative storytelling — shaped frame by frame into work that stays with you.</p>
        <div className="heroActions">
          <a className="button" href="#work">Explore our work <span aria-hidden="true">↘</span></a>
          <a className="button ghost" href="#contact">Start a project <span aria-hidden="true">↗</span></a>
        </div>
        <p className="heroFootnote">
          <span>INDEPENDENT POST-PRODUCTION STUDIO</span>
          <span>COIMBATORE, INDIA · 11°00&apos;N</span>
        </p>
      </div>
      <div className="heroVideoControls" role="group" aria-label="Hero video controls">
        <button
          type="button"
          className="heroVideoControl heroVideoPlay"
          onClick={togglePlayback}
          disabled={!source || videoState === 'unavailable' || videoState === 'loading'}
          aria-label={videoState === 'playing' ? 'Pause hero video' : 'Play hero video'}
        >
          {videoState === 'playing' ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zm5 0h3v14h-3z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg>
          )}
          <span>{videoState === 'playing' ? 'Pause film' : 'Play film'}</span>
        </button>
        <button
          type="button"
          className="heroVideoControl heroVideoSound"
          onClick={toggleSound}
          disabled={!source || videoState === 'unavailable' || videoState === 'loading'}
          aria-label={muted ? 'Turn hero video sound on' : 'Mute hero video'}
          aria-pressed={!muted}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm13-.5a5 5 0 0 1 0 7m2-9a8 8 0 0 1 0 11" /><path d="m17 10 5 5m0-5-5 5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm13-.5a5 5 0 0 1 0 7m2-9a8 8 0 0 1 0 11" /></svg>
          )}
          <span>{muted ? 'Sound off' : 'Sound on'}</span>
        </button>
      </div>
      {source && videoState === 'loading' && (
        <div className="heroLoading" role="status"><span />Loading the studio film</div>
      )}
      {!source && (
        <div className="heroUnavailableNotice" role="status">
          <span>{videoUrl ? 'SOURCE NOT SUPPORTED' : 'HERO FILM / AWAITING OWNER SOURCE'}</span>
          <p>{videoUrl
            ? 'Use an HTTPS MP4/WebM URL, a YouTube URL, or a path to a video in the public folder.'
            : 'Add an owner-provided MP4, WebM or YouTube URL to enable playback.'}</p>
        </div>
      )}
      {playbackMessage && <p className="heroPlaybackMessage" role="status">{playbackMessage}</p>}
    </section>
  );
}
