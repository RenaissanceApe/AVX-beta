-- Profiles privacy (issue #188, hotfix 0.82.3).
-- Until now every signed-in account could read every profile (profiles_select used `true`).
-- After this migration:
--   - a profile row is visible only to people who work with that person (private.can_see_profile);
--   - phone, email_digest and weekly_numbers get their own read paths (the columns are closed in
--     20270120000001_profiles_privacy_columns.sql). You read your
--     own through public.my_profile(), and gig crew phones come from public.gig_crew_phones(gig).
-- Add-only: create or replace and alter policy. Safe with the previous app version.

-- ── 1. Who can see whose profile row ──────────────────────────────────────────────────────
-- Never reads public.profiles itself, so the policy below can use it.
create or replace function private.can_see_profile(p_viewer uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_viewer is not null and p_user is not null and (
    -- a) yourself
    p_viewer = p_user
    -- b) same organisation
    or exists (select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id
                where a.user_id = p_viewer and b.user_id = p_user)
    -- c) same gig: both crew or guests on it ...
    or exists (select 1 from public.gig_members a join public.gig_members b on b.gig_id = a.gig_id
                where a.user_id = p_viewer and b.user_id = p_user)
    --    ... the viewer is in the gig's company and the person is on the gig ...
    or exists (select 1 from public.gig_members gm
                 join public.gigs g on g.id = gm.gig_id
                 join public.org_members om on om.org_id = g.org_id
                where gm.user_id = p_user and om.user_id = p_viewer)
    --    ... or the viewer is on the gig and the person is in the gig's company
    or exists (select 1 from public.gig_members gm
                 join public.gigs g on g.id = gm.gig_id
                 join public.org_members om on om.org_id = g.org_id
                where gm.user_id = p_viewer and om.user_id = p_user)
    -- d) a conversation you're both in
    or exists (select 1 from public.conversation_members a join public.conversation_members b on b.conversation_id = a.conversation_id
                where a.user_id = p_viewer and b.user_id = p_user)
    -- e) the person did something that notified you (e.g. a company contacting you from Find crew)
    or exists (select 1 from public.notifications n where n.user_id = p_viewer and n.actor_id = p_user)
  )
$$;
revoke all on function private.can_see_profile(uuid, uuid) from public, anon;
grant execute on function private.can_see_profile(uuid, uuid) to authenticated;

alter policy profiles_select on public.profiles using (private.can_see_profile(auth.uid(), id));

-- ── 2. Private columns ────────────────────────────────────────────────────────────────────
-- The columns themselves are closed in 20270120000001_profiles_privacy_columns.sql, applied only
-- after the app that uses these functions is live.

-- Your own full profile. Empty (not an error) before the second sign-in step, as reading the
-- table was before this change.
create or replace function public.my_profile()
returns setof public.profiles
language sql stable security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = auth.uid() and private.mfa_ok()
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Phones of a gig's crew and guests, for the crew list and the call sheet. Empty unless you can
-- open the gig.
create or replace function public.gig_crew_phones(p_gig uuid)
returns table (user_id uuid, phone text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.require_mfa();
  if not private.can_access_gig(p_gig) then return; end if;
  return query
    select gm.user_id, p.phone
      from public.gig_members gm join public.profiles p on p.id = gm.user_id
     where gm.gig_id = p_gig and p.phone is not null;
end $$;
revoke all on function public.gig_crew_phones(uuid) from public, anon;
grant execute on function public.gig_crew_phones(uuid) to authenticated;
