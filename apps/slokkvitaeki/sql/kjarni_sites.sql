-- Site registry for the master control station (/kjarni). Each row is a
-- vefur or kerfi managed from the master; "+ Nýr vefur" inserts here and the
-- site opens at /s/<slug>.
create table if not exists kjarni_sites (
  id bigint generated always as identity primary key,
  nafn text not null,
  slug text not null unique,
  tegund text not null default 'vefur',   -- 'vefur' | 'kerfi'
  stada text not null default 'virk',
  buid_til timestamptz not null default now()
);
alter table kjarni_sites enable row level security;
-- policy kjarni_sites_all: for all to anon using (true) with check (true)
-- (writes are behind the master password gate in the UI).

insert into kjarni_sites (nafn, slug, tegund) values
  ('Slökkvitæki vefur','slokkvitaeki','vefur'),
  ('Kerfi — þjónustukerfi','kerfi','kerfi')
on conflict (slug) do nothing;
