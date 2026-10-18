-- Phase 5c: "your network" picker (ROADMAP.md).
-- In the invite dialogs, find people you've already shared a gig or organisation with, by
-- name, with the functions they had on those gigs and whether they're booked for the gig's
-- dates. Nobody can browse everyone on AVX, and emails are never shown: people are added by
-- account. Each person chooses who can find them: managers and admins only (the default), or
-- also other crew.
-- Written without destructive statements so it applies without manual confirmation.

alter table public.profiles add column if not exists findable_by text not null default 'managers';
alter table public.profiles add constraint profiles_findable_by_check check (findable_by in ('managers', 'crew'));

-- "Managers" are the companies' own people: admins and members of an organisation.
-- Freelancers (crew, viewers, and PMs who aren't in the organisation) count as crew.
create or replace function private.is_company_side(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.user_id = p_user and m.role in ('admin', 'member'))
$$;

-- Everyone who shares a gig or an organisation with p_me, with how many gigs and the latest
create or replace function private.network_of(p_me uuid)
returns table(user_id uuid, gigs_together integer, last_together date)
language sql stable security definer set search_path = '' as $$
  with shared_gigs as (
    select o.user_id, g.id as gig_id, g.start_date
      from public.gig_members me
      join public.gig_members o on o.gig_id = me.gig_id and o.user_id <> me.user_id
      join public.gigs g on g.id = me.gig_id
     where me.user_id = p_me
  ), people as (
    select s.user_id from shared_gigs s
    union
    select o.user_id from public.org_members me
      join public.org_members o on o.org_id = me.org_id and o.user_id <> me.user_id
     where me.user_id = p_me
  )
  select p.user_id, count(distinct s.gig_id)::integer, max(s.start_date)
    from people p left join shared_gigs s on s.user_id = p.user_id
   group by p.user_id
$$;

-- Whether p_me may find p_user: in their network, and allowed by p_user's setting
create or replace function private.can_find(p_me uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_me is not null and p_me <> p_user
     and exists (select 1 from private.network_of(p_me) n where n.user_id = p_user)
     and exists (select 1 from public.profiles p where p.id = p_user
                  and (p.findable_by = 'crew' or private.is_company_side(p_me)))
$$;

-- The picker. For a gig you manage it also says who's booked elsewhere on its dates and who's
-- already on it; for an organisation, who's already a member. Up to 20, most recent first.
create or replace function private.network_search_unchecked(p_query text, p_gig uuid, p_org uuid)
returns table(user_id uuid, full_name text, functions text[], gigs_together integer, last_together date, busy boolean, already boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_company boolean := private.is_company_side(auth.uid());
  v_period tstzrange;
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if v_me is null then return; end if;
  if p_gig is not null then
    if not private.can_manage_gig(p_gig) then return; end if;
    v_period := private.gig_period(p_gig);
  elsif p_org is not null then
    if not private.is_org_admin(p_org) then return; end if;
  else
    return;
  end if;
  return query
    select n.user_id, p.full_name,
           array(select distinct gm.function_title from public.gig_members gm
                   join public.gig_members mine on mine.gig_id = gm.gig_id and mine.user_id = v_me
                  where gm.user_id = n.user_id and gm.function_title is not null
                  order by gm.function_title limit 5),
           n.gigs_together, n.last_together,
           case when v_period is null then null else exists (
             select 1 from public.reservations r
              where r.resource_type = 'person' and r.resource_id = n.user_id and r.status <> 'cancelled'
                and r.period && v_period and r.gig_id is distinct from p_gig) end,
           case when p_gig is not null then exists (select 1 from public.gig_members g where g.gig_id = p_gig and g.user_id = n.user_id)
                else exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = n.user_id) end
      from private.network_of(v_me) n
      join public.profiles p on p.id = n.user_id
     where (p.findable_by = 'crew' or v_company)
       and (v_q = '' or strpos(lower(coalesce(p.full_name, '')), v_q) > 0)
     order by n.last_together desc nulls last, p.full_name
     limit 20;
end $$;
create or replace function public.network_search(p_query text default '', p_gig uuid default null, p_org uuid default null)
returns table(user_id uuid, full_name text, functions text[], gigs_together integer, last_together date, busy boolean, already boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.network_search_unchecked(p_query, p_gig, p_org);
end $$;

-- Add someone picked from your network to a gig or organisation, the same way as inviting
-- their email (which you never see)
create or replace function private.add_from_network_unchecked(p_kind text, p_target uuid, p_user uuid, p_role text,
                                                              p_function_title text, p_call_time time)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_email text;
begin
  if not private.can_find(auth.uid(), p_user) then
    raise exception 'That person isn''t in your network' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if v_email is null then raise exception 'Unknown person' using errcode = '22023'; end if;
  if p_kind = 'gig' then
    return private.invite_to_gig_unchecked(p_target, v_email, coalesce(p_role, 'crew'), p_function_title, p_call_time);
  elsif p_kind = 'org' then
    return private.invite_to_org_unchecked(p_target, v_email, coalesce(p_role, 'member'));
  end if;
  raise exception 'Invalid kind' using errcode = '22023';
end $$;
create or replace function public.add_from_network(p_kind text, p_target uuid, p_user uuid, p_role text default null,
                                                   p_function_title text default null, p_call_time time default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.add_from_network_unchecked(p_kind, p_target, p_user, p_role, p_function_title, p_call_time);
end $$;

revoke execute on function private.is_company_side(uuid) from public, anon, authenticated;
revoke execute on function private.network_of(uuid) from public, anon, authenticated;
revoke execute on function private.can_find(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.network_search_unchecked(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.add_from_network_unchecked(text, uuid, uuid, text, text, time) from public, anon, authenticated;
revoke execute on function public.network_search(text, uuid, uuid) from public, anon;
revoke execute on function public.add_from_network(text, uuid, uuid, text, text, time) from public, anon;
grant execute on function public.network_search(text, uuid, uuid) to authenticated;
grant execute on function public.add_from_network(text, uuid, uuid, text, text, time) to authenticated;
