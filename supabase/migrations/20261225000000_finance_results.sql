-- K2 (docs/ANALYTICS.md): money, results and margins. Functions only, no new tables.
--
-- - private.report_quote_lines (the K1 revenue rule) gains each line's qty at the end, for cost of
--   goods sold. Amounts are unchanged.
-- - private.gig_labour_hours(org, gigs): planned days and hours and approved hours per gig (totals
--   only, never per person), security definer like private.gig_labour.
-- - private.depreciation_lines(org, from, until): the write-off per month and currency of units,
--   bulk purchases and capital expenses, each counted once.
-- - public.finance_results(org, from, until, group_by): results and margins, on gig_finance,
--   report_revenue_lines and the expenses. The browser only formats.
-- - public.report_overview gains the K2 tiles (the step 10 function is renamed
--   private.report_overview_pre_k2 and wrapped).
-- Decided with the owner (2026-11-06): a gig with several production managers is shared equally
-- between them; Results count accepted quotes only (as the Revenue tab); the four K2 tiles take
-- the place of step 10's two monthly margin tiles on Overview.
-- Written without destructive statements.

-- ── The revenue rule's view gains the quantity ──────────────────────────────
create or replace view private.report_quote_lines with (security_invoker = on) as
select q.id as quote_id, q.org_id, q.status, q.number as quote_number, q.currency, q.gig_id, q.client_id,
       q.client_company, q.client_name, q.issue_date, q.valid_until, q.sent_at,
       coalesce(fp.first_phase, q.issue_date) as own_date,
       l.v ->> 'id' as line_id, ph.v ->> 'id' as phase_id, k.kind,
       case when l.v ->> 'item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (l.v ->> 'item_id')::uuid end as item_id,
       coalesce(l.v ->> 'description', '') as description,
       round(round(n.qty * n.factor * n.price * (1 - n.pct / 100), 2)
             * (1 - pp.pct / 100) * (1 - least(100, greatest(0, q.discount_pct)) / 100), 2) as amount,
       pp.start as phase_start,
       -- Step 11: the line's own VAT rate (a number, or text such as "6" or "6,5"), else the quote's
       least(100, greatest(0, case jsonb_typeof(l.v -> 'vat_rate')
              when 'number' then (l.v -> 'vat_rate' #>> '{}')::numeric
              when 'string' then case when replace(trim(l.v -> 'vat_rate' #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                      then replace(trim(l.v -> 'vat_rate' #>> '{}'), ',', '.')::numeric else q.vat_rate end
              else q.vat_rate end)) as vat_rate,
       n.qty  -- K2: the line's quantity (a number, or text such as "2,5"; 1 when missing)
from public.quotes q
cross join lateral (
  select min(case when jsonb_typeof(p.v -> 'start_date') = 'string'
                     and (p.v -> 'start_date' #>> '{}') ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'
                     and substr(p.v -> 'start_date' #>> '{}', 9, 2)::int <= extract(day from make_date(substr(p.v -> 'start_date' #>> '{}', 1, 4)::int, substr(p.v -> 'start_date' #>> '{}', 6, 2)::int, 1) + interval '1 month' - interval '1 day')
                    then left(p.v -> 'start_date' #>> '{}', 10)::date end) as first_phase
  from jsonb_array_elements(case when jsonb_typeof(q.body -> 'phases') = 'array' then q.body -> 'phases' else '[]'::jsonb end) p(v)
  where not (case jsonb_typeof(p.v -> 'optional') when 'boolean' then (p.v -> 'optional' #>> '{}')::boolean when 'string' then (p.v -> 'optional' #>> '{}') <> ''
                    when 'number' then (p.v -> 'optional' #>> '{}')::numeric <> 0 when 'object' then true when 'array' then true else false end)
) fp
cross join lateral jsonb_array_elements(case when jsonb_typeof(q.body -> 'phases') = 'array' then q.body -> 'phases' else '[]'::jsonb end) ph(v)
cross join lateral (
  select least(100, greatest(0, case jsonb_typeof(ph.v -> 'discount_pct')
              when 'number' then (ph.v -> 'discount_pct' #>> '{}')::numeric
              when 'string' then case when replace(trim(ph.v -> 'discount_pct' #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                      then replace(trim(ph.v -> 'discount_pct' #>> '{}'), ',', '.')::numeric else 0 end
              else 0 end)) as pct,
         case jsonb_typeof(ph.v -> 'optional') when 'boolean' then (ph.v -> 'optional' #>> '{}')::boolean when 'string' then (ph.v -> 'optional' #>> '{}') <> ''
                    when 'number' then (ph.v -> 'optional' #>> '{}')::numeric <> 0 when 'object' then true when 'array' then true else false end as optional,
         case when jsonb_typeof(ph.v -> 'start_date') = 'string'
                     and (ph.v -> 'start_date' #>> '{}') ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'
                     and substr(ph.v -> 'start_date' #>> '{}', 9, 2)::int <= extract(day from make_date(substr(ph.v -> 'start_date' #>> '{}', 1, 4)::int, substr(ph.v -> 'start_date' #>> '{}', 6, 2)::int, 1) + interval '1 month' - interval '1 day')
                    then left(ph.v -> 'start_date' #>> '{}', 10)::date end as start
) pp
cross join lateral jsonb_array_elements(case when jsonb_typeof(ph.v -> 'sections') = 'array' then ph.v -> 'sections' else '[]'::jsonb end) s(v)
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.v -> 'lines') = 'array' then s.v -> 'lines' else '[]'::jsonb end) l(v)
cross join lateral (select case when l.v ->> 'kind' in ('rental', 'sale', 'crew', 'transport', 'other', 'comment')
                                then l.v ->> 'kind' else 'other' end as kind) k
cross join lateral (
  select case jsonb_typeof(l.v -> 'qty')
              when 'number' then (l.v -> 'qty' #>> '{}')::numeric
              when 'string' then case when replace(trim(l.v -> 'qty' #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                      then replace(trim(l.v -> 'qty' #>> '{}'), ',', '.')::numeric else 1 end
              else 1 end as qty,
         case jsonb_typeof(l.v -> 'factor')
              when 'number' then (l.v -> 'factor' #>> '{}')::numeric
              when 'string' then case when replace(trim(l.v -> 'factor' #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                      then replace(trim(l.v -> 'factor' #>> '{}'), ',', '.')::numeric else 1 end
              else 1 end as factor,
         case jsonb_typeof(l.v -> 'unit_price')
              when 'number' then (l.v -> 'unit_price' #>> '{}')::numeric
              when 'string' then case when replace(trim(l.v -> 'unit_price' #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                      then replace(trim(l.v -> 'unit_price' #>> '{}'), ',', '.')::numeric else 0 end
              else 0 end as price,
         least(100, greatest(0, case jsonb_typeof(l.v -> 'discount_pct')
              when 'number' then (l.v -> 'discount_pct' #>> '{}')::numeric
              when 'string' then case when replace(trim(l.v -> 'discount_pct' #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                      then replace(trim(l.v -> 'discount_pct' #>> '{}'), ',', '.')::numeric else 0 end
              else 0 end)) as pct
) n
where not pp.optional and k.kind <> 'comment';
revoke all on private.report_quote_lines from public, anon;
grant select on private.report_quote_lines to authenticated;

-- ── Planned and approved hours per gig (totals only) ─────────────────────────
-- Per person on the gig (every member, as the labour panel): planned days = their booked days
-- (their booking, else the gig's dates; at most 366); planned hours = an agreed hourly fee's
-- quantity, else booked days × the organisation's normal day (overtime starts after it, 10 hours
-- when not set). Actual hours = the worked hours of their approved days.
create or replace function private.gig_labour_hours(p_org uuid, p_gigs uuid[])
returns table(gig_id uuid, days_planned numeric, hours_planned numeric, hours_actual numeric)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare v_day numeric;
begin
  perform private.require_finance(p_org);
  select coalesce((select f.overtime_after_hours from public.crew_rate_factors f where f.org_id = p_org), 10) into v_day;
  return query
  with p as (
    select gm.gig_id, gm.user_id,
           coalesce((gm.booked_from at time zone 'UTC')::date, g.start_date) as d_from,
           coalesce((gm.booked_until at time zone 'UTC')::date, g.end_date, g.start_date) as d_until
    from public.gig_members gm
    join public.gigs g on g.id = gm.gig_id
    where g.org_id = p_org and g.id = any(p_gigs)
  ), d as (
    select p.gig_id, p.user_id,
           case when p.d_from is null then 0
                else least(366, greatest(coalesce(p.d_until, p.d_from), p.d_from) - p.d_from + 1) end as n
    from p
  ), per as (
    select d.gig_id, d.n,
           case when fe.unit = 'hour' and fe.rate is not null then fe.quantity else d.n * v_day end as hours
    from d
    left join public.gig_crew_fees fe on fe.gig_id = d.gig_id and fe.user_id = d.user_id
  ), act as (
    select t.gig_id, sum(coalesce((t.split ->> 'worked')::numeric, 0)) as hours
    from public.time_entries t
    where t.gig_id = any(p_gigs) and t.status = 'approved' and t.removed_at is null
    group by t.gig_id
  )
  select g.id, coalesce(sum(per.n), 0)::numeric, round(coalesce(sum(per.hours), 0), 2), round(coalesce(max(act.hours), 0), 2)
  from public.gigs g
  left join per on per.gig_id = g.id
  left join act on act.gig_id = g.id
  where g.org_id = p_org and g.id = any(p_gigs)
  group by g.id;
end $$;
revoke execute on function private.gig_labour_hours(uuid, uuid[]) from public, anon;
grant execute on function private.gig_labour_hours(uuid, uuid[]) to authenticated;

-- ── Depreciation ─────────────────────────────────────────────────────────────
-- An equal share each month from the month it starts, for its months, prorated by the days of
-- each month inside [from, until):
--   units            purchase cost (else the item's cost price, an estimate) over the unit's months,
--                    else the item's, else 60; from the purchase date (else when it was added);
--                    stops after the month it was lost or retired
--   bulk purchases   cost each × quantity over the item's months (60 if empty), from the purchase
--   capital expenses their cost over the category's spread months (60 if empty), from their date
-- A unit or bulk purchase with a confirmed expense linked to it counts once, through the expense
-- (spread when its category is capital, else as that kind of cost).
create or replace function private.depreciation_lines(p_org uuid, p_from date, p_until date)
returns table(month date, currency text, amount numeric, estimated numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform private.require_finance(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with a as (
    select 'EUR'::text as cur, coalesce(u.purchase_cost, i.cost_price) as cost, u.purchase_cost is null as est,
           coalesce(u.purchase_date, (u.created_at at time zone v_tz)::date) as start_on,
           greatest(1, coalesce(u.depreciation_months, i.depreciation_months, 60)) as months, u.disposed_on as end_on
    from public.stock_units u
    join public.price_items i on i.id = u.item_id
    where u.org_id = p_org
      and not exists (select 1 from public.expenses e where e.stock_unit_id = u.id and e.removed_at is null and e.status = 'confirmed')
    union all
    select 'EUR', m.unit_cost * m.quantity, false, (m.created_at at time zone v_tz)::date,
           greatest(1, coalesce(i.depreciation_months, 60)), null::date
    from public.stock_movements m
    join public.price_items i on i.id = m.item_id
    where m.org_id = p_org and m.kind = 'purchase' and m.unit_id is null and m.unit_cost is not null
      and not exists (select 1 from public.expenses e where e.stock_movement_id = m.id and e.removed_at is null and e.status = 'confirmed')
    union all
    select x.currency, x.cost, false, x.spent_on, greatest(1, coalesce(c.spread_months, 60)), null::date
    from private.expense_costs x
    join public.expenses e on e.id = x.id
    left join public.expense_categories c on c.id = e.category_id
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed' and x.kind = 'capital'
  ), b as (
    select a.*, date_trunc('month', a.start_on)::date as m0,
           (extract(year from a.start_on) * 12 + extract(month from a.start_on))::int as i0
    from a where a.cost > 0 and a.start_on < p_until
  ), s as (
    select b.cur, b.est, b.cost / b.months as share, (b.m0 + make_interval(months => k))::date as mo
    from b
    cross join lateral generate_series(
      greatest(0, (extract(year from p_from) * 12 + extract(month from p_from))::int - b.i0),
      least(b.months - 1,
            (extract(year from p_until - 1) * 12 + extract(month from p_until - 1))::int - b.i0,
            coalesce((extract(year from b.end_on) * 12 + extract(month from b.end_on))::int - b.i0, b.months - 1))) k
  ), p as (
    select s.cur, s.est, s.mo,
           s.share * (least((s.mo + interval '1 month')::date, p_until) - greatest(s.mo, p_from))
                   / ((s.mo + interval '1 month')::date - s.mo) as v
    from s
  )
  select p.mo, p.cur, round(sum(p.v), 2), round(coalesce(sum(p.v) filter (where p.est), 0), 2)
  from p where p.v > 0
  group by p.mo, p.cur
  order by 1, 2;
end $$;
revoke execute on function private.depreciation_lines(uuid, date, date) from public, anon;
grant execute on function private.depreciation_lines(uuid, date, date) to authenticated;

-- ── Results and margins ──────────────────────────────────────────────────────
-- One row per group and currency (never added across currencies). group_by: total, month,
-- quarter, year, gig, gig_type, status, client, kind, pm. Everything is dated as K1 dates it:
-- what belongs to a gig by the gig's start date; a quote with no gig by its own date; company
-- expenses by their date; depreciation by month.
--   revenue          accepted quotes' lines (report_revenue_lines), by line kind
--   labour, subrentals, repairs, gig_expenses   from gig_finance (euros; a gig's costs in other
--                    currencies are counted as gig_expenses in their currency)
--   cogs             sale lines × the item's cost price (euros); cogs_missing = sale lines whose
--                    item has no cost price
--   other_direct     confirmed company expenses of kind direct not on a gig (or linked to a stock
--                    purchase), and confirmed or returned subrentals with no gig and no expense
--   overheads        confirmed company expenses of kind overhead or tax_other not on a gig
--   depreciation     private.depreciation_lines
-- Costs follow the line kinds as: labour → crew; subrentals and repairs → rental; cogs → sale;
-- gig expenses and other direct costs → other (a subrental with no gig → rental). Rows with an empty group_key hold what has no
-- such group (not on a gig, no client, …), so the rows always add up to the total.
-- The PM grouping shares a gig equally between its production managers. Gig counts are on the
-- euro rows: gigs, gigs_negative (a quote and a negative margin, as step 10), gigs_without_accepted
-- (costs, but no accepted quote: their costs count, their revenue doesn't yet).
create or replace function public.finance_results(p_org uuid, p_from date, p_until date, p_group text default 'total')
returns table(group_key text, group_label text, currency text,
              revenue numeric, revenue_rental numeric, revenue_sale numeric, revenue_crew numeric, revenue_transport numeric, revenue_other numeric,
              labour numeric, labour_estimated numeric, labour_planned numeric, labour_actual numeric,
              days_planned numeric, hours_planned numeric, hours_actual numeric,
              subrentals numeric, repairs numeric, gig_expenses numeric, other_direct numeric, cogs numeric, cogs_missing integer,
              direct_costs numeric, gross_margin numeric, margin_pct numeric,
              overheads numeric, overheads_by_category jsonb, depreciation numeric, depreciation_estimated numeric,
              operating_result numeric, estimated numeric, gigs integer, gigs_negative integer, gigs_without_accepted integer)
language plpgsql stable security invoker set search_path = '' set jit = off set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare v_tz text; v_gigs uuid[];
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  if p_group is null or p_group not in ('total', 'month', 'quarter', 'year', 'gig', 'gig_type', 'status', 'client', 'kind', 'pm') then
    raise exception 'Bad grouping' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;

  -- The gigs gig_finance counts (starting in the period), for the hours helper
  select coalesce(array_agg(g.id), '{}') into v_gigs from public.gigs g
  where g.org_id = p_org and g.start_date >= p_from and g.start_date < p_until;

  return query
  with rl as (
    select * from public.report_revenue_lines(p_org, p_from, p_until)
  ), gf as materialized (
    select * from public.gig_finance(p_org, p_from, p_until)
  ), hrs as (
    select * from private.gig_labour_hours(p_org, v_gigs)
  ), cogs as (
    select rl.report_date, rl.gig_id, rl.client_id, rl.client_name, ql.qty, i.cost_price
    from rl
    join private.report_quote_lines ql on ql.quote_id = rl.quote_id and ql.line_id is not distinct from rl.line_id
                                       and ql.phase_id is not distinct from rl.phase_id
    join public.price_items i on i.id = rl.item_id
    where rl.kind = 'sale' and rl.item_id is not null
      and ql.quote_id = any(array(select distinct r2.quote_id from rl r2 where r2.kind = 'sale' and r2.item_id is not null))
  ), ex as (
    select x.*, e.category_id from private.expense_costs x join public.expenses e on e.id = x.id
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed'
      and x.spent_on >= p_from and x.spent_on < p_until
      and (x.gig_id is null or x.stock_purchase) and coalesce(x.kind, 'direct') <> 'capital'
  ), facts(d, gig, client_id, client, kind, cur, m, v, cat) as (
    -- revenue
    select rl.report_date, rl.gig_id, coalesce(g.client_id, rl.client_id), coalesce(g.client_name, rl.client_name), rl.kind, rl.currency, 'rev', rl.amount, null::uuid
    from rl left join gf g on g.gig_id = rl.gig_id
    -- cost of goods sold
    union all
    select c.report_date, c.gig_id, coalesce(g.client_id, c.client_id), coalesce(g.client_name, c.client_name), 'sale', 'EUR',
           case when c.cost_price is null then 'cogs_miss' else 'cogs' end,
           case when c.cost_price is null then 1 else c.qty * c.cost_price end, null
    from cogs c left join gf g on g.gig_id = c.gig_id
    -- gig costs (euros) and gig counts
    union all
    select g.start_date, g.gig_id, g.client_id, g.client_name, x.kind, 'EUR', x.m, x.v, null
    from gf g
    cross join lateral (values ('crew', 'lab', g.labour), ('crew', 'lab_est', g.labour_estimated), ('crew', 'lab_plan', g.labour_planned),
                               ('crew', 'lab_act', g.labour_actual), ('rental', 'sub', g.subrentals), ('rental', 'rep', g.repairs),
                               ('other', 'gexp', g.other_costs), (null, 'gig_n', 1),
                               (null, 'gig_neg', case when g.margin < 0 and g.revenue_source <> 'none' then 1 else 0 end),
                               (null, 'gig_noacc', case when g.revenue_source <> 'accepted' and g.cost > 0 then 1 else 0 end)) x(kind, m, v)
    where x.v is not null
    -- a gig's costs in other currencies
    union all
    select g.start_date, g.gig_id, g.client_id, g.client_name, 'other', o.key, 'gexp', o.value::numeric, null
    from gf g cross join lateral jsonb_each_text(coalesce(g.other_currencies -> 'costs', '{}'::jsonb)) o
    -- planned and approved hours
    union all
    select g.start_date, g.gig_id, g.client_id, g.client_name, 'crew', 'EUR', x.m, x.v, null
    from gf g join hrs h on h.gig_id = g.gig_id
    cross join lateral (values ('days_plan', h.days_planned), ('hrs_plan', h.hours_planned), ('hrs_act', h.hours_actual)) x(m, v)
    -- subrentals with no gig (and no expense, which counts instead)
    union all
    select (s.starts_at at time zone v_tz)::date, null, null, null, 'rental', 'EUR', 'odir',
           coalesce(s.quoted_total, (select coalesce(sum(sl.quantity * coalesce(sl.unit_cost, 0)), 0) from public.subrental_lines sl where sl.subrental_id = s.id)), null
    from public.subrentals s
    where s.org_id = p_org and s.gig_id is null and s.status in ('confirmed', 'returned')
      and (s.starts_at at time zone v_tz)::date >= p_from and (s.starts_at at time zone v_tz)::date < p_until
      and not exists (select 1 from public.expenses e where e.subrental_id = s.id and e.removed_at is null and e.status = 'confirmed')
    -- company expenses
    union all
    select e.spent_on, null, null, null, case when coalesce(e.kind, 'direct') = 'direct' then 'other' end, e.currency,
           case when coalesce(e.kind, 'direct') = 'direct' then 'odir' else 'ovh' end, e.cost,
           case when coalesce(e.kind, 'direct') = 'direct' then null else e.category_id end
    from ex e
    -- depreciation
    union all
    select dl.month, null, null, null, null, dl.currency, x.m, x.v, null
    from private.depreciation_lines(p_org, p_from, p_until) dl
    cross join lateral (values ('dep', dl.amount), ('dep_est', dl.estimated)) x(m, v)
  ), grp as (
    select case p_group
             when 'total' then 'total'
             when 'month' then to_char(f.d, 'YYYY-MM')
             when 'quarter' then to_char(f.d, 'YYYY') || '-Q' || extract(quarter from f.d)::int
             when 'year' then to_char(f.d, 'YYYY')
             when 'gig' then f.gig::text
             when 'gig_type' then g.gig_type_id::text
             when 'status' then case when g.id is null then null when g.custom_status_id is not null then 'own:' || g.custom_status_id
                                     else 'base:' || g.status end
             when 'client' then coalesce(f.client_id::text, 'name:' || lower(trim(f.client)))
             when 'kind' then f.kind
             when 'pm' then pm.user_id::text
           end as k,
           case p_group when 'gig' then g.name when 'gig_type' then gt.name when 'client' then f.client
                        when 'pm' then coalesce(pr.full_name, '') end as label,
           f.kind, f.cur, f.m, f.v * coalesce(pm.share, 1) as v, f.cat
    from facts f
    left join public.gigs g on g.id = f.gig
    left join public.gig_types gt on p_group = 'gig_type' and gt.id = g.gig_type_id
    left join lateral (
      select gm.user_id, 1.0 / count(*) over () as share
      from public.gig_members gm where p_group = 'pm' and gm.gig_id = f.gig and gm.role = 'pm'
    ) pm on true
    left join public.profiles pr on pr.id = pm.user_id
  ), a as (
    select grp.k, max(grp.label) as label, grp.cur,
           coalesce(sum(grp.v) filter (where grp.m = 'rev'), 0) as rev,
           coalesce(sum(grp.v) filter (where grp.m = 'rev' and grp.kind = 'rental'), 0) as rev_rental,
           coalesce(sum(grp.v) filter (where grp.m = 'rev' and grp.kind = 'sale'), 0) as rev_sale,
           coalesce(sum(grp.v) filter (where grp.m = 'rev' and grp.kind = 'crew'), 0) as rev_crew,
           coalesce(sum(grp.v) filter (where grp.m = 'rev' and grp.kind = 'transport'), 0) as rev_transport,
           coalesce(sum(grp.v) filter (where grp.m = 'rev' and grp.kind = 'other'), 0) as rev_other,
           coalesce(sum(grp.v) filter (where grp.m = 'lab'), 0) as lab,
           coalesce(sum(grp.v) filter (where grp.m = 'lab_est'), 0) as lab_est,
           coalesce(sum(grp.v) filter (where grp.m = 'lab_plan'), 0) as lab_plan,
           sum(grp.v) filter (where grp.m = 'lab_act') as lab_act,
           coalesce(sum(grp.v) filter (where grp.m = 'days_plan'), 0) as days_plan,
           coalesce(sum(grp.v) filter (where grp.m = 'hrs_plan'), 0) as hrs_plan,
           coalesce(sum(grp.v) filter (where grp.m = 'hrs_act'), 0) as hrs_act,
           coalesce(sum(grp.v) filter (where grp.m = 'sub'), 0) as sub,
           coalesce(sum(grp.v) filter (where grp.m = 'rep'), 0) as rep,
           coalesce(sum(grp.v) filter (where grp.m = 'gexp'), 0) as gexp,
           coalesce(sum(grp.v) filter (where grp.m = 'odir'), 0) as odir,
           coalesce(sum(grp.v) filter (where grp.m = 'cogs'), 0) as cogs,
           coalesce(count(*) filter (where grp.m = 'cogs_miss'), 0)::int as cogs_miss,
           coalesce(sum(grp.v) filter (where grp.m = 'ovh'), 0) as ovh,
           coalesce(sum(grp.v) filter (where grp.m = 'dep'), 0) as dep,
           coalesce(sum(grp.v) filter (where grp.m = 'dep_est'), 0) as dep_est,
           coalesce(count(*) filter (where grp.m = 'gig_n'), 0)::int as gig_n,
           coalesce(count(*) filter (where grp.m = 'gig_neg' and grp.v > 0), 0)::int as gig_neg,
           coalesce(count(*) filter (where grp.m = 'gig_noacc' and grp.v > 0), 0)::int as gig_noacc
    from grp group by grp.k, grp.cur
  ), oc as (
    -- overheads by category, biggest first: [{category_id, name, starter_key, amount}]
    select c.k, c.cur, jsonb_agg(jsonb_build_object('category_id', c.cat, 'name', ec.name, 'starter_key', ec.starter_key,
                                                    'amount', round(c.v, 2)) order by c.v desc, ec.name) as cats
    from (select grp.k, grp.cur, grp.cat, sum(grp.v) as v from grp where grp.m = 'ovh' group by grp.k, grp.cur, grp.cat) c
    left join public.expense_categories ec on ec.id = c.cat
    group by c.k, c.cur
  ), b as (
    select a.*,
           round(a.lab + a.sub + a.rep + a.gexp + a.odir + a.cogs, 2) as direct
    from a
  )
  select b.k, b.label, b.cur, round(b.rev, 2),
         round(b.rev_rental, 2), round(b.rev_sale, 2), round(b.rev_crew, 2), round(b.rev_transport, 2), round(b.rev_other, 2),
         round(b.lab, 2), round(b.lab_est, 2), round(b.lab_plan, 2), round(b.lab_act, 2), round(b.days_plan, 1), round(b.hrs_plan, 2), round(b.hrs_act, 2),
         round(b.sub, 2), round(b.rep, 2), round(b.gexp, 2), round(b.odir, 2), round(b.cogs, 2), b.cogs_miss,
         b.direct, round(b.rev - b.direct, 2), case when b.rev > 0 then round((b.rev - b.direct) * 100 / b.rev, 1) end,
         round(b.ovh, 2), coalesce(oc.cats, '[]'::jsonb), round(b.dep, 2), round(b.dep_est, 2),
         round(b.rev - b.direct - b.ovh - b.dep, 2), round(b.lab_est + b.dep_est, 2), b.gig_n, b.gig_neg, b.gig_noacc
  from b
  left join oc on oc.k is not distinct from b.k and oc.cur = b.cur
  order by b.k nulls last, b.cur;
end $$;
revoke execute on function public.finance_results(uuid, date, date, text) from public, anon;
grant execute on function public.finance_results(uuid, date, date, text) to authenticated;

-- ── Overview tiles (K2) ──────────────────────────────────────────────────────
-- revenue_this_month and revenue_month_last_year: accepted revenue per currency from the 1st of
-- this month up to today, and the same days a year earlier; margin_pct_year (euros),
-- operating_result_year (per currency) and negative_margin_year: this year up to today.
alter function public.report_overview(uuid, timestamptz) rename to report_overview_pre_k2;
alter function public.report_overview_pre_k2(uuid, timestamptz) set schema private;

create or replace function public.report_overview(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_out jsonb; v_today date; v_month date; v_year date; v_tiles jsonb;
begin
  v_out := private.report_overview_pre_k2(p_org, p_at); -- checks private.require_finance
  v_today := (v_out ->> 'today')::date;
  v_month := date_trunc('month', v_today)::date;
  v_year := date_trunc('year', v_today)::date;
  with m as (
    select f.currency, f.revenue from public.finance_results(p_org, v_month, v_today + 1, 'total') f
  ), l as (
    select f.currency, f.revenue
    from public.finance_results(p_org, (v_month - interval '1 year')::date, (v_today + 1 - interval '1 year')::date, 'total') f
  ), y as (
    select * from public.finance_results(p_org, v_year, v_today + 1, 'total')
  )
  select jsonb_build_object(
           'revenue_this_month', coalesce((select jsonb_object_agg(m.currency, m.revenue) from m where m.revenue <> 0), '{}'::jsonb),
           'revenue_month_last_year', coalesce((select jsonb_object_agg(l.currency, l.revenue) from l where l.revenue <> 0), '{}'::jsonb),
           'margin_pct_year', (select y.margin_pct from y where y.currency = 'EUR'),
           'operating_result_year', coalesce((select jsonb_object_agg(y.currency, y.operating_result) from y), '{}'::jsonb),
           'negative_margin_year', coalesce((select y.gigs_negative from y where y.currency = 'EUR'), 0))
    into v_tiles;
  return v_out || v_tiles;
end $$;
revoke execute on function private.report_overview_pre_k2(uuid, timestamptz) from public, anon;
grant execute on function private.report_overview_pre_k2(uuid, timestamptz) to authenticated;
revoke execute on function public.report_overview(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview(uuid, timestamptz) to authenticated;
