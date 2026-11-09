-- Step 14 (S08): MVR and GDTF for the light plot and DMX patch (docs/FIELD_TOOLS.md, "How MVR
-- and GDTF work").
-- 1. fixture_types: what a GDTF fixture-type file says about a catalogue item (its modes and
--    their DMX footprints, the file itself), one per item. Weight and power go on the item's own
--    weight_kg and power_w; the copies here are what the file said, for reference.
-- 2. gig_fixtures gains what an MVR file carries: the fixture's MVR id (so importing the same
--    file again updates the fixtures instead of adding them twice), its GDTF file name, its
--    fixture number and its height.
-- 3. A private bucket for the GDTF files, so an MVR export can carry them.
-- Only adds; written without destructive statements.

-- ── Fixture types ────────────────────────────────────────────────────────────
create table if not exists public.fixture_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null unique references public.price_items(id) on delete cascade,
  manufacturer text check (char_length(coalesce(manufacturer, '')) <= 80),
  name text not null check (char_length(trim(name)) between 1 and 120),
  gdtf_id text check (char_length(coalesce(gdtf_id, '')) <= 64),
  revision text check (char_length(coalesce(revision, '')) <= 80),
  modes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(modes) = 'array' and jsonb_array_length(modes) <= 200 and pg_column_size(modes) <= 32768),
  weight_kg numeric(10,3) check (weight_kg is null or weight_kg >= 0),
  power_w integer check (power_w is null or power_w >= 0),
  file_path text check (char_length(coalesce(file_path, '')) <= 300),
  file_name text check (char_length(coalesce(file_name, '')) <= 200),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fixture_types_org_idx on public.fixture_types (org_id);
alter table public.fixture_types enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fixture_types' and policyname = 'fixture_types_select') then
    create policy fixture_types_select on public.fixture_types for select to authenticated using (private.can_quote(org_id));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fixture_types' and policyname = 'fixture_types_insert') then
    create policy fixture_types_insert on public.fixture_types for insert to authenticated with check (private.can_quote(org_id));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fixture_types' and policyname = 'fixture_types_update') then
    create policy fixture_types_update on public.fixture_types for update to authenticated
      using (private.can_quote(org_id)) with check (private.can_quote(org_id));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fixture_types' and policyname = 'mfa_required') then
    create policy mfa_required on public.fixture_types as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;

-- The item must be the organisation's own; who made it and when stay as they were
create or replace function private.fixture_types_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if not exists (select 1 from public.price_items i where i.id = new.item_id and i.org_id = new.org_id) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  if new.file_path is not null and private.path_uuid(new.file_path, 1) is distinct from new.org_id then
    raise exception 'File not in this organisation''s folder' using errcode = '23514';
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.fixture_types_before() from public, anon, authenticated;
create or replace trigger fixture_types_before before insert or update on public.fixture_types
  for each row execute function private.fixture_types_before();

-- ── What an MVR file carries per fixture ─────────────────────────────────────
alter table public.gig_fixtures add column if not exists mvr_uuid uuid;
alter table public.gig_fixtures add column if not exists gdtf_spec text;
alter table public.gig_fixtures add column if not exists fixture_no integer;
alter table public.gig_fixtures add column if not exists height_m numeric(5,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_fixtures_mvr_check') then
    alter table public.gig_fixtures add constraint gig_fixtures_mvr_check check (
      char_length(coalesce(gdtf_spec, '')) <= 120
      and (fixture_no is null or fixture_no between 1 and 99999)
      and (height_m is null or height_m between -10 and 50));
  end if;
end $$;
create unique index if not exists gig_fixtures_mvr_uuid_uniq on public.gig_fixtures (gig_id, mvr_uuid) where mvr_uuid is not null;

-- ── GDTF files ───────────────────────────────────────────────────────────────
-- Private bucket; paths are <org id>/<item id>/<file>.gdtf. Read and written by the people who
-- edit the catalogue (they also make the MVR export, which carries the files).
insert into storage.buckets (id, name, public, file_size_limit)
values ('fixture-types', 'fixture-types', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fixture_types_files_select') then
    create policy fixture_types_files_select on storage.objects for select to authenticated
      using (bucket_id = 'fixture-types' and private.can_quote(private.path_uuid(name, 1)));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fixture_types_files_insert') then
    create policy fixture_types_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'fixture-types' and private.can_quote(private.path_uuid(name, 1)));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fixture_types_files_update') then
    create policy fixture_types_files_update on storage.objects for update to authenticated
      using (bucket_id = 'fixture-types' and private.can_quote(private.path_uuid(name, 1)))
      with check (bucket_id = 'fixture-types' and private.can_quote(private.path_uuid(name, 1)));
  end if;
end $$;
