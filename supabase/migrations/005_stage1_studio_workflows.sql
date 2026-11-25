-- Stage 1 proposal: adoption sources, private DI reviews and moderated guestbook.
-- Do not run until the owner has reviewed and approved this SQL.

create table if not exists project_adoptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  ratio text not null check (ratio in ('1:1', '4:5', '16:9', '9:16')),
  source_url text not null check (source_url ~ '^https?://'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ratio),
  unique (id, project_id)
);

create trigger project_adoptions_updated
  before update on project_adoptions
  for each row execute function set_updated_at();

alter table project_adoptions enable row level security;
create policy "public reads published adoption sources"
  on project_adoptions for select
  using (exists (
    select 1 from projects
    where projects.id = project_adoptions.project_id
      and projects.status = 'published'
  ));
create policy "admins manage adoption sources"
  on project_adoptions for all
  using (is_admin()) with check (is_admin());

create table if not exists di_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 200),
  project_id uuid references projects(id) on delete cascade,
  adoption_id uuid,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint di_checklist_templates_scope_fk
    foreign key (adoption_id, project_id)
    references project_adoptions(id, project_id) on delete cascade,
  constraint di_checklist_templates_scope_check
    check (adoption_id is null or project_id is not null)
);

alter table di_checklist_templates
  add column if not exists project_id uuid references projects(id) on delete cascade,
  add column if not exists adoption_id uuid;
alter table di_checklist_templates drop constraint if exists di_checklist_templates_label_key;
create unique index if not exists di_checklist_templates_scope_label_idx
  on di_checklist_templates (label, project_id, adoption_id) nulls not distinct;

create trigger di_checklist_templates_updated
  before update on di_checklist_templates
  for each row execute function set_updated_at();

insert into di_checklist_templates (label, sort_order) values
  ('Exposure check', 10),
  ('White balance check', 20),
  ('Skin tone check', 30),
  ('Shot matching', 40),
  ('Highlight and shadow detail', 50),
  ('Saturation check', 60),
  ('Color consistency', 70),
  ('Noise and artifact check', 80),
  ('Output resolution', 90),
  ('Frame rate', 100),
  ('Aspect ratio', 110),
  ('Color space / export settings', 120),
  ('Final playback review', 130),
  ('Client approval', 140)
on conflict do nothing;

create table if not exists di_review_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  adoption_id uuid,
  template_id uuid not null references di_checklist_templates(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'passed', 'needs_correction', 'not_applicable')),
  internal_notes text not null default '',
  reviewed_at timestamptz,
  reviewer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint di_review_checks_target_fk
    foreign key (adoption_id, project_id)
    references project_adoptions(id, project_id) on delete cascade,
  unique nulls not distinct (project_id, adoption_id, template_id)
);

create table if not exists di_review_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  adoption_id uuid,
  internal_notes text not null default '',
  review_date date,
  reviewer text,
  final_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint di_review_sessions_target_fk
    foreign key (adoption_id, project_id)
    references project_adoptions(id, project_id) on delete cascade,
  unique nulls not distinct (project_id, adoption_id)
);

create trigger di_review_checks_updated
  before update on di_review_checks
  for each row execute function set_updated_at();
create trigger di_review_sessions_updated
  before update on di_review_sessions
  for each row execute function set_updated_at();

alter table di_checklist_templates enable row level security;
alter table di_review_checks enable row level security;
alter table di_review_sessions enable row level security;
create policy "admins manage DI checklist templates"
  on di_checklist_templates for all using (is_admin()) with check (is_admin());
create policy "admins manage DI review checks"
  on di_review_checks for all using (is_admin()) with check (is_admin());
create policy "admins manage DI review sessions"
  on di_review_sessions for all using (is_admin()) with check (is_admin());

create table if not exists guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  public_name text not null check (length(trim(public_name)) between 1 and 100),
  message text not null check (length(trim(message)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists guestbook_entries_status_created_idx
  on guestbook_entries(status, created_at desc);
alter table guestbook_entries enable row level security;
create policy "public reads approved guestbook entries"
  on guestbook_entries for select using (status = 'approved');
create policy "admins manage guestbook entries"
  on guestbook_entries for all using (is_admin()) with check (is_admin());

grant select on project_adoptions to anon, authenticated;
grant insert, update, delete on project_adoptions to authenticated;
grant select, insert, update, delete on di_checklist_templates, di_review_checks, di_review_sessions to authenticated;
grant select on guestbook_entries to anon, authenticated;
grant update on guestbook_entries to authenticated;

create or replace function public.save_project_adoptions(p_project_id uuid, p_versions jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if coalesce(jsonb_typeof(p_versions), '') <> 'array' then
    raise exception 'Adoption versions must be an array.';
  end if;
  if not exists (select 1 from projects where id = p_project_id) then
    raise exception 'Project not found.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_versions) as v(ratio text, source_url text, sort_order integer)
    group by v.ratio
    having count(*) > 1
  ) then
    raise exception 'Adoption ratios must be unique for each project.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_versions) as v(ratio text, source_url text, sort_order integer)
    where v.ratio is null
      or v.ratio not in ('1:1', '4:5', '16:9', '9:16')
      or v.source_url is null
    or not (
      v.source_url ~* '^https?://(youtube\.com|www\.youtube\.com|m\.youtube\.com|music\.youtube\.com|youtube-nocookie\.com|www\.youtube-nocookie\.com)/(watch\?([^#&]*&)*v=[A-Za-z0-9_-]{11}(&[^#]*)?|(shorts|embed|live|v)/[A-Za-z0-9_-]{11}/?(\?[^#]*)?(#.*)?)$'
      or v.source_url ~* '^https?://(youtu\.be|www\.youtu\.be)/[A-Za-z0-9_-]{11}/?(\?[^#]*)?(#.*)?$'
    )
  ) then
    raise exception 'Each adoption needs a supported ratio and valid YouTube video URL.';
  end if;

  delete from project_adoptions existing
  where existing.project_id = p_project_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_versions) as v(ratio text)
      where v.ratio = existing.ratio
    );

  insert into project_adoptions (project_id, ratio, source_url, sort_order)
  select p_project_id, v.ratio, v.source_url, v.sort_order
  from jsonb_to_recordset(p_versions) as v(ratio text, source_url text, sort_order integer)
  on conflict (project_id, ratio) do update
  set source_url = excluded.source_url, sort_order = excluded.sort_order;

  insert into activity_log (user_id, action, entity, entity_id, detail)
  values (auth.uid(), 'save_adoption_sources', 'project', p_project_id::text,
    jsonb_build_object('formats', jsonb_array_length(p_versions)));
end;
$$;

create or replace function public.save_di_checklist_templates(p_templates jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if coalesce(jsonb_typeof(p_templates), '') <> 'array' then
    raise exception 'Checklist items must be an array.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_templates) as t(id uuid, label text, sort_order integer, project_id uuid, adoption_id uuid)
    where coalesce(length(trim(t.label)), 0) not between 1 and 200
  ) then
    raise exception 'Checklist labels must be between 1 and 200 characters.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_templates) as t(id uuid, label text, sort_order integer, project_id uuid, adoption_id uuid)
    group by lower(trim(t.label)), t.project_id, t.adoption_id having count(*) > 1
  ) then
    raise exception 'Checklist labels must be unique.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_templates) as t(id uuid, label text, sort_order integer, project_id uuid, adoption_id uuid)
    where (t.project_id is not null and not exists (select 1 from projects p where p.id = t.project_id))
       or (t.adoption_id is not null and not exists (
         select 1 from project_adoptions a where a.id = t.adoption_id and a.project_id = t.project_id
       ))
  ) then
    raise exception 'Checklist assignment refers to an unknown project or adoption.';
  end if;

  delete from di_checklist_templates existing
  where not exists (
    select 1
    from jsonb_to_recordset(p_templates) as t(id uuid)
    where t.id = existing.id
  );

  insert into di_checklist_templates (id, label, project_id, adoption_id, sort_order, active)
  select coalesce(t.id, gen_random_uuid()), trim(t.label), t.project_id, t.adoption_id, t.sort_order, true
  from jsonb_to_recordset(p_templates) as t(id uuid, label text, sort_order integer, project_id uuid, adoption_id uuid)
  on conflict (id) do update
  set label = excluded.label,
      project_id = excluded.project_id,
      adoption_id = excluded.adoption_id,
      sort_order = excluded.sort_order,
      active = true;

  insert into activity_log (user_id, action, entity, detail)
  values (auth.uid(), 'save_di_checklist_templates', 'DI checklist',
    jsonb_build_object('item_count', jsonb_array_length(p_templates)));
end;
$$;

create or replace function public.save_di_review(
  p_project_id uuid,
  p_adoption_id uuid,
  p_checks jsonb,
  p_internal_notes text,
  p_review_date date,
  p_final_approved boolean,
  p_reviewer text
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if not exists (select 1 from projects where id = p_project_id) then
    raise exception 'Project not found.';
  end if;
  if p_adoption_id is not null and not exists (
    select 1 from project_adoptions where id = p_adoption_id and project_id = p_project_id
  ) then
    raise exception 'Adoption format does not belong to this project.';
  end if;
  if coalesce(jsonb_typeof(p_checks), '') <> 'array' then
    raise exception 'Review checks must be an array.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_checks) as c(template_id uuid, status text, internal_notes text)
    where c.status not in ('not_started', 'in_progress', 'passed', 'needs_correction', 'not_applicable')
       or not exists (
         select 1 from di_checklist_templates t
         where t.id = c.template_id and t.active
           and (t.project_id is null or (
             t.project_id = p_project_id
             and ((t.adoption_id is null and p_adoption_id is null) or t.adoption_id = p_adoption_id)
           ))
       )
  ) then
    raise exception 'One or more review checks are invalid.';
  end if;
  if p_final_approved and (
    not exists (
      select 1 from di_checklist_templates t
      where t.active
        and (t.project_id is null or (
          t.project_id = p_project_id
          and ((t.adoption_id is null and p_adoption_id is null) or t.adoption_id = p_adoption_id)
        ))
    )
    or exists (
      select 1
      from di_checklist_templates t
      left join jsonb_to_recordset(p_checks) as c(template_id uuid, status text, internal_notes text)
        on c.template_id = t.id
      where t.active
        and (t.project_id is null or (
          t.project_id = p_project_id
          and ((t.adoption_id is null and p_adoption_id is null) or t.adoption_id = p_adoption_id)
        ))
        and (c.template_id is null or c.status not in ('passed', 'not_applicable'))
    )
  ) then
    raise exception 'Final DI approval requires every assigned checklist item to pass or be not applicable.';
  end if;

  insert into di_review_checks (
    project_id, adoption_id, template_id, status, internal_notes, reviewed_at, reviewer
  )
  select p_project_id, p_adoption_id, c.template_id, c.status, coalesce(c.internal_notes, ''),
    case when c.status = 'not_started' then null else now() end, p_reviewer
  from jsonb_to_recordset(p_checks) as c(template_id uuid, status text, internal_notes text)
  on conflict (project_id, adoption_id, template_id) do update
  set status = excluded.status,
      internal_notes = excluded.internal_notes,
      reviewed_at = excluded.reviewed_at,
      reviewer = excluded.reviewer;

  insert into di_review_sessions (
    project_id, adoption_id, internal_notes, review_date, reviewer, final_approved
  ) values (
    p_project_id, p_adoption_id, coalesce(p_internal_notes, ''), p_review_date, p_reviewer, p_final_approved
  )
  on conflict (project_id, adoption_id) do update
  set internal_notes = excluded.internal_notes,
      review_date = excluded.review_date,
      reviewer = excluded.reviewer,
      final_approved = excluded.final_approved;

  insert into activity_log (user_id, action, entity, entity_id, detail)
  values (auth.uid(), 'save_di_review', 'project', p_project_id::text,
    jsonb_build_object('adoption_id', p_adoption_id, 'final_approved', p_final_approved));
end;
$$;

revoke all on function public.save_project_adoptions(uuid, jsonb) from public, anon;
revoke all on function public.save_di_checklist_templates(jsonb) from public, anon;
revoke all on function public.save_di_review(uuid, uuid, jsonb, text, date, boolean, text) from public, anon;
grant execute on function public.save_project_adoptions(uuid, jsonb) to authenticated;
grant execute on function public.save_di_checklist_templates(jsonb) to authenticated;
grant execute on function public.save_di_review(uuid, uuid, jsonb, text, date, boolean, text) to authenticated;
