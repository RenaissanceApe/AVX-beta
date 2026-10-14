-- Phase 1: organisation members and invites by email.

-- ── Organisation invites ────────────────────────────────────────────────────
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  unique (org_id, email)
);
alter table public.org_invites enable row level security;
create policy org_invites_select on public.org_invites for select to authenticated
  using (private.is_org_admin(org_id));
create policy org_invites_delete on public.org_invites for delete to authenticated
  using (private.is_org_admin(org_id));
create index if not exists org_invites_email_idx on public.org_invites (email);

-- Add a colleague to an organisation by email.
-- Returns 'added' (has an account), 'already_member' or 'invited' (pending until sign-up).
create or replace function public.invite_to_org(p_org uuid, p_email text, p_role text default 'member')
returns text
language plpgsql security definer set search_path = public, private as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'Only organisation admins can add members';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address';
  end if;
  if p_role not in ('admin','member','viewer') then
    raise exception 'Invalid role';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null then
    if exists (select 1 from org_members where org_id = p_org and user_id = v_user) then
      return 'already_member';
    end if;
    insert into org_members (org_id, user_id, role) values (p_org, v_user, p_role);
    return 'added';
  end if;

  insert into org_invites (org_id, email, role, invited_by)
  values (p_org, v_email, p_role, auth.uid())
  on conflict (org_id, email) do update set role = excluded.role, invited_by = excluded.invited_by;
  return 'invited';
end $$;
revoke execute on function public.invite_to_org(uuid, text, text) from anon, public;
grant execute on function public.invite_to_org(uuid, text, text) to authenticated;

-- Members of an organisation with name and email (visible to fellow members only).
create or replace function public.org_member_list(p_org uuid)
returns table (user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public, private as $$
  select om.user_id, p.full_name, u.email::text, om.role, om.joined_at
  from org_members om
  join auth.users u on u.id = om.user_id
  left join profiles p on p.id = om.user_id
  where om.org_id = p_org and private.is_org_member(p_org)
  order by om.role = 'admin' desc, p.full_name nulls last
$$;
revoke execute on function public.org_member_list(uuid) from anon, public;
grant execute on function public.org_member_list(uuid) to authenticated;

-- ── Every organisation keeps at least one admin ────────────────────────────
-- Applies to API calls only (auth.uid() set); cascades from deleting the
-- organisation itself and dashboard maintenance are not blocked.
create or replace function private.keep_one_org_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' then
    return new;
  end if;
  if not exists (select 1 from organisations where id = old.org_id) then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from org_members where org_id = old.org_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'An organisation needs at least one admin. Make someone else admin first.';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function private.keep_one_org_admin() from public, anon, authenticated;
create or replace trigger keep_one_admin before update or delete on public.org_members
  for each row execute function private.keep_one_org_admin();

-- Admins may delete their organisation (cascades to gigs, files metadata, feed).
create policy organisations_delete on public.organisations for delete to authenticated
  using (private.is_org_admin(id));
