'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AVATAR_LANGUAGES,
  getAvatarIntroduction,
  type AvatarLanguage,
  type StudioContent,
} from '@/lib/studio-content';

export default function StudioAvatar({
  content,
  imageUrl,
  previewMode = false,
}: {
  content: StudioContent['avatar'];
  imageUrl?: string;
  previewMode?: boolean;
}) {
  const [language, setLanguage] = useState<AvatarLanguage>('en');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playback, setPlayback] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [muted, setMuted] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const enabledLanguages = AVATAR_LANGUAGES.filter((item) => content[item.code].enabled);
  const hasEnabledLanguages = enabledLanguages.length > 0;
  const selectedLanguage = enabledLanguages.find((item) => item.code === language) ?? enabledLanguages[0] ?? AVATAR_LANGUAGES[1];
  const activeLanguage = selectedLanguage.code;
  const dialogue = content[activeLanguage];
  const introduction = useMemo(() => hasEnabledLanguages ? getAvatarIntroduction(dialogue) : '', [dialogue, hasEnabledLanguages]);
  const matchingVoice = voices.some((voice) => voice.lang.toLowerCase().startsWith(`${activeLanguage}-`));

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    const frame = window.requestAnimationFrame(updateVoices);
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => {
      window.cancelAnimationFrame(frame);
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlayback('idle');
  }

  function playSpeech() {
    if (!introduction || muted) return;
    if (!('speechSynthesis' in window)) {
      setVoiceMessage('Voice playback is not available in this browser. Read the text introduction below.');
      return;
    }
    if (playback === 'paused') {
      window.speechSynthesis.resume();
      setPlayback('speaking');
      return;
    }
    if (!matchingVoice) {
      setVoiceMessage(`No ${selectedLanguage.label} voice is installed in this browser. The written introduction is available below.`);
      return;
    }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(introduction);
    utterance.lang = selectedLanguage.locale;
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith(`${activeLanguage}-`)) ?? null;
    utterance.onstart = () => {
      setVoiceMessage('');
      setPlayback('speaking');
    };
    utterance.onend = () => setPlayback('idle');
    utterance.onerror = () => {
      setPlayback('idle');
      setVoiceMessage('Voice playback could not start. Read the text introduction below.');
    };
    window.speechSynthesis.speak(utterance);
  }

  function changeLanguage(value: AvatarLanguage) {
    stopSpeech();
    setLanguage(value);
    setVoiceMessage('');
  }

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (nextMuted) stopSpeech();
  }

  return (
    <section className={`avatarSection${previewMode ? ' isPreview' : ''}`} aria-labelledby="avatar-title">
      <div className="avatarCopy">
        <p className="eyebrow">A PERSONAL WELCOME</p>
        <h2 id="avatar-title">Meet the<br /><span>creative mind.</span></h2>
        <label className="avatarLanguage">
          <span>Choose introduction language</span>
          <select value={enabledLanguages.some((item) => item.code === language) ? language : enabledLanguages[0]?.code ?? ''} disabled={!enabledLanguages.length} onChange={(event) => changeLanguage(event.target.value as AvatarLanguage)}>
            {!enabledLanguages.length && <option value="">No languages enabled</option>}
            {enabledLanguages.map((item) => (
              <option value={item.code} key={item.code}>{item.label}</option>
            ))}
          </select>
        </label>
        {!hasEnabledLanguages ? (
          <p className="avatarText" role="status">No avatar languages are currently enabled.</p>
        ) : introduction ? (
          <p className="avatarText" lang={selectedLanguage.locale}>{introduction}</p>
        ) : (
          <p className="avatarText" role="status">{selectedLanguage.label} introduction is being prepared by the studio.</p>
        )}
        <div className="avatarControls" aria-label="Voice playback controls">
          <button type="button" className="btn" onClick={playSpeech} disabled={!introduction || muted || playback === 'speaking'}>
            {playback === 'paused' ? 'Resume voice' : 'Play voice'}
          </button>
          <button type="button" className="btn ghost" onClick={() => {
            if (playback === 'speaking') {
              window.speechSynthesis.pause();
              setPlayback('paused');
            } else if (playback === 'paused') {
              window.speechSynthesis.resume();
              setPlayback('speaking');
            }
          }} disabled={playback === 'idle'}>
            {playback === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="btn ghost" onClick={toggleMute} aria-pressed={muted}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
        <p className="avatarVoiceNote" role="status">
          {voiceMessage || (!hasEnabledLanguages
            ? 'Enable a language to make voice playback available.'
            : matchingVoice
              ? 'Voice uses a matching voice installed on your device.'
              : 'Matching device voice unavailable; text remains available.')}
        </p>
      </div>
      <div className="avatarPortrait" aria-hidden="true">
        <div className="avatarPortraitFront">
          {imageUrl ? <Image src={imageUrl} alt="" fill unoptimized sizes="(max-width: 700px) 90vw, 35vw" /> : <span>RF</span>}
          <small>RADYFRAMES / STUDIO</small>
        </div>
        <div className="avatarPortraitBack"><span>{selectedLanguage.label}</span><small>INTRODUCTION</small></div>
      </div>
    </section>
  );
}
