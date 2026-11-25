export const STUDIO_CONTENT_KEY = 'studio_content_v1';

export const AVATAR_LANGUAGES = [
  { code: 'ta', label: 'Tamil', locale: 'ta-IN' },
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'kn', label: 'Kannada', locale: 'kn-IN' },
  { code: 'ml', label: 'Malayalam', locale: 'ml-IN' },
  { code: 'hi', label: 'Hindi', locale: 'hi-IN' },
] as const;

export type AvatarLanguage = (typeof AVATAR_LANGUAGES)[number]['code'];

export interface AvatarDialogue {
  enabled: boolean;
  greeting: string;
  introduction: string;
  lines: string[];
  closing: string;
}

export interface StudioContent {
  avatar: Record<AvatarLanguage, AvatarDialogue>;
  about: {
    role: string;
    introduction: string;
    profileImageUrl: string;
  };
  skills: string[];
  services: string[];
  socialLinks: { label: string; url: string }[];
  feedback: { client: string; project: string; quote: string }[];
  process: { title: string; description: string }[];
  guestbookEnabled: boolean;
}

const emptyDialogue = (): AvatarDialogue => ({
  enabled: true,
  greeting: '',
  introduction: '',
  lines: [],
  closing: '',
});

export const DEFAULT_STUDIO_CONTENT: StudioContent = {
  avatar: {
    ta: emptyDialogue(),
    en: emptyDialogue(),
    kn: emptyDialogue(),
    ml: emptyDialogue(),
    hi: emptyDialogue(),
  },
  about: {
    role: 'Director / Creative Director',
    introduction: 'RADYFRAMES CREATIVE MEDIA is an independent post-production studio based in Gandhipuram, Coimbatore. We craft edits, moving images and visual treatments for brands and filmmakers — with care for the story, the rhythm and every frame.',
    profileImageUrl: '',
  },
  skills: [],
  services: [
    'Video Editing',
    'Motion Graphics',
    'CGI / 3D',
    'VFX',
    'Color Grading',
    'Cinematography',
    'Short Films',
    'Feature Films',
    'Showreels',
    'Commercial Ads',
    'Social Media Reels',
    'Digital Assets',
  ],
  socialLinks: [],
  feedback: [],
  process: [],
  guestbookEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function textList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : fallback;
}

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSocialLink(value: unknown): value is { label: string; url: string } {
  return isRecord(value)
    && typeof value.label === 'string'
    && typeof value.url === 'string'
    && safeWebUrl(value.url);
}

function isFeedback(value: unknown): value is { client: string; project: string; quote: string } {
  return isRecord(value)
    && typeof value.client === 'string'
    && typeof value.project === 'string'
    && typeof value.quote === 'string';
}

function isProcessStep(value: unknown): value is { title: string; description: string } {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.description === 'string';
}

export function parseStudioContent(value: unknown): StudioContent {
  if (!isRecord(value)) return DEFAULT_STUDIO_CONTENT;
  const about = isRecord(value.about) ? value.about : {};
  const avatarValue = isRecord(value.avatar) ? value.avatar : {};
  const avatar = { ...DEFAULT_STUDIO_CONTENT.avatar };

  for (const language of AVATAR_LANGUAGES) {
    const saved = avatarValue[language.code];
    if (!isRecord(saved)) continue;
    const defaults = DEFAULT_STUDIO_CONTENT.avatar[language.code];
    avatar[language.code] = {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled,
      greeting: text(saved.greeting, defaults.greeting),
      introduction: text(saved.introduction, defaults.introduction),
      lines: textList(saved.lines, defaults.lines),
      closing: text(saved.closing, defaults.closing),
    };
  }

  const socialLinks = Array.isArray(value.socialLinks)
    ? value.socialLinks.filter(isSocialLink)
      .map((item) => ({ label: item.label, url: item.url }))
    : DEFAULT_STUDIO_CONTENT.socialLinks;
  const feedback = Array.isArray(value.feedback)
    ? value.feedback.filter(isFeedback)
      .map((item) => ({ client: item.client, project: item.project, quote: item.quote }))
    : DEFAULT_STUDIO_CONTENT.feedback;
  const process = Array.isArray(value.process)
    ? value.process.filter(isProcessStep)
      .map((item) => ({ title: item.title, description: item.description }))
    : DEFAULT_STUDIO_CONTENT.process;

  return {
    avatar,
    about: {
      role: text(about.role, DEFAULT_STUDIO_CONTENT.about.role),
      introduction: text(about.introduction, DEFAULT_STUDIO_CONTENT.about.introduction),
      profileImageUrl: safeWebUrl(text(about.profileImageUrl, ''))
        ? text(about.profileImageUrl, '')
        : DEFAULT_STUDIO_CONTENT.about.profileImageUrl,
    },
    skills: textList(value.skills, DEFAULT_STUDIO_CONTENT.skills),
    services: textList(value.services, DEFAULT_STUDIO_CONTENT.services),
    socialLinks,
    feedback,
    process,
    guestbookEnabled: typeof value.guestbookEnabled === 'boolean'
      ? value.guestbookEnabled
      : DEFAULT_STUDIO_CONTENT.guestbookEnabled,
  };
}

export function getAvatarIntroduction(dialogue: AvatarDialogue): string {
  return [dialogue.greeting, dialogue.introduction, ...dialogue.lines, dialogue.closing]
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}
