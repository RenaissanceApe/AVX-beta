-- Build order step 6, S1 (docs/TOOLS_PLAN.md; COMPETITOR_RESEARCH #10): an organisation's own gig
-- statuses and gig types.
-- - gig_statuses: a name and colour of the organisation's choosing ("Option", "Pencilled",
--   "Invoiced"), each standing for one of the five built-in statuses (draft, confirmed, active,
--   completed, archived). The built-in status keeps driving everything (lists, archiving,
--   notifications, import); the organisation's status is what people read.
-- - gig_types: "Corporate", "Festival", "Theatre"… with a colour.
-- - gigs.custom_status_id / gig_type_id. Setting a custom status sets the built-in one; changing
--   the built-in status directly (an import, an older screen) picks the organisation's first
--   status standing for it, or none.
-- Admins manage both lists; everyone in the organisation, and anyone on one of its gigs, reads
-- them. Removing only marks a row; gigs that had it keep their built-in status.
-- Written without destructive statements.

create table if not exists public.gig_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  colour text not null default 'grey' check (colour in ('grey', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'sky')),
  base_status text not null check (base_status in ('draft', 'confirmed', 'active', 'completed', 'archived')),
  position integer not null default 0 check (position between 0 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists gig_statuses_org_idx on public.gig_statuses (org_id, position) where removed_at is null;

create table if not exists public.gig_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  colour text not null default 'grey' check (colour in ('grey', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'sky')),
  position integer not null default 0 check (position between 0 and 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists gig_types_org_idx on public.gig_types (org_id, position) where removed_at is null;

alter table public.gigs add column if not exists custom_status_id uuid references public.gig_statuses(id) on delete set null;
alter table public.gigs add column if not exists gig_type_id uuid references public.gig_types(id) on delete set null;
create index if not exists gigs_custom_status_idx on public.gigs (custom_status_id) where custom_status_id is not null;
create index if not exists gigs_type_idx on public.gigs (gig_type_id) where gig_type_id is not null;

-- On one of the organisation's gigs (crew from outside see the labels on their gig)
create or replace function private.on_gig_in_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gig_members m join public.gigs g on g.id = m.gig_id
                 where g.org_id = p_org and m.user_id = auth.uid())
$$;
revoke execute on function private.on_gig_in_org(uuid) from public, anon;
grant execute on function private.on_gig_in_org(uuid) to authenticated;

alter table public.gig_statuses enable row level security;
alter table public.gig_types enable row level security;
create policy gig_statuses_select on public.gig_statuses for select to authenticated
  using (private.is_org_member(org_id) or private.on_gig_in_org(org_id));
create policy gig_statuses_insert on public.gig_statuses for insert to authenticated
  with check (private.is_org_admin(org_id) and removed_at is null);
create policy gig_statuses_update on public.gig_statuses for update to authenticated
  using (removed_at is null and private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.gig_statuses as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy gig_types_select on public.gig_types for select to authenticated
  using (private.is_org_member(org_id) or private.on_gig_in_org(org_id));
create policy gig_types_insert on public.gig_types for insert to authenticated
  with check (private.is_org_admin(org_id) and removed_at is null);
create policy gig_types_update on public.gig_types for update to authenticated
  using (removed_at is null and private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.gig_types as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.gig_statuses from authenticated;
revoke update on public.gig_types from authenticated;
grant update (name, colour, base_status, position, removed_at) on public.gig_statuses to authenticated;
grant update (name, colour, position, removed_at) on public.gig_types to authenticated;

-- Runs as the caller: tidy, stamp, keep the limit (30 of each per organisation)
create or replace function private.gig_labels_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_count integer;
begin
  new.name := trim(new.name);
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if tg_table_name = 'gig_statuses' then
      select count(*) into v_count from public.gig_statuses s where s.org_id = new.org_id and s.removed_at is null;
    else
      select count(*) into v_count from public.gig_types s where s.org_id = new.org_id and s.removed_at is null;
    end if;
    if v_count >= 30 then raise exception 'Limit reached' using errcode = '54000'; end if;
  else
    new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_labels_before() from public, anon, authenticated;
create or replace trigger gig_statuses_before before insert or update on public.gig_statuses
  for each row execute function private.gig_labels_before();
create or replace trigger gig_types_before before insert or update on public.gig_types
  for each row execute function private.gig_labels_before();

-- A status that now stands for another built-in status moves its gigs with it; a removed status
-- or type comes off its gigs (they keep their built-in status). Runs as owner: it updates gigs
-- the admin may not manage one by one.
create or replace function private.gig_statuses_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    update public.gigs set custom_status_id = null where custom_status_id = new.id;
  elsif new.base_status is distinct from old.base_status then
    update public.gigs set status = new.base_status where custom_status_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function private.gig_statuses_after() from public, anon, authenticated;
create or replace trigger gig_statuses_after after update of base_status, removed_at on public.gig_statuses
  for each row execute function private.gig_statuses_after();

create or replace function private.gig_types_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    update public.gigs set gig_type_id = null where gig_type_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function private.gig_types_after() from public, anon, authenticated;
create or replace trigger gig_types_after after update of removed_at on public.gig_types
  for each row execute function private.gig_types_after();

-- On a gig: the custom status and type must be the organisation's own and current; the custom
-- status sets the built-in one; a built-in change on its own picks a matching custom status.
-- Security definer so it reads the lists whoever edits (they're the organisation's own anyway).
create or replace function private.gigs_labels() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_base text;
begin
  if new.gig_type_id is not null and (tg_op = 'INSERT' or new.gig_type_id is distinct from old.gig_type_id) then
    if not exists (select 1 from public.gig_types t where t.id = new.gig_type_id and t.org_id = new.org_id and t.removed_at is null) then
      raise exception 'That gig type is not this organisation''s' using errcode = '22023';
    end if;
  end if;
  if new.custom_status_id is not null and (tg_op = 'INSERT' or new.custom_status_id is distinct from old.custom_status_id) then
    select s.base_status into v_base from public.gig_statuses s
     where s.id = new.custom_status_id and s.org_id = new.org_id and s.removed_at is null;
    if v_base is null then raise exception 'That status is not this organisation''s' using errcode = '22023'; end if;
    new.status := v_base;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    -- A new gig, or the built-in status changed on its own: keep the custom one only if it still
    -- matches, otherwise the organisation's first one standing for it (or none)
    if new.custom_status_id is null or not exists (select 1 from public.gig_statuses s where s.id = new.custom_status_id and s.base_status = new.status) then
      select s.id into new.custom_status_id from public.gig_statuses s
       where s.org_id = new.org_id and s.base_status = new.status and s.removed_at is null
       order by s.position, s.created_at limit 1;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.gigs_labels() from public, anon, authenticated;
create or replace trigger gigs_labels before insert or update of status, custom_status_id, gig_type_id on public.gigs
  for each row execute function private.gigs_labels();
