'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=/admin/update-password`,
      });
      if (resetError) {
        setError('The reset request could not be processed. Please try again later.');
        return;
      }
      setSent(true); // same message either way: never reveal whether an account exists
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to authentication.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="adminAuthShell">
      <form onSubmit={submit} className="card adminAuthCard">
        <h1>Reset password</h1>
        <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        {sent && <p className="ok" role="status">If that account exists, a reset email has been sent.</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>Send reset link</button>
        <a href="/admin/login" className="mut">Back to login</a>
      </form>
    </main>
  );
}
