-- RADYFRAMES Stage 1: foundation. Run in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create type publish_status as enum ('pending_review','draft','published','archived');
create type admin_role as enum ('super_admin','editor');

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role admin_role not null default 'editor',
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from admins where user_id = auth.uid()) $$;

create or replace function is_super_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from admins where user_id = auth.uid() and role = 'super_admin') $$;

create or replace function set_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  youtube_id text unique,
  original_url text not null,
  kind text check (kind in ('short','video')),
  category_id uuid references categories(id) on delete set null,
  topic text,
  client text,
  title text,
  description text,
  ratio_raw text,
  ratio text check (ratio in ('16:9','1:1','4:5','9:16')),
  source_sheet text,
  status publish_status not null default 'pending_review',
  featured boolean not null default false,
  sort_order int not null default 0,
  import_batch_id uuid references import_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger projects_updated before update on projects for each row execute function set_updated_at();
create index projects_status_idx on projects(status);
create index projects_category_idx on projects(category_id);

create table site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger settings_updated before update on site_settings for each row execute function set_updated_at();

create table activity_log (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  action text not null,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table admins enable row level security;
alter table categories enable row level security;
alter table import_batches enable row level security;
alter table projects enable row level security;
alter table site_settings enable row level security;
alter table activity_log enable row level security;

create policy "admin reads own row" on admins for select using (user_id = auth.uid());
create policy "super admin manages admins" on admins for all using (is_super_admin()) with check (is_super_admin());

create policy "public reads visible categories" on categories for select using (visible);
create policy "admins manage categories" on categories for all using (is_admin()) with check (is_admin());

create policy "public reads published projects" on projects for select using (status = 'published');
create policy "admins manage projects" on projects for all using (is_admin()) with check (is_admin());

-- site_settings is PUBLIC content. Never store secrets here.
create policy "public reads settings" on site_settings for select using (true);
create policy "admins manage settings" on site_settings for all using (is_admin()) with check (is_admin());

create policy "admins manage import batches" on import_batches for all using (is_admin()) with check (is_admin());
create policy "admins read activity" on activity_log for select using (is_admin());
create policy "admins write activity" on activity_log for insert with check (is_admin());

-- Starter categories (your list). Safe to re-run.
insert into categories (name, slug, sort_order) values
 ('Foods / Ads Film','foods-ads-film',1),('Ad Film','ad-film',2),('Testimonials','testimonials',3),
 ('Influencer Content','influencer-content',4),('Clothing Brand','clothing-brand',5),('Real Estate','real-estate',6),
 ('Mixed Content','mixed-content',7),('Saree Reels','saree-reels',8),('Celebrity Reel Edit','celebrity-reel-edit',9),
 ('Long-form Vertical','long-form-vertical',10),('Wish Reel','wish-reel',11),('Cinematography','cinematography',12),
 ('Short Films','short-films',13),('Feature Films','feature-films',14),('Color Grading','color-grading',15),
 ('CGI / 3D','cgi-3d',16),('VFX','vfx',17),('Blender / Unreal Engine','blender-unreal-engine',18),
 ('Showreels','showreels',19),('Uncategorized / To Classify','uncategorized',99)
on conflict (name) do nothing;
