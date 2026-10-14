-- Phase 2b: crew availability and booking-clash warnings.
-- Written without DROP/DELETE statements so it applies without manual confirmation.

create table if not exists public.crew_unavailability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text check (char_length(coalesce(note, '')) <= 200),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists crew_unavailability_user_idx on public.crew_unavailability (user_id, start_date);
alter table public.crew_unavailability enable row level security;
-- Only the person themselves sees and edits their own entries; others only get "busy" via the RPCs below
create policy crew_unavailability_select on public.crew_unavailability for select to authenticated
  using (user_id = auth.uid());
create policy crew_unavailability_insert on public.crew_unavailability for insert to authenticated
  with check (user_id = auth.uid());
create policy crew_unavailability_update on public.crew_unavailability for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy crew_unavailability_delete on public.crew_unavailability for delete to authenticated
  using (user_id = auth.uid());

-- Clashes for one person against one gig's dates. Other gigs are named only when the caller
-- can see them; otherwise they show as "busy" without details.
create or replace function private.person_conflicts(p_gig uuid, p_user uuid)
returns table (kind text, start_date date, end_date date, label text)
language sql stable security definer set search_path = public, private as $$
  with g as (select start_date, coalesce(end_date, start_date) as end_date from gigs where id = p_gig and start_date is not null)
  select 'unavailable', u.start_date, u.end_date, null::text
    from crew_unavailability u, g
   where u.user_id = p_user and u.start_date <= g.end_date and u.end_date >= g.start_date
  union all
  select 'booked', o.start_date, coalesce(o.end_date, o.start_date),
         case when private.can_access_gig(o.id) then o.name end
    from gig_members m join gigs o on o.id = m.gig_id, g
   where m.user_id = p_user and o.id <> p_gig and o.status <> 'archived' and o.start_date is not null
     and o.start_date <= g.end_date and coalesce(o.end_date, o.start_date) >= g.start_date
$$;
revoke execute on function private.person_conflicts(uuid, uuid) from public, anon, authenticated;

-- Before inviting: does this email clash with the gig's dates? (Gig managers only.)
create or replace function public.crew_conflicts(p_gig uuid, p_email text)
returns table (kind text, start_date date, end_date date, label text)
language plpgsql stable security definer set search_path = public, private as $$
declare v_user uuid;
begin
  if not private.can_manage_gig(p_gig) then
    raise exception 'Only the gig PM or an organisation admin can check availability';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then return; end if;
  return query select * from private.person_conflicts(p_gig, v_user);
end $$;
revoke execute on function public.crew_conflicts(uuid, text) from anon, public;
grant execute on function public.crew_conflicts(uuid, text) to authenticated;

-- Clashes for everyone already on the gig (shown in the Crew tab to managers).
create or replace function public.gig_crew_conflicts(p_gig uuid)
returns table (user_id uuid, kind text, start_date date, end_date date, label text)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not private.can_manage_gig(p_gig) then
    return;
  end if;
  return query
    select m.user_id, c.kind, c.start_date, c.end_date, c.label
      from gig_members m, lateral private.person_conflicts(p_gig, m.user_id) c
     where m.gig_id = p_gig;
end $$;
revoke execute on function public.gig_crew_conflicts(uuid) from anon, public;
grant execute on function public.gig_crew_conflicts(uuid) to authenticated;
