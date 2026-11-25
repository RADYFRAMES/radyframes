import PasswordForm from '@/components/PasswordForm';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function Account() {
  await requireAdmin();
  return (<><h1>Account</h1><PasswordForm title="Change password" /></>);
}
