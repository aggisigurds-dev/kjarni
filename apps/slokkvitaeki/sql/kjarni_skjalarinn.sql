-- Skjalarinn — independent document/PDF/file organizer (/skjalarinn).
-- Self-contained: its own Storage bucket + table, not tied to the Brunahólf hub.

-- Public storage bucket for the files.
insert into storage.buckets (id, name, public)
values ('skjalarinn', 'skjalarinn', true)
on conflict (id) do nothing;
-- policy skjalarinn_anon_all on storage.objects: for all to anon
--   using (bucket_id='skjalarinn') with check (bucket_id='skjalarinn')

-- Metadata for each uploaded file.
create table if not exists kjarni_skjol (
  id bigint generated always as identity primary key,
  heiti text not null,          -- display name
  slod text not null,           -- object key within the bucket
  url text,                     -- public URL
  stord bigint default 0,       -- bytes
  tegund text default '',       -- mime type
  mappa text not null default 'Almennt',   -- folder / tag
  buid_til timestamptz not null default now()
);
alter table kjarni_skjol enable row level security;
-- policy kjarni_skjol_all: for all to anon using (true) with check (true)
