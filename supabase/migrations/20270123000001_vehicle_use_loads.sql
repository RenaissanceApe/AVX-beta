-- Step 23, V4 follow-up: the vehicle-use report reads the loads V3 records (vehicle_loads,
-- 20270122000000_vehicle_loads.sql). Only replaces public.vehicle_use (newest body:
-- 20270123000000_vehicle_costs.sql), same signature; the Dispatcher confirmed on 2026-11-11 that
-- this is within the owner's approval for V4. Checks in supabase/tests/vehicle_costs.sql.
--
-- load_kg = the heaviest load of the vehicle's trips departing in the period: per trip, each loaded
-- unit's weight × its quantity, where a case weighs its own weight plus its contents' (item_parts
-- 'content'), as src/lib/vehicleLoads.js counts it. Only known weights are added (an item without
-- a weight adds nothing). Empty when none of those trips has a load recorded.
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
    select t.id, t.vehicle_id, t.gig_id, t.km,
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
  ), ld as (
    select x.vehicle_id, max(w.kg) as kg
    from tr x
    join lateral (
      select sum(l.quantity * (coalesce(i.weight_kg, 0)
               + case when i.kit_type = 'case' then coalesce((
                   select sum(p.quantity * coalesce(c.weight_kg, 0))
                   from public.item_parts p join public.price_items c on c.id = p.child_id
                   where p.parent_id = i.id and p.kind = 'content'), 0) else 0 end)) as kg
      from public.vehicle_loads l join public.price_items i on i.id = l.item_id
      where l.trip_id = x.id and l.quantity > 0
      having count(*) > 0
    ) w on true
    group by x.vehicle_id
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
           (select jsonb_object_agg(ex.currency, round(ex.cost, 2)) from ex where ex.vehicle_id = v.id and ex.currency <> 'EUR') as other,
           round(ld.kg, 1) as load_kg
    from public.vehicles v
    left join agg a on a.vehicle_id = v.id
    left join dd on dd.vehicle_id = v.id
    left join ld on ld.vehicle_id = v.id
    where v.org_id = p_org
      and (v.removed_at is null or a.vehicle_id is not null or exists (select 1 from ex where ex.vehicle_id = v.id))
  )
  select r.id, r.name, r.plate, r.removed_at, r.max_load_kg, r.volume_m3, r.cost_per_km, r.cost_per_day, r.trips, r.gigs,
         r.km, r.km_missing, r.days, r.running, r.expenses, round(r.running + r.expenses, 2), r.load_kg, r.other
  from r
  order by r.removed_at is not null, r.name, r.id;
end $$;
revoke execute on function public.vehicle_use(uuid, date, date) from public, anon;
grant execute on function public.vehicle_use(uuid, date, date) to authenticated;
