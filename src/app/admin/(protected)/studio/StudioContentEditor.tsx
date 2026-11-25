'use client';

import { useState, useActionState } from 'react';
import StudioAvatar from '@/components/StudioAvatar';
import {
  AVATAR_LANGUAGES,
  getAvatarIntroduction,
  type AvatarLanguage,
  type StudioContent,
} from '@/lib/studio-content';
import { saveStudioContent, type StudioActionState } from './actions';

const initialState: StudioActionState = { status: 'idle', message: '' };

function LinesField({
  label,
  value,
  onChange,
  rows = 5,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  rows?: number;
}) {
  return (
    <label>{label}
      <textarea
        rows={rows}
        value={value.join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
        placeholder="One item per line"
      />
      <small className="mut">Keep each item on its own line. Blank lines are retained in the draft and omitted on publish.</small>
    </label>
  );
}

export default function StudioContentEditor({ initialContent }: { initialContent: StudioContent }) {
  const [content, setContent] = useState(initialContent);
  const [approved, setApproved] = useState(false);
  const [state, action, pending] = useActionState(saveStudioContent, initialState);

  function updateContent(update: (current: StudioContent) => StudioContent) {
    setApproved(false);
    setContent(update);
  }

  function updateAvatar(language: AvatarLanguage, update: (current: StudioContent['avatar'][AvatarLanguage]) => StudioContent['avatar'][AvatarLanguage]) {
    updateContent((current) => ({ ...current, avatar: { ...current.avatar, [language]: update(current.avatar[language]) } }));
  }

  function updateList(field: 'skills' | 'services', value: string[]) {
    updateContent((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="studioEditorLayout">
      <form action={action} className="card adminForm studioEditor" onSubmit={(event) => {
        if (!approved) {
          event.preventDefault();
          return;
        }
      }}>
        <input type="hidden" name="content" value={JSON.stringify(content)} />
        <section className="studioEditorSection">
          <div className="adminPageTitle">
            <div><p className="eyebrow">ABOUT / PROFILE</p><h2>Studio introduction</h2></div>
            <span className="mut">Existing verified copy is prefilled; new owner details remain blank.</span>
          </div>
          <div className="adminFormGrid">
            <label>Role<input maxLength={120} value={content.about.role} onChange={(event) => updateContent((current) => ({ ...current, about: { ...current.about, role: event.target.value } }))} /></label>
            <label>Profile image URL<input type="url" maxLength={2048} value={content.about.profileImageUrl} placeholder="Needs owner input" onChange={(event) => updateContent((current) => ({ ...current, about: { ...current.about, profileImageUrl: event.target.value } }))} /></label>
          </div>
          <label>About the studio<textarea rows={4} maxLength={5000} value={content.about.introduction} onChange={(event) => updateContent((current) => ({ ...current, about: { ...current.about, introduction: event.target.value } }))} /></label>
          <LinesField label="Skills" value={content.skills} onChange={(value) => updateList('skills', value)} />
          <LinesField label="Services" value={content.services} onChange={(value) => updateList('services', value)} />
        </section>

        <section className="studioEditorSection">
          <div><p className="eyebrow">AVATAR / FIVE LANGUAGES</p><h2>Dialogue manager</h2></div>
          <p className="mut">Each language is independent. No automatic translation is used. Preview the text before saving.</p>
          {AVATAR_LANGUAGES.map((language) => {
            const dialogue = content.avatar[language.code];
            return (
              <fieldset className="studioLanguageEditor" key={language.code}>
                <legend>{language.label}</legend>
                <label className="showcaseEnable">
                  <input type="checkbox" checked={dialogue.enabled} onChange={(event) => updateAvatar(language.code, (current) => ({ ...current, enabled: event.target.checked }))} />
                  Enable this language on the public avatar
                </label>
                <div className="adminFormGrid">
                  <label>Greeting<textarea rows={2} maxLength={800} value={dialogue.greeting} onChange={(event) => updateAvatar(language.code, (current) => ({ ...current, greeting: event.target.value }))} /></label>
                  <label>Introduction<textarea rows={2} maxLength={1500} value={dialogue.introduction} onChange={(event) => updateAvatar(language.code, (current) => ({ ...current, introduction: event.target.value }))} /></label>
                  <label>Additional dialogue lines<textarea rows={3} value={dialogue.lines.join('\n')} onChange={(event) => updateAvatar(language.code, (current) => ({ ...current, lines: event.target.value.split('\n') }))} /><small className="mut">One line per entry. Speaking order follows this list.</small></label>
                  <label>Closing message<textarea rows={2} maxLength={800} value={dialogue.closing} onChange={(event) => updateAvatar(language.code, (current) => ({ ...current, closing: event.target.value }))} /></label>
                </div>
                <p className="studioDialoguePreview" lang={language.locale}>
                  <strong>Text preview:</strong> {getAvatarIntroduction(dialogue) || 'Missing / Needs Owner Input'}
                </p>
              </fieldset>
            );
          })}
        </section>

        <section className="studioEditorSection">
          <div><p className="eyebrow">CONTACT / SOCIAL</p><h2>Social links</h2></div>
          {content.socialLinks.map((item, index) => (
            <div className="adminFormGrid studioItemRow" key={`social-${index}`}>
              <label>Link label<input maxLength={80} value={item.label} onChange={(event) => updateContent((current) => ({ ...current, socialLinks: current.socialLinks.map((link, itemIndex) => itemIndex === index ? { ...link, label: event.target.value } : link) }))} /></label>
              <label>URL<input type="url" maxLength={2048} value={item.url} placeholder="Needs owner input" onChange={(event) => updateContent((current) => ({ ...current, socialLinks: current.socialLinks.map((link, itemIndex) => itemIndex === index ? { ...link, url: event.target.value } : link) }))} /></label>
              <button type="button" className="btn ghost" onClick={() => updateContent((current) => ({ ...current, socialLinks: current.socialLinks.filter((_, itemIndex) => itemIndex !== index) }))}>Remove link</button>
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => updateContent((current) => ({ ...current, socialLinks: [...current.socialLinks, { label: '', url: '' }] }))}>Add social link</button>
        </section>

        <section className="studioEditorSection">
          <div><p className="eyebrow">CLIENT FEEDBACK</p><h2>Testimonials</h2></div>
          {content.feedback.map((item, index) => (
            <fieldset className="studioLanguageEditor" key={`feedback-${index}`}>
              <legend>Feedback {index + 1}</legend>
              <div className="adminFormGrid">
                <label>Client<input maxLength={160} value={item.client} onChange={(event) => updateContent((current) => ({ ...current, feedback: current.feedback.map((entry, itemIndex) => itemIndex === index ? { ...entry, client: event.target.value } : entry) }))} /></label>
                <label>Project<input maxLength={200} value={item.project} onChange={(event) => updateContent((current) => ({ ...current, feedback: current.feedback.map((entry, itemIndex) => itemIndex === index ? { ...entry, project: event.target.value } : entry) }))} /></label>
              </div>
              <label>Approved quote<textarea rows={3} maxLength={2000} value={item.quote} onChange={(event) => updateContent((current) => ({ ...current, feedback: current.feedback.map((entry, itemIndex) => itemIndex === index ? { ...entry, quote: event.target.value } : entry) }))} /></label>
              <button type="button" className="btn ghost" onClick={() => updateContent((current) => ({ ...current, feedback: current.feedback.filter((_, itemIndex) => itemIndex !== index) }))}>Remove feedback</button>
            </fieldset>
          ))}
          <button type="button" className="btn ghost" onClick={() => updateContent((current) => ({ ...current, feedback: [...current.feedback, { client: '', project: '', quote: '' }] }))}>Add client feedback</button>
        </section>

        <section className="studioEditorSection">
          <div><p className="eyebrow">PROCESS</p><h2>Making process</h2></div>
          {content.process.map((item, index) => (
            <fieldset className="studioLanguageEditor" key={`process-${index}`}>
              <legend>Step {index + 1}</legend>
              <label>Step title<input maxLength={160} value={item.title} onChange={(event) => updateContent((current) => ({ ...current, process: current.process.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry) }))} /></label>
              <label>Description<textarea rows={3} maxLength={1200} value={item.description} onChange={(event) => updateContent((current) => ({ ...current, process: current.process.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry) }))} /></label>
              <button type="button" className="btn ghost" onClick={() => updateContent((current) => ({ ...current, process: current.process.filter((_, itemIndex) => itemIndex !== index) }))}>Remove step</button>
            </fieldset>
          ))}
          <button type="button" className="btn ghost" onClick={() => updateContent((current) => ({ ...current, process: [...current.process, { title: '', description: '' }] }))}>Add process step</button>
        </section>

        <section className="studioEditorSection">
          <div><p className="eyebrow">PUBLIC GUESTBOOK</p><h2>Visitor messages</h2></div>
          <label className="showcaseEnable">
            <input type="checkbox" checked={content.guestbookEnabled} onChange={(event) => updateContent((current) => ({ ...current, guestbookEnabled: event.target.checked }))} />
            Show approved guestbook section
          </label>
          <p className="mut">Public submissions are disabled until anti-spam protection and a secure submission workflow are configured. The reviewed Stage 1 migration adds approved-message storage and moderation only.</p>
        </section>

        <div className="studioSaveBar">
          <label className="showcaseEnable">
            <input type="checkbox" name="approved" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
            I approve this draft for public publishing
          </label>
          <button className="btn" type="submit" disabled={!approved || pending}>{pending ? 'Saving…' : 'Save approved content'}</button>
          {state.message && <p className={state.status === 'error' ? 'err' : 'ok'} role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
        </div>
      </form>

      <aside className="studioPreview card" aria-label="Draft preview">
        <p className="eyebrow">DRAFT PREVIEW</p>
        <h2>{content.about.role || 'Role needs owner input'}</h2>
        <p>{content.about.introduction || 'Studio introduction needs owner input.'}</p>
        <p><strong>{content.skills.filter((item) => item.trim()).length}</strong> listed skills · <strong>{content.services.filter((item) => item.trim()).length}</strong> listed services</p>
        <h3>Enabled avatar languages</h3>
        <ul>{AVATAR_LANGUAGES.filter((item) => content.avatar[item.code].enabled).map((item) => <li key={item.code}>{item.label}: {getAvatarIntroduction(content.avatar[item.code]) || 'Needs owner input'}</li>)}</ul>
        <StudioAvatar content={content.avatar} imageUrl={content.about.profileImageUrl} previewMode />
        <h3>Social links</h3>
        {content.socialLinks.filter((item) => item.label && item.url).map((item) => <p key={`${item.label}-${item.url}`}>{item.label} — {item.url}</p>)}
        <h3>Client feedback</h3>
        {content.feedback.filter((item) => item.quote.trim()).map((item, index) => <blockquote key={`${item.client}-${index}`}>{item.quote}<small>{item.client} · {item.project}</small></blockquote>)}
        <h3>Making process</h3>
        {content.process.filter((item) => item.title.trim()).map((item) => <p key={item.title}><strong>{item.title}</strong> — {item.description}</p>)}
      </aside>
    </div>
  );
}
