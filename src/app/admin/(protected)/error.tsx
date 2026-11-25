'use client';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="adminError card" role="alert">
      <p className="eyebrow">ADMIN WORKSPACE / LOAD ERROR</p>
      <h1>This section could not be loaded.</h1>
      <p>
        A required database request failed. Check that the approved Supabase schema and access policies are available,
        then retry. No changes were made by this error screen.
      </p>
      <button className="btn" type="button" onClick={reset}>Try again</button>
    </section>
  );
}
