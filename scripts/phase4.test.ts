import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canManageHomepageSettings } from '../src/lib/auth/homepage-settings-authorization';
import {
  DEFAULT_HERO_VIDEO_SETTINGS,
  getLatestSavedAfterSave,
  getHeroVideoEmbedUrl,
  getHeroYouTubeVideoId,
  parseHeroVideoSettings,
  resolveHeroVideoSource,
  validateHeroPosterUrl,
  validateHeroVideoUrl,
} from '../src/lib/portfolio/hero';
import {
  DEFAULT_SHOWCASE_SETTINGS,
  filterPublishedShowcaseProjects,
  parseShowcaseSettings,
  validatePublishedShowcaseSelection,
} from '../src/lib/portfolio/showcase';
import type { PortfolioProject } from '../src/lib/portfolio/types';
import {
  saveHeroVideoSettingsForRole,
  saveShowcaseSettingsForRole,
} from '../src/lib/portfolio/homepage-settings-actions';
import {
  YouTubePlayerBridge,
  YOUTUBE_NOCOOKIE_ORIGIN,
  shouldHideHeroText,
  type YouTubePlaybackState,
} from '../src/lib/portfolio/youtube-player-bridge';

test('validates cinematic hero MP4, WebM and same-origin public paths', () => {
  assert.equal(validateHeroVideoUrl('https://cdn.example.com/hero.mp4'), 'https://cdn.example.com/hero.mp4');
  assert.equal(validateHeroVideoUrl('https://cdn.example.com/hero.webm'), 'https://cdn.example.com/hero.webm');
  assert.equal(validateHeroVideoUrl('/public/hero.mp4'), '/hero.mp4');
  assert.equal(validateHeroVideoUrl('/hero.webm'), '/hero.webm');
  assert.equal(validateHeroVideoUrl('http://cdn.example.com/hero.mp4'), null);
  assert.equal(validateHeroVideoUrl('https://user:pass@cdn.example.com/hero.mp4'), null);
  assert.equal(validateHeroVideoUrl('https://cdn.example.com/hero.mp4?token=secret'), null);
  assert.equal(validateHeroVideoUrl('/public/hero.jpg'), null);
});

test('accepts supported YouTube URL formats and creates privacy-enhanced embeds', () => {
  const formats = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  ];
  for (const url of formats) {
    assert.equal(getHeroYouTubeVideoId(url), 'dQw4w9WgXcQ');
    assert.equal(validateHeroVideoUrl(url), url);
    const embed = new URL(getHeroVideoEmbedUrl(url, 'https://radyframes.example')!);
    assert.equal(embed.origin, 'https://www.youtube-nocookie.com');
    assert.equal(embed.pathname, '/embed/dQw4w9WgXcQ');
    assert.equal(embed.searchParams.get('enablejsapi'), '1');
    assert.equal(embed.searchParams.get('origin'), 'https://radyframes.example');
    assert.equal(embed.searchParams.get('controls'), '1');
  }
});

test('rejects arbitrary YouTube domains, malformed URLs and invalid video IDs', () => {
  const invalid = [
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/',
    'https://youtu.be/short',
    'https://www.youtube.com/watch?v=bad!',
    'https://www.youtube.com/embed/',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ/extra',
    'http://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ#fragment',
  ];
  for (const url of invalid) {
    assert.equal(getHeroYouTubeVideoId(url), null);
    assert.equal(validateHeroVideoUrl(url), null);
    assert.equal(getHeroVideoEmbedUrl(url), null);
  }
});

test('YouTube support preserves MP4, WebM and public path preview behavior', () => {
  assert.equal(validateHeroVideoUrl('https://cdn.example.com/hero.mp4'), 'https://cdn.example.com/hero.mp4');
  assert.equal(getHeroVideoEmbedUrl('https://cdn.example.com/hero.mp4'), null);
  assert.equal(validateHeroVideoUrl('/hero.webm'), '/hero.webm');
  assert.equal(getHeroVideoEmbedUrl('/hero.webm'), null);
});

test('YouTube bridge waits for player readiness and initializes listeners once', () => {
  const sent: Array<{ message: Record<string, unknown>; origin: string }> = [];
  const bridge = new YouTubePlayerBridge((raw, origin) => {
    sent.push({ message: JSON.parse(raw) as Record<string, unknown>, origin });
  }, () => {}, () => {}, () => {});

  bridge.startListening();
  bridge.play();
  assert.equal(bridge.isReady(), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, YOUTUBE_NOCOOKIE_ORIGIN);
  assert.equal(sent[0].message.event, 'listening');

  bridge.handleMessage(JSON.stringify({ event: 'onReady' }));
  assert.equal(bridge.isReady(), true);
  const listenerCalls = sent.filter((entry) => entry.message.func === 'addEventListener');
  bridge.handleMessage(JSON.stringify({ event: 'onReady' }));
  assert.equal(sent.filter((entry) => entry.message.func === 'addEventListener').length, listenerCalls.length);
  assert.ok(sent.some((entry) => entry.message.func === 'getPlayerState'));
});

test('YouTube bridge sends play, pause, mute and unmute commands', () => {
  const sent: Array<Record<string, unknown>> = [];
  const bridge = new YouTubePlayerBridge((raw) => {
    sent.push(JSON.parse(raw) as Record<string, unknown>);
  }, () => {}, () => {}, () => {});

  bridge.handleMessage({ event: 'onReady' });
  bridge.play();
  bridge.pause();
  bridge.mute();
  bridge.unmute();

  for (const func of ['playVideo', 'pauseVideo', 'mute', 'unMute']) {
    assert.ok(sent.some((message) => message.func === func));
  }
});

test('YouTube bridge synchronizes playback and muted state from player messages', () => {
  const playbackStates: YouTubePlaybackState[] = [];
  const mutedStates: boolean[] = [];
  const bridge = new YouTubePlayerBridge(
    () => {},
    (state) => playbackStates.push(state),
    (muted) => mutedStates.push(muted),
    () => {},
  );
  bridge.handleMessage({ event: 'onReady' });
  bridge.handleMessage({ event: 'onStateChange', data: 1 });
  bridge.handleMessage({ event: 'infoDelivery', info: { playerState: 2, muted: false } });

  assert.equal(bridge.isPlaying(), false);
  assert.equal(bridge.isMuted(), false);
  assert.deepEqual(playbackStates.slice(-2), ['playing', 'paused']);
  assert.deepEqual(mutedStates, [false]);
});

test('hero text hides on playback and returns on pause or ended', () => {
  let hidden = shouldHideHeroText(false, 'playing');
  assert.equal(hidden, true);

  hidden = shouldHideHeroText(hidden, 'paused');
  assert.equal(hidden, false);

  hidden = shouldHideHeroText(false, 'playing');
  hidden = shouldHideHeroText(hidden, 'loading');
  assert.equal(hidden, true);
  hidden = shouldHideHeroText(hidden, 'playing');
  assert.equal(hidden, true);

  assert.equal(shouldHideHeroText(hidden, 'ended'), false);
  assert.equal(shouldHideHeroText(hidden, 'unavailable'), false);
});

test('native hero playback follows the same hide and restore states', () => {
  const hiddenDuringPlayback = shouldHideHeroText(false, 'playing');
  assert.equal(hiddenDuringPlayback, true);
  assert.equal(shouldHideHeroText(hiddenDuringPlayback, 'paused'), false);
  assert.equal(shouldHideHeroText(hiddenDuringPlayback, 'ended'), false);
});

test('YouTube ENDED player event is distinct from pause', () => {
  const playbackStates: YouTubePlaybackState[] = [];
  const bridge = new YouTubePlayerBridge(
    () => {},
    (state) => playbackStates.push(state),
    () => {},
    () => {},
  );
  bridge.handleMessage({ event: 'onStateChange', data: 2 });
  bridge.handleMessage({ event: 'onStateChange', data: 0 });

  assert.deepEqual(playbackStates, ['paused', 'ended']);
});

test('YouTube bridge resets safely for iframe reload and reports player errors', () => {
  const playbackStates: YouTubePlaybackState[] = [];
  let errors = 0;
  const bridge = new YouTubePlayerBridge(
    () => {},
    (state) => playbackStates.push(state),
    () => {},
    () => { errors += 1; },
  );
  bridge.handleMessage({ event: 'onReady' });
  bridge.reset();
  assert.equal(bridge.isReady(), false);
  bridge.handleMessage({ event: 'onError', data: 2 });
  assert.equal(playbackStates.at(-1), 'unavailable');
  assert.equal(errors, 1);
});

test('homepage ticker is removed while showcase and other homepage sections remain', () => {
  const homepage = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(homepage, /className="marquee"/);
  assert.match(homepage, /<PortfolioShowcase\b/);
  assert.match(homepage, /<PortfolioExperience\b/);
  assert.match(homepage, /id="contact"/);
});

test('validates optional poster URLs', () => {
  assert.equal(validateHeroPosterUrl('/public/hero.webp'), '/hero.webp');
  assert.equal(validateHeroPosterUrl('https://cdn.example.com/hero.jpg'), 'https://cdn.example.com/hero.jpg');
  assert.equal(validateHeroPosterUrl('javascript:alert(1)'), null);
});

test('parses hero settings and defaults', () => {
  assert.deepEqual(DEFAULT_HERO_VIDEO_SETTINGS, { enabled: false, videoUrl: '' });
  assert.deepEqual(parseHeroVideoSettings({ enabled: true, videoUrl: '/hero.mp4' }), {
    enabled: true,
    videoUrl: '/hero.mp4',
  });
  assert.deepEqual(parseHeroVideoSettings({ enabled: false, videoUrl: '' }), {
    enabled: false,
    videoUrl: '',
  });
  assert.equal(parseHeroVideoSettings({ enabled: true, videoUrl: 'http://example.com/hero.mp4' }), null);
  assert.equal(parseHeroVideoSettings({ enabled: true }), null);
  assert.deepEqual(parseHeroVideoSettings({
    enabled: true,
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }), {
    enabled: true,
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
});

test('enforces super admin homepage settings authorization', () => {
  assert.equal(canManageHomepageSettings('super_admin'), true);
  assert.equal(canManageHomepageSettings('editor'), false);
  assert.equal(canManageHomepageSettings(undefined), false);
});

test('requires exactly four unique published YouTube projects', () => {
  const projects: Pick<PortfolioProject, 'youtube_id' | 'original_url' | 'status'>[] = [
    { youtube_id: 'aaaaaaaaaaa', original_url: 'https://youtu.be/aaaaaaaaaaa', status: 'published' },
    { youtube_id: 'bbbbbbbbbbb', original_url: 'https://youtu.be/bbbbbbbbbbb', status: 'published' },
    { youtube_id: 'ccccccccccc', original_url: 'https://youtu.be/ccccccccccc', status: 'published' },
    { youtube_id: 'ddddddddddd', original_url: 'https://youtu.be/ddddddddddd', status: 'published' },
    { youtube_id: 'eeeeeeeeeee', original_url: 'https://youtu.be/eeeeeeeeeee', status: 'draft' },
  ];
  assert.equal(validatePublishedShowcaseSelection(
    ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'],
    projects,
  ), true);
  assert.equal(validatePublishedShowcaseSelection(
    ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'],
    projects,
  ), false);
  assert.equal(validatePublishedShowcaseSelection(
    ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'eeeeeeeeeee'],
    projects,
  ), false);
});

test('filters showcase settings to exactly four public published projects', () => {
  const makeProject = (id: string, status: PortfolioProject['status'] = 'published'): PortfolioProject => ({
    id,
    youtube_id: id,
    original_url: `https://youtu.be/${id}`,
    kind: 'video',
    category_id: null,
    category: null,
    topic: null,
    client: null,
    title: id,
    description: null,
    ratio_raw: null,
    ratio: '16:9',
    status,
  });
  const settings = {
    ...DEFAULT_SHOWCASE_SETTINGS,
    enabled: true,
    videoIds: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'],
  };
  const projects = [
    makeProject('aaaaaaaaaaa'),
    makeProject('bbbbbbbbbbb'),
    makeProject('ccccccccccc'),
    makeProject('ddddddddddd'),
  ];
  assert.equal(filterPublishedShowcaseProjects(settings, projects).length, 4);
  assert.deepEqual(filterPublishedShowcaseProjects(settings, projects.slice(0, 3)), []);
  assert.deepEqual(filterPublishedShowcaseProjects(settings, [
    ...projects.slice(0, 3),
    makeProject('ddddddddddd', 'draft'),
  ]), []);
  assert.deepEqual(parseShowcaseSettings(DEFAULT_SHOWCASE_SETTINGS), null);
});

test('distinguishes missing, malformed, enabled and disabled hero database settings', () => {
  assert.deepEqual(resolveHeroVideoSource({ state: 'missing' }, '/environment.mp4'), {
    videoUrl: '/environment.mp4',
    posterUrl: undefined,
  });
  assert.deepEqual(resolveHeroVideoSource({ state: 'invalid' }, '/environment.mp4'), {
    videoUrl: undefined,
    posterUrl: undefined,
  });
  assert.deepEqual(resolveHeroVideoSource({
    state: 'valid',
    settings: { enabled: true, videoUrl: '/database.mp4', posterUrl: '/database.webp' },
  }, '/environment.mp4'), {
    videoUrl: '/database.mp4',
    posterUrl: '/database.webp',
  });
  assert.deepEqual(resolveHeroVideoSource({
    state: 'valid',
    settings: { enabled: false, videoUrl: '' },
  }, '/environment.mp4'), {
    videoUrl: undefined,
    posterUrl: undefined,
  });
});

test('hero malformed and missing settings parse into distinct public states', () => {
  assert.equal(parseHeroVideoSettings({ enabled: true, videoUrl: 'http://example.com/hero.mp4' }), null);
  assert.equal(parseHeroVideoSettings({ enabled: 'yes', videoUrl: '/hero.mp4' }), null);
  assert.deepEqual(parseHeroVideoSettings({ enabled: false, videoUrl: '' }), {
    enabled: false,
    videoUrl: '',
  });
});

test('hero cancel restores latest successful save and ignores failed saves', () => {
  const initial = { enabled: false, videoUrl: '' };
  const saved = { enabled: true, videoUrl: '/saved.mp4' };
  let latest = getLatestSavedAfterSave(initial, saved, 'success');
  assert.deepEqual(latest, saved);
  latest = getLatestSavedAfterSave(latest, { enabled: true, videoUrl: '/failed.mp4' }, 'error');
  assert.deepEqual(latest, saved);
});

test('showcase cancel restores latest successful save and ignores failed saves', () => {
  const initial = {
    ...DEFAULT_SHOWCASE_SETTINGS,
    enabled: false,
  };
  const saved = {
    ...initial,
    enabled: true,
    videoIds: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'],
  };
  let latest = getLatestSavedAfterSave(initial, saved, 'success');
  assert.deepEqual(latest, saved);
  latest = getLatestSavedAfterSave(latest, { ...saved, autoRotate: true }, 'error');
  assert.deepEqual(latest, saved);
});

test('hero server action rejects editor role before Supabase save', async () => {
  let upsertCalled = false;
  const supabase = {
    from: () => ({
      upsert: async () => {
        upsertCalled = true;
        return { error: null };
      },
    }),
  };
  const formData = new FormData();
  formData.set('settings', JSON.stringify({ enabled: true, videoUrl: '/hero.mp4' }));
  const result = await saveHeroVideoSettingsForRole('editor', supabase, formData);
  assert.equal(result.status, 'error');
  assert.equal(upsertCalled, false);
});

test('showcase server action rejects editor role before Supabase queries', async () => {
  let upsertCalled = false;
  const supabase = {
    from: () => ({
      upsert: async () => {
        upsertCalled = true;
        return { error: null };
      },
    }),
  };
  const formData = new FormData();
  formData.set('settings', JSON.stringify({
    ...DEFAULT_SHOWCASE_SETTINGS,
    enabled: true,
    videoIds: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'],
  }));
  const result = await saveShowcaseSettingsForRole('editor', supabase, formData);
  assert.equal(result.status, 'error');
  assert.equal(upsertCalled, false);
});
