-- Kerfi — clean, reusable service-company system (template for standing up
-- another similar þjónustufyrirtæki). Applied to Supabase via MCP migrations
-- kerfi_service_template + kerfi_settings. Kept here for reproducibility.
-- All tables are namespaced kerfi_* and isolated from live data.

create table if not exists kerfi_vidskiptavinir (
  id bigint generated always as identity primary key,
  nafn text not null,
  tegund text not null default 'fyrirtaeki',   -- 'heimili' | 'fyrirtaeki'
  kennitala text,
  heimilisfang text,
  postnr text,
  stadur text,
  simi text,
  netfang text,
  athugasemd text,
  buid_til timestamptz not null default now()
);

create table if not exists kerfi_taeki (
  id bigint generated always as identity primary key,
  vidskiptavinur_id bigint not null references kerfi_vidskiptavinir(id) on delete cascade,
  tegund text not null,
  eldflokkur text default '',
  stadsetning text,
  radnr text,
  sidast_skodad date,
  naesta_skodun date,
  buid_til timestamptz not null default now()
);
create index if not exists kerfi_taeki_vidskiptavinur_idx on kerfi_taeki(vidskiptavinur_id);

create table if not exists kerfi_stillingar (
  lykill text primary key,
  gildi text,
  uppfaert timestamptz not null default now()
);

-- Test system: publishable (anon) key gets full CRUD on these isolated tables.
alter table kerfi_vidskiptavinir enable row level security;
alter table kerfi_taeki enable row level security;
alter table kerfi_stillingar enable row level security;
-- policies kerfi_v_all / kerfi_t_all / kerfi_s_all: for all to anon using (true) with check (true)

-- Module flags. Default enabled = Grunnur (Búnaður + Skoðanir); the rest are
-- turned on þrepaskipt from the Einingar screen:
--   Þrep 1 · Afgreiðsla:  sala, verkstaedi, afgreidsla
--   Þrep 2 · Þjónusta:    thjonusta, utkeyrsla
--   Þrep 3 · Framlengt:   brunakerfi, reikningar (Payday/kröfuyfirlit)
-- insert into kerfi_stillingar (lykill, gildi)
--   values ('einingar', '["vidskiptavinir","bunadur","skodanir"]');

-- ---- Þrep 1 · Sala (POS) — migration kerfi_sala ----------------------------
create table if not exists kerfi_vorur (
  id bigint generated always as identity primary key,
  heiti text not null,
  tegund text not null default 'vara',   -- 'vara' | 'thjonusta'
  verd integer not null,                 -- price WITH vsk, ISK
  vsk integer not null default 24,
  virk boolean not null default true,
  rod integer not null default 0,
  buid_til timestamptz not null default now()
);
create table if not exists kerfi_solur (
  id bigint generated always as identity primary key,
  vidskiptavinur_id bigint references kerfi_vidskiptavinir(id) on delete set null,
  vidskiptavinur_nafn text,
  linur jsonb not null default '[]',     -- [{heiti, verd, fjoldi}]
  samtals integer not null default 0,
  vsk integer not null default 0,
  greidslumati text default 'kort',      -- 'kort' | 'reikningur' | 'reidufe'
  buid_til timestamptz not null default now()
);
-- RLS on; anon policies kerfi_vor_all / kerfi_sol_all (for all, using true).
-- Sala seeded with 10 vörur/þjónusta and turned on by default:
--   update kerfi_stillingar set gildi='["vidskiptavinir","bunadur","skodanir","sala"]' where lykill='einingar';
