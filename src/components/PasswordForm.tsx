'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PasswordForm({ title }: { title: string }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p1.length < 12) return setMsg({ ok: false, text: 'Use at least 12 characters.' });
    if (p1 !== p2) return setMsg({ ok: false, text: 'The two passwords do not match.' });
    setBusy(true);
    let error: { message: string } | null = null;
    try {
      const result = await createClient().auth.updateUser({ password: p1 });
      error = result.error;
    } catch (cause) {
      error = cause instanceof Error ? cause : new Error('Could not update the password.');
    }
    setBusy(false);
    if (error) return setMsg({ ok: false, text: 'Could not update the password. Sign in again and retry.' });
    setP1(''); setP2('');
    setMsg({ ok: true, text: 'Password updated.' });
  }

  return (
    <form onSubmit={submit} className="card adminAuthCard">
      <h2>{title}</h2>
      <label>New password<input type="password" autoComplete="new-password" required value={p1} onChange={e => setP1(e.target.value)} /></label>
      <label>Repeat password<input type="password" autoComplete="new-password" required value={p2} onChange={e => setP2(e.target.value)} /></label>
      {msg && <p className={msg.ok ? 'ok' : 'err'} role="status">{msg.text}</p>}
      <button className="btn" disabled={busy}>Save password</button>
    </form>
  );
}
