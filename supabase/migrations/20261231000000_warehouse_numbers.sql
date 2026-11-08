-- K6 (docs/ANALYTICS.md): warehouse and upkeep numbers. Two columns and functions; only adds.
--
-- - subrentals.requested_at / decided_at: when a hire request was sent and when its answer was
--   recorded (by the supplier on AVX, or by hand), so the time to answer can be counted. Written
--   only by the trigger subrentals_times. Older requests have neither: their time to answer uses
--   the day they were made and the supplier's answer, when there is one.
-- - private.warehouse_demand_rows(org, from, until): per stock item, the busiest moment booked in a
--   period against what was owned that day (units' owned periods and the bulk ledger, K5's
--   private.equipment_units / equipment_bulk_moves) and what was hired in at that moment; days over
--   stock and days still short after hire-in.
-- - public.warehouse_demand(org, from, until, at): those rows per item, hire-ins, idle stock and
--   "sell?" candidates (no confirmed booking in the last 12 months, with book value).
-- - public.warehouse_suppliers(org, from, until, at): hire-in spend, requests and answers per supplier.
-- - public.warehouse_damage(org, from, until, at): repairs per item, gig and client; losses;
--   inspections due, overdue and their cost.
-- - public.warehouse_dispatch(org, from, until, at): per gig planned / out / back / missing, scans
--   per day, how many days before the gig gear left.
-- - public.report_overview_k6(org, at): the K6 Overview tiles (its own function).
-- Owner's answers (2026-11-08): "prepped" = scanned out; the idle period is 12 months.
-- Cancelled gigs hold no equipment (K7): left out of demand and dispatch.
-- Who: the organisation's admins and members (private.require_ops, K7); money only for those who
-- see it (private.can_see_finance), else null. Security definer, like K7's reports.
-- Written without destructive statements.

-- ── When a request was sent and answered ─────────────────────────────────────
alter table public.subrentals add column if not exists requested_at timestamptz;
alter table public.subrentals add column if not exists decided_at timestamptz;

create or replace function private.subrentals_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.requested_at := old.requested_at; new.decided_at := old.decided_at;
  else
    new.requested_at := null; new.decided_at := null;
  end if;
  if new.status = 'requested' and (tg_op = 'INSERT' or old.status is distinct from 'requested') then
    new.requested_at := now(); new.decided_at := null;
  elsif new.status in ('confirmed', 'declined') and tg_op = 'UPDATE' and old.status = 'requested' then
    new.decided_at := coalesce(new.answered_at, now());
  end if;
  return new;
end $$;
revoke execute on function private.subrentals_times() from public, anon, authenticated;
-- Runs after subrentals_before (triggers of one kind run in name order)
create or replace trigger subrentals_times before insert or update on public.subrentals
  for each row execute function private.subrentals_times();

-- ── Demand against stock ─────────────────────────────────────────────────────
-- Booked: equipment reservations that aren't cancelled (holds included, as the availability check
-- counts them; a cancelled gig's are cancelled). Sets are booked as themselves, as in the
-- availability check, so they are left out. Owned on a day: units owned that day (purchase date,
-- else added, until lost or retired) plus the bulk ledger up to that day; units in repair still
-- count as owned. Hired in at a moment: confirmed or returned subrental lines whose dates cover it.
-- Each day's busiest moment is found at the starts of the bookings running that day.
create or replace function private.warehouse_demand_rows(p_org uuid, p_from date, p_until date)
returns table(item_id uuid, peak_booked integer, peak_at timestamptz, peak_day date, owned_at_peak integer,
              hired_at_peak integer, short_at_peak integer, days_over integer, days_short integer,
              max_short integer, first_short date)
language sql stable security definer set search_path = '' set jit = off as $$
  with tz as (
    select coalesce((select o.time_zone from public.organisations o where o.id = p_org), 'UTC') as z
  ), rng as (
    select p_from::timestamp at time zone tz.z as a, p_until::timestamp at time zone tz.z as b from tz
  ), items as (
    select i.id from public.price_items i
    where i.org_id = p_org and i.kind in ('rental', 'sale') and i.tracking <> 'none' and i.kit_type is distinct from 'set'
  ), res as materialized (
    select r.resource_id as item_id, r.period, r.quantity
    from public.reservations r cross join rng
    where r.org_id = p_org and r.resource_type = 'equipment' and r.status <> 'cancelled'
      and r.period && tstzrange(rng.a, rng.b, '[)') and r.resource_id in (select items.id from items)
  ), hire as materialized (
    select sl.item_id, tstzrange(s.starts_at, s.ends_at, '[)') as period, sl.quantity
    from public.subrentals s
    join public.subrental_lines sl on sl.subrental_id = s.id
    left join public.gigs g on g.id = s.gig_id
    where s.org_id = p_org and s.status in ('confirmed', 'returned') and sl.item_id is not null
      and g.status is distinct from 'cancelled'
  ), days as (
    select d::date as day, d at time zone tz.z as ds, (d + interval '1 day') at time zone tz.z as de
    from tz cross join generate_series(p_from::timestamp, (p_until - 1)::timestamp, interval '1 day') d
  ), pts as (
    select distinct res.item_id, days.day, greatest(lower(res.period), days.ds) as at
    from res join days on res.period && tstzrange(days.ds, days.de, '[)')
  ), units as materialized (
    select u.item_id, u.start_on, u.end_on from private.equipment_units(p_org) u
  ), bulk as materialized (
    select m.item_id, m.on_date, m.delta from private.equipment_bulk_moves(p_org) m
  ), owned as (
    select k.item_id, k.day,
           ((select count(*) from units u where u.item_id = k.item_id and u.start_on <= k.day and (u.end_on is null or u.end_on > k.day))
            + coalesce((select sum(m.delta) from bulk m where m.item_id = k.item_id and m.on_date <= k.day), 0))::integer as owned
    from (select distinct pts.item_id, pts.day from pts) k
  ), d as (
    select p.item_id, p.day, p.at, o.owned,
           (select sum(r.quantity) from res r where r.item_id = p.item_id and r.period @> p.at)::integer as booked,
           coalesce((select sum(h.quantity) from hire h where h.item_id = p.item_id and h.period @> p.at), 0)::integer as hired
    from pts p join owned o on o.item_id = p.item_id and o.day = p.day
  ), per_day as (
    select d.item_id, d.day, bool_or(d.booked > d.owned) as over_, bool_or(d.booked > d.owned + d.hired) as short_,
           max(d.booked - d.owned - d.hired) as gap
    from d group by d.item_id, d.day
  ), peak as (
    select distinct on (d.item_id) d.item_id, d.at, d.day, d.booked, d.owned, d.hired
    from d order by d.item_id, d.booked desc, d.at
  )
  select pk.item_id, pk.booked, pk.at, pk.day, pk.owned, pk.hired, greatest(0, pk.booked - pk.owned - pk.hired),
         (count(*) filter (where pd.over_))::integer, (count(*) filter (where pd.short_))::integer,
         greatest(0, max(pd.gap))::integer, min(pd.day) filter (where pd.short_)
  from peak pk join per_day pd on pd.item_id = pk.item_id
  group by pk.item_id, pk.booked, pk.at, pk.day, pk.owned, pk.hired
$$;
revoke execute on function private.warehouse_demand_rows(uuid, date, date) from public, anon, authenticated;

-- { today, from, until, money, items: [{ item_id, name, category, tracking, owned (now), peak_booked,
--   peak_at, peak_day, owned_at_peak, hired_at_peak, short_at_peak, days_over, days_short, max_short,
--   first_short, hire_ins, hired_units, last_confirmed, idle, book_value, book_value_estimated }] }
-- One row per stock item that is owned or booked in the period. idle: owned now, no confirmed
-- booking from 12 months ago onwards (future bookings count). hire_ins: confirmed or returned
-- subrentals with the item whose dates overlap the period. Book value (money only): live units'
-- cost less their depreciation so far, plus bulk purchases' cost less theirs, for the share of
-- bulk still owned (K5's rule, private.equipment_depreciation).
create or replace function public.warehouse_demand(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set jit = off as $$
declare v_tz text; v_today date; v_fin boolean; v_book jsonb := '{}'::jsonb; v_out jsonb; v_a timestamptz; v_b timestamptz;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 400);
  v_fin := private.can_see_finance(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  v_today := private.org_today(p_org, p_at);
  v_a := p_from::timestamp at time zone v_tz;
  v_b := p_until::timestamp at time zone v_tz;
  if v_fin then
    with dep as (
      select * from private.equipment_depreciation(p_org, date '1900-01-01', v_today + 1)
    ), u as (
      select u.item_id, sum(u.cost - coalesce(d.amount, 0)) as v, bool_or(u.estimated) as est
      from private.equipment_units(p_org) u left join dep d on d.unit_id = u.unit_id
      where u.end_on is null and u.cost is not null group by u.item_id
    ), b as (
      select m.item_id, sum(m.unit_cost * m.quantity) as cost, sum(m.quantity) as qty
      from private.equipment_bulk_moves(p_org) m where m.kind = 'purchase' and m.unit_cost is not null group by m.item_id
    ), bd as (
      select dep.item_id, sum(dep.amount) as amount from dep where dep.unit_id is null group by dep.item_id
    ), lvl as (
      select s.item_id, sum(s.quantity) as n from public.stock_levels s
      join public.price_items i on i.id = s.item_id and i.tracking = 'bulk'
      where s.org_id = p_org group by s.item_id
    ), t as (
      select coalesce(u.item_id, b.item_id) as item_id,
             greatest(0, coalesce(u.v, 0)
               + coalesce((b.cost - coalesce(bd.amount, 0)) * least(1, greatest(0, coalesce(l.n, 0)) / nullif(b.qty, 0)), 0)) as v,
             coalesce(u.est, false) as est
      from u full join b on b.item_id = u.item_id
      left join bd on bd.item_id = coalesce(u.item_id, b.item_id)
      left join lvl l on l.item_id = coalesce(u.item_id, b.item_id)
    )
    select coalesce(jsonb_object_agg(t.item_id, jsonb_build_object('v', round(t.v, 2), 'est', t.est)), '{}'::jsonb) into v_book from t;
  end if;

  with dem as (
    select * from private.warehouse_demand_rows(p_org, p_from, p_until)
  ), own as (
    select s.item_id, sum(s.quantity)::integer as n from public.stock_levels s where s.org_id = p_org group by s.item_id
  ), hire as (
    select sl.item_id, count(distinct s.id)::integer as n, sum(sl.quantity)::integer as qty
    from public.subrentals s join public.subrental_lines sl on sl.subrental_id = s.id
    left join public.gigs g on g.id = s.gig_id
    where s.org_id = p_org and s.status in ('confirmed', 'returned') and sl.item_id is not null
      and g.status is distinct from 'cancelled' and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_a, v_b, '[)')
    group by sl.item_id
  ), conf as (
    select r.resource_id as item_id,
           max((upper(r.period) at time zone v_tz)::date) filter (where lower(r.period) <= p_at) as last_confirmed,
           bool_or(upper(r.period) > (v_today - interval '12 months')::timestamp at time zone v_tz) as recent
    from public.reservations r
    where r.org_id = p_org and r.resource_type = 'equipment' and r.status = 'confirmed'
    group by r.resource_id
  ), rw as (
    select i.id, i.name, i.category, i.tracking, coalesce(o.n, 0) as owned, dm.*, coalesce(h.n, 0) as hire_ins,
           coalesce(h.qty, 0) as hired_units, c.last_confirmed,
           coalesce(o.n, 0) > 0 and not coalesce(c.recent, false) as idle
    from public.price_items i
    left join dem dm on dm.item_id = i.id
    left join own o on o.item_id = i.id
    left join hire h on h.item_id = i.id
    left join conf c on c.item_id = i.id
    where i.org_id = p_org and i.kind in ('rental', 'sale') and i.tracking <> 'none' and i.kit_type is distinct from 'set'
      and (i.archived_at is null or dm.item_id is not null)
      and (coalesce(o.n, 0) > 0 or dm.item_id is not null or h.item_id is not null)
  )
  select jsonb_build_object(
    'today', v_today, 'from', p_from, 'until', p_until, 'money', v_fin,
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'item_id', r.id, 'name', r.name, 'category', r.category, 'tracking', r.tracking, 'owned', r.owned,
        'peak_booked', coalesce(r.peak_booked, 0), 'peak_at', r.peak_at, 'peak_day', r.peak_day,
        'owned_at_peak', r.owned_at_peak, 'hired_at_peak', coalesce(r.hired_at_peak, 0),
        'short_at_peak', coalesce(r.short_at_peak, 0), 'days_over', coalesce(r.days_over, 0),
        'days_short', coalesce(r.days_short, 0), 'max_short', coalesce(r.max_short, 0), 'first_short', r.first_short,
        'hire_ins', r.hire_ins, 'hired_units', r.hired_units, 'last_confirmed', r.last_confirmed, 'idle', r.idle,
        'book_value', case when v_fin then (v_book -> r.id::text ->> 'v')::numeric end,
        'book_value_estimated', case when v_fin then coalesce((v_book -> r.id::text ->> 'est')::boolean, false) end)
      order by coalesce(r.days_short, 0) desc, coalesce(r.days_over, 0) desc, r.name), '[]'::jsonb))
  into v_out from rw r;
  return v_out;
end $$;
revoke execute on function public.warehouse_demand(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.warehouse_demand(uuid, date, date, timestamptz) to authenticated;

-- ── Suppliers ────────────────────────────────────────────────────────────────
-- Requests (not drafts) dated like hire-in (the gig's start date, else the subrental's start), in
-- [from, until). Confirmed counts returned ones too. Time to answer: the answer (the supplier's on
-- AVX, else when it was marked confirmed or declined) minus when it was sent (else made). Spend
-- (money only): K5's hire-in cost per line, private.equipment_hire_lines, in euros.
-- { today, money, totals: { requests, confirmed, declined, waiting, cancelled, answered,
--   median_answer_hours, spend }, suppliers: [{ supplier_id, name, ...same }] }
create or replace function public.warehouse_suppliers(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set jit = off as $$
declare v_tz text; v_fin boolean; v_spend jsonb := '{}'::jsonb; v_out jsonb;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 400);
  v_fin := private.can_see_finance(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  if v_fin then
    select coalesce(jsonb_object_agg(x.supplier_id, x.amount), '{}'::jsonb) into v_spend
    from (select s.supplier_id, round(sum(h.amount), 2) as amount
          from private.equipment_hire_lines(p_org, p_from, p_until) h join public.subrentals s on s.id = h.subrental_id
          group by s.supplier_id) x;
  end if;
  with s as (
    select s.id, s.supplier_id, s.status,
           extract(epoch from (coalesce(s.answered_at, s.decided_at) - coalesce(s.requested_at, s.created_at))) / 3600 as answer_h
    from public.subrentals s left join public.gigs g on g.id = s.gig_id
    where s.org_id = p_org and s.status <> 'draft'
      and coalesce(g.start_date, (s.starts_at at time zone v_tz)::date) >= p_from
      and coalesce(g.start_date, (s.starts_at at time zone v_tz)::date) < p_until
  ), per as (
    select s.supplier_id, count(*)::int as requests,
           count(*) filter (where s.status in ('confirmed', 'returned'))::int as confirmed,
           count(*) filter (where s.status = 'declined')::int as declined,
           count(*) filter (where s.status = 'requested')::int as waiting,
           count(*) filter (where s.status = 'cancelled')::int as cancelled,
           count(s.answer_h) filter (where s.answer_h >= 0)::int as answered,
           percentile_cont(0.5) within group (order by s.answer_h) filter (where s.answer_h >= 0) as median_h
    from s group by s.supplier_id
  ), ids as (
    select per.supplier_id from per union select (k)::uuid from jsonb_object_keys(v_spend) k
  )
  select jsonb_build_object(
    'today', private.org_today(p_org, p_at), 'money', v_fin,
    'totals', jsonb_build_object(
        'requests', (select count(*) from s), 'confirmed', (select count(*) from s where s.status in ('confirmed', 'returned')),
        'declined', (select count(*) from s where s.status = 'declined'), 'waiting', (select count(*) from s where s.status = 'requested'),
        'cancelled', (select count(*) from s where s.status = 'cancelled'),
        'answered', (select count(*) from s where s.answer_h >= 0),
        'median_answer_hours', (select round(percentile_cont(0.5) within group (order by s.answer_h)::numeric, 1) from s where s.answer_h >= 0),
        'spend', case when v_fin then (select coalesce(sum(v.value::numeric), 0) from jsonb_each_text(v_spend) v) end),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object(
        'supplier_id', ids.supplier_id, 'name', sp.name, 'archived', sp.archived_at is not null,
        'requests', coalesce(p.requests, 0), 'confirmed', coalesce(p.confirmed, 0), 'declined', coalesce(p.declined, 0),
        'waiting', coalesce(p.waiting, 0), 'cancelled', coalesce(p.cancelled, 0), 'answered', coalesce(p.answered, 0),
        'median_answer_hours', round(p.median_h::numeric, 1),
        'spend', case when v_fin then coalesce((v_spend ->> ids.supplier_id::text)::numeric, 0) end)
        order by coalesce((v_spend ->> ids.supplier_id::text)::numeric, 0) desc, coalesce(p.requests, 0) desc, sp.name)
      from ids join public.suppliers sp on sp.id = ids.supplier_id left join per p on p.supplier_id = ids.supplier_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.warehouse_suppliers(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.warehouse_suppliers(uuid, date, date, timestamptz) to authenticated;

-- ── Damage, loss and inspections ─────────────────────────────────────────────
-- Repairs opened in [from, until) (organisation's date). Cost (money only): a confirmed linked
-- expense in euros replaces the repair's cost, as K5. Charged back: the cost of repairs marked
-- "charge client"; invoiced: those already on an invoice. Days to repair: closed − reported, done
-- repairs only. Losses: units lost in the period (the day they were lost), on the gig they last
-- went out to and never came back from (undone scans left out), else no gig; bulk lost minus found
-- in the period (no gig). Value (money only): replacement value, else cost, less any payout.
-- Inspections: what is due (private.maintenance_due_all; never inspected counts as due today),
-- overdue = due before today, due in the next 30 days; done, failed and their cost in the period.
create or replace function public.warehouse_damage(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set jit = off as $$
declare v_tz text; v_fin boolean; v_today date; v_out jsonb;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 400);
  v_fin := private.can_see_finance(p_org);
  v_today := private.org_today(p_org, p_at);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  with ex as (
    select x.repair_id, x.currency, x.cost from private.expense_costs x
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed' and x.repair_id is not null
  ), rep as (
    select r.id, r.item_id, r.gig_id, g.client_id, r.quantity, r.status, r.charge_client, r.invoice_id is not null as invoiced,
           case when e.repair_id is null then coalesce(r.cost, 0) when e.currency = 'EUR' then e.cost else 0 end as cost,
           case when r.status = 'done' and r.closed_at is not null then extract(epoch from (r.closed_at - r.created_at)) / 86400 end as days
    from public.repairs r
    left join ex e on e.repair_id = r.id
    left join public.gigs g on g.id = r.gig_id
    where r.org_id = p_org and (r.created_at at time zone v_tz)::date >= p_from and (r.created_at at time zone v_tz)::date < p_until
  ), disp as (
    select d.id, d.gig_id, d.unit_id, d.direction from public.gig_dispatch d
    where d.org_id = p_org and d.undone_at is null and d.unit_id is not null
  ), lost as (
    select u.unit_id, u.item_id,
           greatest(0, coalesce(i.replacement_value, u.cost, 0) - coalesce(u.disposal_value, 0)) as value,
           (select o.gig_id from disp o where o.unit_id = u.unit_id and o.direction = 'out'
              and not exists (select 1 from disp b where b.unit_id = u.unit_id and b.direction = 'in' and b.id > o.id)
            order by o.id desc limit 1) as gig_id
    from private.equipment_units(p_org) u join public.price_items i on i.id = u.item_id
    where u.status = 'lost' and u.end_on >= p_from and u.end_on < p_until
  ), lostg as (
    select l.*, g.client_id from lost l left join public.gigs g on g.id = l.gig_id
  ), bulk as (
    select m.item_id, greatest(0, sum(case m.kind when 'lost' then m.quantity else -m.quantity end))::int as n
    from private.equipment_bulk_moves(p_org) m
    where m.kind in ('lost', 'found') and m.on_date >= p_from and m.on_date < p_until group by m.item_id
  ), due as (
    select x.item_id, x.unit_id, x.last_done, case when x.last_done is null then v_today else x.due_on end as due_on
    from private.maintenance_due_all(p_org) x
  ), ins as (
    select n.result, n.cost from public.inspections n where n.org_id = p_org and n.done_on >= p_from and n.done_on < p_until
  ), gk as (
    select rep.gig_id from rep where rep.gig_id is not null union select lostg.gig_id from lostg where lostg.gig_id is not null
  ), ck as (
    select rep.client_id from rep union select lostg.client_id from lostg
  )
  select jsonb_build_object(
    'today', v_today, 'money', v_fin,
    'repairs', jsonb_build_object(
        'count', (select count(*) from rep), 'units', coalesce((select sum(rep.quantity) from rep), 0),
        'open', (select count(*) from rep where rep.status in ('open', 'in_repair')),
        'done', (select count(*) from rep where rep.status = 'done'),
        'written_off', (select count(*) from rep where rep.status = 'written_off'),
        'median_days', (select round(percentile_cont(0.5) within group (order by rep.days)::numeric, 1) from rep where rep.days is not null),
        'average_days', (select round(avg(rep.days)::numeric, 1) from rep where rep.days is not null),
        'charged_count', (select count(*) from rep where rep.charge_client),
        'invoiced_count', (select count(*) from rep where rep.charge_client and rep.invoiced),
        'cost', case when v_fin then (select round(coalesce(sum(rep.cost), 0), 2) from rep) end,
        'charged', case when v_fin then (select round(coalesce(sum(rep.cost) filter (where rep.charge_client), 0), 2) from rep) end),
    'by_item', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'category', i.category,
        'repairs', x.n, 'units', x.units, 'open', x.open, 'median_days', x.md,
        'cost', case when v_fin then x.cost end, 'charged', case when v_fin then x.charged end) order by x.n desc, i.name)
      from (select rep.item_id, count(*)::int as n, sum(rep.quantity)::int as units,
                   count(*) filter (where rep.status in ('open', 'in_repair'))::int as open,
                   round(percentile_cont(0.5) within group (order by rep.days)::numeric, 1) as md,
                   round(sum(rep.cost), 2) as cost, round(coalesce(sum(rep.cost) filter (where rep.charge_client), 0), 2) as charged
            from rep group by rep.item_id) x join public.price_items i on i.id = x.item_id), '[]'::jsonb),
    'by_gig', coalesce((select jsonb_agg(jsonb_build_object('gig_id', g.id, 'name', g.name, 'start_date', g.start_date,
        'client_id', g.client_id, 'client', c.name,
        'repairs', (select count(*) from rep where rep.gig_id = g.id),
        'cost', case when v_fin then (select round(coalesce(sum(rep.cost), 0), 2) from rep where rep.gig_id = g.id) end,
        'charged', case when v_fin then (select round(coalesce(sum(rep.cost) filter (where rep.charge_client), 0), 2) from rep where rep.gig_id = g.id) end,
        'lost', (select count(*) from lostg where lostg.gig_id = g.id),
        'lost_value', case when v_fin then (select round(coalesce(sum(lostg.value), 0), 2) from lostg where lostg.gig_id = g.id) end)
        order by g.start_date desc nulls last, g.name)
      from gk join public.gigs g on g.id = gk.gig_id left join public.clients c on c.id = g.client_id), '[]'::jsonb),
    'by_client', coalesce((select jsonb_agg(jsonb_build_object('client_id', ck.client_id, 'name', c.name,
        'repairs', (select count(*) from rep where rep.client_id is not distinct from ck.client_id),
        'cost', case when v_fin then (select round(coalesce(sum(rep.cost), 0), 2) from rep where rep.client_id is not distinct from ck.client_id) end,
        'charged', case when v_fin then (select round(coalesce(sum(rep.cost) filter (where rep.charge_client), 0), 2) from rep where rep.client_id is not distinct from ck.client_id) end,
        'lost', (select count(*) from lostg where lostg.client_id is not distinct from ck.client_id),
        'lost_value', case when v_fin then (select round(coalesce(sum(lostg.value), 0), 2) from lostg where lostg.client_id is not distinct from ck.client_id) end)
        order by c.name nulls last)
      from ck left join public.clients c on c.id = ck.client_id), '[]'::jsonb),
    'losses', jsonb_build_object(
        'units', (select count(*) from lostg), 'bulk', coalesce((select sum(bulk.n) from bulk), 0),
        'on_gigs', (select count(*) from lostg where lostg.gig_id is not null),
        'value', case when v_fin then round((select coalesce(sum(lostg.value), 0) from lostg)
            + (select coalesce(sum(bulk.n * coalesce(i.replacement_value, 0)), 0) from bulk join public.price_items i on i.id = bulk.item_id), 2) end,
        'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'units', x.n,
            'value', case when v_fin then round(x.v, 2) end) order by x.n desc, i.name)
          from (select y.item_id, sum(y.n)::int as n, sum(y.v) as v from (
                  select lostg.item_id, 1 as n, lostg.value as v from lostg
                  union all
                  select bulk.item_id, bulk.n, bulk.n * coalesce(pi.replacement_value, 0) from bulk join public.price_items pi on pi.id = bulk.item_id where bulk.n > 0
                ) y group by y.item_id) x join public.price_items i on i.id = x.item_id), '[]'::jsonb)),
    'inspections', jsonb_build_object(
        'overdue', (select count(*) from due where due.due_on < v_today),
        'due_now', (select count(*) from due where due.due_on <= v_today),
        'never', (select count(*) from due where due.last_done is null),
        'due_30', (select count(*) from due where due.due_on >= v_today and due.due_on < v_today + 30),
        'done', (select count(*) from ins), 'failed', (select count(*) from ins where ins.result = 'fail'),
        'cost', case when v_fin then (select round(coalesce(sum(ins.cost), 0), 2) from ins) end,
        'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'overdue', x.overdue,
            'due_30', x.due_30, 'never', x.never, 'next_due', x.next_due) order by x.overdue desc, x.next_due, i.name)
          from (select due.item_id, count(*) filter (where due.due_on < v_today)::int as overdue,
                       count(*) filter (where due.due_on >= v_today and due.due_on < v_today + 30)::int as due_30,
                       count(*) filter (where due.last_done is null)::int as never, min(due.due_on) as next_due
                from due group by due.item_id) x join public.price_items i on i.id = x.item_id
          where x.overdue > 0 or x.due_30 > 0 or x.never > 0), '[]'::jsonb))
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.warehouse_damage(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.warehouse_damage(uuid, date, date, timestamptz) to authenticated;

-- ── Dispatch ─────────────────────────────────────────────────────────────────
-- Gigs starting in [from, until), not cancelled, with equipment planned or scanned. "Prepped" =
-- scanned out (the owner's answer). Per item: short = planned − out (when more was planned),
-- missing = out − back; undone scans left out. Left: the gig's start date − the day of its first
-- out scan (organisation's dates; negative when gear went out after the start). Scans per day:
-- every scan in the period (not undone, not on a cancelled gig), by the organisation's date.
create or replace function public.warehouse_dispatch(p_org uuid, p_from date, p_until date, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set jit = off as $$
declare v_tz text; v_today date; v_out jsonb;
begin
  perform private.require_ops(p_org);
  perform private.ops_period(p_from, p_until, 400);
  v_today := private.org_today(p_org, p_at);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  with gg as (
    select g.id, g.name, g.start_date, g.end_date, g.status from public.gigs g
    where g.org_id = p_org and g.status <> 'cancelled' and g.start_date >= p_from and g.start_date < p_until
  ), disp as (
    select d.gig_id, d.item_id, d.direction, d.quantity, d.created_at from public.gig_dispatch d
    where d.gig_id in (select gg.id from gg) and d.undone_at is null
  ), per_item as (
    select x.gig_id, x.item_id, sum(x.planned)::int as planned, sum(x.out_q)::int as out_q, sum(x.back_q)::int as back_q from (
      select e.gig_id, e.item_id, e.quantity as planned, 0 as out_q, 0 as back_q from public.gig_equipment e where e.gig_id in (select gg.id from gg)
      union all
      select disp.gig_id, disp.item_id, 0, case when disp.direction = 'out' then disp.quantity else 0 end,
             case when disp.direction = 'in' then disp.quantity else 0 end from disp
    ) x group by x.gig_id, x.item_id
  ), per_gig as (
    select gg.id, gg.name, gg.start_date, gg.end_date, gg.status,
           coalesce(gg.end_date, gg.start_date) < v_today as ended,
           sum(p.planned)::int as planned, sum(p.out_q)::int as out_q, sum(p.back_q)::int as back_q,
           sum(greatest(p.planned - p.out_q, 0))::int as short_out, sum(greatest(p.out_q - p.back_q, 0))::int as missing,
           (select min(disp.created_at) from disp where disp.gig_id = gg.id and disp.direction = 'out') as first_out
    from gg join per_item p on p.gig_id = gg.id
    group by gg.id, gg.name, gg.start_date, gg.end_date, gg.status
  ), g2 as (
    select pg.*, pg.start_date - (pg.first_out at time zone v_tz)::date as lead_days from per_gig pg
  ), scans as (
    select (d.created_at at time zone v_tz)::date as day, count(*)::int as scans, sum(d.quantity)::int as units,
           count(*) filter (where d.direction = 'out')::int as scans_out, count(*) filter (where d.direction = 'in')::int as scans_in
    from public.gig_dispatch d join public.gigs g on g.id = d.gig_id
    where d.org_id = p_org and d.undone_at is null and g.status <> 'cancelled'
      and (d.created_at at time zone v_tz)::date >= p_from and (d.created_at at time zone v_tz)::date < p_until
    group by 1
  )
  select jsonb_build_object(
    'today', v_today,
    'totals', jsonb_build_object(
        'gigs', (select count(*) from g2), 'planned', coalesce((select sum(g2.planned) from g2), 0),
        'out', coalesce((select sum(g2.out_q) from g2), 0), 'back', coalesce((select sum(g2.back_q) from g2), 0),
        'short_out', coalesce((select sum(g2.short_out) from g2), 0),
        'missing', coalesce((select sum(g2.missing) from g2 where g2.ended), 0),
        'gigs_missing', (select count(*) from g2 where g2.ended and g2.missing > 0),
        'scans', coalesce((select sum(scans.scans) from scans), 0),
        'busiest_day', (select jsonb_build_object('day', s.day, 'scans', s.scans) from scans s order by s.scans desc, s.day limit 1),
        'median_lead_days', (select percentile_cont(0.5) within group (order by g2.lead_days) from g2 where g2.lead_days is not null),
        'lead', jsonb_build_object(
            'after', (select count(*) from g2 where g2.lead_days < 0), 'same_day', (select count(*) from g2 where g2.lead_days = 0),
            'one', (select count(*) from g2 where g2.lead_days = 1), 'two_three', (select count(*) from g2 where g2.lead_days between 2 and 3),
            'more', (select count(*) from g2 where g2.lead_days > 3))),
    'gigs', coalesce((select jsonb_agg(jsonb_build_object('gig_id', g2.id, 'name', g2.name, 'start_date', g2.start_date,
        'end_date', g2.end_date, 'ended', g2.ended, 'planned', g2.planned, 'out', g2.out_q, 'back', g2.back_q,
        'short_out', g2.short_out, 'missing', g2.missing, 'first_out', g2.first_out, 'lead_days', g2.lead_days)
        order by g2.start_date, g2.name) from g2), '[]'::jsonb),
    'scans_by_day', coalesce((select jsonb_agg(to_jsonb(scans) order by scans.day) from scans), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.warehouse_dispatch(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.warehouse_dispatch(uuid, date, date, timestamptz) to authenticated;

-- ── Overview tiles (K6's own; report_overview stays as it is) ────────────────
-- { items_short_30: items still short (after hire-in) on some day from today to 29 days ahead,
--   units_in_repair: units and bulk quantities in repair now, inspections_overdue: due before
--   today, never_inspected: never inspected (due now) }
create or replace function public.report_overview_k6(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = '' set jit = off as $$
declare v_today date; v_out jsonb;
begin
  perform private.require_ops(p_org);
  v_today := private.org_today(p_org, p_at);
  select jsonb_build_object(
    'items_short_30', (select count(*) from private.warehouse_demand_rows(p_org, v_today, v_today + 30) d where d.days_short > 0),
    'units_in_repair', coalesce((select sum(t.in_repair) from public.stock_totals t where t.org_id = p_org), 0),
    'inspections_overdue', (select count(*) from private.maintenance_due_all(p_org) x where x.last_done is not null and x.due_on < v_today),
    'never_inspected', (select count(*) from private.maintenance_due_all(p_org) x where x.last_done is null)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.report_overview_k6(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview_k6(uuid, timestamptz) to authenticated;
