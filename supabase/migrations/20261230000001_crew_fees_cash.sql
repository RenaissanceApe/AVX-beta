-- K8 · Crew fees to pay join K3's cash report as expected out "crew" (D50 h, docs/ANALYTICS.md,
-- "How K8 works"). public.cash_report is renamed private.cash_report_pre_k8 and wrapped (the same
-- signature and rights). Needs 20261230000000_crew_numbers.sql. Checks in
-- supabase/tests/finance_cash.sql (the K8 block). Written without destructive statements.
-- ── Cash: crew fees to pay join expected out (D50 h) ─────────────────────────
-- Fees to pay with no expense linked yet count in this month as expected out "crew" (at the agreed
-- fee, euros). A fee whose invoice is recorded already counts through that expense ("unpaid"), so
-- nothing is counted twice. Security definer (fees are readable only by a gig's managers): totals
-- per currency only, after the finance check.
create or replace function private.crew_fees_unbilled(p_org uuid, p_at timestamptz default now())
returns table(currency text, amount numeric, items integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_finance(p_org);
  return query
  select r.currency, sum(r.amount), count(*)::integer
  from private.crew_to_pay_rows(p_org, private.org_today(p_org, p_at)) r
  where r.estimated
  group by r.currency;
end $$;
revoke execute on function private.crew_fees_unbilled(uuid, timestamptz) from public, anon;
grant execute on function private.crew_fees_unbilled(uuid, timestamptz) to authenticated;

alter function public.cash_report(uuid, date, date, integer, timestamptz) rename to cash_report_pre_k8;
alter function public.cash_report_pre_k8(uuid, date, date, integer, timestamptz) set schema private;

create or replace function public.cash_report(p_org uuid, p_from date, p_until date, p_ahead integer default 3,
                                              p_at timestamptz default now())
returns table(section text, month date, group_key text, label text, currency text, amount numeric, items integer)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_month date;
begin
  perform private.require_finance(p_org);
  if p_ahead is null or p_ahead < 1 or p_ahead > 24 then raise exception 'Bad months ahead' using errcode = '22023'; end if;
  v_month := date_trunc('month', private.org_today(p_org, p_at))::date;
  return query
  with base as (
    select * from private.cash_report_pre_k8(p_org, p_from, p_until, p_ahead, p_at) -- checks the period
  ), crew as (
    select * from private.crew_fees_unbilled(p_org, p_at) c where c.items > 0
  ), months as (
    select (v_month + make_interval(months => n))::date as month from generate_series(0, p_ahead - 1) n
  ), cur as (
    select b.currency from base b where b.section = 'position' union select c.currency from crew c
  )
  select b.* from base b where b.section <> 'position'
  union all
  select 'expected_out'::text, v_month, 'crew'::text, null::text, c.currency, c.amount, c.items from crew c
  union all
  select 'position'::text, m.month, ''::text, null::text, x.currency,
         coalesce((select b.amount from base b where b.section = 'position' and b.month = m.month and b.currency = x.currency), 0)
         - case when m.month = v_month then coalesce((select c.amount from crew c where c.currency = x.currency), 0) else 0 end,
         0
    from months m cross join cur x
  order by 1, 2 nulls first, 3, 5;
end $$;
revoke execute on function public.cash_report(uuid, date, date, integer, timestamptz) from public, anon;
grant execute on function public.cash_report(uuid, date, date, integer, timestamptz) to authenticated;
