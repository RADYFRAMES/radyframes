import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const notice =
    params.error === 'unauthorized' ? 'This account is not authorised for the admin area.' :
    params.error === 'admin-schema' ? 'Supabase cannot find the public admins table in its schema cache. Admin sign-in cannot be completed until the site owner approves and applies the required database setup.' :
    params.error === 'admin-check' ? 'You signed in, but the application could not read the admin authorization record. Ask the site owner to check the Supabase admins table and its access policies.' :
    params.error === 'link' ? 'That link is invalid or expired. Request a new one.' :
    params.error === 'auth' ? 'Your admin session could not be verified. Please sign in again.' :
    params.error === 'logout' ? 'The session could not be cleared completely. Please sign in again or contact the site administrator.' :
    params.error === 'config' || !configured
      ? 'Admin login is unavailable until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured and the development server is restarted.'
      : undefined;
  return <main className="adminAuthShell"><LoginForm notice={notice} configurationAvailable={configured} /></main>;
}
