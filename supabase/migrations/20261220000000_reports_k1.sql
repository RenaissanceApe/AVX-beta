-- Step K1 (docs/ANALYTICS.md): the reports engine. Functions only, no new tables.
--
-- Every report function runs with the reader's rights (security invoker, like
-- client_quote_counts), so the table rules decide what is counted, and refuses anyone who can't
-- see money (private.can_see_finance, step 9b) or hasn't passed the second sign-in step.
--
-- - report_revenue_lines(org, from, until): the revenue rule. One row per priced line of an
--   accepted quote whose report date is in [from, until). Its JS twin is
--   src/lib/analytics/revenue.js; both are checked against src/lib/analytics/fixtures.json.
-- - equipment_report(org, from, until, currency): Inventory → Reports (I7), counted here so the
--   API's 1000-row limit no longer cuts it short. Revenue is dated by the rule.
-- - report_overview(org, at): the Overview tiles and the Home strip in one call.
-- Written without destructive statements.

-- ── Reading quote bodies: the rule ───────────────────────────────────────────
-- One row per priced line of every quote the reader may see (security invoker: the quotes rules
-- decide), net after the line, phase and quote discounts, rounded to the cent. Optional phases and
-- comments are left out. Numbers are read the way the editor reads them (normalizeBody: a number,
-- or text such as "2,5"; qty and factor default to 1). The report date of a quote without a gig
-- is its first dated phase (optional ones skipped), else its issue date (the gig's start date
-- is joined in by the functions below). revenue.js is the JS twin.
-- A view rather than a function per quote, so Postgres plans it once with the outer query: on
-- 5,000 quotes a function per quote took seconds.
create or replace view private.report_quote_lines with (security_invoker = on) as
select q.id as quote_id, q.org_id, q.status, q.number as quote_number, q.currency, q.gig_id, q.client_id,
       q.client_company, q.client_name, q.issue_date, q.valid_until, q.sent_at,
       coalesce(fp.first_phase, q.issue_date) as own_date,
       l.v ->> 'id' as line_id, ph.v ->> 'id' as phase_id, k.kind,
       case when l.v ->> 'item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (l.v ->> 'item_id')::uuid end as item_id,
       coalesce(l.v ->> 'description', '') as description,
       round(round(n.qty * n.factor * n.price * (1 - n.pct / 100), 2)
             * (1 - pp.pct / 100) * (1 - least(100, greatest(0, q.discount_pct)) / 100), 2) as amount,
       pp.start as phase_start
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

-- ── Who may ──────────────────────────────────────────────────────────────────
create or replace function private.require_finance(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not private.can_see_finance(p_org) or not private.mfa_ok() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

-- Today in the organisation's time zone
create or replace function private.org_today(p_org uuid, p_at timestamptz default now()) returns date
language sql stable security definer set search_path = '' as $$
  select (p_at at time zone coalesce((select o.time_zone from public.organisations o where o.id = p_org), 'UTC'))::date
$$;

do $$
declare f text;
begin
  foreach f in array array['require_finance(uuid)', 'org_today(uuid, timestamptz)'] loop
    execute format('revoke execute on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

-- ── The revenue rule ─────────────────────────────────────────────────────────
create or replace function public.report_revenue_lines(p_org uuid, p_from date, p_until date)
returns table(quote_id uuid, quote_number integer, line_id text, phase_id text, kind text, item_id uuid, description text,
              amount numeric, currency text, report_date date, phase_start date, gig_id uuid, gig_name text, gig_type_id uuid,
              gig_status text, gig_custom_status_id uuid, client_id uuid, client_name text)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  return query
  select l.quote_id, l.quote_number, l.line_id, l.phase_id, l.kind, l.item_id, l.description, l.amount, l.currency,
         coalesce(g.start_date, l.own_date), l.phase_start, l.gig_id, g.name, g.gig_type_id, g.status, g.custom_status_id,
         l.client_id, coalesce(c.name, nullif(trim(l.client_company), ''), nullif(trim(l.client_name), ''))
  from private.report_quote_lines l
  left join public.gigs g on g.id = l.gig_id
  left join public.clients c on c.id = l.client_id
  where l.org_id = p_org and l.status = 'accepted'
    and coalesce(g.start_date, l.own_date) >= p_from and coalesce(g.start_date, l.own_date) < p_until
  order by 10, 1;
end $$;
revoke execute on function public.report_revenue_lines(uuid, date, date) from public, anon;
grant execute on function public.report_revenue_lines(uuid, date, date) to authenticated;

-- ── I7 in the database ───────────────────────────────────────────────────────
-- One row per stock-tracked catalogue item, as src/lib/reports.js inventoryReport did in the
-- browser. Days are counted from midnight in the organisation's time zone; use only up to today.
create or replace function public.equipment_report(p_org uuid, p_from date, p_until date, p_currency text default 'EUR')
returns table(item_id uuid, name text, category text, owned integer, use numeric, gigs integer, last_used timestamptz,
              revenue numeric, return_on_cost numeric, repairs integer, repair_cost numeric, charged numeric,
              lost integer, lost_value numeric, hired_in numeric, book_value numeric, cost numeric, idle boolean)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare
  v_tz text; v_today date; v_from timestamptz; v_until timestamptz; v_end timestamptz; v_days numeric;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  v_today := private.org_today(p_org);
  v_from := p_from::timestamp at time zone v_tz;
  v_end := p_until::timestamp at time zone v_tz;
  v_until := least(p_until, v_today + 1)::timestamp at time zone v_tz;
  v_days := greatest(0, extract(epoch from (v_until - v_from)) / 86400);
  return query
  with items as (
    select i.id, i.name, i.category, i.replacement_value from public.price_items i
    where i.org_id = p_org and i.kind in ('rental', 'sale') and i.tracking <> 'none'
  ), own as (
    select s.item_id, sum(s.quantity)::integer as n from public.stock_levels s where s.org_id = p_org group by s.item_id
  ), res as (
    select r.resource_id as item_id,
           sum(r.quantity * greatest(0, extract(epoch from (least(upper(r.period), v_until) - greatest(lower(r.period), v_from))) / 86400)) as unit_days,
           count(distinct r.gig_id)::integer as gigs,
           max(lower(r.period)) filter (where lower(r.period) <= now()) as last_used
    from public.reservations r
    where r.org_id = p_org and r.resource_type = 'equipment' and r.status = 'confirmed'
      and r.period && tstzrange(v_from, v_end, '[)')
    group by r.resource_id
  ), rev as (
    select l.item_id, sum(l.amount) as amount
    from public.report_revenue_lines(p_org, p_from, p_until) l
    where l.item_id is not null and l.currency = p_currency
    group by l.item_id
  ), rep as (
    select r.item_id, count(*)::integer as n, coalesce(sum(r.cost), 0) as cost,
           coalesce(sum(r.cost) filter (where r.charge_client), 0) as charged
    from public.repairs r where r.org_id = p_org and r.created_at >= v_from and r.created_at < v_end
    group by r.item_id
  ), mov as (
    select m.item_id, sum(case when m.kind = 'lost' then m.quantity else -m.quantity end) as lost
    from public.stock_movements m
    where m.org_id = p_org and m.kind in ('lost', 'found') and m.created_at >= v_from and m.created_at < v_end
    group by m.item_id
  ), hire as (
    select sl.item_id, sum(sl.quantity * coalesce(sl.unit_cost, 0)) as cost
    from public.subrentals s join public.subrental_lines sl on sl.subrental_id = s.id
    where s.org_id = p_org and s.status in ('confirmed', 'returned') and s.starts_at < v_end and s.ends_at > v_from
      and sl.item_id is not null
    group by sl.item_id
  ), units as (
    select u.item_id,
           sum(case when u.purchase_cost is null then 0
                    when u.purchase_date is null then u.purchase_cost
                    else round(u.purchase_cost * least(1, greatest(0, 1 - greatest(0,
                      (extract(year from v_today) - extract(year from u.purchase_date)) * 12
                      + (extract(month from v_today) - extract(month from u.purchase_date))
                      - case when extract(day from v_today) < extract(day from u.purchase_date) then 1 else 0 end)
                      / coalesce(u.depreciation_months, 60))), 2) end) as book_value,
           sum(coalesce(u.purchase_cost, 0)) as cost,
           bool_or(u.purchase_cost is not null) as has_cost
    from public.stock_units u
    where u.org_id = p_org and u.status not in ('lost', 'retired')
    group by u.item_id
  )
  select i.id, i.name, i.category, coalesce(o.n, 0),
         case when coalesce(o.n, 0) > 0 and v_days > 0 then least(1, coalesce(r.unit_days, 0) / (o.n * v_days)) else 0 end,
         coalesce(r.gigs, 0), r.last_used,
         round(coalesce(v.amount, 0), 2),
         case when coalesce(u.cost, 0) > 0 then coalesce(v.amount, 0) / u.cost end,
         coalesce(p.n, 0), round(coalesce(p.cost, 0), 2), round(coalesce(p.charged, 0), 2),
         greatest(0, coalesce(m.lost, 0))::integer,
         round(greatest(0, coalesce(m.lost, 0)) * coalesce(i.replacement_value, 0), 2),
         round(coalesce(h.cost, 0), 2), round(coalesce(u.book_value, 0), 2), round(coalesce(u.cost, 0), 2),
         coalesce(o.n, 0) > 0 and not coalesce(r.unit_days, 0) > 0
  from items i
  left join own o on o.item_id = i.id
  left join res r on r.item_id = i.id
  left join rev v on v.item_id = i.id
  left join rep p on p.item_id = i.id
  left join mov m on m.item_id = i.id
  left join hire h on h.item_id = i.id
  left join units u on u.item_id = i.id
  order by i.name, i.id;
end $$;
revoke execute on function public.equipment_report(uuid, date, date, text) from public, anon;
grant execute on function public.equipment_report(uuid, date, date, text) to authenticated;

-- ── Overview tiles ───────────────────────────────────────────────────────────
-- { today, gigs_this_month: { total, confirmed }, revenue_next_30: { EUR: … },
--   waiting: { count, totals: { EUR: … } }, equipment_use_90: 0–1 or null }
-- p_at lets the tests fix the clock.
create or replace function public.report_overview(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare
  v_today date; v_month date; v_gigs jsonb; v_rev jsonb; v_wait jsonb; v_use numeric;
begin
  perform private.require_finance(p_org);
  v_today := private.org_today(p_org, p_at);
  v_month := date_trunc('month', v_today)::date;

  select jsonb_build_object('total', count(*), 'confirmed', count(*) filter (where g.status in ('confirmed', 'active', 'completed')))
    into v_gigs
  from public.gigs g
  where g.org_id = p_org and g.start_date >= v_month and g.start_date < (v_month + interval '1 month')::date;

  select coalesce(jsonb_object_agg(t.currency, t.amount), '{}'::jsonb) into v_rev
  from (select l.currency, sum(l.amount) as amount
        from public.report_revenue_lines(p_org, v_today, v_today + 30) l group by l.currency) t;

  select jsonb_build_object('count', coalesce(sum(t.n), 0), 'totals', coalesce(jsonb_object_agg(t.currency, t.amount), '{}'::jsonb))
    into v_wait
  from (select l.currency, count(distinct l.quote_id) as n, sum(l.amount) as amount
        from private.report_quote_lines l
        where l.org_id = p_org and l.status = 'sent' and (l.valid_until is null or l.valid_until >= v_today)
        group by l.currency) t;

  select case when sum(e.owned) > 0 then sum(e.use * e.owned) / sum(e.owned) end into v_use
  from public.equipment_report(p_org, v_today - 89, v_today + 1) e;

  return jsonb_build_object('today', v_today, 'gigs_this_month', v_gigs, 'revenue_next_30', v_rev,
                            'waiting', v_wait, 'equipment_use_90', v_use);
end $$;
revoke execute on function public.report_overview(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview(uuid, timestamptz) to authenticated;
