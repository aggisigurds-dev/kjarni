-- Skráning (apps/slokkvitaeki /kjarni/skraning): eigið skráningakerfi í stað EG Ajour
-- fyrir brunaþéttingar á verkstöðum Brunahólfs. Sjá docs/HT-13.10-AJOUR-SKRANING.md.
--
-- Líkanið speglar Ajour Inspect & QA eins og Brunahólf notar það svo innflutningur
-- úr Ajour sé 1:1: verk → teikning (PDF renderað í fasta mynd) → skráning með pinna
-- í PIXLUM á þeirri mynd, flokki (stærð gats = verðskrárlína), starfsmanni, stöðu,
-- gátlista og ljósmyndum. Sama Supabase-verkefni og allt annað (osfdzskyvisifcwyjkuk).
--
-- RLS á öllum töflum. Fyrsta útgáfa: anon select/insert/update eins og marks/turbopaint
-- (innri tól, engin innskráning enn) — engin DELETE-heimild; eyðing = `eytt=true`.
-- Þegar innskráning starfsmanna kemur (áfangi 2) þrengjast policies í auth.uid().

-- ---------------------------------------------------------------- verk
create table if not exists public.skr_verk (
  id              bigint generated always as identity primary key,
  heiti           text not null,
  heimilisfang    text,
  verkkaupi       text,                       -- GG Verk, ÞG verk, Jáverk, Safír …
  ajour_project_id uuid unique,               -- projectId í Ajour (til innflutnings/samanburðar)
  ajour_nafn      text,                       -- ProjectName nákvæmlega eins og í Ajour-CSV
  verdskra_scope  text,                       -- lykill í hole_size_rates.scope (t.d. 'heklureitur', 'generic')
  stig            jsonb not null default '[]'::jsonb,  -- Ajour ProjectLevel1-3 ef notað
  virkt           boolean not null default true,
  eytt            boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- teikningar
create table if not exists public.skr_teikningar (
  id              bigint generated always as identity primary key,
  verk_id         bigint not null references public.skr_verk(id),
  heiti           text not null,              -- "K -1-.pdf", "5H 1S og 2S.jpg"
  haed            text,                       -- "K-1", "5H" … (valfrjálst, til síunar)
  pdf_path        text,                       -- bucket skraning/<verk>/<id>.pdf (frumrit)
  mynd_path       text,                       -- bucket skraning/<verk>/<id>.png (fasta renderingin)
  breidd_px       integer,                    -- stærð renderingarinnar — pinnar eru í þessum hnitum
  haed_px         integer,
  dpi             integer,
  skurdur         jsonb,                      -- fastur skurður {x,y,w,h} í px renderingarinnar; pinnar eru í hnitum allrar myndar
  rod             integer not null default 0,
  ajour_file_id   uuid unique,
  eytt            boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists skr_teikningar_verk_idx on public.skr_teikningar (verk_id, eytt, rod);

-- ---------------------------------------------------------------- flokkar (= Ajour CategoryGroup)
create table if not exists public.skr_flokkar (
  id              bigint generated always as identity primary key,
  verk_id         bigint references public.skr_verk(id),   -- null = sjálfgefið sniðmát fyrir öll verk
  heiti           text not null,              -- "Gat Ø 000-031", "Borði 110mm", "Línuþétting", "Annað"
  tegund          text not null default 'gat' check (tegund in ('gat','bordi','lina','punktur','annad')),
  mm_fra          integer,                    -- 0
  mm_til          integer,                    -- 31  (til að máta við hole_size_rates)
  rod             integer not null default 0,
  ajour_group_id  uuid,
  virkt           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists skr_flokkar_verk_idx on public.skr_flokkar (verk_id, virkt, rod);

-- ---------------------------------------------------------------- gátlisti (= Ajour ControlSchema items)
create table if not exists public.skr_gatlisti (
  id              bigint generated always as identity primary key,
  verk_id         bigint references public.skr_verk(id),   -- null = sjálfgefið sniðmát
  atridi          text not null,              -- "EI60", "Kragi / PCP Collars", "Ljósmynd af gati fyrir þéttingu"
  hopur           text,                       -- 'brunamotstada' | 'efni' | 'mynd' | 'annad'
  rod             integer not null default 0,
  virkt           boolean not null default true
);

-- ---------------------------------------------------------------- starfsmenn / fyrirtæki
create table if not exists public.skr_fyrirtaeki (
  id              bigint generated always as identity primary key,
  heiti           text not null unique,       -- Brunahólf ehf, GG Verk, ÞG verk, Jáverk, Safír
  ajour_company_id uuid
);

create table if not exists public.skr_starfsmenn (
  id              bigint generated always as identity primary key,
  numer           integer unique,             -- Ajour "Starfsmaður N" → N
  nafn            text,
  fyrirtaeki_id   bigint references public.skr_fyrirtaeki(id),
  auth_user_id    uuid,                       -- tengist auth.users þegar innskráning kemur
  virkur          boolean not null default true
);

-- ---------------------------------------------------------------- skráningar
create table if not exists public.skr_skraningar (
  id              bigint generated always as identity primary key,
  verk_id         bigint not null references public.skr_verk(id),
  radnr           integer not null,           -- raðnúmer innan verks (Ajour SerialNumber)
  teikning_id     bigint references public.skr_teikningar(id),
  x_px            numeric,                    -- pinni í pixlum á skr_teikningar.mynd_path
  y_px            numeric,
  flokkur_id      bigint references public.skr_flokkar(id),
  starfsmadur_id  bigint references public.skr_starfsmenn(id),
  tegund          text not null default 'qa' check (tegund in ('qa','supervisory','project','pre','defect')),
  stada           text not null default 'created'
                  check (stada in ('created','done','completed','rejected','not_approved')),
  lysing          text,                       -- Ajour Description
  athugasemd      text,                       -- Ajour Subject/Commentaries
  frestur         date,
  framkvaemt_fra  date,
  framkvaemt_til  date,
  lokid_at        timestamptz,                -- þegar staða varð done
  abyrgd_id       bigint references public.skr_fyrirtaeki(id),
  mottakandi_id   bigint references public.skr_fyrirtaeki(id),
  lon             double precision,
  lat             double precision,
  ajour_registration_id uuid unique,
  ajour_serial    integer,
  eytt            boolean not null default false,
  stofnad_af      bigint references public.skr_starfsmenn(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (verk_id, radnr)
);
create index if not exists skr_skraningar_verk_idx on public.skr_skraningar (verk_id, eytt, stada);
create index if not exists skr_skraningar_teikning_idx on public.skr_skraningar (teikning_id);
create index if not exists skr_skraningar_dags_idx on public.skr_skraningar (framkvaemt_fra);
create index if not exists skr_skraningar_created_idx on public.skr_skraningar (created_at desc);

create table if not exists public.skr_gatlisti_svor (
  skraning_id     bigint not null references public.skr_skraningar(id) on delete cascade,
  atridi_id       bigint not null references public.skr_gatlisti(id),
  hakad           boolean not null default false,
  texti           text,
  hakad_af        bigint references public.skr_starfsmenn(id),
  hakad_at        timestamptz,
  primary key (skraning_id, atridi_id)
);

create table if not exists public.skr_myndir (
  id              bigint generated always as identity primary key,
  skraning_id     bigint not null references public.skr_skraningar(id) on delete cascade,
  path            text not null,              -- bucket skraning/<verk>/<skraning>/<n>.jpg
  stig            text not null default 'fyrir' check (stig in ('fyrir','eftir','annad')),  -- fyrir þéttingu / eftir að lokið er
  breidd          integer,
  haed            integer,
  tekin_at        timestamptz,
  af              bigint references public.skr_starfsmenn(id),
  ajour_file_id   uuid unique,
  rod             integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists skr_myndir_skraning_idx on public.skr_myndir (skraning_id, rod);

-- atburðaskrá (= Ajour registration log)
create table if not exists public.skr_atburdir (
  id              bigint generated always as identity primary key,
  skraning_id     bigint not null references public.skr_skraningar(id) on delete cascade,
  hvad            text not null,              -- 'stofnad','stada','flokkur','mynd','teikning','texti'
  gogn            jsonb,
  hver            bigint references public.skr_starfsmenn(id),
  hvenaer         timestamptz not null default now()
);
create index if not exists skr_atburdir_skraning_idx on public.skr_atburdir (skraning_id, hvenaer desc);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['skr_verk','skr_teikningar','skr_flokkar','skr_gatlisti','skr_fyrirtaeki',
                           'skr_starfsmenn','skr_skraningar','skr_gatlisti_svor','skr_myndir','skr_atburdir']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check (true)', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using (true) with check (true)', t || '_update', t);
  end loop;
end $$;

-- updated_at
create or replace function public.skr_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['skr_verk','skr_teikningar','skr_skraningar']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.skr_touch()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- lesgluggi á Ajour-innflutninginn
-- `ajour_registrations` (brunaholf/luna-bridge) er með RLS og ENGA policy → aðeins service-lykill les hana.
-- Áfangi 1 les hana í gegnum þetta view (eigandi = postgres, svo RLS töflunnar gildir ekki; aðeins
-- lesdálkar, engin skrif). Hverfur þegar skr_skraningar hefur tekið við og viewið snýr á þær.
create or replace view public.skr_ajour_lesid as
  select id, serial_number, registration_status, project_name, category_group, category, category1,
         checklist_item, execution_date, checked_date, checked_by_user, registration_created_date,
         drawing_name, subject, receiver_company, imported_at
  from public.ajour_registrations;
grant select on public.skr_ajour_lesid to anon, authenticated;

-- ---------------------------------------------------------------- geymsla
-- Teikningar (PDF + render) og ljósmyndir. Public eins og turbopaint/marks í fyrstu útgáfu
-- (innri tól); verður private + signed URLs þegar innskráning kemur.
insert into storage.buckets (id, name, public, file_size_limit)
values ('skraning', 'skraning', true, 52428800)
on conflict (id) do nothing;

drop policy if exists "skraning_objects_select" on storage.objects;
create policy "skraning_objects_select" on storage.objects for select using (bucket_id = 'skraning');
drop policy if exists "skraning_objects_insert" on storage.objects;
create policy "skraning_objects_insert" on storage.objects for insert with check (bucket_id = 'skraning');
drop policy if exists "skraning_objects_update" on storage.objects;
create policy "skraning_objects_update" on storage.objects for update using (bucket_id = 'skraning') with check (bucket_id = 'skraning');

-- ---------------------------------------------------------------- sjálfgefin sniðmát (úr Ajour-skema Brunahólfs 13.10.2026)
insert into public.skr_fyrirtaeki (heiti) values ('Brunahólf ehf'),('GG Verk'),('ÞG verk'),('Jáverk'),('Safír')
on conflict (heiti) do nothing;

insert into public.skr_flokkar (verk_id, heiti, tegund, mm_fra, mm_til, rod)
select null, heiti, tegund, mm_fra, mm_til, rod from (values
  ('Gat Ø 000-031','gat',0,31,10),('Gat Ø 032-059','gat',32,59,20),('Gat Ø 060-109','gat',60,109,30),
  ('Gat Ø 110-159','gat',110,159,40),('Gat Ø 160-209','gat',160,209,50),('Gat Ø 210-259','gat',210,259,60),
  ('Gat Ø 260-309','gat',260,309,70),('Gat Ø 310-359','gat',310,359,80),('Gat Ø 360-409','gat',360,409,90),
  ('Gat Ø 410-459','gat',410,459,100),('Gat Ø 460-509','gat',460,509,110),('Gat Ø 510-559','gat',510,559,120),
  ('Gat Ø 560-609','gat',560,609,130),('Gat Ø 610-659','gat',610,659,140),('Gat Ø 660-709','gat',660,709,150),
  ('Gat Ø 710-759','gat',710,759,160),('Gat Ø 760-809','gat',760,809,170),('Gat Ø 810-859','gat',810,859,180),
  ('Gat Ø 860-909','gat',860,909,190),('Gat Ø 910-959','gat',910,959,200),('Gat Ø 960-1009','gat',960,1009,210),
  ('Gat Ø1010-1059','gat',1010,1059,220),('Gat Ø1060-1109','gat',1060,1109,230),('Gat Ø1110-1159','gat',1110,1159,240),
  ('Gat Ø1160-1209+','gat',1160,1209,250),('Gat Ø1210-1300','gat',1210,1300,260),
  ('Borði 110mm','bordi',null,null,300),('Línuþétting','lina',null,null,310),('Guide point','punktur',null,null,320),
  ('Annað','annad',null,null,330)
) as v(heiti,tegund,mm_fra,mm_til,rod)
where not exists (select 1 from public.skr_flokkar f where f.verk_id is null and f.heiti = v.heiti);

insert into public.skr_gatlisti (verk_id, atridi, hopur, rod)
select null, atridi, hopur, rod from (values
  ('EI60','brunamotstada',10),('EI 90','brunamotstada',20),('EI 120','brunamotstada',30),('EI 180','brunamotstada',40),
  ('EI 240','brunamotstada',50),('EI 360','brunamotstada',60),
  ('Ljósmynd af gati fyrir þéttingu','mynd',100),
  ('Kragi / PCP Collars','efni',200),('50 mm Þéttull / FR Board','efni',210),('Akríl / Pyrocoustic Sealant','efni',220),
  ('Borðar / PWP Wraps','efni',230),('Kítti háþensla / Graphite Sealant','efni',240),('Silicon / Silikon','efni',250),
  ('Annað / Other','annad',300)
) as v(atridi,hopur,rod)
where not exists (select 1 from public.skr_gatlisti g where g.verk_id is null and g.atridi = v.atridi);

-- ---------------------------------------------------------------- sameinuð sýn + yfirlit per verk
-- (sjá migration skr_yfirlit_view_og_rpc 14.10.2026) — skr_yfirlit = Ajour-innflutningur ∪ eigin skráningar í sömu
-- dálkum (uppruni 'ajour'|'skraning', lykill 'a:id'|'s:id', stada samræmd, myndir/mynd_path úr skr_myndir);
-- skr_verk_yfirlit() = talningar per verk (alls/done/created/í dag/vika/mánuður/fyrri mánuður done/síðast/sótt/teikn/menn)
-- svo yfirlitið sæki EINA röð per verk í stað 25 þús. raða. Skilgreiningarnar eru í migration-skránni.
