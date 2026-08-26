-- TurboPaint (apps/slokkvitaeki/app/kjarni/turbopaint): mörg borð + vistun
-- milli tækja. Applied to osfdzskyvisifcwyjkuk 2026-08-26 as migration
-- turbopaint_boards_and_storage.
--
-- RLS er virkt (kjarni-regla). Appið hefur enga innskráningu svo policy-in
-- leyfa anon eins og annars staðar í vistkerfinu — en engin DELETE-policy:
-- borðum er aðeins soft-eytt með deleted=true. Asset (plan-PNG) fara í
-- public bucketið `turbopaint`, eitt object per assetId, ódauðanleg.

create table if not exists public.turbopaint_boards (
  id text primary key,
  name text not null default 'TurboPaint borð',
  doc jsonb not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.turbopaint_boards enable row level security;

create policy "turbopaint_boards_select" on public.turbopaint_boards
  for select using (true);
create policy "turbopaint_boards_insert" on public.turbopaint_boards
  for insert with check (true);
create policy "turbopaint_boards_update" on public.turbopaint_boards
  for update using (true) with check (true);

create index if not exists turbopaint_boards_updated_idx
  on public.turbopaint_boards (deleted, updated_at desc);

insert into storage.buckets (id, name, public)
values ('turbopaint', 'turbopaint', true)
on conflict (id) do nothing;

create policy "turbopaint_assets_read" on storage.objects
  for select using (bucket_id = 'turbopaint');
create policy "turbopaint_assets_insert" on storage.objects
  for insert with check (bucket_id = 'turbopaint');
create policy "turbopaint_assets_update" on storage.objects
  for update using (bucket_id = 'turbopaint') with check (bucket_id = 'turbopaint');

-- Saga (applied 2026-08-26 as migration turbopaint_boards_history):
-- hver breyting á doc vistar fyrri útgáfuna — öryggisnet gegn LWW-yfirskrift.
create table if not exists public.turbopaint_boards_history (
  hid bigint generated always as identity primary key,
  board_id text not null,
  name text,
  doc jsonb not null,
  replaced_at timestamptz not null default now()
);

create index if not exists turbopaint_boards_history_board_idx
  on public.turbopaint_boards_history (board_id, replaced_at desc);

alter table public.turbopaint_boards_history enable row level security;
-- Engar anon-policies: sagan er aðeins fyrir service-hlutverkið (endurheimt
-- gegnum SQL/Claude, ekki úr vafranum).

create or replace function public.turbopaint_boards_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.doc is distinct from new.doc then
    insert into public.turbopaint_boards_history (board_id, name, doc)
    values (old.id, old.name, old.doc);
  end if;
  return new;
end;
$$;

drop trigger if exists turbopaint_boards_history_trg on public.turbopaint_boards;
create trigger turbopaint_boards_history_trg
  before update on public.turbopaint_boards
  for each row execute function public.turbopaint_boards_snapshot();
