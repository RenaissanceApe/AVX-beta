-- K3 (docs/ANALYTICS.md): money, cash, spending and forecast.
--
-- - public.finance_targets: a monthly budget per expense category and a monthly revenue target
--   (decided with the owner, 2026-11-07). Admins and members (can_see_finance); removed by marking.
-- - private.open_invoices(org, today): every issued invoice with what is left after credit notes
--   and payments, and how many days it is overdue by the organisation's date.
-- - public.cash_report(org, from, until, months_ahead, at): cash in and out per month, overdue by
--   age, and money expected in and out per month ahead (and the position: in − out).
-- - public.spending(org, from, until, group_by): confirmed expenses at their cost, grouped.
-- - public.client_balance(org, client, at): what each client owes; the client portal (step 26)
--   shows a client's balance from this function.
-- - public.revenue_forecast(org, months, at): accepted revenue of upcoming gigs per month, quotes
--   waiting apart, and the win rate of the last 12 months (never multiplied in: owner, 2026-11-07).
-- - public.target_progress(org, from, until): each target against what happened.
-- - public.report_overview gains the four K3 tiles (the K2 function is renamed
--   private.report_overview_pre_k3 and wrapped).
-- Every function runs as the reader and calls private.require_finance. Cash figures are WITH VAT
-- (what moves in the bank); spending and budgets use each expense's cost (the 9b VAT rule).
-- Written without destructive statements.

-- ── Budgets and targets ──────────────────────────────────────────────────────
create table if not exists public.finance_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('budget', 'revenue')),
  category_id uuid references public.expense_categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0 and amount <= 100000000),   -- per month
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint finance_targets_category_check check ((kind = 'budget') = (category_id is not null))
);
create index if not exists finance_targets_org_idx on public.finance_targets (org_id) where removed_at is null;
-- One live budget per category and currency, one live revenue target per currency
create unique index if not exists finance_targets_one on public.finance_targets
  (org_id, kind, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), currency) where removed_at is null;
alter table public.finance_targets enable row level security;
create policy finance_targets_select on public.finance_targets for select to authenticated
  using (private.can_see_finance(org_id));
create policy finance_targets_insert on public.finance_targets for insert to authenticated
  with check (private.can_see_finance(org_id) and removed_at is null);
create policy finance_targets_update on public.finance_targets for update to authenticated
  using (removed_at is null and private.can_see_finance(org_id)) with check (private.can_see_finance(org_id));
create policy mfa_required on public.finance_targets as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.finance_targets from anon, authenticated;
grant select on public.finance_targets to authenticated;
grant insert (org_id, kind, category_id, amount, currency) on public.finance_targets to authenticated;
grant update (amount, removed_at) on public.finance_targets to authenticated;

-- The category must be the organisation's own; who made it and when it changed are the database's
create or replace function private.finance_targets_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.finance_refs_ok(new.org_id, null, new.category_id) then
    raise exception 'Category of another organisation' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger finance_targets_before before insert or update on public.finance_targets
  for each row execute function private.finance_targets_before();

-- ── Open invoices ────────────────────────────────────────────────────────────
-- Issued invoices (not credit notes, not removed): the total, issued credit notes against it,
-- payments, what is left (never below zero) and days overdue (> 0 only when past the due date in
-- the organisation's time zone). Paid invoices are left out: nothing is left on them.
create or replace function private.open_invoices(p_org uuid, p_today date)
returns table(invoice_id uuid, number integer, legal_number text, client_key text, client_id uuid, client_name text,
              currency text, scope text, issue_date date, due_date date, total numeric, credited numeric, paid numeric,
              left_to_pay numeric, days_overdue integer)
language sql stable security invoker set search_path = '' as $$
  select i.id, i.number, i.legal_number,
         coalesce(i.client_id::text, 'name:' || coalesce(nullif(trim(i.client_name), ''), '')),
         i.client_id, coalesce(c.name, nullif(trim(i.client_name), '')), i.currency, i.scope, i.issue_date, i.due_date,
         i.total, x.credited, x.paid, greatest(i.total - x.credited - x.paid, 0),
         case when i.due_date < p_today then p_today - i.due_date else 0 end
    from public.invoices i
    left join public.clients c on c.id = i.client_id
    cross join lateral (
      select coalesce((select sum(cn.total) from public.invoices cn
                        where cn.credited_invoice_id = i.id and cn.removed_at is null and cn.status in ('issued', 'paid')), 0) as credited,
             coalesce((select sum(p.amount) from public.invoice_payments p
                        where p.invoice_id = i.id and p.removed_at is null), 0) as paid
    ) x
   where i.org_id = p_org and i.removed_at is null and i.kind = 'invoice' and i.status = 'issued'
$$;
revoke execute on function private.open_invoices(uuid, date) from public, anon;
grant execute on function private.open_invoices(uuid, date) to authenticated;

-- Recurring costs not drafted yet, from the next date to p_until (exclusive): each date once. A date
-- that already has an expense (a draft, a confirmed one, or a removed draft) is never projected.
create or replace function private.recurring_ahead(p_org uuid, p_until date)
returns table(recurrence_id uuid, description text, due date, currency text, amount numeric)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.description, d.due, r.currency, round(r.amount_net + round(r.amount_net * r.vat_rate / 100, 2), 2)
    from public.expense_recurrences r
    cross join lateral (
      -- the same date as private.add_periods (not granted to the app)
      select (r.starts_on + make_interval(months => (r.drafted + n) * case r.every when 'month' then 1 when 'quarter' then 3 else 12 end))::date as due
        from generate_series(0, 60) n
    ) d
   where r.org_id = p_org and r.removed_at is null
     and d.due < p_until and (r.ends_on is null or d.due <= r.ends_on)
     and not exists (select 1 from public.expenses e where e.recurrence_id = r.id and e.recurrence_due = d.due)
$$;
revoke execute on function private.recurring_ahead(uuid, date) from public, anon;
grant execute on function private.recurring_ahead(uuid, date) to authenticated;

-- ── Cash ─────────────────────────────────────────────────────────────────────
-- Long rows: (section, month, group_key, label, currency, amount, items). Amounts WITH VAT.
-- In [from, until), per month:
--   invoiced    issued invoices by issue date (group_key 'deposit' for deposit invoices, else '')
--   credited    issued credit notes by issue date
--   received    payments by payment date
--   paid_out    confirmed expenses by the date they were paid
-- As of today (p_at, in the organisation's time zone):
--   overdue     what is left on overdue invoices, group_key 0_30 / 31_60 / 61_90 / 90_plus, month null
--   expected_in what is left on issued invoices, by due-date month from this month for
--               p_ahead months; overdue ones in this month (group_key 'overdue', else 'due')
--   expected_out unpaid confirmed expenses ('unpaid'), approved claims to reimburse ('claims'),
--               unconfirmed drafts and recurring dates not drafted yet ('recurring'), by due month
--               (late ones in this month)
--   recurring   each recurring cost's dates in the window (group_key its id, label its description)
--   position    expected_in − expected_out per month and currency
create or replace function public.cash_report(p_org uuid, p_from date, p_until date, p_ahead integer default 3,
                                              p_at timestamptz default now())
returns table(section text, month date, group_key text, label text, currency text, amount numeric, items integer)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_today date; v_month date; v_end date;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  if p_ahead is null or p_ahead < 1 or p_ahead > 24 then raise exception 'Bad months ahead' using errcode = '22023'; end if;
  v_today := private.org_today(p_org, p_at);
  v_month := date_trunc('month', v_today)::date;
  v_end := (v_month + make_interval(months => p_ahead))::date;
  return query
  with inv as (
    select 'invoiced'::text as section, date_trunc('month', i.issue_date)::date as month,
           case when i.scope = 'deposit' then 'deposit' else '' end as group_key, null::text as label,
           i.currency, sum(i.total) as amount, count(*)::integer as items
      from public.invoices i
     where i.org_id = p_org and i.removed_at is null and i.kind = 'invoice' and i.status in ('issued', 'paid')
       and i.issue_date >= p_from and i.issue_date < p_until
     group by 2, 3, 5
    union all
    select 'credited', date_trunc('month', i.issue_date)::date, '', null, i.currency, sum(i.total), count(*)::integer
      from public.invoices i
     where i.org_id = p_org and i.removed_at is null and i.kind = 'credit_note' and i.status in ('issued', 'paid')
       and i.issue_date >= p_from and i.issue_date < p_until
     group by 2, 5
    union all
    select 'received', date_trunc('month', p.paid_on)::date, '', null, i.currency, sum(p.amount), count(*)::integer
      from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
     where p.org_id = p_org and p.removed_at is null and p.paid_on >= p_from and p.paid_on < p_until
     group by 2, 5
    union all
    select 'paid_out', date_trunc('month', e.paid_on)::date, '', null, e.currency, sum(e.total), count(*)::integer
      from public.expenses e
     where e.org_id = p_org and e.removed_at is null and e.status = 'confirmed'
       and e.paid_on >= p_from and e.paid_on < p_until
     group by 2, 5
  ), open_inv as (
    select * from private.open_invoices(p_org, v_today) o where o.left_to_pay > 0
  ), overdue as (
    select 'overdue'::text as section, null::date as month,
           case when o.days_overdue <= 30 then '0_30' when o.days_overdue <= 60 then '31_60'
                when o.days_overdue <= 90 then '61_90' else '90_plus' end as group_key,
           null::text as label, o.currency, sum(o.left_to_pay) as amount, count(*)::integer as items
      from open_inv o where o.days_overdue > 0
     group by 3, 5
  ), exp_in as (
    select 'expected_in'::text as section,
           greatest(date_trunc('month', coalesce(o.due_date, o.issue_date, v_today))::date, v_month) as month,
           case when o.days_overdue > 0 then 'overdue' else 'due' end as group_key, null::text as label,
           o.currency, sum(o.left_to_pay) as amount, count(*)::integer as items
      from open_inv o
     where coalesce(o.due_date, o.issue_date, v_today) < v_end
     group by 2, 3, 5
  ), out_rows as (
    select greatest(date_trunc('month', coalesce(e.due_on, e.spent_on))::date, v_month) as month,
           case when e.status = 'draft' then 'recurring' when e.claimed_by is not null then 'claims' else 'unpaid' end as group_key,
           e.currency, e.total as amount
      from public.expenses e
     where e.org_id = p_org and e.removed_at is null and e.paid_on is null
       and e.status in ('confirmed', 'draft') and coalesce(e.due_on, e.spent_on) < v_end
    union all
    select date_trunc('month', r.due)::date, 'recurring', r.currency, r.amount
      from private.recurring_ahead(p_org, v_end) r
     where r.due >= v_month
  ), exp_out as (
    select 'expected_out'::text as section, o.month, o.group_key, null::text as label, o.currency,
           sum(o.amount) as amount, count(*)::integer as items
      from out_rows o group by 2, 3, 5
  ), rec as (
    select 'recurring'::text as section, date_trunc('month', x.due)::date as month, x.rid::text as group_key,
           max(x.description) as label, x.currency, sum(x.amount) as amount, count(*)::integer as items
      from (
        select r.recurrence_id as rid, r.description, r.due, r.currency, r.amount
          from private.recurring_ahead(p_org, v_end) r where r.due >= v_month
        union all
        select e.recurrence_id, e.description, coalesce(e.due_on, e.spent_on), e.currency, e.total
          from public.expenses e
         where e.org_id = p_org and e.removed_at is null and e.recurrence_id is not null and e.paid_on is null
           and e.status in ('confirmed', 'draft') and coalesce(e.due_on, e.spent_on) >= v_month
           and coalesce(e.due_on, e.spent_on) < v_end
      ) x
     group by 2, 3, 5
  ), months as (
    select (v_month + make_interval(months => n))::date as month from generate_series(0, p_ahead - 1) n
  ), cur as (
    select distinct c.currency from (select currency from exp_in union select currency from exp_out) c
  ), pos as (
    select 'position'::text as section, m.month, ''::text as group_key, null::text as label, c.currency,
           coalesce((select sum(i.amount) from exp_in i where i.month = m.month and i.currency = c.currency), 0)
           - coalesce((select sum(o.amount) from exp_out o where o.month = m.month and o.currency = c.currency), 0) as amount,
           0 as items
      from months m cross join cur c
  )
  select * from inv
  union all select * from overdue
  union all select * from exp_in
  union all select * from exp_out
  union all select * from rec
  union all select * from pos
  order by 1, 2 nulls first, 3, 5;
end $$;
revoke execute on function public.cash_report(uuid, date, date, integer, timestamptz) from public, anon;
grant execute on function public.cash_report(uuid, date, date, integer, timestamptz) to authenticated;

-- ── Spending ─────────────────────────────────────────────────────────────────
-- Confirmed expenses dated in [from, until), at their cost (amount excl. VAT, plus the VAT that
-- isn't recovered), with `total` (with VAT) beside it. Capital purchases count in full on their date
-- here (this is money spent; the results in K2 spread them). group_by: total, category, kind,
-- supplier (id, else 'name:<typed name>'), gig, month. An empty group_key holds what has no such
-- group, so each grouping adds up to the total.
create or replace function public.spending(p_org uuid, p_from date, p_until date, p_group text default 'total')
returns table(group_key text, group_label text, starter_key text, currency text, amount numeric, total numeric, items integer)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  if p_group not in ('total', 'category', 'kind', 'supplier', 'gig', 'month') then
    raise exception 'Bad grouping' using errcode = '22023';
  end if;
  return query
  with x as (
    select ec.cost, e.total, e.currency,
           case p_group
             when 'total' then ''
             when 'category' then coalesce(e.category_id::text, '')
             when 'kind' then coalesce(c.kind, '')
             when 'supplier' then coalesce(e.supplier_id::text, 'name:' || nullif(trim(e.supplier_name), ''), '')
             when 'gig' then coalesce(e.gig_id::text, '')
             else to_char(date_trunc('month', e.spent_on), 'YYYY-MM-DD') end as gkey,
           case p_group
             when 'category' then c.name
             when 'supplier' then coalesce(s.name, nullif(trim(e.supplier_name), ''))
             when 'gig' then g.name
             else null end as glabel,
           case when p_group = 'category' then c.starter_key end as skey
      from public.expenses e
      join private.expense_costs ec on ec.id = e.id
      left join public.expense_categories c on c.id = e.category_id
      left join public.suppliers s on s.id = e.supplier_id
      left join public.gigs g on g.id = e.gig_id
     where e.org_id = p_org and e.removed_at is null and e.status = 'confirmed'
       and e.spent_on >= p_from and e.spent_on < p_until
  )
  select x.gkey, max(x.glabel), max(x.skey), x.currency, sum(x.cost), sum(x.total), count(*)::integer
    from x group by x.gkey, x.currency
   order by 5 desc, 1;
end $$;
revoke execute on function public.spending(uuid, date, date, text) from public, anon;
grant execute on function public.spending(uuid, date, date, text) to authenticated;

-- ── Client balance ───────────────────────────────────────────────────────────
-- Per client and currency, every invoice ever issued: invoiced (with VAT), deposits invoiced,
-- credited, paid, balance (left to pay), overdue (left on invoices past due), the oldest open due
-- date and how many invoices are open. p_client narrows it to one client (step 26's portal).
create or replace function public.client_balance(p_org uuid, p_client uuid default null, p_at timestamptz default now())
returns table(client_key text, client_id uuid, client_name text, currency text, invoiced numeric, deposits numeric,
              credited numeric, paid numeric, balance numeric, overdue numeric, oldest_due date, open_invoices integer)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_today date;
begin
  perform private.require_finance(p_org);
  v_today := private.org_today(p_org, p_at);
  return query
  with inv as (
    select coalesce(i.client_id::text, 'name:' || coalesce(nullif(trim(i.client_name), ''), '')) as ckey,
           i.client_id, coalesce(c.name, nullif(trim(i.client_name), '')) as cname, i.currency, i.scope, i.status,
           i.total, i.due_date, x.credited, x.paid, greatest(i.total - x.credited - x.paid, 0) as left_amt
      from public.invoices i
      left join public.clients c on c.id = i.client_id
      cross join lateral (
        select coalesce((select sum(cn.total) from public.invoices cn
                          where cn.credited_invoice_id = i.id and cn.removed_at is null and cn.status in ('issued', 'paid')), 0) as credited,
               coalesce((select sum(p.amount) from public.invoice_payments p
                          where p.invoice_id = i.id and p.removed_at is null), 0) as paid
      ) x
     where i.org_id = p_org and i.removed_at is null and i.kind = 'invoice' and i.status in ('issued', 'paid')
       and (p_client is null or i.client_id = p_client)
  )
  select inv.ckey, inv.client_id, max(inv.cname), inv.currency,
         sum(inv.total), coalesce(sum(inv.total) filter (where inv.scope = 'deposit'), 0),
         sum(inv.credited), sum(inv.paid),
         coalesce(sum(inv.left_amt) filter (where inv.status = 'issued'), 0),
         coalesce(sum(inv.left_amt) filter (where inv.status = 'issued' and inv.due_date < v_today), 0),
         min(inv.due_date) filter (where inv.status = 'issued' and inv.left_amt > 0),
         (count(*) filter (where inv.status = 'issued' and inv.left_amt > 0))::integer
    from inv
   group by inv.ckey, inv.client_id, inv.currency
   order by 9 desc, 3;
end $$;
revoke execute on function public.client_balance(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.client_balance(uuid, uuid, timestamptz) to authenticated;

-- ── Forecast ─────────────────────────────────────────────────────────────────
-- From this month for p_months months, per month and currency: confirmed = accepted revenue (the
-- K1 rule) dated from today on; waiting = quotes sent and still valid, dated as K1 dates them (one
-- dated before today counts in this month), with how many. win_rate_count and win_rate_value: the
-- last 12 months (decided dates), accepted ÷ (accepted + declined), the same on every row of a
-- currency; null when nothing was decided. Shown beside the waiting quotes, never multiplied in.
create or replace function public.revenue_forecast(p_org uuid, p_months integer default 3, p_at timestamptz default now())
returns table(month date, currency text, confirmed numeric, waiting numeric, waiting_quotes integer,
              win_rate_count numeric, win_rate_value numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_today date; v_month date; v_end date;
begin
  perform private.require_finance(p_org);
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Bad months' using errcode = '22023'; end if;
  v_today := private.org_today(p_org, p_at);
  v_month := date_trunc('month', v_today)::date;
  v_end := (v_month + make_interval(months => p_months))::date;
  return query
  with conf as (
    select date_trunc('month', l.report_date)::date as month, l.currency, sum(l.amount) as amount
      from public.report_revenue_lines(p_org, v_today, v_end) l
     group by 1, 2
  ), wait as (
    select greatest(date_trunc('month', coalesce(g.start_date, l.own_date))::date, v_month) as month, l.currency,
           sum(l.amount) as amount, count(distinct l.quote_id)::integer as n
      from private.report_quote_lines l
      left join public.gigs g on g.id = l.gig_id
     where l.org_id = p_org and l.status = 'sent' and (l.valid_until is null or l.valid_until >= v_today)
       and coalesce(g.start_date, l.own_date, v_today) < v_end
     group by 1, 2
  ), decided as (
    select q.id, q.status, q.currency, coalesce((select sum(l.amount) from private.report_quote_lines l where l.quote_id = q.id), 0) as value
      from public.quotes q
     where q.org_id = p_org and q.status in ('accepted', 'declined')
       and q.decided_at >= (v_month - interval '11 months') and q.decided_at < (v_month + interval '1 month')
  ), rate as (
    select d.currency,
           round(count(*) filter (where d.status = 'accepted')::numeric / count(*), 4) as by_count,
           case when sum(d.value) > 0 then round(sum(d.value) filter (where d.status = 'accepted') / sum(d.value), 4) end as by_value
      from decided d group by d.currency
  ), months as (
    select (v_month + make_interval(months => n))::date as month from generate_series(0, p_months - 1) n
  ), cur as (
    select currency from conf union select currency from wait
  )
  select m.month, c.currency, coalesce(cf.amount, 0), coalesce(w.amount, 0), coalesce(w.n, 0),
         r.by_count, coalesce(r.by_value, case when r.by_count is not null then 0 end)
    from months m cross join cur c
    left join conf cf on cf.month = m.month and cf.currency = c.currency
    left join wait w on w.month = m.month and w.currency = c.currency
    left join rate r on r.currency = c.currency
   order by 1, 2;
end $$;
revoke execute on function public.revenue_forecast(uuid, integer, timestamptz) from public, anon;
grant execute on function public.revenue_forecast(uuid, integer, timestamptz) to authenticated;

-- ── Targets against what happened ────────────────────────────────────────────
-- For [from, until): each live target × the months in the period (part months prorated by days),
-- against the cost of the category's confirmed expenses (budgets) or accepted revenue (revenue,
-- by the K1 rule, through finance_results).
create or replace function public.target_progress(p_org uuid, p_from date, p_until date)
returns table(target_id uuid, kind text, category_id uuid, category_name text, starter_key text, currency text,
              monthly numeric, target numeric, actual numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_months numeric;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  select coalesce(sum(((least(p_until, (x.m + interval '1 month')::date) - greatest(p_from, x.m))::numeric)
                      / ((x.m + interval '1 month')::date - x.m)), 0)
    into v_months
    from generate_series(0, 1200) n
    cross join lateral (select (date_trunc('month', p_from)::date + make_interval(months => n))::date as m) x
   where x.m < p_until;
  return query
  select t.id, t.kind, t.category_id, c.name, c.starter_key, t.currency, t.amount, round(t.amount * v_months, 2),
         case when t.kind = 'budget' then
           coalesce((select sum(ec.cost) from private.expense_costs ec join public.expenses e on e.id = ec.id
                      where e.org_id = p_org and e.category_id = t.category_id and e.currency = t.currency
                        and e.removed_at is null and e.status = 'confirmed'
                        and e.spent_on >= p_from and e.spent_on < p_until), 0)
         else
           coalesce((select f.revenue from public.finance_results(p_org, p_from, p_until, 'total') f
                      where f.currency = t.currency), 0)
         end
    from public.finance_targets t
    left join public.expense_categories c on c.id = t.category_id
   where t.org_id = p_org and t.removed_at is null
   order by (t.kind = 'budget'), c.name;
end $$;
revoke execute on function public.target_progress(uuid, date, date) from public, anon;
grant execute on function public.target_progress(uuid, date, date) to authenticated;

-- ── Overview tiles (K3) ──────────────────────────────────────────────────────
-- overdue_now {currency: left} and overdue_count; cash_in_30 {currency}: left on invoices due from
-- today to 30 days ahead (overdue ones are their own tile); expenses_due_14 {currency}: unpaid
-- confirmed expenses and approved claims due within 14 days, late ones included; revenue_next_3m
-- {currency}: accepted revenue from today to three months ahead.
alter function public.report_overview(uuid, timestamptz) rename to report_overview_pre_k3;
alter function public.report_overview_pre_k3(uuid, timestamptz) set schema private;

create or replace function public.report_overview(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_out jsonb; v_today date; v_tiles jsonb;
begin
  v_out := private.report_overview_pre_k3(p_org, p_at); -- checks private.require_finance
  v_today := (v_out ->> 'today')::date;
  with o as (
    select * from private.open_invoices(p_org, v_today) o where o.left_to_pay > 0
  )
  select jsonb_build_object(
           'overdue_now', coalesce((select jsonb_object_agg(t.currency, t.s) from
               (select o.currency, sum(o.left_to_pay) as s from o where o.days_overdue > 0 group by 1) t), '{}'::jsonb),
           'overdue_count', (select count(*) from o where o.days_overdue > 0),
           'cash_in_30', coalesce((select jsonb_object_agg(t.currency, t.s) from
               (select o.currency, sum(o.left_to_pay) as s from o
                 where o.days_overdue = 0 and coalesce(o.due_date, v_today) <= v_today + 30 group by 1) t), '{}'::jsonb),
           'expenses_due_14', coalesce((select jsonb_object_agg(t.currency, t.s) from
               (select e.currency, sum(e.total) as s from public.expenses e
                 where e.org_id = p_org and e.removed_at is null and e.status = 'confirmed' and e.paid_on is null
                   and coalesce(e.due_on, e.spent_on) <= v_today + 14 group by 1) t), '{}'::jsonb),
           'revenue_next_3m', coalesce((select jsonb_object_agg(t.currency, t.s) from
               (select l.currency, sum(l.amount) as s
                  from public.report_revenue_lines(p_org, v_today, (v_today + interval '3 months')::date) l group by 1) t), '{}'::jsonb))
    into v_tiles;
  return v_out || v_tiles;
end $$;
revoke execute on function private.report_overview_pre_k3(uuid, timestamptz) from public, anon;
grant execute on function private.report_overview_pre_k3(uuid, timestamptz) to authenticated;
revoke execute on function public.report_overview(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview(uuid, timestamptz) to authenticated;
