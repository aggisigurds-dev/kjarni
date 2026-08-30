-- Marks (apps/web /marks): categorized bookmark start page, so the same
-- links open on a phone or another computer. Same company Supabase as
-- TurboPaint / 3dwork (osfdzskyvisifcwyjkuk).
--
-- Each row is a site. id = 'home' is the kjarni starter board; extra
-- rows (id like site_…) are clean boards for different topics. Extra
-- rows already work — no migration. RLS on; anon select/insert/update
-- like turbopaint_boards — no DELETE policy.

create table if not exists public.marks_boards (
  id text primary key,
  doc jsonb not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marks_boards enable row level security;

create policy "marks_boards_select" on public.marks_boards
  for select using (true);
create policy "marks_boards_insert" on public.marks_boards
  for insert with check (true);
create policy "marks_boards_update" on public.marks_boards
  for update using (true) with check (true);

create index if not exists marks_boards_updated_idx
  on public.marks_boards (deleted, updated_at desc);

-- Cover / screenshot cache. Public like turbopaint / work3d; anon can
-- read, insert, and replace. No DELETE policy.
insert into storage.buckets (id, name, public, file_size_limit)
values ('marks', 'marks', true, 5242880)
on conflict (id) do nothing;

create policy "marks_objects_select" on storage.objects
  for select using (bucket_id = 'marks');
create policy "marks_objects_insert" on storage.objects
  for insert with check (bucket_id = 'marks');
create policy "marks_objects_update" on storage.objects
  for update using (bucket_id = 'marks') with check (bucket_id = 'marks');
