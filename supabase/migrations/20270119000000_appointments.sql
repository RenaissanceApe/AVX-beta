-- Step 23, part V2: appointments (docs/BUSINESS.md "How appointments work").
-- Calendar items that aren't a gig: a site visit, a meeting, a warehouse day or something else,
-- with a title, place, start/end (or whole days), notes, an optional gig or client, and people
-- invited.
-- 1. appointments + appointment_people. The organisation's planners (admins and members, the
--    people who can create gigs) create and edit them; invited people see the ones they're on.
--    Removed by marking (removed_at), never deleted.
-- 2. Each invited person gets a reservation (resource 'person', source 'appointment'), so
--    appointments show up in every clash check like gig bookings do. All-day appointments are read
--    in the organisation's time zone and move with it.
-- 3. The clash check names an appointment (kind 'appointment' and its title) to people who may see
--    it; to everyone else it's just "booked", as before.
-- 4. Invited people are notified (appointment_invited / appointment_changed /
--    appointment_cancelled), which sends push and the email summary like gig notifications.
-- 5. appointment_clashes(): the invited people's other bookings, for the planner's form.
-- Add-only: new tables, create or replace, new triggers. Nothing is removed.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null default 'meeting' check (kind in ('site_visit', 'meeting', 'warehouse', 'other')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  place text check (char_length(coalesce(place, '')) <= 300),
  all_day boolean not null default false,
  starts_at timestamptz,          -- timed appointments
  ends_at timestamptz,
  start_date date,                -- all-day appointments, on the organisation's calendar
  end_date date,
  notes text check (char_length(coalesce(notes, '')) <= 4000),
  gig_id uuid references public.gigs(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint appointments_when_check check (
    (all_day and start_date is not null and end_date is not null and end_date >= start_date)
    or (not all_day and starts_at is not null and ends_at is not null and ends_at > starts_at)),
  constraint appointments_length_check check (
    (all_day and end_date - start_date <= 366) or (not all_day and ends_at - starts_at <= interval '31 days'))
);
create index if not exists appointments_org_idx on public.appointments (org_id, coalesce(start_date, (starts_at at time zone 'UTC')::date));
create index if not exists appointments_gig_idx on public.appointments (gig_id) where gig_id is not null;
create index if not exists appointments_client_idx on public.appointments (client_id) where client_id is not null;
alter table public.appointments enable row level security;

create table if not exists public.appointment_people (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (appointment_id, user_id)
);
create index if not exists appointment_people_user_idx on public.appointment_people (user_id) where removed_at is null;
alter table public.appointment_people enable row level security;

-- ── Who may do what ──────────────────────────────────────────────────────────
-- Plan = the organisation's admins and members (can_quote, the same people who create gigs)
create or replace function private.can_plan_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointments a where a.id = p_appointment and private.can_quote(a.org_id))
$$;
-- See = planners, whoever made it, and the people invited (while they're on it)
create or replace function private.can_see_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointments a
                  where a.id = p_appointment
                    and (private.can_quote(a.org_id) or a.created_by = auth.uid()
                         or exists (select 1 from public.appointment_people p
                                     where p.appointment_id = a.id and p.user_id = auth.uid() and p.removed_at is null)))
$$;
-- Who can be invited: the organisation's members and people who have been crew on its gigs
create or replace function private.can_invite_to_org(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members om where om.org_id = p_org and om.user_id = p_user)
      or exists (select 1 from public.gig_members gm join public.gigs g on g.id = gm.gig_id
                  where g.org_id = p_org and gm.user_id = p_user)
$$;
revoke execute on function private.can_plan_appointment(uuid) from public, anon;
revoke execute on function private.can_see_appointment(uuid) from public, anon;
revoke execute on function private.can_invite_to_org(uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_plan_appointment(uuid) to authenticated;
grant execute on function private.can_see_appointment(uuid) to authenticated;

create policy appointments_select on public.appointments for select to authenticated
  using (private.can_see_appointment(id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (private.can_quote(org_id));
create policy appointments_update on public.appointments for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.appointments as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Appointments are removed by marking removed_at, so there is no rule for removing rows

create policy appointment_people_select on public.appointment_people for select to authenticated
  using (private.can_see_appointment(appointment_id));
create policy appointment_people_insert on public.appointment_people for insert to authenticated
  with check (private.can_plan_appointment(appointment_id));
create policy appointment_people_update on public.appointment_people for update to authenticated
  using (private.can_plan_appointment(appointment_id)) with check (private.can_plan_appointment(appointment_id));
create policy mfa_required on public.appointment_people as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- People are taken off by marking removed_at, so there is no rule for removing rows
revoke update on public.appointment_people from authenticated;
grant update (removed_at) on public.appointment_people to authenticated;

-- ── Keeping rows honest ──────────────────────────────────────────────────────
create or replace function private.appointments_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_at := now();
    new.removed_at := null;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  new.updated_at := now();
  new.title := trim(new.title);
  new.place := nullif(trim(coalesce(new.place, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  -- Keep only the pair of fields that matches all_day
  if new.all_day then new.starts_at := null; new.ends_at := null;
  else new.start_date := null; new.end_date := null; end if;
  -- A linked gig or client must belong to the same organisation
  if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = new.org_id) then
    raise exception 'That gig belongs to another organisation' using errcode = '42501';
  end if;
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.org_id = new.org_id) then
    raise exception 'That client belongs to another organisation' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger appointments_before before insert or update on public.appointments
  for each row execute function private.appointments_before();

create or replace function private.appointment_people_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if tg_op = 'UPDATE' then
    new.appointment_id := old.appointment_id; new.user_id := old.user_id; new.created_at := old.created_at;
    -- Asked again after being taken off: counts as a new invitation
    if old.removed_at is not null and new.removed_at is null then new.added_by := auth.uid(); else new.added_by := old.added_by; end if;
    return new;
  end if;
  select a.org_id into v_org from public.appointments a where a.id = new.appointment_id;
  if not private.can_invite_to_org(v_org, new.user_id) then
    raise exception 'Only the organisation''s members and crew can be invited' using errcode = '42501';
  end if;
  new.added_by := auth.uid();
  new.created_at := now();
  new.removed_at := null;
  return new;
end $$;
create or replace trigger appointment_people_before before insert or update on public.appointment_people
  for each row execute function private.appointment_people_before();

-- ── Reservations ─────────────────────────────────────────────────────────────
-- An appointment's time as a real time range (whole days on the organisation's clock)
create or replace function private.appointment_period(p_appointment uuid) returns tstzrange
language sql stable security definer set search_path = '' as $$
  select case when a.all_day
              then tstzrange((a.start_date::timestamp at time zone private.org_zone(a.org_id)),
                             ((a.end_date + 1)::timestamp at time zone private.org_zone(a.org_id)), '[)')
              else tstzrange(a.starts_at, a.ends_at, '[)') end
  from public.appointments a where a.id = p_appointment
$$;

-- Keep one invited person's reservation in step with the appointment
create or replace function private.sync_appointment_reservation(p_appointment uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := p_appointment::text || ':' || p_user::text;
  v_appt record;
  v_on boolean;
begin
  select a.org_id, a.title, a.removed_at into v_appt from public.appointments a where a.id = p_appointment;
  select exists (select 1 from public.appointment_people p
                  where p.appointment_id = p_appointment and p.user_id = p_user and p.removed_at is null) into v_on;
  if v_appt is null or v_appt.removed_at is not null or not v_on then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'appointment' and source_id = v_key and status <> 'cancelled';
    return;
  end if;
  insert into public.reservations (resource_type, resource_id, period, status, org_id, gig_id, source_type, source_id, label)
  values ('person', p_user, private.appointment_period(p_appointment), 'confirmed', v_appt.org_id, null,
          'appointment', v_key, left(v_appt.title, 200))
  on conflict (source_type, source_id) do update
    set period = excluded.period, status = excluded.status, label = excluded.label, updated_at = now();
end $$;

create or replace function private.appointment_people_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_appt record; v_kind text;
begin
  perform private.sync_appointment_reservation(new.appointment_id, new.user_id);
  -- Tell the person (not when they added themselves)
  if new.user_id is distinct from auth.uid() then
    if new.removed_at is null and (tg_op = 'INSERT' or old.removed_at is not null) then v_kind := 'appointment_invited';
    elsif tg_op = 'UPDATE' and new.removed_at is not null and old.removed_at is null then v_kind := 'appointment_cancelled';
    end if;
  end if;
  if v_kind is not null then
    select a.* into v_appt from public.appointments a where a.id = new.appointment_id;
    if v_appt.removed_at is null then
      insert into public.notifications (user_id, org_id, actor_id, kind, details)
      values (new.user_id, v_appt.org_id, auth.uid(), v_kind,
              jsonb_build_object('appointment_id', v_appt.id, 'title', v_appt.title, 'appointment_kind', v_appt.kind,
                                 'place', v_appt.place, 'all_day', v_appt.all_day,
                                 'starts_at', v_appt.starts_at, 'ends_at', v_appt.ends_at,
                                 'start_date', v_appt.start_date, 'end_date', v_appt.end_date,
                                 'why', case when v_kind = 'appointment_cancelled' then 'taken_off' end));
    end if;
  end if;
  return null;
end $$;
create or replace trigger appointment_people_after after insert or update on public.appointment_people
  for each row execute function private.appointment_people_after();

create or replace function private.appointments_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record; v_kind text;
begin
  if tg_op = 'UPDATE' and (new.all_day, new.starts_at, new.ends_at, new.start_date, new.end_date, new.title, new.removed_at)
       is not distinct from (old.all_day, old.starts_at, old.ends_at, old.start_date, old.end_date, old.title, old.removed_at)
     and new.place is not distinct from old.place then
    return null;
  end if;
  for p in select ap.user_id from public.appointment_people ap where ap.appointment_id = new.id and ap.removed_at is null loop
    perform private.sync_appointment_reservation(new.id, p.user_id);
  end loop;
  if tg_op = 'UPDATE' then
    if new.removed_at is not null and old.removed_at is null then v_kind := 'appointment_cancelled';
    elsif new.removed_at is null and (new.all_day, new.starts_at, new.ends_at, new.start_date, new.end_date, new.place)
            is distinct from (old.all_day, old.starts_at, old.ends_at, old.start_date, old.end_date, old.place) then
      v_kind := 'appointment_changed';
    end if;
  end if;
  if v_kind is not null then
    insert into public.notifications (user_id, org_id, actor_id, kind, details)
    select ap.user_id, new.org_id, auth.uid(), v_kind,
           jsonb_build_object('appointment_id', new.id, 'title', new.title, 'appointment_kind', new.kind,
                              'place', new.place, 'all_day', new.all_day,
                              'starts_at', new.starts_at, 'ends_at', new.ends_at,
                              'start_date', new.start_date, 'end_date', new.end_date)
      from public.appointment_people ap
     where ap.appointment_id = new.id and ap.removed_at is null and ap.user_id is distinct from auth.uid();
  end if;
  return null;
end $$;
create or replace trigger appointments_after after insert or update on public.appointments
  for each row execute function private.appointments_after();

-- A new time zone moves all-day appointments that haven't ended more than 30 days ago
create or replace function private.organisations_appointments_time_zone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if new.time_zone is not distinct from old.time_zone then return null; end if;
  for p in select ap.appointment_id, ap.user_id from public.appointment_people ap
             join public.appointments a on a.id = ap.appointment_id
            where a.org_id = new.id and a.all_day and a.removed_at is null and ap.removed_at is null
              and a.end_date >= (now() at time zone new.time_zone)::date - 30 loop
    perform private.sync_appointment_reservation(p.appointment_id, p.user_id);
  end loop;
  return null;
end $$;
create or replace trigger organisations_appointments_time_zone after update of time_zone on public.organisations
  for each row execute function private.organisations_appointments_time_zone();

revoke execute on function private.appointment_period(uuid) from public, anon, authenticated;
revoke execute on function private.sync_appointment_reservation(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.appointments_before() from public, anon, authenticated;
revoke execute on function private.appointment_people_before() from public, anon, authenticated;
revoke execute on function private.appointments_after() from public, anon, authenticated;
revoke execute on function private.appointment_people_after() from public, anon, authenticated;
revoke execute on function private.organisations_appointments_time_zone() from public, anon, authenticated;

-- ── The clash check names appointments ───────────────────────────────────────
-- Same as in 20261024000000_reservations_people.sql, plus: an appointment row says
-- kind 'appointment' and gives its title (label) to people who may see that appointment.
create or replace function private.clashes(p_type text, p_resource uuid, p_period tstzrange, p_exclude_gig uuid default null)
returns table(reservation_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz,
              gig_id uuid, label text, company text, role_label text)
language sql stable security definer set search_path = '' as $$
  select r.id,
         case when r.source_type = 'unavailable' then 'unavailable'
              when r.source_type = 'appointment' and private.can_see_appointment(split_part(r.source_id, ':', 1)::uuid) then 'appointment'
              else 'booked' end,
         r.status, lower(r.period), upper(r.period),
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then r.gig_id end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then g.name
              when r.source_type = 'appointment' and private.can_see_appointment(split_part(r.source_id, ':', 1)::uuid) then r.label end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then o.name
              when r.source_type = 'appointment' and private.can_see_appointment(split_part(r.source_id, ':', 1)::uuid) then o.name end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then r.label end
  from public.reservations r
  left join public.gigs g on g.id = r.gig_id
  left join public.organisations o on o.id = r.org_id
  where r.resource_type = p_type and r.resource_id = p_resource and r.status <> 'cancelled'
    and r.period && p_period
    and (p_exclude_gig is null or r.gig_id is distinct from p_exclude_gig)
  order by lower(r.period)
$$;
revoke execute on function private.clashes(text, uuid, tstzrange, uuid) from public, anon, authenticated;

-- ── Clashes for the appointment form ─────────────────────────────────────────
-- For a planner: each listed person's other bookings in a time range (the appointment being
-- edited left out). Only people who could be invited are checked.
create or replace function private.appointment_clashes_unchecked(p_org uuid, p_users uuid[], p_from timestamptz,
                                                                 p_until timestamptz, p_exclude_appointment uuid)
returns table(user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_quote(p_org) or p_until is null or p_from is null or p_until <= p_from then return; end if;
  return query
    select u.id, c.kind, c.status, c.starts_at, c.ends_at, c.gig_id, c.label, c.company, c.role_label
      from unnest(coalesce(p_users, '{}'::uuid[])) as u(id)
      cross join lateral private.clashes('person', u.id, tstzrange(p_from, p_until, '[)'), null) c
      join public.reservations r on r.id = c.reservation_id
     where private.can_invite_to_org(p_org, u.id)
       and not (p_exclude_appointment is not null and r.source_type = 'appointment'
                and r.source_id = p_exclude_appointment::text || ':' || u.id::text);
end $$;
create or replace function public.appointment_clashes(p_org uuid, p_users uuid[], p_from timestamptz, p_until timestamptz,
                                                      p_exclude_appointment uuid default null)
returns table(user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.appointment_clashes_unchecked(p_org, p_users, p_from, p_until, p_exclude_appointment);
end $$;
revoke execute on function private.appointment_clashes_unchecked(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.appointment_clashes(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.appointment_clashes(uuid, uuid[], timestamptz, timestamptz, uuid) to authenticated;

-- ── People who can be invited ────────────────────────────────────────────────
-- For a planner: the organisation's members and its gigs' crew, with their names
create or replace function private.appointment_invitees_unchecked(p_org uuid)
returns table(user_id uuid, full_name text, is_member boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, bool_or(x.member)
  from (select om.user_id, true as member from public.org_members om where om.org_id = p_org
        union all
        select gm.user_id, false from public.gig_members gm join public.gigs g on g.id = gm.gig_id where g.org_id = p_org) x
  join public.profiles p on p.id = x.user_id
  where private.can_quote(p_org)
  group by p.id, p.full_name
  order by bool_or(x.member) desc, lower(coalesce(p.full_name, ''))
$$;
create or replace function public.appointment_invitees(p_org uuid)
returns table(user_id uuid, full_name text, is_member boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.appointment_invitees_unchecked(p_org);
end $$;
revoke execute on function private.appointment_invitees_unchecked(uuid) from public, anon, authenticated;
revoke execute on function public.appointment_invitees(uuid) from public, anon;
grant execute on function public.appointment_invitees(uuid) to authenticated;
