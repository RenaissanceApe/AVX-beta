-- Phase 1: claim organisation invites at sign-up, and self-service account deletion.
-- These functions contain DELETE statements, so the Supabase MCP tool asks for confirmation;
-- run this file in the Supabase SQL editor if it hasn't been applied yet.

-- ── New users claim pending gig and organisation invites ───────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into org_members (org_id, user_id, role)
  select org_id, new.id, role from org_invites where email = lower(new.email)
  on conflict (org_id, user_id) do nothing;
  delete from org_invites where email = lower(new.email);

  insert into gig_members (gig_id, user_id, role, function_title, call_time)
  select gig_id, new.id, role, function_title, call_time
  from gig_invites where email = lower(new.email)
  on conflict (gig_id, user_id) do nothing;
  delete from gig_invites where email = lower(new.email);
  return new;
end $$;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ── Account deletion ────────────────────────────────────────────────────────
-- What deleting the caller's account would do:
--   blocking_orgs: orgs where they are the only admin but other people are members
--   orgs_to_delete / gig_ids: orgs where they are the only member (deleted with the account)
create or replace function public.account_deletion_plan()
returns json
language sql stable security definer set search_path = public as $$
  with mine as (
    select om.org_id, o.name,
           (select count(*) from org_members x where x.org_id = om.org_id and x.user_id <> auth.uid()) as others,
           (select count(*) from org_members x where x.org_id = om.org_id and x.role = 'admin' and x.user_id <> auth.uid()) as other_admins,
           om.role
    from org_members om join organisations o on o.id = om.org_id
    where om.user_id = auth.uid()
  )
  select json_build_object(
    'blocking_orgs', coalesce((select json_agg(json_build_object('id', org_id, 'name', name))
                               from mine where role = 'admin' and other_admins = 0 and others > 0), '[]'::json),
    'orgs_to_delete', coalesce((select json_agg(json_build_object('id', org_id, 'name', name))
                                from mine where others = 0), '[]'::json),
    'gig_ids', coalesce((select json_agg(g.id) from gigs g join mine m on m.org_id = g.org_id where m.others = 0), '[]'::json)
  )
$$;
revoke execute on function public.account_deletion_plan() from anon, public;
grant execute on function public.account_deletion_plan() to authenticated;

-- Permanently deletes the caller's account. Organisations where they are the only
-- member are deleted too. The app removes those gigs' files from storage first.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan json;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  v_plan := public.account_deletion_plan();
  if json_array_length(v_plan->'blocking_orgs') > 0 then
    raise exception 'You are the only admin of "%". Make someone else admin, or remove the other members, first.',
      v_plan->'blocking_orgs'->0->>'name';
  end if;

  delete from organisations where id in (
    select (o->>'id')::uuid from json_array_elements(v_plan->'orgs_to_delete') o
  );
  -- Cascades: profile, memberships. Content they created stays with the gig (author set to NULL).
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
