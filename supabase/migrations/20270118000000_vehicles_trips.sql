-- Step 23, part V1: vehicles and trips (docs/BUSINESS.md, "How vehicles and trips work").
-- - driving_licences: each person's licence categories; read by the person and the admins of an
--   organisation they belong to. Planners who aren't admins only get ok / missing / unknown.
-- - vehicles: the organisation's vans and trucks (capacity, licence needed, running costs per km
--   and per day for gig finance later); managed by admins and members; removed by marking.
-- - trips: out / back / one-way legs on a gig with a vehicle, driver, co-driver, passengers, times
--   and km. Planned by the gig's managers and the organisation's admins and members; everyone on
--   the gig sees them.
-- - Reservations: a trip books its vehicle ('vehicle' / 'trip') and its driver and co-driver
--   ('person' / 'trip_driver', 'trip_codriver'), so double bookings show as clashes wherever
--   bookings already show. Written only by triggers, like the rest of the engine.
-- - time_entries.driving_minutes: driving counts as its own kind of hours ("driving" in the split).
-- Only adds: create table / index if not exists, add column if not exists, create or replace.
-- The shared private.gigs_reservations and private.clashes are not replaced.

-- ── Who plans transport, who is an admin of whom ─────────────────────────────
create or replace function private.can_plan_transport(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_gig(p_gig)
      or exists (select 1 from public.gigs g where g.id = p_gig and g.org_id is not null and private.can_quote(g.org_id))
$$;
revoke execute on function private.can_plan_transport(uuid) from public, anon;
grant execute on function private.can_plan_transport(uuid) to authenticated;

-- The caller is an admin of an organisation the person belongs to
create or replace function private.is_admin_of(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members me join public.org_members them on them.org_id = me.org_id
                  where me.user_id = auth.uid() and me.role = 'admin' and them.user_id = p_user)
$$;
revoke execute on function private.is_admin_of(uuid) from public, anon;
grant execute on function private.is_admin_of(uuid) to authenticated;

-- ── Driving licences ─────────────────────────────────────────────────────────
create table if not exists public.driving_licences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  categories text[] not null default '{}'
    check (categories <@ array['B','BE','C1','C1E','C','CE','D1','D1E','D','DE']::text[] and cardinality(categories) <= 10),
  updated_at timestamptz not null default now()
);
alter table public.driving_licences enable row level security;
create policy driving_licences_select on public.driving_licences for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin_of(user_id));
create policy driving_licences_insert on public.driving_licences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy driving_licences_update on public.driving_licences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy mfa_required on public.driving_licences as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.driving_licences from authenticated;
grant select on public.driving_licences to authenticated;
grant insert (user_id, categories), update (categories) on public.driving_licences to authenticated;

create or replace function private.driving_licences_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.categories := coalesce(array(select distinct c from unnest(new.categories) c where c is not null order by c), '{}');
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.driving_licences_before() from public, anon, authenticated;
create or replace trigger driving_licences_before before insert or update on public.driving_licences
  for each row execute function private.driving_licences_before();

-- Does holding these categories allow driving a vehicle that needs this one? (EU licence rules:
-- C covers C1, CE covers C, C1E and BE, D covers D1, any C or D category means B is held…)
create or replace function private.licence_covers(p_held text[], p_needed text) returns boolean
language sql immutable set search_path = '' as $$
  select p_needed is null or p_needed = any(coalesce(p_held, '{}')) or coalesce(case p_needed
    when 'B'   then p_held && array['BE','C1','C1E','C','CE','D1','D1E','D','DE']
    when 'BE'  then p_held && array['C1E','CE','D1E','DE']
    when 'C1'  then p_held && array['C1E','C','CE']
    when 'C1E' then p_held && array['CE']
    when 'C'   then p_held && array['CE']
    when 'D1'  then p_held && array['D1E','D','DE']
    when 'D1E' then p_held && array['DE']
    when 'D'   then p_held && array['DE']
    else false end, false)
$$;

-- ok | missing | unknown (nothing recorded) | null (no vehicle, no driver or no licence needed)
create or replace function private.licence_status(p_user uuid, p_vehicle uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_user is null or v.licence_category is null then null
    when l.user_id is null or cardinality(l.categories) = 0 then 'unknown'
    when private.licence_covers(l.categories, v.licence_category) then 'ok'
    else 'missing' end
  from public.vehicles v
  left join public.driving_licences l on l.user_id = p_user
  where v.id = p_vehicle
$$;

-- ── Vehicles ─────────────────────────────────────────────────────────────────
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  plate text check (char_length(plate) <= 20),
  licence_category text check (licence_category in ('B','BE','C1','C1E','C','CE','D1','D1E','D','DE')),
  max_load_kg numeric(8,1) check (max_load_kg between 0 and 100000),
  volume_m3 numeric(6,2) check (volume_m3 between 0 and 1000),
  cost_per_km numeric(10,2) check (cost_per_km between 0 and 10000),   -- read by gig finance (step 23, V4)
  cost_per_day numeric(10,2) check (cost_per_day between 0 and 100000),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists vehicles_org_idx on public.vehicles (org_id) where removed_at is null;
alter table public.vehicles enable row level security;
create policy vehicles_select on public.vehicles for select to authenticated using (private.can_quote(org_id));
create policy vehicles_insert on public.vehicles for insert to authenticated with check (private.can_quote(org_id));
create policy vehicles_update on public.vehicles for update to authenticated
  using (removed_at is null and private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.vehicles as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.vehicles from authenticated;
grant select on public.vehicles to authenticated;
grant insert (id, org_id, name, plate, licence_category, max_load_kg, volume_m3, cost_per_km, cost_per_day, notes) on public.vehicles to authenticated;
grant update (name, plate, licence_category, max_load_kg, volume_m3, cost_per_km, cost_per_day, notes, removed_at) on public.vehicles to authenticated;

create or replace function private.vehicles_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  new.plate := nullif(upper(trim(new.plate)), '');
  new.notes := nullif(trim(new.notes), '');
  if tg_op = 'INSERT' then
    if (select count(*) from public.vehicles v where v.org_id = new.org_id and v.removed_at is null) >= 500 then
      raise exception 'Too many vehicles' using errcode = '54000';
    end if;
    new.created_by := auth.uid(); new.created_at := now(); new.removed_at := null;
  else
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.vehicles_before() from public, anon, authenticated;
create or replace trigger vehicles_before before insert or update on public.vehicles
  for each row execute function private.vehicles_before();

-- A renamed vehicle keeps its bookings' label in step
create or replace function private.vehicles_relabel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update public.reservations set label = new.name, updated_at = now()
     where source_type in ('trip', 'trip_driver', 'trip_codriver')
       and source_id in (select t.id::text from public.trips t where t.vehicle_id = new.id);
  end if;
  return null;
end $$;
revoke execute on function private.vehicles_relabel() from public, anon, authenticated;

-- ── Trips ────────────────────────────────────────────────────────────────────
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade,   -- the gig's
  vehicle_id uuid references public.vehicles(id) on delete set null,
  direction text not null default 'out' check (direction in ('out', 'back', 'one_way')),
  driver_id uuid references auth.users(id) on delete set null,
  co_driver_id uuid references auth.users(id) on delete set null,
  passenger_ids uuid[] not null default '{}' check (cardinality(passenger_ids) <= 20),
  departs_at timestamptz not null,
  arrives_at timestamptz not null,
  from_place text check (char_length(from_place) <= 200),
  to_place text check (char_length(to_place) <= 200),
  km numeric(7,1) check (km between 0 and 20000),
  note text check (char_length(note) <= 1000),
  licence_override boolean not null default false,  -- the planner saw the licence warning and went ahead
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint trips_times_check check (arrives_at > departs_at and arrives_at - departs_at <= interval '7 days'),
  constraint trips_co_driver_check check (co_driver_id is null or co_driver_id is distinct from driver_id)
);
create index if not exists trips_gig_idx on public.trips (gig_id, departs_at);
create index if not exists trips_vehicle_idx on public.trips (vehicle_id);
create index if not exists trips_driver_idx on public.trips (driver_id);
alter table public.trips enable row level security;
create policy trips_select on public.trips for select to authenticated using (private.can_access_gig(gig_id));
create policy trips_insert on public.trips for insert to authenticated with check (private.can_plan_transport(gig_id));
create policy trips_update on public.trips for update to authenticated
  using (removed_at is null and private.can_plan_transport(gig_id)) with check (private.can_plan_transport(gig_id));
create policy mfa_required on public.trips as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.trips from authenticated;
grant select on public.trips to authenticated;
grant insert (id, gig_id, vehicle_id, direction, driver_id, co_driver_id, passenger_ids, departs_at, arrives_at,
              from_place, to_place, km, note, licence_override) on public.trips to authenticated;
grant update (vehicle_id, direction, driver_id, co_driver_id, passenger_ids, departs_at, arrives_at,
              from_place, to_place, km, note, licence_override, removed_at) on public.trips to authenticated;

-- Runs as the owner to read the gig, its crew and the vehicle whoever asks; only checks and tidies
create or replace function private.trips_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; p uuid;
begin
  if tg_op = 'INSERT' then
    select g.org_id into v_org from public.gigs g where g.id = new.gig_id;
    new.org_id := v_org;
    if (select count(*) from public.trips t where t.gig_id = new.gig_id and t.removed_at is null) >= 200 then
      raise exception 'Too many trips' using errcode = '54000';
    end if;
    new.created_by := auth.uid(); new.created_at := now(); new.removed_at := null;
  else
    if old.removed_at is not null then raise exception 'Trip removed' using errcode = '42501'; end if;
    new.id := old.id; new.gig_id := old.gig_id; new.org_id := old.org_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null then new.removed_at := now(); end if;
  end if;
  if new.vehicle_id is not null and (tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id) then
    if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.org_id = new.org_id and v.removed_at is null) then
      raise exception 'Vehicle not available to this gig' using errcode = '22023';
    end if;
  end if;
  if new.driver_id is not null and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id)
     and not private.on_gig(new.gig_id, new.driver_id) then
    raise exception 'Driver not on this gig' using errcode = '22023';
  end if;
  if new.co_driver_id is not null and (tg_op = 'INSERT' or new.co_driver_id is distinct from old.co_driver_id)
     and not private.on_gig(new.gig_id, new.co_driver_id) then
    raise exception 'Co-driver not on this gig' using errcode = '22023';
  end if;
  new.passenger_ids := coalesce(array(select distinct x from unnest(new.passenger_ids) x
                                       where x is not null and x is distinct from new.driver_id and x is distinct from new.co_driver_id), '{}');
  if tg_op = 'INSERT' or new.passenger_ids is distinct from old.passenger_ids then
    foreach p in array new.passenger_ids loop
      if not private.on_gig(new.gig_id, p) then raise exception 'Passenger not on this gig' using errcode = '22023'; end if;
    end loop;
  end if;
  new.from_place := nullif(trim(new.from_place), '');
  new.to_place := nullif(trim(new.to_place), '');
  new.note := nullif(trim(new.note), '');
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.trips_before() from public, anon, authenticated;
create or replace trigger trips_before before insert or update on public.trips
  for each row execute function private.trips_before();

-- ── Reservations for a trip ──────────────────────────────────────────────────
-- One row per role, keyed by the trip: the vehicle ('trip'), the driver ('trip_driver') and the
-- co-driver ('trip_codriver'). Changing who or what moves the row; a removed trip cancels them.
create or replace function private.sync_trip_reservations(p_trip uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v record; v_status text; v_period tstzrange; v_key text := p_trip::text; r record;
begin
  select t.*, g.status as gig_status, ve.name as vehicle_name into v
    from public.trips t join public.gigs g on g.id = t.gig_id left join public.vehicles ve on ve.id = t.vehicle_id
   where t.id = p_trip;
  if not found then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type in ('trip', 'trip_driver', 'trip_codriver') and source_id = v_key and status <> 'cancelled';
    return;
  end if;
  v_status := case when v.removed_at is not null then 'cancelled' else private.gig_reservation_status(v.gig_status) end;
  v_period := tstzrange(v.departs_at, v.arrives_at, '[)');
  for r in select * from (values ('trip', 'vehicle', v.vehicle_id), ('trip_driver', 'person', v.driver_id), ('trip_codriver', 'person', v.co_driver_id))
                    as x(source_type, resource_type, resource_id) loop
    if r.resource_id is null then
      update public.reservations set status = 'cancelled', updated_at = now()
       where source_type = r.source_type and source_id = v_key and status <> 'cancelled';
    else
      insert into public.reservations (resource_type, resource_id, quantity, period, status, org_id, gig_id, source_type, source_id, label)
      values (r.resource_type, r.resource_id, 1, v_period, v_status, v.org_id, v.gig_id, r.source_type, v_key, v.vehicle_name)
      on conflict (source_type, source_id) do update
        set resource_type = excluded.resource_type, resource_id = excluded.resource_id, period = excluded.period,
            status = excluded.status, org_id = excluded.org_id, label = excluded.label, updated_at = now();
    end if;
  end loop;
end $$;
revoke execute on function private.sync_trip_reservations(uuid) from public, anon, authenticated;

create or replace function private.trips_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_trip_reservations(new.id);
  return null;
end $$;
revoke execute on function private.trips_reservations() from public, anon, authenticated;
create or replace trigger trips_reservations after insert or update on public.trips
  for each row execute function private.trips_reservations();

-- A gig's status decides hold / confirmed / cancelled for its trips too (a trigger of its own, so
-- the shared private.gigs_reservations stays as it is)
create or replace function private.gigs_trip_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if (new.status, new.org_id) is distinct from (old.status, old.org_id) then
    for m in select t.id from public.trips t where t.gig_id = new.id loop
      perform private.sync_trip_reservations(m.id);
    end loop;
  end if;
  return null;
end $$;
revoke execute on function private.gigs_trip_reservations() from public, anon, authenticated;
create or replace trigger trips_reservations_sync after update on public.gigs
  for each row execute function private.gigs_trip_reservations();

create or replace trigger vehicles_relabel after update on public.vehicles
  for each row execute function private.vehicles_relabel();

-- ── Clashes for a trip ───────────────────────────────────────────────────────
-- Everything else booked for the vehicle, driver and co-driver in a time range: not the trip's
-- own rows, and not the driver's own crew booking on this gig. Gig names only where the caller
-- may see that gig (like private.clashes).
create or replace function private.transport_clashes(p_gig uuid, p_trip uuid, p_vehicle uuid, p_driver uuid,
  p_co_driver uuid, p_from timestamptz, p_until timestamptz)
returns table(who text, user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text)
language sql stable security definer set search_path = '' as $$
  with ask as (
    select 'vehicle'::text as who, 'vehicle'::text as rtype, p_vehicle as rid where p_vehicle is not null
    union all select 'driver', 'person', p_driver where p_driver is not null
    union all select 'co_driver', 'person', p_co_driver where p_co_driver is not null
  )
  select a.who, case when a.rtype = 'person' then a.rid end,
         case when r.source_type = 'unavailable' then 'unavailable'
              when r.source_type in ('trip', 'trip_driver', 'trip_codriver') then 'trip' else 'booked' end,
         r.status, lower(r.period), upper(r.period),
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then r.gig_id end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then g.name end
    from ask a
    join public.reservations r on r.resource_type = a.rtype and r.resource_id = a.rid
    left join public.gigs g on g.id = r.gig_id
   where p_from is not null and p_until > p_from and r.status <> 'cancelled'
     and r.period && tstzrange(p_from, p_until, '[)')
     and not (p_trip is not null and r.source_type in ('trip', 'trip_driver', 'trip_codriver') and r.source_id = p_trip::text)
     and not (r.source_type = 'gig_member' and r.gig_id is not distinct from p_gig)
   order by lower(r.period)
$$;
revoke execute on function private.transport_clashes(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- While planning: clashes for the vehicle and people chosen (only the gig org's vehicles and the
-- gig's crew are looked up)
create or replace function public.transport_clashes(p_gig uuid, p_trip uuid, p_vehicle uuid, p_driver uuid,
  p_co_driver uuid, p_from timestamptz, p_until timestamptz)
returns table(who text, user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  perform private.require_mfa();
  if not private.can_plan_transport(p_gig) then return; end if;
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  return query select * from private.transport_clashes(p_gig, p_trip,
    case when exists (select 1 from public.vehicles v where v.id = p_vehicle and v.org_id = v_org) then p_vehicle end,
    case when private.on_gig(p_gig, p_driver) then p_driver end,
    case when private.on_gig(p_gig, p_co_driver) then p_co_driver end,
    p_from, p_until);
end $$;
revoke execute on function public.transport_clashes(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.transport_clashes(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz) to authenticated;

-- A gig's trips with their vehicle's name, plate, licence and capacity (never its costs), for
-- anyone on the gig; the licence status and clashes for the people who plan them
create or replace function public.gig_trips(p_gig uuid)
returns table(id uuid, gig_id uuid, vehicle_id uuid, direction text, driver_id uuid, co_driver_id uuid, passenger_ids uuid[],
              departs_at timestamptz, arrives_at timestamptz, from_place text, to_place text, km numeric, note text,
              licence_override boolean, vehicle_name text, vehicle_plate text, vehicle_licence text,
              vehicle_max_load_kg numeric, vehicle_volume_m3 numeric, vehicle_removed boolean,
              licence text, co_licence text, clashes jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v_plan boolean;
begin
  perform private.require_mfa();
  if not private.can_access_gig(p_gig) then return; end if;
  v_plan := private.can_plan_transport(p_gig);
  return query
    select t.id, t.gig_id, t.vehicle_id, t.direction, t.driver_id, t.co_driver_id, t.passenger_ids,
           t.departs_at, t.arrives_at, t.from_place, t.to_place, t.km, t.note, t.licence_override,
           v.name, v.plate, v.licence_category, v.max_load_kg, v.volume_m3, v.removed_at is not null,
           case when v_plan then private.licence_status(t.driver_id, t.vehicle_id) end,
           case when v_plan then private.licence_status(t.co_driver_id, t.vehicle_id) end,
           case when v_plan then coalesce((select jsonb_agg(to_jsonb(c)) from private.transport_clashes(
             t.gig_id, t.id, t.vehicle_id, t.driver_id, t.co_driver_id, t.departs_at, t.arrives_at) c), '[]'::jsonb) end
      from public.trips t left join public.vehicles v on v.id = t.vehicle_id
     where t.gig_id = p_gig and t.removed_at is null
     order by t.departs_at, t.created_at;
end $$;
revoke execute on function public.gig_trips(uuid) from public, anon;
grant execute on function public.gig_trips(uuid) to authenticated;

-- The vehicles a planner can pick for a gig (the gig organisation's, not removed; no costs)
create or replace function public.gig_vehicle_choices(p_gig uuid)
returns table(id uuid, name text, plate text, licence_category text, max_load_kg numeric, volume_m3 numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.can_plan_transport(p_gig) then return; end if;
  return query
    select v.id, v.name, v.plate, v.licence_category, v.max_load_kg, v.volume_m3
      from public.vehicles v join public.gigs g on g.org_id = v.org_id
     where g.id = p_gig and v.removed_at is null
     order by v.name;
end $$;
revoke execute on function public.gig_vehicle_choices(uuid) from public, anon;
grant execute on function public.gig_vehicle_choices(uuid) to authenticated;

-- While planning: does this person's licence cover the vehicle? ok | missing | unknown | null
create or replace function public.driver_licence_check(p_gig uuid, p_user uuid, p_vehicle uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.can_plan_transport(p_gig) or not private.on_gig(p_gig, p_user)
     or not exists (select 1 from public.vehicles v join public.gigs g on g.org_id = v.org_id where v.id = p_vehicle and g.id = p_gig) then
    return null;
  end if;
  return private.licence_status(p_user, p_vehicle);
end $$;
revoke execute on function public.driver_licence_check(uuid, uuid, uuid) from public, anon;
grant execute on function public.driver_licence_check(uuid, uuid, uuid) to authenticated;

revoke execute on function private.licence_status(uuid, uuid) from public, anon, authenticated;

-- ── Driving hours in time registration ───────────────────────────────────────
alter table public.time_entries add column if not exists driving_minutes integer not null default 0
  check (driving_minutes between 0 and 1440);
grant insert (driving_minutes), update (driving_minutes) on public.time_entries to authenticated;

-- Same as in 20261212000000_time_registration.sql, plus 'driving' in the stored split
create or replace function public.review_time_entry(p_entry uuid, p_approve boolean, p_note text default null,
  p_split jsonb default null, p_fee_unit text default null, p_fee_rate numeric default null, p_cost numeric default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_e public.time_entries; v_me uuid := auth.uid(); v_note text := nullif(trim(p_note), '');
        v_worked numeric; v_sum numeric; v_gig text;
begin
  select * into v_e from public.time_entries where id = p_entry for update;
  if not found or v_e.removed_at is not null or not private.can_manage_gig(v_e.gig_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_e.status = 'approved' then return 'already'; end if;
  if char_length(v_note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if p_approve then
    if p_split is null or jsonb_typeof(p_split) <> 'object' then raise exception 'Split missing' using errcode = '22023'; end if;
    v_worked := (extract(epoch from (v_e.end_time - v_e.start_time)) / 60 + case when v_e.end_time <= v_e.start_time then 1440 else 0 end
                 - v_e.break_minutes) / 60.0;
    v_sum := coalesce((p_split->>'normal')::numeric, 0) + coalesce((p_split->>'overtime')::numeric, 0) + coalesce((p_split->>'night')::numeric, 0)
           + coalesce((p_split->>'weekend')::numeric, 0) + coalesce((p_split->>'holiday')::numeric, 0);
    if abs(v_sum - v_worked) > 0.05 then raise exception 'Split does not match the hours' using errcode = '22023'; end if;
    if p_fee_unit is not null and p_fee_unit not in ('day', 'half_day', 'hour', 'fixed') then raise exception 'Bad unit' using errcode = '22023'; end if;
    if p_cost is not null and (p_cost < 0 or p_cost > 1000000) then raise exception 'Bad cost' using errcode = '22023'; end if;
    update public.time_entries set status = 'approved', review_note = v_note, reviewed_by = v_me, reviewed_at = now(),
           split = p_split || jsonb_build_object('worked', round(v_worked, 2), 'travel', round(v_e.travel_minutes / 60.0, 2),
                                                 'driving', round(v_e.driving_minutes / 60.0, 2), 'km', v_e.km),
           fee_unit = p_fee_unit, fee_rate = p_fee_rate, cost = round(p_cost, 2), updated_at = now()
     where id = p_entry;
  else
    if v_note is null then raise exception 'A note is needed' using errcode = '22023'; end if;
    update public.time_entries set status = 'returned', review_note = v_note, reviewed_by = v_me, reviewed_at = now(), updated_at = now()
     where id = p_entry;
  end if;
  if v_e.user_id <> v_me then
    select g.name into v_gig from public.gigs g where g.id = v_e.gig_id;
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    values (v_e.user_id, v_e.gig_id, v_me, case when p_approve then 'hours_approved' else 'hours_returned' end,
            jsonb_build_object('gig_name', v_gig,'work_date', v_e.work_date, 'note', v_note));
  end if;
  return case when p_approve then 'approved' else 'returned' end;
end $$;
revoke execute on function public.review_time_entry(uuid, boolean, text, jsonb, text, numeric, numeric) from public, anon;
grant execute on function public.review_time_entry(uuid, boolean, text, jsonb, text, numeric, numeric) to authenticated;
