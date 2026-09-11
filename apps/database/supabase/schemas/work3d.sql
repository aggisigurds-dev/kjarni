-- 3dwork (apps/web /3dwork): bench projects + parsed meshes, so a build opened
-- on one computer comes back on another (or a phone). Same company Supabase
-- project as TurboPaint (osfdzskyvisifcwyjkuk).
--
-- GitHub in this repo is the kjarni *code* remote — not the parts cloud.
-- Geometry is stored as Float32 triangle soups (not raw 90 MB Drive 3MF).
--
-- RLS is on (kjarni rule). 3dwork has no login, so policies allow anon like
-- turbopaint_boards — but no DELETE policy: rows are only soft-deleted
-- (deleted=true). Anyone holding the publishable key can still read and
-- overwrite builds; closing that needs a login.
--
-- What does not need a login is closed (2026-09-11): the `work3d` bucket is
-- private (read through the key, no keyless public links), takes only
-- application/octet-stream at prj_<id>/ver_<id>.bin, and rows must carry a
-- prj_ id and a project document of at most 1 MB.

create table if not exists public.work3d_projects (
  id text primary key,
  name text not null default 'Untitled blaster',
  project jsonb not null,
  manifest jsonb not null default '{}'::jsonb,
  part_count integer not null default 0,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work3d_projects_id_shape check (id ~ '^prj_[0-9a-z_]+$'),
  constraint work3d_projects_project_size check (octet_length(project::text) <= 1048576)
);

alter table public.work3d_projects enable row level security;

create policy "work3d_projects_select" on public.work3d_projects
  for select using (true);
create policy "work3d_projects_insert" on public.work3d_projects
  for insert with check (true);
create policy "work3d_projects_update" on public.work3d_projects
  for update using (true) with check (true);

create index if not exists work3d_projects_updated_idx
  on public.work3d_projects (deleted, updated_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work3d', 'work3d', false, 83886080, array['application/octet-stream'])
on conflict (id) do nothing;

create policy "work3d_objects_select" on storage.objects
  for select using (bucket_id = 'work3d');
create policy "work3d_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'work3d'
    and name ~ '^prj_[0-9a-z_]+/ver_[0-9a-z_]+\.bin$'
  );
create policy "work3d_objects_update" on storage.objects
  for update using (bucket_id = 'work3d')
  with check (
    bucket_id = 'work3d'
    and name ~ '^prj_[0-9a-z_]+/ver_[0-9a-z_]+\.bin$'
  );
