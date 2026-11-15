-- Bíó (/bio) — yfirlit yfir Plex-safnið heima: þættir sem fylgst er með (hvað vantar,
-- hvað er á diski utan Plex, næsti þáttur), nýir þættir og nýjar myndir.
--
-- PC-tölvan heima (tools/bio-sync) les Plex, diskana og TVmaze/iTunes og sendir
-- samantekt hingað; síðan /bio les hana. Engin innskráning — sama lag og Tónklippa:
-- langur lykill (≥ 32 stafir) býr á PC-tölvunni og í vafranum og er sendur í hausnum
-- x-bio-key. Raðirnar eru merktar sha256(lykill) og reglurnar hleypa aðeins þeim að
-- sem senda lykilinn. Lykillinn sjálfur er hvergi geymdur í gagnagrunninum.
--
--   hluti = 'safn'      samantekt frá PC-tölvunni (skrifar: tools/bio-sync)
--   hluti = 'fylgjast'  þættir sem bætt var við á síðunni (skrifar: /bio, les: bio-sync)

create or replace function public.bio_skuffa()
returns text
language sql
stable
set search_path = ''
as $$
  select case when length(k) >= 32 then encode(sha256(convert_to(k, 'UTF8')), 'hex') end
  from (
    select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-bio-key', '') as k
  ) s
$$;

create table if not exists public.bio_gogn (
  skuffa   text        not null check (skuffa ~ '^[0-9a-f]{64}$'),
  hluti    text        not null check (hluti in ('safn', 'fylgjast')),
  gogn     jsonb       not null,
  uppfaert timestamptz not null default now(),
  primary key (skuffa, hluti),
  check (octet_length(gogn::text) < 2000000)
);

alter table public.bio_gogn enable row level security;

create policy "bio_gogn_select" on public.bio_gogn
  for select using (skuffa = (select public.bio_skuffa()));
create policy "bio_gogn_insert" on public.bio_gogn
  for insert with check (skuffa = (select public.bio_skuffa()));
create policy "bio_gogn_update" on public.bio_gogn
  for update using (skuffa = (select public.bio_skuffa()))
  with check (skuffa = (select public.bio_skuffa()));
create policy "bio_gogn_delete" on public.bio_gogn
  for delete using (skuffa = (select public.bio_skuffa()));

grant select, insert, update, delete on public.bio_gogn to anon, authenticated;
