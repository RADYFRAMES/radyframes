export function canManageThumbnails(role: unknown): role is 'super_admin' {
  return role === 'super_admin';
}
