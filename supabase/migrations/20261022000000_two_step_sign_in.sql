-- Two-step sign-in (authenticator app, TOTP). Supabase Auth handles enrolment and the
-- code check; this migration makes the database itself insist on it: once someone has
-- a verified authenticator, a session that hasn't passed the second step (aal1) can't
-- read or change anything, even when calling the API directly with the password alone.
-- People without an authenticator are unaffected.
-- Written without destructive statements so it applies without manual confirmation.

-- True when the current session may use data: it passed the second step, or the user
-- has no verified authenticator.
create or replace function private.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;
revoke execute on function private.mfa_ok() from public, anon;
grant execute on function private.mfa_ok() to authenticated;

create or replace function private.require_mfa() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.mfa_ok() then
    raise exception 'Two-step sign-in required' using errcode = '42501';
  end if;
end $$;
revoke execute on function private.require_mfa() from public, anon;
grant execute on function private.require_mfa() to authenticated;

-- Every table with access rules, and file storage, gets an extra restrictive rule.
-- Restrictive rules are ANDed with the existing ones, so they can only narrow access.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'mfa_required') then
      execute format(
        'create policy mfa_required on public.%I as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'mfa_required') then
    create policy mfa_required on storage.objects as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;

-- Functions the app calls directly run with elevated rights and skip table rules, so
-- each gets a thin public wrapper that checks the second step first. The original
-- moves to the private schema (not reachable through the API) as <name>_unchecked.
-- NOTE for later migrations: change private.<name>_unchecked, not the public wrapper.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('invite_to_org', 'invite_to_gig', 'org_member_list', 'crew_conflicts', 'gig_crew_conflicts',
                        'account_deletion_plan', 'delete_my_account')
      and not exists (select 1 from pg_proc q where q.pronamespace = 'private'::regnamespace and q.proname = p.proname || '_unchecked')
  loop
    execute format('alter function public.%I(%s) rename to %I', fn.proname, fn.args, fn.proname || '_unchecked');
    execute format('alter function public.%I(%s) set schema private', fn.proname || '_unchecked', fn.args);
    execute format('revoke execute on function private.%I(%s) from public, anon, authenticated', fn.proname || '_unchecked', fn.args);
  end loop;
end $$;

create or replace function public.invite_to_org(p_org uuid, p_email text, p_role text default 'member') returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.invite_to_org_unchecked(p_org, p_email, p_role);
end $$;

create or replace function public.invite_to_gig(p_gig uuid, p_email text, p_role text default 'crew',
  p_function_title text default null, p_call_time time default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.invite_to_gig_unchecked(p_gig, p_email, p_role, p_function_title, p_call_time);
end $$;

create or replace function public.org_member_list(p_org uuid)
returns table(user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.org_member_list_unchecked(p_org);
end $$;

create or replace function public.crew_conflicts(p_gig uuid, p_email text)
returns table(kind text, start_date date, end_date date, label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.crew_conflicts_unchecked(p_gig, p_email);
end $$;

create or replace function public.gig_crew_conflicts(p_gig uuid)
returns table(user_id uuid, kind text, start_date date, end_date date, label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_crew_conflicts_unchecked(p_gig);
end $$;

create or replace function public.account_deletion_plan() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.account_deletion_plan_unchecked();
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.delete_my_account_unchecked();
end $$;

revoke execute on function public.invite_to_org(uuid, text, text) from public, anon;
revoke execute on function public.invite_to_gig(uuid, text, text, text, time) from public, anon;
revoke execute on function public.org_member_list(uuid) from public, anon;
revoke execute on function public.crew_conflicts(uuid, text) from public, anon;
revoke execute on function public.gig_crew_conflicts(uuid) from public, anon;
revoke execute on function public.account_deletion_plan() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.invite_to_org(uuid, text, text) to authenticated;
grant execute on function public.invite_to_gig(uuid, text, text, text, time) to authenticated;
grant execute on function public.org_member_list(uuid) to authenticated;
grant execute on function public.crew_conflicts(uuid, text) to authenticated;
grant execute on function public.gig_crew_conflicts(uuid) to authenticated;
grant execute on function public.account_deletion_plan() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
