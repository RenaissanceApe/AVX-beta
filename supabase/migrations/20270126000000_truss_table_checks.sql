-- Rigging RG2 (docs/TOOLS_PLAN.md §5, docs/TRUSS_DATA.md): the second person's check of each truss
-- load table. The tables themselves stay in the repository (src/data/truss/*.json); this table
-- records, for AVX as a whole (every organisation), which edition of which table an AVX admin has
-- compared row by row with the manufacturer's document and marked checked, or marked blocked.
-- - One row per mark: the table's id, its edition and the SHA-256 of the source document. A new
--   edition (another SHA-256) needs a new check.
-- - Only AVX admins with two-step sign-in can mark (private.require_avx_admin()); everyone signed
--   in can read the marks.
-- - A mark is never edited: the only change allowed is taking it back (withdrawn_at, by whom, why),
--   and a withdrawn mark can't change again. Nothing is ever removed.
-- - The app uses a table for a pass/fail only when its active mark is 'checked' for the exact
--   edition and SHA-256 in the repository.
-- Only adds; applies without manual confirmation.

create table if not exists public.truss_table_checks (
  id uuid primary key default gen_random_uuid(),
  table_id text not null check (table_id ~ '^[a-z0-9-]{2,60}$'),
  edition text not null check (length(edition) between 1 and 40),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('checked', 'blocked')),
  rows_checked integer check (rows_checked is null or rows_checked between 1 and 200),
  note text check (note is null or length(note) <= 1000),
  checked_by uuid references auth.users(id) on delete set null,
  checked_by_name text not null check (length(checked_by_name) between 1 and 200),
  checked_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id) on delete set null,
  withdrawn_by_name text check (withdrawn_by_name is null or length(withdrawn_by_name) <= 200),
  withdrawn_note text check (withdrawn_note is null or length(withdrawn_note) <= 1000),
  constraint truss_table_checks_checked_rows check (status <> 'checked' or rows_checked is not null)
);
-- At most one active mark per table and source document
create unique index if not exists truss_table_checks_active
  on public.truss_table_checks (table_id, source_sha256) where withdrawn_at is null;
create index if not exists truss_table_checks_table on public.truss_table_checks (table_id, checked_at desc);

alter table public.truss_table_checks enable row level security;
revoke all on public.truss_table_checks from public, anon, authenticated;
grant select on public.truss_table_checks to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'truss_table_checks' and policyname = 'truss_table_checks_select') then
    create policy truss_table_checks_select on public.truss_table_checks for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'truss_table_checks' and policyname = 'mfa_required') then
    create policy mfa_required on public.truss_table_checks as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;

-- A mark can only be taken back, once; nothing else about it ever changes
create or replace function private.truss_table_checks_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.withdrawn_at is not null then
    raise exception 'A mark that was taken back can''t change' using errcode = '42501';
  end if;
  if (new.id, new.table_id, new.edition, new.source_sha256, new.status, new.rows_checked, new.note,
      new.checked_by, new.checked_by_name, new.checked_at)
     is distinct from
     (old.id, old.table_id, old.edition, old.source_sha256, old.status, old.rows_checked, old.note,
      old.checked_by, old.checked_by_name, old.checked_at) then
    raise exception 'A mark can''t be edited, only taken back' using errcode = '42501';
  end if;
  if new.withdrawn_at is null or new.withdrawn_by_name is null or new.withdrawn_note is null then
    raise exception 'Taking a mark back needs who, when and why' using errcode = '22023';
  end if;
  return new;
end $$;
create or replace trigger truss_table_checks_before before update on public.truss_table_checks
  for each row execute function private.truss_table_checks_before();
revoke execute on function private.truss_table_checks_before() from public, anon, authenticated;

-- The admin's own name, as their profile holds it (kept on the mark, so it reads the same later)
create or replace function private.avx_admin_name() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select nullif(left(trim(p.full_name), 200), '') into v from public.profiles p where p.id = auth.uid();
  if v is null then raise exception 'Add your name to your profile first' using errcode = '22023'; end if;
  return v;
end $$;
revoke execute on function private.avx_admin_name() from public, anon, authenticated;

-- AVX admins: mark one edition of a table checked (every row compared with the source document)
-- or blocked (with the reason). A table that already has an active mark for that document needs
-- it taken back first.
create or replace function public.mark_truss_table(
  p_table text, p_edition text, p_sha256 text, p_status text, p_rows integer default null, p_note text default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_name text; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  perform private.require_avx_admin();
  v_name := private.avx_admin_name();
  if p_status not in ('checked', 'blocked') then raise exception 'Unknown mark' using errcode = '22023'; end if;
  if p_status = 'checked' and coalesce(p_rows, 0) < 1 then raise exception 'Compare every row first' using errcode = '22023'; end if;
  if p_status = 'blocked' and v_note is null then raise exception 'Say why the table is blocked' using errcode = '22023'; end if;
  if exists (select 1 from public.truss_table_checks c
              where c.table_id = p_table and c.source_sha256 = lower(p_sha256) and c.withdrawn_at is null) then
    raise exception 'This table already has a mark for this document: take it back first' using errcode = '23505';
  end if;
  insert into public.truss_table_checks (table_id, edition, source_sha256, status, rows_checked, note, checked_by, checked_by_name)
  values (p_table, trim(p_edition), lower(p_sha256), p_status, case when p_status = 'checked' then p_rows end, v_note, auth.uid(), v_name)
  returning id into v_id;
  return v_id;
end $$;

-- AVX admins: take a mark back (it stays in the history with who, when and why)
create or replace function public.withdraw_truss_mark(p_id uuid, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_name text; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  perform private.require_avx_admin();
  v_name := private.avx_admin_name();
  if v_note is null then raise exception 'Say why the mark is taken back' using errcode = '22023'; end if;
  update public.truss_table_checks
     set withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_by_name = v_name, withdrawn_note = v_note
   where id = p_id and withdrawn_at is null;
  if not found then raise exception 'Nothing to take back' using errcode = '22023'; end if;
end $$;

revoke execute on function public.mark_truss_table(text, text, text, text, integer, text) from public, anon;
grant execute on function public.mark_truss_table(text, text, text, text, integer, text) to authenticated;
revoke execute on function public.withdraw_truss_mark(uuid, text) from public, anon;
grant execute on function public.withdraw_truss_mark(uuid, text) to authenticated;
