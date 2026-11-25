export const YOUTUBE_NOCOOKIE_ORIGIN = 'https://www.youtube-nocookie.com';
const PLAYER_ID = 'radyframes-hero-player';

export type YouTubePlaybackState = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'unavailable';

export function shouldHideHeroText(
  currentlyHidden: boolean,
  state: YouTubePlaybackState,
): boolean {
  if (state === 'playing') return true;
  if (state === 'paused' || state === 'ended' || state === 'unavailable') return false;
  return currentlyHidden;
}

type YouTubeInfo = {
  playerState?: unknown;
  muted?: unknown;
  volume?: unknown;
};

type YouTubeMessage = {
  event?: unknown;
  info?: YouTubeInfo;
  infoType?: unknown;
  data?: unknown;
};

export class YouTubePlayerBridge {
  private ready = false;
  private playbackState: YouTubePlaybackState = 'loading';
  private muted = true;

  constructor(
    private readonly post: (message: string, targetOrigin: string) => void,
    private readonly onPlaybackState: (state: YouTubePlaybackState) => void,
    private readonly onMutedChange: (muted: boolean) => void,
    private readonly onError: () => void,
  ) {}

  startListening() {
    this.post(JSON.stringify({ event: 'listening', id: PLAYER_ID, channel: 'widget' }), YOUTUBE_NOCOOKIE_ORIGIN);
  }

  reset() {
    this.ready = false;
    this.setPlaybackState('loading');
  }

  handleMessage(raw: unknown) {
    let message: YouTubeMessage;
    try {
      message = typeof raw === 'string' ? JSON.parse(raw) as YouTubeMessage : raw as YouTubeMessage;
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.event === 'onReady') {
      if (this.ready) return;
      this.ready = true;
      this.setPlaybackState('ready');
      this.command('addEventListener', ['onStateChange']);
      this.command('addEventListener', ['onError']);
      this.command('addEventListener', ['onAutoplayBlocked']);
      this.command('addEventListener', ['onVolumeChange']);
      this.command('mute');
      this.command('getPlayerState');
      this.command('isMuted');
      return;
    }
    if (message.event === 'onError') {
      this.ready = false;
      this.setPlaybackState('unavailable');
      this.onError();
      return;
    }
    if (message.event === 'onAutoplayBlocked') return;
    if (message.event === 'onStateChange') {
      this.handlePlayerState(message.data);
      return;
    }
    if (message.event === 'infoDelivery' && message.info) {
      this.handleInfo(message.info);
    }
  }

  play() {
    if (this.ready) {
      this.command('playVideo');
      this.command('getPlayerState');
    }
  }

  pause() {
    if (this.ready) {
      this.command('pauseVideo');
      this.command('getPlayerState');
    }
  }

  mute() {
    if (this.ready) {
      this.command('mute');
      this.command('isMuted');
    }
  }

  unmute() {
    if (this.ready) {
      this.command('unMute');
      this.command('isMuted');
    }
  }

  isReady() {
    return this.ready;
  }

  isPlaying() {
    return this.playbackState === 'playing';
  }

  isMuted() {
    return this.muted;
  }

  private command(func: string, args: unknown[] = []) {
    if (!this.ready && func !== 'addEventListener') return;
    this.post(
      JSON.stringify({ event: 'command', func, args, id: PLAYER_ID, channel: 'widget' }),
      YOUTUBE_NOCOOKIE_ORIGIN,
    );
  }

  private handlePlayerState(value: unknown) {
    if (value === 1) this.setPlaybackState('playing');
    else if (value === 0) this.setPlaybackState('ended');
    else if (value === 2) this.setPlaybackState('paused');
    else if (value === 5 || value === -1) this.setPlaybackState('ready');
    else if (value === 3) this.setPlaybackState('loading');
  }

  private handleInfo(info: YouTubeInfo) {
    if (typeof info.playerState === 'number') this.handlePlayerState(info.playerState);
    if (typeof info.muted === 'boolean' && info.muted !== this.muted) {
      this.muted = info.muted;
      this.onMutedChange(this.muted);
    }
  }

  private setPlaybackState(state: YouTubePlaybackState) {
    if (state === this.playbackState) return;
    this.playbackState = state;
    this.onPlaybackState(state);
  }
}
