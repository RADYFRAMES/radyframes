'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm({ notice, configurationAvailable }: { notice?: string; configurationAvailable: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('radnuscreativemedia@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) { setError(`Sign-in failed: ${error.message}`); setBusy(false); return; }
      router.replace('/admin'); router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to connect to authentication.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card adminAuthCard" aria-busy={busy}>
      <h1>Admin login</h1>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="err" id="login-error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || !configurationAvailable}>{busy ? 'Signing in...' : 'Sign in'}</button>
      <a href="/admin/reset-password" className="mut">Forgot password?</a>
    </form>
  );
}
