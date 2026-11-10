-- FX1 (issue #114): report_overview is faster, with the same numbers and the same rights checks.
--
-- Measured on the test project (warm, as an organisation admin): report_overview took 60–72 ms, of
-- which the K2 layer (private.report_overview_pre_k3) took about 57 ms. That layer called
-- public.finance_results three times (this month, the same days last year, this year), about 18 ms
-- each even with no data, because each call plans its large query again (plan_cache_mode =
-- force_custom_plan) and runs gig_finance, gig_labour_hours and depreciation_lines.
--
-- For "this month" and "same days last year" the layer reads only finance_results' revenue column.
-- With grouping 'total' that column is round(sum(amount), 2) per currency over
-- public.report_revenue_lines(p_org, from, until): finance_results' only 'rev' facts are those lines,
-- one fact per line (each gig appears once in gig_finance, so the left join adds no rows), and no
-- share applies outside grouping 'pm'. So those two calls now read report_revenue_lines directly,
-- which runs the same private.require_finance check. The "this year" call stays as it was: its
-- margin, operating result and gig counts need the whole of finance_results.
--
-- Same name, arguments and result; grants are kept by create or replace. RLS unchanged. No new index.

create or replace function private.report_overview_pre_k3(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_out jsonb; v_today date; v_month date; v_year date; v_tiles jsonb;
begin
  v_out := private.report_overview_pre_k2(p_org, p_at); -- checks private.require_finance
  v_today := (v_out ->> 'today')::date;
  v_month := date_trunc('month', v_today)::date;
  v_year := date_trunc('year', v_today)::date;
  with m as (
    select l.currency, round(sum(l.amount), 2) as revenue
    from public.report_revenue_lines(p_org, v_month, v_today + 1) l group by l.currency
  ), l as (
    select r.currency, round(sum(r.amount), 2) as revenue
    from public.report_revenue_lines(p_org, (v_month - interval '1 year')::date, (v_today + 1 - interval '1 year')::date) r
    group by r.currency
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
