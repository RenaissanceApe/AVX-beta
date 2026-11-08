-- K5 (docs/ANALYTICS.md): equipment money. Functions only, no new tables.
--
-- - private.set_shares(org): how a set's revenue is shared out to its contents (sets inside sets
--   followed through), by their day prices (quantity × the content's price); contents with no
--   price at all share by quantity. Decided with the owner (2026-11-08).
-- - private.equipment_revenue(org, from, until): rental lines of accepted quotes (the K1 rule,
--   report_revenue_lines) per item, sets shared out; lines typed by hand have no item.
-- - private.equipment_units / equipment_bulk_moves: when each unit and bulk quantity was owned.
-- - private.equipment_depreciation(org, from, until): the K2 straight-line rule per unit and bulk
--   purchase (purchase cost, else the item's cost price as an estimate; months of the unit, else
--   the item's, else 60).
-- - private.equipment_hire_lines(org, from, until): hire-in cost per subrental line (the supplier's
--   price or a linked expense shared out over the lines by their cost, else by quantity).
-- - public.equipment_money(org, from, until, currency): profit per item in a period.
-- - public.equipment_unit_money(org, from, until, item): profit per unit.
-- - public.equipment_payback(org, item, at): payback per item and unit.
-- - public.equipment_buy_or_hire(org, at): hire-in over 12 months against the cost to buy.
-- - public.item_money_card(item, at): the numbers card on the item page.
-- - public.report_overview_k5(org, at): the K5 Overview tiles (best and worst earners this year,
--   hire-in spend this year), its own function beside report_overview.
-- Owner's answers (2026-11-08): sets shared by day price; write-off period 60 months unless set;
-- profit carries no share of labour. Costs are in euros, as in K2; for another currency only the
-- revenue is shown.
-- Everything runs as the reader (security invoker) and calls private.require_finance.
-- Written without destructive statements.

-- ── How a set's revenue is shared ────────────────────────────────────────────
create or replace function private.set_shares(p_org uuid)
returns table(set_id uuid, item_id uuid, share numeric)
language sql stable security invoker set search_path = '' as $$
  with recursive parts as (
    select p.parent_id, p.child_id, p.quantity::numeric as qty, coalesce(c.unit_price, 0) as price, c.kit_type
    from public.item_parts p
    join public.price_items s on s.id = p.parent_id and s.kit_type = 'set'
    join public.price_items c on c.id = p.child_id
    where p.org_id = p_org and p.kind = 'content'
  ), w as (
    select parts.parent_id, parts.child_id, parts.kit_type,
           case when sum(parts.qty * parts.price) over (partition by parts.parent_id) > 0
                then parts.qty * parts.price / sum(parts.qty * parts.price) over (partition by parts.parent_id)
                else parts.qty / sum(parts.qty) over (partition by parts.parent_id) end as frac
    from parts
  ), walk(set_id, item_id, share, kit_type, depth) as (
    select w.parent_id, w.child_id, w.frac, w.kit_type, 1 from w
    union all
    select walk.set_id, w.child_id, walk.share * w.frac, w.kit_type, walk.depth + 1
    from walk join w on w.parent_id = walk.item_id
    where walk.kit_type = 'set' and walk.depth < 10
  )
  -- a set inside a set with no contents of its own keeps its share
  select walk.set_id, walk.item_id, sum(walk.share)
  from walk
  where coalesce(walk.kit_type, '') <> 'set' or not exists (select 1 from w x where x.parent_id = walk.item_id)
  group by walk.set_id, walk.item_id
$$;

-- ── Equipment revenue (the K1 rule, rental lines, sets shared out) ───────────
-- item_id is null for lines typed by hand (no catalogue item): "not linked to an item"
create or replace function private.equipment_revenue(p_org uuid, p_from date, p_until date)
returns table(item_id uuid, currency text, report_date date, amount numeric, via_set boolean)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
begin
  perform private.require_finance(p_org);
  return query
  with sh as (select * from private.set_shares(p_org)),
  l as (
    select i.id as known, r.currency, r.report_date, r.amount
    from public.report_revenue_lines(p_org, p_from, p_until) r
    left join public.price_items i on i.id = r.item_id and i.org_id = p_org
    where r.kind = 'rental'
  )
  select coalesce(sh.item_id, l.known), l.currency, l.report_date, l.amount * coalesce(sh.share, 1), sh.set_id is not null
  from l left join sh on sh.set_id = l.known;
end $$;

-- ── When each unit was owned ─────────────────────────────────────────────────
-- From the purchase date (else the day it was added) until the day it was lost or retired (a unit
-- found again has its disposal cleared, so it was never gone).
create or replace function private.equipment_units(p_org uuid)
returns table(unit_id uuid, item_id uuid, code text, serial text, status text, start_on date, end_on date,
              purchase_cost numeric, cost numeric, estimated boolean, months integer, disposal_value numeric)
language sql stable security invoker set search_path = '' as $$
  select u.id, u.item_id, u.code, u.serial, u.status,
         coalesce(u.purchase_date, (u.created_at at time zone tz.z)::date),
         case when u.status in ('lost', 'retired') then coalesce(u.disposed_on, (u.updated_at at time zone tz.z)::date) end,
         u.purchase_cost, coalesce(u.purchase_cost, i.cost_price), u.purchase_cost is null,
         greatest(1, coalesce(u.depreciation_months, i.depreciation_months, 60)), u.disposal_value
  from public.stock_units u
  join public.price_items i on i.id = u.item_id
  cross join (select coalesce((select o.time_zone from public.organisations o where o.id = p_org), 'UTC') as z) tz
  where u.org_id = p_org
$$;

-- Bulk movements that change what is owned (+ bought, found, counted up; − sold, lost, retired,
-- counted down), dated in the organisation's time zone
create or replace function private.equipment_bulk_moves(p_org uuid)
returns table(item_id uuid, on_date date, delta integer, kind text, quantity integer, unit_cost numeric)
language sql stable security invoker set search_path = '' as $$
  select m.item_id, (m.created_at at time zone tz.z)::date,
         ((m.to_location_id is not null)::int - (m.from_location_id is not null)::int) * m.quantity,
         m.kind, m.quantity, m.unit_cost
  from public.stock_movements m
  cross join (select coalesce((select o.time_zone from public.organisations o where o.id = p_org), 'UTC') as z) tz
  where m.org_id = p_org and m.unit_id is null and m.kind in ('purchase', 'found', 'correction', 'sale', 'lost', 'retire')
$$;

-- ── Depreciation per unit and bulk purchase (the K2 rule) ────────────────────
-- An equal share each month from the month it starts, prorated by the days of each month inside the
-- period; units stop after the month they were lost or retired. unit_id is null for bulk purchases.
create or replace function private.equipment_depreciation(p_org uuid, p_from date, p_until date)
returns table(item_id uuid, unit_id uuid, amount numeric, estimated numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
begin
  perform private.require_finance(p_org);
  return query
  with a as (
    select u.item_id, u.unit_id, u.cost, u.estimated as est, u.start_on, u.months, u.end_on
    from private.equipment_units(p_org) u
    union all
    select m.item_id, null::uuid, m.unit_cost * m.quantity, false, m.on_date, greatest(1, coalesce(i.depreciation_months, 60)), null::date
    from private.equipment_bulk_moves(p_org) m
    join public.price_items i on i.id = m.item_id
    where m.kind = 'purchase' and m.unit_cost is not null
  ), b as (
    select a.*, date_trunc('month', a.start_on)::date as m0,
           (extract(year from a.start_on) * 12 + extract(month from a.start_on))::int as i0
    from a where a.cost > 0 and a.start_on < p_until
  ), s as (
    select b.item_id, b.unit_id, b.est, b.cost / b.months as share, (b.m0 + make_interval(months => k))::date as mo
    from b
    cross join lateral generate_series(
      greatest(0, (extract(year from p_from) * 12 + extract(month from p_from))::int - b.i0),
      least(b.months - 1,
            (extract(year from p_until - 1) * 12 + extract(month from p_until - 1))::int - b.i0,
            coalesce((extract(year from b.end_on) * 12 + extract(month from b.end_on))::int - b.i0, b.months - 1))) k
  ), p as (
    select s.item_id, s.unit_id, s.est,
           s.share * (least((s.mo + interval '1 month')::date, p_until) - greatest(s.mo, p_from))
                   / ((s.mo + interval '1 month')::date - s.mo) as v
    from s
  )
  select p.item_id, p.unit_id, round(sum(p.v), 2), round(coalesce(sum(p.v) filter (where p.est), 0), 2)
  from p where p.v > 0
  group by p.item_id, p.unit_id;
end $$;

-- ── Hire-in per subrental line ───────────────────────────────────────────────
-- Confirmed or returned subrentals (or any with a confirmed expense linked), dated by their gig's
-- start date, else their own start, in [from, until). Their cost (a linked expense in euros, else the
-- supplier's price, else the lines) is shared over the lines by each line's cost, else by quantity.
-- Euros only. item_id is null on lines typed by hand.
create or replace function private.equipment_hire_lines(p_org uuid, p_from date, p_until date)
returns table(subrental_id uuid, item_id uuid, on_date date, quantity integer, amount numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform private.require_finance(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with ex as (
    select x.subrental_id, x.currency, x.cost from private.expense_costs x
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed' and x.subrental_id is not null
  ), s as (
    select s.id, coalesce(g.start_date, (s.starts_at at time zone v_tz)::date) as on_date,
           case when e.subrental_id is null then coalesce(s.quoted_total,
                  (select coalesce(sum(sl.quantity * coalesce(sl.unit_cost, 0)), 0) from public.subrental_lines sl where sl.subrental_id = s.id))
                when e.currency = 'EUR' then e.cost else 0 end as total
    from public.subrentals s
    left join public.gigs g on g.id = s.gig_id
    left join ex e on e.subrental_id = s.id
    where s.org_id = p_org and (s.status in ('confirmed', 'returned') or e.subrental_id is not null)
  ), l as (
    select sl.subrental_id, sl.item_id, sl.quantity, s.on_date, s.total,
           sl.quantity * coalesce(sl.unit_cost, 0) as w,
           sum(sl.quantity * coalesce(sl.unit_cost, 0)) over (partition by sl.subrental_id) as tw,
           sum(sl.quantity) over (partition by sl.subrental_id) as tq
    from public.subrental_lines sl join s on s.id = sl.subrental_id
    where s.on_date >= p_from and s.on_date < p_until
  )
  select l.subrental_id, l.item_id, l.on_date, l.quantity,
         l.total * case when l.tw > 0 then l.w / l.tw else l.quantity::numeric / l.tq end
  from l;
end $$;

do $$
declare f text;
begin
  foreach f in array array['set_shares(uuid)', 'equipment_revenue(uuid, date, date)', 'equipment_units(uuid)',
                           'equipment_bulk_moves(uuid)', 'equipment_depreciation(uuid, date, date)',
                           'equipment_hire_lines(uuid, date, date)'] loop
    execute format('revoke execute on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

-- ── Profit per item ──────────────────────────────────────────────────────────
-- One row per item with stock (or anything to count) in [from, until), plus one row with an empty
-- item_id for rental lines typed by hand ("not linked to an item"), so the rows add up to the
-- equipment revenue. profit = revenue − depreciation − repairs not charged − inspections − hire-in
-- − losses (lost units at replacement value less any payout; bulk lost minus found, as I7).
-- Repairs are dated when opened, inspections when done, losses when the unit was lost.
-- Costs in euros: for another currency only the revenue is filled in. The browser passes today + 1
-- as until while a period runs, as K2 does.
create or replace function public.equipment_money(p_org uuid, p_from date, p_until date, p_currency text default 'EUR')
returns table(item_id uuid, name text, category text, tracking text, owned integer, units integer, units_with_cost integer,
              has_cost boolean, revenue numeric, revenue_sets numeric, depreciation numeric, depreciation_estimated numeric,
              repairs numeric, inspections numeric, hire_in numeric, losses numeric, profit numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_tz text; v_eur boolean := coalesce(p_currency, 'EUR') = 'EUR';
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with rev as (
    select r.item_id, sum(r.amount) as amount, coalesce(sum(r.amount) filter (where r.via_set), 0) as sets
    from private.equipment_revenue(p_org, p_from, p_until) r
    where r.currency = coalesce(p_currency, 'EUR')
    group by r.item_id
  ), dep as (
    select d.item_id, sum(d.amount) as amount, sum(d.estimated) as est
    from private.equipment_depreciation(p_org, p_from, p_until) d where v_eur group by d.item_id
  ), ex as (
    select x.repair_id, x.currency, x.cost from private.expense_costs x
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed' and x.repair_id is not null
  ), rep as (
    select r.item_id, sum(case when e.repair_id is null then coalesce(r.cost, 0) when e.currency = 'EUR' then e.cost else 0 end) as amount
    from public.repairs r left join ex e on e.repair_id = r.id
    where v_eur and r.org_id = p_org and not r.charge_client
      and (r.created_at at time zone v_tz)::date >= p_from and (r.created_at at time zone v_tz)::date < p_until
    group by r.item_id
  ), ins as (
    select n.item_id, sum(coalesce(n.cost, 0)) as amount from public.inspections n
    where v_eur and n.org_id = p_org and n.done_on >= p_from and n.done_on < p_until
    group by n.item_id
  ), hire as (
    select h.item_id, sum(h.amount) as amount from private.equipment_hire_lines(p_org, p_from, p_until) h
    where v_eur and h.item_id is not null group by h.item_id
  ), units as (
    select u.item_id, count(*) filter (where u.end_on is null)::int as live,
           count(*) filter (where u.end_on is null and u.purchase_cost is not null)::int as with_cost,
           coalesce(sum(greatest(0, coalesce(i.replacement_value, u.cost, 0) - coalesce(u.disposal_value, 0)))
                    filter (where v_eur and u.status = 'lost' and u.end_on >= p_from and u.end_on < p_until), 0) as lost
    from private.equipment_units(p_org) u join public.price_items i on i.id = u.item_id
    group by u.item_id
  ), bulk as (
    select m.item_id, bool_or(m.kind = 'purchase' and m.unit_cost is not null) as has_cost,
           greatest(0, coalesce(sum(case m.kind when 'lost' then m.quantity when 'found' then -m.quantity end)
                                filter (where m.on_date >= p_from and m.on_date < p_until), 0)) as lost
    from private.equipment_bulk_moves(p_org) m group by m.item_id
  ), own as (
    select s.item_id, sum(s.quantity)::integer as n from public.stock_levels s where s.org_id = p_org group by s.item_id
  ), fig as (
    select i.id, i.name, i.category, i.tracking, coalesce(o.n, 0) as owned, coalesce(u.live, 0) as live, coalesce(u.with_cost, 0) as with_cost,
           case when i.cost_price is not null then true
                when i.tracking = 'serial' then coalesce(u.live, 0) > 0 and u.with_cost = u.live
                else coalesce(b.has_cost, false) end as has_cost,
           round(coalesce(v.amount, 0), 2) as revenue, round(coalesce(v.sets, 0), 2) as sets,
           coalesce(d.amount, 0) as dep, coalesce(d.est, 0) as dep_est,
           round(coalesce(p.amount, 0), 2) as rep, round(coalesce(n.amount, 0), 2) as ins, round(coalesce(h.amount, 0), 2) as hire,
           round(coalesce(u.lost, 0) + case when v_eur then coalesce(b.lost, 0) * coalesce(i.replacement_value, 0) else 0 end, 2) as lost,
           i.kind in ('rental', 'sale') and i.tracking <> 'none' and i.kit_type is distinct from 'set' and i.archived_at is null as stock
    from public.price_items i
    left join rev v on v.item_id = i.id
    left join dep d on d.item_id = i.id
    left join rep p on p.item_id = i.id
    left join ins n on n.item_id = i.id
    left join hire h on h.item_id = i.id
    left join units u on u.item_id = i.id
    left join bulk b on b.item_id = i.id
    left join own o on o.item_id = i.id
    where i.org_id = p_org
  )
  select r.id, r.name, r.category, r.tracking, r.owned, r.live, r.with_cost, r.has_cost, r.revenue, r.sets,
         r.dep, r.dep_est, r.rep, r.ins, r.hire, r.lost, r.revenue - r.dep - r.rep - r.ins - r.hire - r.lost
  from fig r
  where r.stock or r.revenue <> 0 or r.dep <> 0 or r.rep <> 0 or r.ins <> 0 or r.hire <> 0 or r.lost <> 0
  union all
  select null, null, null, null, 0, 0, 0, false, round(v.amount, 2), 0, 0, 0, 0, 0, 0, 0, round(v.amount, 2)
  from rev v where v.item_id is null and v.amount <> 0
  order by 2 nulls last, 1;
end $$;
revoke execute on function public.equipment_money(uuid, date, date, text) from public, anon;
grant execute on function public.equipment_money(uuid, date, date, text) to authenticated;

-- ── Profit per unit ──────────────────────────────────────────────────────────
-- Each unit's share of its item's revenue is by the days it was owned in the period against all the
-- item's owned unit-days (units and bulk), so a unit bought mid-period gets a smaller share. Its own
-- depreciation, repairs and inspections on that unit, and its loss. Hire-in and bulk costs stay on
-- the item. Euros.
create or replace function public.equipment_unit_money(p_org uuid, p_from date, p_until date, p_item uuid default null)
returns table(unit_id uuid, item_id uuid, item_name text, code text, serial text, status text, start_on date,
              purchase_cost numeric, owned_days integer, revenue numeric, depreciation numeric, depreciation_estimated numeric,
              repairs numeric, inspections numeric, losses numeric, profit numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with u as (
    select u.*, greatest(0, least(coalesce(u.end_on, p_until), p_until) - greatest(u.start_on, p_from)) as days
    from private.equipment_units(p_org) u where p_item is null or u.item_id = p_item
  ), bulk_days as (
    select m.item_id, greatest(0, sum(m.delta * greatest(0, p_until - greatest(m.on_date, p_from)))) as days
    from private.equipment_bulk_moves(p_org) m where p_item is null or m.item_id = p_item group by m.item_id
  ), tot as (
    select u.item_id, sum(u.days) + coalesce(max(b.days), 0) as days
    from u left join bulk_days b on b.item_id = u.item_id group by u.item_id
  ), rev as (
    select r.item_id, sum(r.amount) as amount from private.equipment_revenue(p_org, p_from, p_until) r
    where r.currency = 'EUR' and r.item_id in (select u.item_id from u) group by r.item_id
  ), dep as (
    select d.unit_id, d.amount, d.estimated from private.equipment_depreciation(p_org, p_from, p_until) d where d.unit_id is not null
  ), ex as (
    select x.repair_id, x.currency, x.cost from private.expense_costs x
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed' and x.repair_id is not null
  ), rep as (
    select r.unit_id, sum(case when e.repair_id is null then coalesce(r.cost, 0) when e.currency = 'EUR' then e.cost else 0 end) as amount
    from public.repairs r left join ex e on e.repair_id = r.id
    where r.org_id = p_org and r.unit_id is not null and not r.charge_client
      and (r.created_at at time zone v_tz)::date >= p_from and (r.created_at at time zone v_tz)::date < p_until
    group by r.unit_id
  ), ins as (
    select n.unit_id, sum(coalesce(n.cost, 0)) as amount from public.inspections n
    where n.org_id = p_org and n.unit_id is not null and n.done_on >= p_from and n.done_on < p_until group by n.unit_id
  ), fig as (
    select u.unit_id, u.item_id, i.name, u.code, u.serial, u.status, u.start_on, u.purchase_cost, u.days,
           round(case when t.days > 0 then coalesce(v.amount, 0) * u.days / t.days else 0 end, 2) as revenue,
           coalesce(d.amount, 0) as dep, coalesce(d.estimated, 0) as est,
           round(coalesce(p.amount, 0), 2) as rep, round(coalesce(n.amount, 0), 2) as ins,
           round(case when u.status = 'lost' and u.end_on >= p_from and u.end_on < p_until
                      then greatest(0, coalesce(i.replacement_value, u.cost, 0) - coalesce(u.disposal_value, 0)) else 0 end, 2) as lost
    from u
    join public.price_items i on i.id = u.item_id
    left join tot t on t.item_id = u.item_id
    left join rev v on v.item_id = u.item_id
    left join dep d on d.unit_id = u.unit_id
    left join rep p on p.unit_id = u.unit_id
    left join ins n on n.unit_id = u.unit_id
    where u.days > 0 or d.amount is not null or p.amount is not null or n.amount is not null
  )
  select r.unit_id, r.item_id, r.name, r.code, r.serial, r.status, r.start_on, r.purchase_cost, r.days::int,
         r.revenue, r.dep, r.est, r.rep, r.ins, r.lost, r.revenue - r.dep - r.rep - r.ins - r.lost
  from fig r
  order by r.name, r.code;
end $$;
revoke execute on function public.equipment_unit_money(uuid, date, date, uuid) from public, anon;
grant execute on function public.equipment_unit_money(uuid, date, date, uuid) to authenticated;

-- ── Payback per item and unit ────────────────────────────────────────────────
-- Revenue since purchase (euros, up to today, by the K1 rule with sets shared out) against the
-- purchase cost. Item: every unit's cost (purchase cost, else the item's cost price: estimated) and
-- every bulk purchase's cost, revenue from its first purchase. Unit: each revenue line shared equally
-- between what was owned that day (units and bulk), from the unit's purchase until it was lost or
-- retired. paid_back_on: the report date on which the running revenue reached the cost. Not yet:
-- expected_on at the pace of the last 12 months (or since purchase, when shorter); none for a unit
-- that was lost or retired.
create or replace function public.equipment_payback(p_org uuid, p_item uuid default null, p_at timestamptz default now())
returns table(level text, item_id uuid, unit_id uuid, code text, name text, category text, since date, cost numeric,
              estimated boolean, revenue numeric, ratio numeric, paid_back_on date, pace_month numeric, expected_on date)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_today date;
begin
  perform private.require_finance(p_org);
  v_today := private.org_today(p_org, p_at);
  return query
  with u as (
    select * from private.equipment_units(p_org) u where p_item is null or u.item_id = p_item
  ), bm as (
    select * from private.equipment_bulk_moves(p_org) m where p_item is null or m.item_id = p_item
  ), costs as (
    select x.item_id, sum(x.cost) as cost, bool_or(x.est) as est, min(x.start_on) as since from (
      select u.item_id, u.cost, u.estimated as est, u.start_on from u where u.cost is not null
      union all
      select bm.item_id, bm.unit_cost * bm.quantity, false, bm.on_date from bm where bm.kind = 'purchase' and bm.unit_cost is not null
    ) x group by x.item_id
  ), lines as (
    select r.item_id, r.report_date as d, sum(r.amount) as amount
    from private.equipment_revenue(p_org, date '1900-01-01', v_today + 1) r
    where r.currency = 'EUR' and r.item_id is not null and (p_item is null or r.item_id = p_item)
    group by r.item_id, r.report_date
  ), item_lines as (
    select l.item_id, l.d, l.amount, c.cost,
           sum(l.amount) over (partition by l.item_id order by l.d rows unbounded preceding) as run
    from lines l join costs c on c.item_id = l.item_id where l.d >= c.since
  ), items as (
    select c.item_id, c.since, c.cost, c.est,
           coalesce((select sum(il.amount) from item_lines il where il.item_id = c.item_id), 0) as revenue,
           (select min(il.d) from item_lines il where il.item_id = c.item_id and il.run >= c.cost) as paid,
           coalesce((select sum(il.amount) from item_lines il where il.item_id = c.item_id and il.d > v_today - 365), 0) as recent,
           least(365, v_today - c.since + 1) as window_days
    from costs c
  ), owned as (
    -- what was owned on each day with revenue
    select l.item_id, l.d,
           (select count(*) from u where u.item_id = l.item_id and u.start_on <= l.d and (u.end_on is null or l.d < u.end_on))
           + coalesce((select sum(bm.delta) from bm where bm.item_id = l.item_id and bm.on_date <= l.d), 0) as n
    from lines l
  ), unit_lines as (
    select u.unit_id, l.d, l.amount / o.n as amount,
           sum(l.amount / o.n) over (partition by u.unit_id order by l.d rows unbounded preceding) as run
    from u
    join lines l on l.item_id = u.item_id and l.d >= u.start_on and (u.end_on is null or l.d < u.end_on)
    join owned o on o.item_id = l.item_id and o.d = l.d and o.n > 0
  ), units as (
    select u.unit_id, u.item_id, u.code, u.start_on, u.end_on, u.cost, u.estimated,
           coalesce((select sum(ul.amount) from unit_lines ul where ul.unit_id = u.unit_id), 0) as revenue,
           (select min(ul.d) from unit_lines ul where ul.unit_id = u.unit_id and ul.run >= u.cost) as paid,
           coalesce((select sum(ul.amount) from unit_lines ul where ul.unit_id = u.unit_id and ul.d > v_today - 365), 0) as recent,
           least(365, coalesce(u.end_on - 1, v_today) - u.start_on + 1) as window_days
    from u where u.cost is not null and u.cost > 0
  ), res as (
    select 'item'::text as level, x.item_id, null::uuid as unit_id, null::text as code, x.since, x.cost, x.est,
           x.revenue, x.paid, x.recent, x.window_days, null::date as end_on
    from items x where x.cost > 0
    union all
    select 'unit', y.item_id, y.unit_id, y.code, y.start_on, y.cost, y.estimated, y.revenue, y.paid, y.recent, y.window_days, y.end_on
    from units y
  )
  select o.level, o.item_id, o.unit_id, o.code, i.name, i.category, o.since, round(o.cost, 2), o.est,
         round(o.revenue, 2), round(o.revenue / o.cost, 4), o.paid,
         case when o.window_days > 0 then round(o.recent / o.window_days * 365 / 12, 2) end,
         case when o.paid is null and o.end_on is null and o.window_days > 0 and o.recent > 0
              then v_today + ceil((o.cost - o.revenue) / (o.recent / o.window_days))::int end
  from res o join public.price_items i on i.id = o.item_id
  order by i.name, o.item_id, o.level, o.code;
end $$;
revoke execute on function public.equipment_payback(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.equipment_payback(uuid, uuid, timestamptz) to authenticated;

-- ── Buy or keep hiring in ────────────────────────────────────────────────────
-- Per item hired in over the last 12 months (up to today): the hire-in spend, how many hire-ins, the
-- most hired at once (in one subrental), the price to buy one (cost price, else replacement value),
-- the cost to buy that many and the months the spend would take to pay it back. Euros.
create or replace function public.equipment_buy_or_hire(p_org uuid, p_at timestamptz default now())
returns table(item_id uuid, name text, category text, owned integer, hire_ins integer, peak integer, spend numeric,
              unit_price numeric, price_source text, cost_to_buy numeric, months_to_pay_back numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_today date;
begin
  perform private.require_finance(p_org);
  v_today := private.org_today(p_org, p_at);
  return query
  with h as (
    select h.item_id, h.subrental_id, sum(h.quantity) as qty, sum(h.amount) as amount
    from private.equipment_hire_lines(p_org, (v_today - interval '12 months')::date + 1, v_today + 1) h
    where h.item_id is not null group by h.item_id, h.subrental_id
  ), t as (
    select h.item_id, count(*)::int as n, max(h.qty)::int as peak, sum(h.amount) as spend from h group by h.item_id
  ), own as (
    select s.item_id, sum(s.quantity)::integer as n from public.stock_levels s where s.org_id = p_org group by s.item_id
  )
  select i.id, i.name, i.category, coalesce(o.n, 0), t.n, t.peak, round(t.spend, 2),
         coalesce(i.cost_price, i.replacement_value),
         case when i.cost_price is not null then 'cost' when i.replacement_value is not null then 'replacement' end,
         round(coalesce(i.cost_price, i.replacement_value) * t.peak, 2),
         case when t.spend > 0 and coalesce(i.cost_price, i.replacement_value) is not null
              then round(coalesce(i.cost_price, i.replacement_value) * t.peak / (t.spend / 12), 1) end
  from t join public.price_items i on i.id = t.item_id
  left join own o on o.item_id = i.id
  order by 11 nulls last, 7 desc;
end $$;
revoke execute on function public.equipment_buy_or_hire(uuid, timestamptz) from public, anon;
grant execute on function public.equipment_buy_or_hire(uuid, timestamptz) to authenticated;

-- ── The item page's numbers card ─────────────────────────────────────────────
-- { today, lifetime_revenue: {currency: amount} (up to today), payback: {cost, revenue, ratio,
--   paid_back_on, expected_on, estimated} or null, use_12m: 0–1 or null, owned,
--   next_bookings: [{gig_id, gig_name, starts_at, quantity}] (3 at most), upcoming: count }
create or replace function public.item_money_card(p_item uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_org uuid; v_tz text; v_today date; v_from timestamptz; v_until timestamptz; v_owned integer; v_out jsonb;
begin
  select i.org_id into v_org from public.price_items i where i.id = p_item;
  perform private.require_finance(v_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = v_org;
  v_today := private.org_today(v_org, p_at);
  v_from := ((v_today - interval '12 months')::date + 1)::timestamp at time zone v_tz;
  v_until := (v_today + 1)::timestamp at time zone v_tz;
  select coalesce(sum(s.quantity), 0)::int into v_owned from public.stock_levels s where s.item_id = p_item;
  select jsonb_build_object(
    'today', v_today,
    'owned', v_owned,
    'lifetime_revenue', coalesce((select jsonb_object_agg(t.currency, t.amount) from
        (select r.currency, round(sum(r.amount), 2) as amount
           from private.equipment_revenue(v_org, date '1900-01-01', v_today + 1) r
          where r.item_id = p_item group by r.currency) t), '{}'::jsonb),
    'payback', (select jsonb_build_object('cost', p.cost, 'revenue', p.revenue, 'ratio', p.ratio, 'since', p.since,
                                          'paid_back_on', p.paid_back_on, 'expected_on', p.expected_on, 'estimated', p.estimated)
                from public.equipment_payback(v_org, p_item, p_at) p where p.level = 'item'),
    'use_12m', case when v_owned > 0 then least(1, coalesce((
        select sum(r.quantity * greatest(0, extract(epoch from (least(upper(r.period), v_until) - greatest(lower(r.period), v_from))) / 86400))
        from public.reservations r
        where r.org_id = v_org and r.resource_type = 'equipment' and r.resource_id = p_item and r.status = 'confirmed'
          and r.period && tstzrange(v_from, v_until, '[)')), 0)
        / (v_owned * extract(epoch from (v_until - v_from)) / 86400)) end,
    'upcoming', (select count(*) from public.reservations r
                 where r.org_id = v_org and r.resource_type = 'equipment' and r.resource_id = p_item
                   and r.status <> 'cancelled' and upper(r.period) > p_at),
    'next_bookings', coalesce((select jsonb_agg(b order by b.starts_at) from (
        select r.gig_id, g.name as gig_name, lower(r.period) as starts_at, r.quantity
        from public.reservations r left join public.gigs g on g.id = r.gig_id
        where r.org_id = v_org and r.resource_type = 'equipment' and r.resource_id = p_item
          and r.status <> 'cancelled' and upper(r.period) > p_at
        order by lower(r.period) limit 3) b), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;
revoke execute on function public.item_money_card(uuid, timestamptz) from public, anon;
grant execute on function public.item_money_card(uuid, timestamptz) to authenticated;

-- ── Overview tiles (K5) ──────────────────────────────────────────────────────
-- Its own function beside report_overview (the browser merges the two):
-- { best_earner_year: {item_id, name, amount} or null, worst_earner_year: likewise (null when fewer
--   than two items), hire_in_year: {EUR: amount} }, this year up to today, profit in euros.
create or replace function public.report_overview_k5(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_today date; v_year date; v_out jsonb;
begin
  perform private.require_finance(p_org);
  v_today := private.org_today(p_org, p_at);
  v_year := date_trunc('year', v_today)::date;
  with r as (
    select e.item_id, e.name, e.profit from public.equipment_money(p_org, v_year, v_today + 1, 'EUR') e
    where e.item_id is not null and (e.owned > 0 or e.revenue <> 0 or e.profit <> 0)
  )
  select jsonb_build_object(
    'best_earner_year', (select jsonb_build_object('item_id', b.item_id, 'name', b.name, 'amount', b.profit)
                         from r b order by b.profit desc, b.name limit 1),
    'worst_earner_year', case when (select count(*) from r) > 1 then
                         (select jsonb_build_object('item_id', w.item_id, 'name', w.name, 'amount', w.profit)
                          from r w order by w.profit, w.name limit 1) end,
    'hire_in_year', jsonb_build_object('EUR', (select round(coalesce(sum(h.amount), 0), 2)
                                               from private.equipment_hire_lines(p_org, v_year, v_today + 1) h)))
  into v_out;
  return v_out;
end $$;
revoke execute on function public.report_overview_k5(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview_k5(uuid, timestamptz) to authenticated;
