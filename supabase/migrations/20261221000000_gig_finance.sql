-- Step 10 (docs/BUSINESS.md): gig finance overview. Functions only, no new tables.
--
-- - private.expense_costs: each expense with its cost (amount excl. VAT, plus the VAT when the
--   organisation or the category doesn't recover it), the twin of costOf in src/lib/expenses.js.
-- - private.gig_labour(org, gigs): each gig's labour TOTALS (never per person), the SQL twin of
--   labourLines + personActual (src/lib/crewRates.js, src/lib/timeRegistration.js). Security
--   definer because crew fees and approved hours are readable only by a gig's managers, and the
--   people who see money (admins and members, D23) need the totals of every gig. Refuses anyone
--   else (private.require_finance).
-- - public.gig_finance(org, from, until, gig): one row per gig starting in [from, until) (or the
--   one gig; or every gig when both dates are empty): revenue by the K1 rule, labour, subrentals,
--   repairs, other costs, margin. Runs as the reader. Its JS twin is src/lib/analytics/gigFinance.js; both
--   are checked against src/lib/analytics/gigFinanceFixtures.json.
-- - public.report_overview gains two tiles: margin this month and gigs with a negative margin.
--   The K1 function is renamed private.report_overview_pre_step10 and wrapped.
-- - The organisation export gains a gig_finance file (export function renamed
--   export_org_part_pre_step10 and wrapped).
-- Both gig functions plan each call for its own gigs (plan_cache_mode = force_custom_plan): a plan
-- cached from one-gig calls on small tables made a month of 300 gigs take seconds instead of ~70 ms.
-- Written without destructive statements.

-- ── Expense cost ─────────────────────────────────────────────────────────────
create or replace view private.expense_costs with (security_invoker = on) as
select e.id, e.org_id, e.status, e.removed_at, e.spent_on, e.currency, e.gig_id, e.subrental_id, e.repair_id,
       e.crew_fee_user_id, (e.stock_movement_id is not null or e.stock_unit_id is not null) as stock_purchase,
       c.kind,
       round(e.amount_net + case when coalesce(fs.recovers_vat, true) and coalesce(c.vat_recoverable, true)
                                 then 0 else e.vat_amount end, 2) as cost
from public.expenses e
left join public.expense_categories c on c.id = e.category_id
left join public.org_finance_settings fs on fs.org_id = e.org_id;
revoke all on private.expense_costs from public, anon;
grant select on private.expense_costs to authenticated;

-- ── Labour per gig (totals only) ─────────────────────────────────────────────
-- Per person on the gig (every member, as the labour panel):
--   planned = the agreed fee (rate × quantity, fixed once), else the rate card: the most specific
--             rate (person in function, person, function; names compared ignoring case), its day
--             rate (else half-day rate) per booked day (their booking, else the gig's dates; at
--             most 366), weekend days × the weekend factor. Hour-only rates suggest nothing.
--   actual  = an expense linked to their fee (confirmed, EUR), else the cost stored on their
--             approved days plus a fixed fee once; none when nothing is approved.
--   counted = actual, else planned; the planned amount from the rate card is an estimate.
create or replace function private.gig_labour(p_org uuid, p_gigs uuid[])
returns table(gig_id uuid, planned numeric, actual numeric, labour numeric, estimated numeric, people integer, missing integer)
language plpgsql stable security definer set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
begin
  perform private.require_finance(p_org);
  return query
  with p as (
    select gm.gig_id, gm.user_id, gm.function_title,
           coalesce((gm.booked_from at time zone 'UTC')::date, g.start_date) as d_from,
           coalesce((gm.booked_until at time zone 'UTC')::date, g.end_date, g.start_date) as d_until
    from public.gig_members gm
    join public.gigs g on g.id = gm.gig_id
    where g.org_id = p_org and g.id = any(p_gigs)
  ), d as (
    select p.*, case when p.d_from is null then 0
                     else least(366, greatest(coalesce(p.d_until, p.d_from), p.d_from) - p.d_from + 1) end as n
    from p
  ), per as (
    select d.gig_id, d.user_id,
           case when fe.rate is not null then round(fe.rate * case when fe.unit = 'fixed' then 1 else fe.quantity end, 2) end as fee_total,
           fe.unit as fee_unit, fe.rate as fee_rate,
           case when rt.per is not null and d.n > 0 then
             round(rt.per * (d.n - wk.days) + rt.per * coalesce((select f.weekend from public.crew_rate_factors f where f.org_id = p_org), 1) * wk.days, 2)
           end as card_total,
           inv.cost as invoice,
           hrs.n as approved_days, hrs.cost as hours_cost
    from d
    left join public.gig_crew_fees fe on fe.gig_id = d.gig_id and fe.user_id = d.user_id and fe.rate is not null
    left join lateral (
      select coalesce(r.day_rate, r.half_day_rate) as per
      from public.crew_rates r
      where r.org_id = p_org and r.removed_at is null and (
              (r.user_id = d.user_id and r.function_title is not null and lower(trim(r.function_title)) = lower(trim(coalesce(d.function_title, ''))))
           or (r.user_id = d.user_id and r.function_title is null)
           or (r.user_id is null and trim(coalesce(d.function_title, '')) <> '' and lower(trim(r.function_title)) = lower(trim(d.function_title))))
      order by case when r.user_id is not null and r.function_title is not null then 1 when r.user_id is not null then 2 else 3 end
      limit 1
    ) rt on true
    left join lateral (
      select count(*)::int as days
      from generate_series(d.d_from::timestamp, (d.d_from + greatest(d.n - 1, 0))::timestamp, interval '1 day') s(day)
      where d.n > 0 and extract(isodow from s.day) in (6, 7)
    ) wk on true
    left join lateral (
      select x.cost from private.expense_costs x
      where x.org_id = p_org and x.gig_id = d.gig_id and x.crew_fee_user_id = d.user_id
        and x.removed_at is null and x.status = 'confirmed' and x.currency = 'EUR'
      limit 1
    ) inv on true
    left join lateral (
      select count(*)::int as n, coalesce(sum(t.cost), 0) as cost
      from public.time_entries t
      where t.gig_id = d.gig_id and t.user_id = d.user_id and t.status = 'approved' and t.removed_at is null
    ) hrs on true
  ), cnt as (
    select per.gig_id,
           coalesce(per.fee_total, per.card_total) as planned,
           case when per.invoice is not null then per.invoice
                when per.approved_days > 0 then round(per.hours_cost + case when per.fee_unit = 'fixed' then per.fee_rate else 0 end, 2)
           end as actual,
           per.fee_total is null and per.card_total is not null as from_card
    from per
  )
  select g.id,
         coalesce(round(sum(cnt.planned), 2), 0),
         round(sum(cnt.actual), 2),
         coalesce(round(sum(coalesce(cnt.actual, cnt.planned)), 2), 0),
         coalesce(round(sum(cnt.planned) filter (where cnt.actual is null and cnt.from_card), 2), 0),
         count(cnt.gig_id)::int,
         (count(cnt.gig_id) filter (where cnt.actual is null and cnt.planned is null))::int
  from public.gigs g
  left join cnt on cnt.gig_id = g.id
  where g.org_id = p_org and g.id = any(p_gigs)
  group by g.id;
end $$;
revoke execute on function private.gig_labour(uuid, uuid[]) from public, anon;
grant execute on function private.gig_labour(uuid, uuid[]) to authenticated;

-- ── Gig finance ──────────────────────────────────────────────────────────────
-- Money is in euros, as the labour panel (D42 c); revenue and costs in other currencies are listed
-- in other_currencies ({"revenue": {...}, "costs": {...}}), never added in.
--   revenue      every accepted quote of the gig (net, the K1 rule); none accepted: the newest sent
--                quote (revenue_source 'estimate'); none at all: 'none'. Drafts never count.
--   subrentals   confirmed or returned: the supplier's price, else the lines; a linked expense
--                replaces it (and counts even if the subrental was later cancelled)
--   repairs      on the gig and not charged to the client (D-step 10): their cost, or the linked
--                expense; repairs_charged lists those the client pays for (not counted)
--   other_costs  confirmed expenses on the gig not linked to a subrental, repair, crew fee (of
--                someone on the gig) or stock purchase, capital ones left out
--   margin       revenue − cost; margin_pct when there is revenue
create or replace function public.gig_finance(p_org uuid, p_from date, p_until date, p_gig uuid default null)
returns table(gig_id uuid, gig_name text, start_date date, end_date date, gig_status text, gig_custom_status_id uuid,
              gig_type_id uuid, client_id uuid, client_name text, revenue numeric, revenue_source text, quotes integer,
              labour_planned numeric, labour_actual numeric, labour numeric, labour_estimated numeric, people integer,
              people_missing integer, subrentals numeric, repairs numeric, repairs_charged numeric, other_costs numeric,
              cost numeric, estimated_cost numeric, margin numeric, margin_pct numeric, other_currencies jsonb)
language plpgsql stable security invoker set search_path = '' set jit = off set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare v_gigs uuid[];
begin
  perform private.require_finance(p_org);
  if p_gig is null and (p_from is null) <> (p_until is null) or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  select coalesce(array_agg(g.id), '{}') into v_gigs from public.gigs g
  where g.org_id = p_org
    and case when p_gig is not null then g.id = p_gig
             when p_from is null then true
             else g.start_date >= p_from and g.start_date < p_until end;

  return query
  with cq as (
    select q.gig_id, q.id, false as estimate
    from public.quotes q where q.org_id = p_org and q.gig_id = any(v_gigs) and q.status = 'accepted'
    union all
    (select distinct on (q.gig_id) q.gig_id, q.id, true
     from public.quotes q
     where q.org_id = p_org and q.gig_id = any(v_gigs) and q.status = 'sent'
       and not exists (select 1 from public.quotes a where a.gig_id = q.gig_id and a.org_id = p_org and a.status = 'accepted')
     order by q.gig_id, coalesce(q.sent_at, q.updated_at, q.created_at) desc, q.id)
  ), qc as (
    select cq.gig_id, count(*)::int as n, bool_or(cq.estimate) as est, (array_agg(cq.id order by cq.id))[1] as first_quote
    from cq group by cq.gig_id
  ), rev as (
    select cq.gig_id, l.currency, sum(l.amount) as amount
    from cq join private.report_quote_lines l on l.quote_id = cq.id
    group by cq.gig_id, l.currency
  ), ex as (
    select x.* from private.expense_costs x
    where x.org_id = p_org and x.removed_at is null and x.status = 'confirmed'
  ), sub as (
    select s.gig_id,
           case when e.id is null then coalesce(s.quoted_total,
                  (select coalesce(sum(sl.quantity * coalesce(sl.unit_cost, 0)), 0) from public.subrental_lines sl where sl.subrental_id = s.id))
                when e.currency = 'EUR' then e.cost else 0 end as amount,
           case when e.currency <> 'EUR' then e.currency end as other_currency, e.cost as other_amount
    from public.subrentals s
    left join ex e on e.subrental_id = s.id
    where s.org_id = p_org and s.gig_id = any(v_gigs) and (s.status in ('confirmed', 'returned') or e.id is not null)
  ), rep as (
    select r.gig_id, r.charge_client,
           case when e.id is null then coalesce(r.cost, 0) when e.currency = 'EUR' then e.cost else 0 end as amount,
           case when e.currency <> 'EUR' then e.currency end as other_currency, e.cost as other_amount
    from public.repairs r
    left join ex e on e.repair_id = r.id
    where r.org_id = p_org and r.gig_id = any(v_gigs)
  ), oth as (
    select e.gig_id, e.currency, e.cost
    from ex e
    where e.gig_id = any(v_gigs) and e.subrental_id is null and e.repair_id is null and not e.stock_purchase
      and coalesce(e.kind, 'direct') <> 'capital'
      and (e.crew_fee_user_id is null
           or not exists (select 1 from public.gig_members gm where gm.gig_id = e.gig_id and gm.user_id = e.crew_fee_user_id))
  ), money_other as (
    select o.gig_id, o.kind, o.currency, sum(o.amount) as amount from (
      select rev.gig_id, 'revenue' as kind, rev.currency, rev.amount from rev where rev.currency <> 'EUR'
      union all select sub.gig_id, 'costs', sub.other_currency, sub.other_amount from sub where sub.other_currency is not null
      union all select rep.gig_id, 'costs', rep.other_currency, rep.other_amount from rep where rep.other_currency is not null and not rep.charge_client
      union all select oth.gig_id, 'costs', oth.currency, oth.cost from oth where oth.currency <> 'EUR'
    ) o group by o.gig_id, o.kind, o.currency
  ), mo as (
    select k.gig_id, jsonb_object_agg(k.kind, k.amounts) as other
    from (select money_other.gig_id, money_other.kind, jsonb_object_agg(money_other.currency, money_other.amount) as amounts
          from money_other group by money_other.gig_id, money_other.kind) k
    group by k.gig_id
  ), lab as (
    select * from private.gig_labour(p_org, v_gigs)
  ), t as (
    select g.id, g.name, g.start_date, g.end_date, g.status, g.custom_status_id, g.gig_type_id, g.client_id,
           coalesce(c.name, nullif(trim(fq.client_company), ''), nullif(trim(fq.client_name), '')) as client_name,
           coalesce((select rev.amount from rev where rev.gig_id = g.id and rev.currency = 'EUR'), 0) as revenue,
           case when qc.n is null then 'none' when qc.est then 'estimate' else 'accepted' end as revenue_source,
           coalesce(qc.n, 0) as quotes,
           coalesce(lab.planned, 0) as labour_planned, lab.actual as labour_actual, coalesce(lab.labour, 0) as labour,
           coalesce(lab.estimated, 0) as labour_estimated, coalesce(lab.people, 0) as people, coalesce(lab.missing, 0) as people_missing,
           coalesce((select sum(sub.amount) from sub where sub.gig_id = g.id), 0) as subrentals,
           coalesce((select sum(rep.amount) from rep where rep.gig_id = g.id and not rep.charge_client), 0) as repairs,
           coalesce((select sum(case when rep.other_currency is null then rep.amount else 0 end) from rep where rep.gig_id = g.id and rep.charge_client), 0) as repairs_charged,
           coalesce((select sum(oth.cost) from oth where oth.gig_id = g.id and oth.currency = 'EUR'), 0) as other_costs,
           mo.other
    from public.gigs g
    left join public.clients c on c.id = g.client_id
    left join qc on qc.gig_id = g.id
    left join public.quotes fq on fq.id = qc.first_quote
    left join lab on lab.gig_id = g.id
    left join mo on mo.gig_id = g.id
    where g.id = any(v_gigs)
  )
  select t.id, t.name, t.start_date, t.end_date, t.status, t.custom_status_id, t.gig_type_id, t.client_id, t.client_name,
         round(t.revenue, 2), t.revenue_source, t.quotes, t.labour_planned, t.labour_actual, t.labour, t.labour_estimated,
         t.people, t.people_missing, round(t.subrentals, 2), round(t.repairs, 2), round(t.repairs_charged, 2), round(t.other_costs, 2),
         round(t.labour + t.subrentals + t.repairs + t.other_costs, 2),
         t.labour_estimated,
         round(t.revenue - (t.labour + t.subrentals + t.repairs + t.other_costs), 2),
         case when t.revenue > 0 then round((t.revenue - (t.labour + t.subrentals + t.repairs + t.other_costs)) * 100 / t.revenue, 1) end,
         t.other
  from t
  order by t.start_date nulls last, t.name, t.id;
end $$;
revoke execute on function public.gig_finance(uuid, date, date, uuid) from public, anon;
grant execute on function public.gig_finance(uuid, date, date, uuid) to authenticated;

-- ── Overview tiles: margin this month, gigs with a negative margin ───────────
-- Gigs starting this month (the organisation's time zone) that have a quote (accepted, or sent
-- as an estimate); gigs with no quote yet are left out of both.
alter function public.report_overview(uuid, timestamptz) rename to report_overview_pre_step10;
alter function public.report_overview_pre_step10(uuid, timestamptz) set schema private;

create or replace function public.report_overview(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_out jsonb; v_month date; v_tiles jsonb;
begin
  v_out := private.report_overview_pre_step10(p_org, p_at); -- checks private.require_finance
  v_month := date_trunc('month', (v_out ->> 'today')::date)::date;
  select jsonb_build_object(
           'margin_this_month', jsonb_build_object('EUR', coalesce(sum(f.margin), 0)),
           'margin_pct_this_month', case when sum(f.revenue) > 0 then round(sum(f.margin) * 100 / sum(f.revenue), 1) end,
           'negative_margin', count(*) filter (where f.margin < 0))
    into v_tiles
  from public.gig_finance(p_org, v_month, (v_month + interval '1 month')::date) f
  where f.revenue_source <> 'none';
  return v_out || v_tiles;
end $$;
revoke execute on function private.report_overview_pre_step10(uuid, timestamptz) from public, anon;
grant execute on function private.report_overview_pre_step10(uuid, timestamptz) to authenticated;
revoke execute on function public.report_overview(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview(uuid, timestamptz) to authenticated;

-- ── Organisation export: gig_finance file ────────────────────────────────────
alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step10;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_part = 'gig_finance' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, f.gig_id::text) as gig_ref, f.gig_name as gig, f.start_date, f.end_date, f.gig_status,
             f.client_name as client, f.revenue, f.revenue_source, f.quotes, f.labour_planned, f.labour_actual, f.labour,
             f.labour_estimated, f.subrentals, f.repairs, f.repairs_charged, f.other_costs, f.cost, f.estimated_cost,
             f.margin, f.margin_pct, f.other_currencies
        from public.gig_finance(p_org, null, null) f
        join public.gigs g on g.id = f.gig_id
       order by f.start_date nulls last, f.gig_name, f.gig_id offset v_off limit v_lim) x;
    return coalesce(v_out, '[]'::jsonb);
  end if;
  return private.export_org_part_pre_step10(p_org, p_part, p_offset);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step10(uuid, text, integer) from public, anon, authenticated;
