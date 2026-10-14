-- AVX beta pilot hardening
-- * Replaces every RLS policy with non-recursive, correctly-scoped ones built on
--   SECURITY DEFINER helpers (fixes infinite recursion + tautological checks).
-- * Org creator becomes admin and gig creator becomes PM via triggers
--   (clients can no longer add themselves to arbitrary orgs/gigs).
-- * Private storage, scoped per gig folder.
-- * Working crew invites: add existing users immediately, or hold a pending
--   invite that is claimed automatically when that email signs up.

-- ── Helpers (private schema: usable by policies, not exposed via the API) ───
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from org_members where org_id = p_org and user_id = auth.uid())
$$;

create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from org_members where org_id = p_org and user_id = auth.uid() and role = 'admin')
$$;

-- Anyone who belongs to the gig or to the gig's organisation
create or replace function private.can_access_gig(p_gig uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from gig_members where gig_id = p_gig and user_id = auth.uid())
      or exists (select 1 from gigs g join org_members om on om.org_id = g.org_id
                 where g.id = p_gig and om.user_id = auth.uid())
$$;

-- Org members and gig PMs: may upload/edit assets
create or replace function private.can_contribute_gig(p_gig uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from gig_members where gig_id = p_gig and user_id = auth.uid() and role = 'pm')
      or exists (select 1 from gigs g join org_members om on om.org_id = g.org_id
                 where g.id = p_gig and om.user_id = auth.uid())
$$;

-- Org admins, gig PMs and the gig creator: may edit the gig and its crew
create or replace function private.can_manage_gig(p_gig uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from gig_members where gig_id = p_gig and user_id = auth.uid() and role = 'pm')
      or exists (select 1 from gigs g where g.id = p_gig and g.created_by = auth.uid())
      or exists (select 1 from gigs g join org_members om on om.org_id = g.org_id
                 where g.id = p_gig and om.user_id = auth.uid() and om.role = 'admin')
$$;

-- Storage paths are "<gig_id>/<file>"; returns null for anything else
create or replace function private.gig_id_from_path(p_name text) returns uuid
language sql immutable set search_path = public, private as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

revoke execute on function private.is_org_member(uuid), private.is_org_admin(uuid),
  private.can_access_gig(uuid), private.can_contribute_gig(uuid), private.can_manage_gig(uuid)
  from anon, public;
grant execute on function private.is_org_member(uuid), private.is_org_admin(uuid),
  private.can_access_gig(uuid), private.can_contribute_gig(uuid), private.can_manage_gig(uuid)
  to authenticated;

-- ── Drop all existing public-table policies ─────────────────────────────────
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('profiles','organisations','org_members','gigs','gig_members','assets','feed_posts')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── Profiles ────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── Organisations ───────────────────────────────────────────────────────────
create policy organisations_select on public.organisations for select to authenticated
  using (private.is_org_member(id) or created_by = auth.uid());
create policy organisations_insert on public.organisations for insert to authenticated
  with check (created_by = auth.uid());
create policy organisations_update on public.organisations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));

create or replace function public.handle_new_org() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into org_members (org_id, user_id, role) values (new.id, new.created_by, 'admin')
  on conflict (org_id, user_id) do update set role = 'admin';
  return new;
end $$;
drop trigger if exists on_org_created on public.organisations;
create trigger on_org_created after insert on public.organisations
  for each row execute function public.handle_new_org();

-- ── Org members ─────────────────────────────────────────────────────────────
create policy org_members_select on public.org_members for select to authenticated
  using (user_id = auth.uid() or private.is_org_member(org_id));
create policy org_members_insert on public.org_members for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy org_members_update on public.org_members for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy org_members_delete on public.org_members for delete to authenticated
  using (private.is_org_admin(org_id) or user_id = auth.uid());

-- ── Gigs ────────────────────────────────────────────────────────────────────
create policy gigs_select on public.gigs for select to authenticated
  using (private.can_access_gig(id) or private.is_org_member(org_id));
create policy gigs_insert on public.gigs for insert to authenticated
  with check (created_by = auth.uid() and private.is_org_member(org_id));
create policy gigs_update on public.gigs for update to authenticated
  using (private.can_manage_gig(id)) with check (private.is_org_member(org_id) or private.can_manage_gig(id));
create policy gigs_delete on public.gigs for delete to authenticated
  using (private.is_org_admin(org_id) or created_by = auth.uid());

create or replace function public.handle_new_gig() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into gig_members (gig_id, user_id, role, function_title)
  values (new.id, new.created_by, 'pm', 'Production Manager')
  on conflict (gig_id, user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_gig_created on public.gigs;
create trigger on_gig_created after insert on public.gigs
  for each row execute function public.handle_new_gig();

-- ── Gig members ─────────────────────────────────────────────────────────────
create policy gig_members_select on public.gig_members for select to authenticated
  using (private.can_access_gig(gig_id));
create policy gig_members_insert on public.gig_members for insert to authenticated
  with check (private.can_manage_gig(gig_id));
create policy gig_members_update on public.gig_members for update to authenticated
  using (private.can_manage_gig(gig_id)) with check (private.can_manage_gig(gig_id));
create policy gig_members_delete on public.gig_members for delete to authenticated
  using (private.can_manage_gig(gig_id) or user_id = auth.uid());

-- ── Assets ──────────────────────────────────────────────────────────────────
create policy assets_select on public.assets for select to authenticated
  using (private.can_access_gig(gig_id));
create policy assets_insert on public.assets for insert to authenticated
  with check (created_by = auth.uid() and private.can_contribute_gig(gig_id));
create policy assets_update on public.assets for update to authenticated
  using (private.can_contribute_gig(gig_id)) with check (private.can_contribute_gig(gig_id));
create policy assets_delete on public.assets for delete to authenticated
  using (private.can_contribute_gig(gig_id));

-- ── Feed ────────────────────────────────────────────────────────────────────
create policy feed_select on public.feed_posts for select to authenticated
  using (private.can_access_gig(gig_id));
create policy feed_insert on public.feed_posts for insert to authenticated
  with check (user_id = auth.uid() and private.can_access_gig(gig_id));
create policy feed_delete on public.feed_posts for delete to authenticated
  using (user_id = auth.uid() or private.can_manage_gig(gig_id));

-- ── Pending invites ─────────────────────────────────────────────────────────
create table if not exists public.gig_invites (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  email text not null,
  role text not null default 'crew' check (role in ('pm','crew','viewer')),
  function_title text,
  call_time time,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (gig_id, email)
);
alter table public.gig_invites enable row level security;
drop policy if exists gig_invites_select on public.gig_invites;
drop policy if exists gig_invites_delete on public.gig_invites;
create policy gig_invites_select on public.gig_invites for select to authenticated
  using (private.can_manage_gig(gig_id));
create policy gig_invites_delete on public.gig_invites for delete to authenticated
  using (private.can_manage_gig(gig_id));

-- Add a person to a gig by email. Returns 'added' (existing account) or 'invited' (pending).
create or replace function public.invite_to_gig(
  p_gig uuid, p_email text, p_role text default 'crew',
  p_function_title text default null, p_call_time time default null
) returns text
language plpgsql security definer set search_path = public, private as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not private.can_manage_gig(p_gig) then
    raise exception 'Only the gig PM or an organisation admin can add crew';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address';
  end if;
  if p_role not in ('pm','crew','viewer') then
    raise exception 'Invalid role';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null then
    insert into gig_members (gig_id, user_id, role, function_title, call_time)
    values (p_gig, v_user, p_role, nullif(trim(p_function_title), ''), p_call_time)
    on conflict (gig_id, user_id) do update
      set role = excluded.role, function_title = excluded.function_title, call_time = excluded.call_time;
    return 'added';
  end if;

  insert into gig_invites (gig_id, email, role, function_title, call_time, invited_by)
  values (p_gig, v_email, p_role, nullif(trim(p_function_title), ''), p_call_time, auth.uid())
  on conflict (gig_id, email) do update
    set role = excluded.role, function_title = excluded.function_title,
        call_time = excluded.call_time, invited_by = excluded.invited_by;
  return 'invited';
end $$;
revoke execute on function public.invite_to_gig(uuid, text, text, text, time) from anon, public;
grant execute on function public.invite_to_gig(uuid, text, text, text, time) to authenticated;

-- New signups: create profile and claim any pending invites for their email
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into gig_members (gig_id, user_id, role, function_title, call_time)
  select gig_id, new.id, role, function_title, call_time
  from gig_invites where email = lower(new.email)
  on conflict (gig_id, user_id) do nothing;
  delete from gig_invites where email = lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions must not be callable over the API
revoke execute on function public.handle_new_user(), public.handle_new_org(), public.handle_new_gig()
  from anon, authenticated, public;

-- ── Storage: private bucket, access scoped to the gig folder ───────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('gig-assets', 'gig-assets', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and (policyname like 'storage\_%' or policyname like '(auth.uid() IS NOT NULL)%' or policyname like 'gig\_assets\_%')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy gig_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'gig-assets' and private.can_access_gig(private.gig_id_from_path(name)));
create policy gig_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gig-assets' and private.can_contribute_gig(private.gig_id_from_path(name)));
create policy gig_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'gig-assets' and private.can_contribute_gig(private.gig_id_from_path(name)));
create policy gig_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gig-assets' and private.can_contribute_gig(private.gig_id_from_path(name)));

-- ── Indexes for the policy lookups ──────────────────────────────────────────
create index if not exists org_members_user_idx on public.org_members (user_id);
create index if not exists gig_members_user_idx on public.gig_members (user_id);
create index if not exists gigs_org_idx on public.gigs (org_id);
create index if not exists assets_gig_idx on public.assets (gig_id);
create index if not exists feed_posts_gig_idx on public.feed_posts (gig_id);
create index if not exists gig_invites_email_idx on public.gig_invites (email);

-- ── Ignore duplicate membership inserts ─────────────────────────────────────
-- Creator membership is added by triggers; this keeps older clients that also
-- insert it themselves from failing on a duplicate key.
create or replace function private.skip_duplicate_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'org_members' then
    if exists (select 1 from org_members where org_id = new.org_id and user_id = new.user_id) then return null; end if;
  elsif exists (select 1 from gig_members where gig_id = new.gig_id and user_id = new.user_id) then
    return null;
  end if;
  return new;
end $$;
revoke execute on function private.skip_duplicate_member() from public, anon, authenticated;
drop trigger if exists skip_duplicate on public.org_members;
create trigger skip_duplicate before insert on public.org_members
  for each row execute function private.skip_duplicate_member();
drop trigger if exists skip_duplicate on public.gig_members;
create trigger skip_duplicate before insert on public.gig_members
  for each row execute function private.skip_duplicate_member();
