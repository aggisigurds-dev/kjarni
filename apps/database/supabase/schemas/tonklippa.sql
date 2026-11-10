-- Tónklippa (/tonklippa) — skýjageymsla fyrir rútínur og lög.
--
-- Engin innskráning: hvert tæki á „skúffu“ sem opnast með löngum leynilykli
-- sem appið býr til og sendir í hausnum x-tk-key. Skrárnar liggja í möppu sem
-- heitir sha256(lykill), og reglurnar hleypa aðeins þeim að sem senda lykilinn
-- sem mappan er reiknuð úr. Enginn sér því eða getur talið upp skúffur annarra,
-- og lykillinn sjálfur er hvergi geymdur í gagnagrunninum.
--
--   <sha256(lykill)>/p/<rútína>.json      lýsing rútínu (bútar, hápunktar, lengd)
--   <sha256(lykill)>/t/<rútína>/<lag>     upprunaleg lagaskrá

create or replace function public.tonklippa_skuffa()
returns text
language sql
stable
set search_path = ''
as $$
  select case when length(k) >= 32 then encode(sha256(convert_to(k, 'UTF8')), 'hex') end
  from (
    select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-tk-key', '') as k
  ) s
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tonklippa', 'tonklippa', false, 52428800,
  array['audio/*', 'video/mp4', 'video/quicktime', 'application/json', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "tonklippa_objects_select" on storage.objects
  for select using (
    bucket_id = 'tonklippa'
    and (storage.foldername(name))[1] = public.tonklippa_skuffa()
  );
create policy "tonklippa_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'tonklippa'
    and (storage.foldername(name))[1] = public.tonklippa_skuffa()
    and name ~ '^[0-9a-f]{64}/(p/[0-9a-z-]{1,40}\.json|t/[0-9a-z-]{1,40}/[0-9a-z-]{1,40})$'
  );
create policy "tonklippa_objects_update" on storage.objects
  for update using (
    bucket_id = 'tonklippa'
    and (storage.foldername(name))[1] = public.tonklippa_skuffa()
  )
  with check (
    bucket_id = 'tonklippa'
    and (storage.foldername(name))[1] = public.tonklippa_skuffa()
    and name ~ '^[0-9a-f]{64}/(p/[0-9a-z-]{1,40}\.json|t/[0-9a-z-]{1,40}/[0-9a-z-]{1,40})$'
  );
create policy "tonklippa_objects_delete" on storage.objects
  for delete using (
    bucket_id = 'tonklippa'
    and (storage.foldername(name))[1] = public.tonklippa_skuffa()
  );
