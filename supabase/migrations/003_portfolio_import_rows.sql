-- Keep every workbook row and URL occurrence, including repeated video IDs.
alter table import_batches add column source_hash text unique;

create table portfolio_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  youtube_id text,
  original_url text not null default '',
  source_sheet text not null,
  source_row_number integer not null,
  source_data jsonb not null default '{}'::jsonb,
  validation_status text not null check (validation_status in ('valid', 'invalid', 'no_video_url')),
  validation_error text,
  created_at timestamptz not null default now()
);

create index portfolio_import_rows_batch_idx on portfolio_import_rows(import_batch_id);
create index portfolio_import_rows_video_idx on portfolio_import_rows(youtube_id);

alter table portfolio_import_rows enable row level security;
create policy "admins manage portfolio import rows"
  on portfolio_import_rows for all
  using (is_admin()) with check (is_admin());

create or replace function public.import_portfolio_inventory(
  p_source text,
  p_source_hash text,
  p_videos jsonb,
  p_source_rows jsonb,
  p_categories jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_id uuid;
begin
  if exists (select 1 from import_batches where source_hash = p_source_hash) then
    raise exception 'This workbook has already been imported. No data was changed.';
  end if;

  insert into import_batches (source, source_hash, note)
  values (p_source, p_source_hash, 'Workbook import; duplicate video occurrences and raw source rows are retained.')
  returning id into batch_id;

  insert into categories (name, slug, sort_order, visible)
  select category.name, category.slug, 100, true
  from jsonb_to_recordset(p_categories) as category(name text, slug text)
  on conflict (name) do nothing;

  insert into projects (
    youtube_id, original_url, kind, category_id, topic, client, title,
    description, ratio_raw, ratio, source_sheet, status, import_batch_id
  )
  select
    video.youtube_id,
    video.original_url,
    video.kind,
    category.id,
    video.topic,
    video.client,
    video.title,
    video.description,
    video.ratio_raw,
    video.ratio,
    video.source_sheet,
    'pending_review',
    batch_id
  from jsonb_to_recordset(p_videos) as video(
    youtube_id text,
    original_url text,
    kind text,
    category text,
    topic text,
    client text,
    title text,
    description text,
    ratio_raw text,
    ratio text,
    source_sheet text
  )
  left join categories category on category.name = coalesce(video.category, 'Uncategorized / To Classify')
  on conflict (youtube_id) do nothing;

  insert into portfolio_import_rows (
    import_batch_id, project_id, youtube_id, original_url, source_sheet,
    source_row_number, source_data, validation_status, validation_error
  )
  select
    batch_id,
    project.id,
    source_row.youtube_id,
    coalesce(source_row.original_url, ''),
    source_row.source_sheet,
    source_row.source_row_number,
    coalesce(source_row.source_data, '{}'::jsonb),
    source_row.validation_status,
    source_row.validation_error
  from jsonb_to_recordset(p_source_rows) as source_row(
    youtube_id text,
    original_url text,
    source_sheet text,
    source_row_number integer,
    source_data jsonb,
    validation_status text,
    validation_error text
  )
  left join projects project on project.youtube_id = source_row.youtube_id;

  return batch_id;
end;
$$;

revoke all on function public.import_portfolio_inventory(text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_portfolio_inventory(text, text, jsonb, jsonb, jsonb) to service_role;
