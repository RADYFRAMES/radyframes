alter type publish_status add value if not exists 'approved';
alter type publish_status add value if not exists 'rejected';

alter table projects
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
