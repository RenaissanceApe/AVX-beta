-- Step 23, part V4: transport costs in gig finance, expenses linked to a vehicle (and a trip),
-- the vehicle-use report, vehicles and trips in the organisation export, and the account-closing
-- guard for V1's tables. Checks in supabase/tests/vehicle_costs.sql and account_closing.sql.
-- Only adds: new columns, functions and one trigger; gig_finance and the export function are
-- renamed and wrapped, as earlier steps did.
--
-- Transport cost of a gig (docs/BUSINESS.md, "How transport costs work"):
--   per vehicle on the gig: km of its trips × cost_per_km + days used × cost_per_day.
--   A day is used when at least one of the gig's live trips with that vehicle is under way on it,
--   on the organisation's clock; a trip over midnight uses both days, and several trips on one day
--   use it once. Trips without a vehicle cost nothing; a trip without km counts its days only and
--   is listed as "km missing". The vehicle's current rates are used (as the rate card is for labour).
--   Only those who see money (private.require_finance) get any of it; crew never do.

-- ── 1. Transport per gig and vehicle ─────────────────────────────────────────
create or replace function private.gig_transport(p_org uuid, p_gigs uuid[])
returns table(gig_id uuid, vehicle_id uuid, vehicle_name text, plate text, removed_at timestamptz, trips integer,
              km numeric, km_missing integer, days integer, cost_per_km numeric, cost_per_day numeric, running numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform private.require_finance(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with tr as (
    select t.gig_id, t.vehicle_id, t.km,
           (t.departs_at at time zone v_tz)::date as d0,
           ((t.arrives_at - interval '1 microsecond') at time zone v_tz)::date as d1
    from public.trips t
    where t.org_id = p_org and t.gig_id = any(p_gigs) and t.removed_at is null and t.vehicle_id is not null
  ), dd as (
    select x.gig_id, x.vehicle_id, count(distinct d.d::date)::int as n
    from tr x cross join lateral generate_series(x.d0, greatest(x.d0, x.d1), interval '1 day') d(d)
    group by x.gig_id, x.vehicle_id
  ), agg as (
    select x.gig_id, x.vehicle_id, count(*)::int as trips, coalesce(sum(x.km), 0) as km,
           count(*) filter (where x.km is null)::int as km_missing
    from tr x group by x.gig_id, x.vehicle_id
  )
  select a.gig_id, a.vehicle_id, v.name, v.plate, v.removed_at, a.trips, a.km, a.km_missing, coalesce(dd.n, 0),
         v.cost_per_km, v.cost_per_day,
         round(a.km * coalesce(v.cost_per_km, 0) + coalesce(dd.n, 0) * coalesce(v.cost_per_day, 0), 2)
  from agg a
  join public.vehicles v on v.id = a.vehicle_id
  left join dd on dd.gig_id = a.gig_id and dd.vehicle_id = a.vehicle_id
  order by a.gig_id, v.name, a.vehicle_id;
end $$;
revoke execute on function private.gig_transport(uuid, uuid[]) from public, anon;
grant execute on function private.gig_transport(uuid, uuid[]) to authenticated;

-- One gig's transport cost per vehicle, for its Transport tab (those who see money only)
create or replace function public.gig_transport_cost(p_gig uuid)
returns table(vehicle_id uuid, vehicle_name text, plate text, removed_at timestamptz, trips integer, km numeric,
              km_missing integer, days integer, cost_per_km numeric, cost_per_day numeric, running numeric)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare v_org uuid;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  if v_org is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select x.vehicle_id, x.vehicle_name, x.plate, x.removed_at, x.trips, x.km, x.km_missing, x.days,
         x.cost_per_km, x.cost_per_day, x.running
  from private.gig_transport(v_org, array[p_gig]) x;
end $$;
revoke execute on function public.gig_transport_cost(uuid) from public, anon;
grant execute on function public.gig_transport_cost(uuid) to authenticated;

-- ── 2. Gig finance gains a transport line ────────────────────────────────────
-- The body from 20270102000001_quote_bin.sql (its newest) is kept as private.gig_finance_pre_v4
-- and wrapped: the same columns, then transport, transport_km, transport_trips and
-- transport_km_missing; cost, margin and margin % include transport.
do $$ begin
  if to_regprocedure('private.gig_finance_pre_v4(uuid, date, date, uuid)') is null then
    alter function public.gig_finance(uuid, date, date, uuid) rename to gig_finance_pre_v4;
    alter function public.gig_finance_pre_v4(uuid, date, date, uuid) set schema private;
  end if;
end $$;
revoke execute on function private.gig_finance_pre_v4(uuid, date, date, uuid) from public, anon;
grant execute on function private.gig_finance_pre_v4(uuid, date, date, uuid) to authenticated;

create or replace function public.gig_finance(p_org uuid, p_from date, p_until date, p_gig uuid default null)
returns table(gig_id uuid, gig_name text, start_date date, end_date date, gig_status text, gig_custom_status_id uuid,
              gig_type_id uuid, client_id uuid, client_name text, revenue numeric, revenue_source text, quotes integer,
              labour_planned numeric, labour_actual numeric, labour numeric, labour_estimated numeric, people integer,
              people_missing integer, subrentals numeric, repairs numeric, repairs_charged numeric, other_costs numeric,
              cost numeric, estimated_cost numeric, margin numeric, margin_pct numeric, other_currencies jsonb,
              transport numeric, transport_km numeric, transport_trips integer, transport_km_missing integer)
language plpgsql stable security invoker set search_path = '' set jit = off set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
begin
  return query
  with f as materialized (
    select * from private.gig_finance_pre_v4(p_org, p_from, p_until, p_gig)
  ), tr as (
    select x.gig_id, sum(x.running) as running, sum(x.km) as km, sum(x.trips)::int as trips, sum(x.km_missing)::int as km_missing
    from private.gig_transport(p_org, array(select f.gig_id from f)) x
    group by x.gig_id
  ), j as (
    select f.*, coalesce(tr.running, 0) as tr_cost, coalesce(tr.km, 0) as tr_km,
           coalesce(tr.trips, 0) as tr_trips, coalesce(tr.km_missing, 0) as tr_missing
    from f left join tr on tr.gig_id = f.gig_id
  )
  select j.gig_id, j.gig_name, j.start_date, j.end_date, j.gig_status, j.gig_custom_status_id, j.gig_type_id, j.client_id,
         j.client_name, j.revenue, j.revenue_source, j.quotes, j.labour_planned, j.labour_actual, j.labour, j.labour_estimated,
         j.people, j.people_missing, j.subrentals, j.repairs, j.repairs_charged, j.other_costs,
         round(j.cost + j.tr_cost, 2), j.estimated_cost, round(j.margin - j.tr_cost, 2),
         case when j.revenue > 0 then round((j.margin - j.tr_cost) * 100 / j.revenue, 1) end,
         j.other_currencies, round(j.tr_cost, 2), j.tr_km, j.tr_trips, j.tr_missing
  from j
  order by j.start_date nulls last, j.gig_name, j.gig_id;
end $$;
revoke execute on function public.gig_finance(uuid, date, date, uuid) from public, anon;
grant execute on function public.gig_finance(uuid, date, date, uuid) to authenticated;

-- ── 3. Expenses linked to a vehicle, and optionally one of its trips ─────────
alter table public.expenses add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.expenses add column if not exists trip_id uuid references public.trips(id) on delete set null;
create index if not exists expenses_vehicle_idx on public.expenses (vehicle_id, spent_on) where vehicle_id is not null and removed_at is null;
create index if not exists expenses_trip_idx on public.expenses (trip_id) where trip_id is not null;
grant insert (vehicle_id, trip_id), update (vehicle_id, trip_id) on public.expenses to authenticated;

-- Security definer: the vehicle and trip must be the expense's organisation's (and its gig's).
-- A trip gives its vehicle and fills in its gig. Returns the vehicle and gig to use.
create or replace function private.expense_vehicle_gig(p_org uuid, p_gig uuid, p_vehicle uuid, p_trip uuid)
returns table(vehicle_id uuid, gig_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_vehicle uuid; v_gig uuid; v_removed timestamptz;
begin
  if p_trip is not null then
    select t.org_id, t.vehicle_id, t.gig_id, t.removed_at into v_org, v_vehicle, v_gig, v_removed
      from public.trips t where t.id = p_trip;
    if v_org is distinct from p_org then raise exception 'Linked record not found in this organisation' using errcode = '42501'; end if;
    if v_removed is not null then raise exception 'Trip removed' using errcode = '22023'; end if;
    if v_vehicle is null then raise exception 'Trip has no vehicle' using errcode = '22023'; end if;
    if p_vehicle is not null and p_vehicle <> v_vehicle then raise exception 'Trip uses another vehicle' using errcode = '22023'; end if;
    if p_gig is not null and p_gig <> v_gig then raise exception 'Linked record belongs to another gig' using errcode = '22023'; end if;
    return query select v_vehicle, v_gig;
    return;
  end if;
  select v.org_id into v_org from public.vehicles v where v.id = p_vehicle;
  if v_org is distinct from p_org then raise exception 'Linked record not found in this organisation' using errcode = '42501'; end if;
  return query select p_vehicle, p_gig;
end $$;
revoke execute on function private.expense_vehicle_gig(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.expense_vehicle_gig(uuid, uuid, uuid, uuid) to authenticated;

-- Runs as the caller, after expenses_before (triggers fire in name order). A vehicle link is one
-- more "linked record": never together with a subrental, repair, crew fee or stock purchase, and
-- never on a claim (a claim links only to its gig). Many expenses may link to one vehicle or trip.
create or replace function private.expenses_vehicle_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.vehicle_id is null and new.trip_id is null then return new; end if;
  if num_nonnulls(new.subrental_id, new.repair_id, new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id) > 0 then
    raise exception 'An expense links to one record' using errcode = '22023';
  end if;
  if new.status in ('claimed', 'returned') then
    raise exception 'A claim links only to its gig' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' or (new.vehicle_id, new.trip_id, new.gig_id) is distinct from (old.vehicle_id, old.trip_id, old.gig_id) then
    select x.vehicle_id, x.gig_id into new.vehicle_id, new.gig_id
      from private.expense_vehicle_gig(new.org_id, new.gig_id, new.vehicle_id, new.trip_id) x;
  end if;
  return new;
end $$;
revoke execute on function private.expenses_vehicle_before() from public, anon, authenticated;
create or replace trigger expenses_vehicle_before before insert or update on public.expenses
  for each row execute function private.expenses_vehicle_before();

-- ── 4. Vehicle-use report ────────────────────────────────────────────────────
-- One row per vehicle with trips departing in [from, until) on the organisation's clock, or live
-- (not removed). Days used are distinct days of the vehicle's live trips inside the period (across
-- gigs: a van on two gigs the same day uses that day once). Running cost = km × cost_per_km + days
-- used × cost_per_day. Expenses: confirmed expenses linked to the vehicle spent in the period, at
-- their cost (private.expense_costs), euros only; other currencies listed apart. load_kg stays empty
-- until the packing list per vehicle (V3) records loads: the report says "not recorded".
create or replace function public.vehicle_use(p_org uuid, p_from date, p_until date)
returns table(vehicle_id uuid, vehicle_name text, plate text, removed_at timestamptz, max_load_kg numeric, volume_m3 numeric,
              cost_per_km numeric, cost_per_day numeric, trips integer, gigs integer, km numeric, km_missing integer,
              days integer, running numeric, expenses numeric, total numeric, load_kg numeric, other_currencies jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until <= p_from or p_until - p_from > 3700 then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with tr as (
    select t.vehicle_id, t.gig_id, t.km,
           greatest((t.departs_at at time zone v_tz)::date, p_from) as d0,
           least(((t.arrives_at - interval '1 microsecond') at time zone v_tz)::date, p_until - 1) as d1
    from public.trips t
    where t.org_id = p_org and t.removed_at is null and t.vehicle_id is not null
      and (t.departs_at at time zone v_tz)::date >= p_from and (t.departs_at at time zone v_tz)::date < p_until
  ), dd as (
    select x.vehicle_id, count(distinct d.d::date)::int as n
    from tr x cross join lateral generate_series(x.d0, greatest(x.d0, x.d1), interval '1 day') d(d)
    group by x.vehicle_id
  ), agg as (
    select x.vehicle_id, count(*)::int as trips, count(distinct x.gig_id)::int as gigs, coalesce(sum(x.km), 0) as km,
           count(*) filter (where x.km is null)::int as km_missing
    from tr x group by x.vehicle_id
  ), ex as (
    select e.vehicle_id, e.currency, sum(c.cost) as cost
    from public.expenses e join private.expense_costs c on c.id = e.id
    where e.org_id = p_org and e.vehicle_id is not null and e.removed_at is null and e.status = 'confirmed'
      and e.spent_on >= p_from and e.spent_on < p_until
    group by e.vehicle_id, e.currency
  ), r as (
    select v.id, v.name, v.plate, v.removed_at, v.max_load_kg, v.volume_m3, v.cost_per_km, v.cost_per_day,
           coalesce(a.trips, 0) as trips, coalesce(a.gigs, 0) as gigs, coalesce(a.km, 0) as km,
           coalesce(a.km_missing, 0) as km_missing, coalesce(dd.n, 0) as days,
           round(coalesce(a.km, 0) * coalesce(v.cost_per_km, 0) + coalesce(dd.n, 0) * coalesce(v.cost_per_day, 0), 2) as running,
           round(coalesce((select ex.cost from ex where ex.vehicle_id = v.id and ex.currency = 'EUR'), 0), 2) as expenses,
           (select jsonb_object_agg(ex.currency, round(ex.cost, 2)) from ex where ex.vehicle_id = v.id and ex.currency <> 'EUR') as other
    from public.vehicles v
    left join agg a on a.vehicle_id = v.id
    left join dd on dd.vehicle_id = v.id
    where v.org_id = p_org
      and (v.removed_at is null or a.vehicle_id is not null or exists (select 1 from ex where ex.vehicle_id = v.id))
  )
  select r.id, r.name, r.plate, r.removed_at, r.max_load_kg, r.volume_m3, r.cost_per_km, r.cost_per_day, r.trips, r.gigs,
         r.km, r.km_missing, r.days, r.running, r.expenses, round(r.running + r.expenses, 2), null::numeric, r.other
  from r
  order by r.removed_at is not null, r.name, r.id;
end $$;
revoke execute on function public.vehicle_use(uuid, date, date) from public, anon;
grant execute on function public.vehicle_use(uuid, date, date) to authenticated;

-- ── 5. Organisation export: vehicles, trips and expenses per vehicle ────────
do $$ begin
  if to_regprocedure('private.export_org_part_pre_v4(uuid, text, integer)') is null then
    alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_v4;
  end if;
end $$;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  case p_part
  when 'vehicles' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select v.name, v.plate, v.licence_category, v.max_load_kg, v.volume_m3, v.cost_per_km, v.cost_per_day, v.notes,
             v.created_at, v.removed_at
        from public.vehicles v where v.org_id = p_org
       order by v.removed_at is not null, v.name, v.id offset v_off limit v_lim) x;
  when 'trips' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, t.direction, v.name as vehicle, v.plate,
             dp.full_name as driver, cp.full_name as co_driver,
             (select string_agg(pp.full_name, ', ' order by pp.full_name) from public.profiles pp where pp.id = any(t.passenger_ids)) as passengers,
             t.departs_at, t.arrives_at, t.from_place, t.to_place, t.km, t.note, t.licence_override, t.created_at
        from public.trips t
        join public.gigs g on g.id = t.gig_id
        left join public.vehicles v on v.id = t.vehicle_id
        left join public.profiles dp on dp.id = t.driver_id
        left join public.profiles cp on cp.id = t.co_driver_id
       where t.org_id = p_org and t.removed_at is null
       order by t.departs_at, t.id offset v_off limit v_lim) x;
  when 'vehicle_expenses' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select e.spent_on, v.name as vehicle, v.plate, coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig,
             t.departs_at as trip_departs_at, t.direction as trip_direction, e.description,
             coalesce(c.name, c.starter_key) as category, e.amount_net, e.vat_amount, e.total, e.currency, e.status
        from public.expenses e
        join public.vehicles v on v.id = e.vehicle_id
        left join public.gigs g on g.id = e.gig_id
        left join public.trips t on t.id = e.trip_id
        left join public.expense_categories c on c.id = e.category_id
       where e.org_id = p_org and e.removed_at is null
       order by e.spent_on, e.created_at, e.id offset v_off limit v_lim) x;
  else
    return private.export_org_part_pre_v4(p_org, p_part, p_offset);
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_v4(uuid, text, integer) from public, anon, authenticated;

-- ── 6. Account closing: V1's tables (issue #195, after 20270121000000_account_closing.sql) ──
-- The newest bodies from 20270118000000_vehicles_trips.sql with the account-closing lines added at
-- the top; nothing else changed.
create or replace function private.vehicles_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and current_user not in ('authenticated', 'anon') then
    if private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  end if;
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

create or replace function private.trips_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; p uuid;
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by,driver_id,co_driver_id}') then return new; end if;
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
