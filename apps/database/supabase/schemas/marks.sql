-- Marks (apps/web /marks): categorized bookmark start page, so the same
-- links open on a phone or another computer. Same company Supabase as
-- TurboPaint / 3dwork (osfdzskyvisifcwyjkuk).
--
-- One row (id = 'home') holds the whole board as jsonb. RLS on; anon
-- select/insert/update like turbopaint_boards — no DELETE policy.

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
