-- K4 (docs/ANALYTICS.md): sales and clients. Functions only, no new tables.
--
-- - private.sales_num, private.sales_optional, private.sales_quote_gross: a quote's priced lines
--   before any discount (line, phase or quote), read the way the revenue rule reads them, for
--   "discounts given".
-- - private.sales_quotes(org): one row per quote that left draft, with its value (the K1 revenue
--   rule, private.report_quote_lines), gross, client (the gig's client first, as finance_results),
--   author, dates in the organisation's time zone and the custom values of its gig and client.
-- - public.sales_waiting(org, days, at): quotes waiting for an answer, with age, opened by the
--   client, expiring soon, expired and the follow-up flag (sent `days` or more days ago, still valid).
-- - public.sales_win_rate(org, from, until, group_by): win rate by count and value, time from sent to
--   decision, average quote value and discounts, per period, gig type, client, author, lost reason
--   or a custom field of kind "choice" (field:<id>).
-- - public.sales_clients(org, from, until, client, at): revenue and margin (finance_results), gigs,
--   quotes, win rate, first, last and next gig, new and returning clients.
-- - public.report_overview_k4(org, at): the K4 tiles (follow-ups, win rate over 90 days, top client
--   this year). report_overview itself is left as it is (other steps add their own functions).
-- Decided with the owner (2026-11-08): follow-ups after 7 days with no answer; win rate per person
-- for admins and members (both see money, D23); grouping by a custom field of kind "choice".
-- Every public function runs as the reader and calls private.require_finance.
-- Written without destructive statements.

-- ── Numbers in a quote body, as the revenue rule reads them ──────────────────
create or replace function private.sales_num(p_v jsonb, p_default numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p_v)
           when 'number' then (p_v #>> '{}')::numeric
           when 'string' then case when replace(trim(p_v #>> '{}'), ',', '.') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$'
                                   then replace(trim(p_v #>> '{}'), ',', '.')::numeric else p_default end
           else p_default end
$$;

create or replace function private.sales_optional(p_v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case jsonb_typeof(p_v) when 'boolean' then (p_v #>> '{}')::boolean when 'string' then (p_v #>> '{}') <> ''
              when 'number' then (p_v #>> '{}')::numeric <> 0 when 'object' then true when 'array' then true else false end
$$;

-- Priced lines before every discount: round(qty × factor × price, 2), optional phases and comments
-- left out (the same lines private.report_quote_lines counts)
create or replace function private.sales_quote_gross(p_body jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(sum(round(private.sales_num(l.v -> 'qty', 1) * private.sales_num(l.v -> 'factor', 1)
                            * private.sales_num(l.v -> 'unit_price', 0), 2)), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_body -> 'phases') = 'array' then p_body -> 'phases' else '[]'::jsonb end) ph(v)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(ph.v -> 'sections') = 'array' then ph.v -> 'sections' else '[]'::jsonb end) s(v)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.v -> 'lines') = 'array' then s.v -> 'lines' else '[]'::jsonb end) l(v)
  where not private.sales_optional(ph.v -> 'optional') and coalesce(l.v ->> 'kind', '') <> 'comment'
$$;
revoke execute on function private.sales_num(jsonb, numeric) from public, anon;
revoke execute on function private.sales_optional(jsonb) from public, anon;
revoke execute on function private.sales_quote_gross(jsonb) from public, anon;
grant execute on function private.sales_num(jsonb, numeric) to authenticated;
grant execute on function private.sales_optional(jsonb) to authenticated;
grant execute on function private.sales_quote_gross(jsonb) to authenticated;

-- ── Every quote that left draft, ready to count ──────────────────────────────
-- The client is the gig's client, else the quote's, and only a client of this organisation (a key
-- of another organisation's client is never made); else the typed company or name ("name:…").
create or replace function private.sales_quotes(p_org uuid)
returns table(quote_id uuid, quote_number integer, title text, status text, currency text, value numeric, gross numeric,
              client_key text, client_id uuid, client_label text, gig_id uuid, gig_type_id uuid, created_by uuid,
              sent_at timestamptz, decided_at timestamptz, sent_on date, decided_on date, valid_until date, lost_reason text,
              gig_custom jsonb, client_custom jsonb)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_tz text;
begin
  perform private.require_finance(p_org);
  select coalesce(o.time_zone, 'UTC') into v_tz from public.organisations o where o.id = p_org;
  return query
  with v as (
    select l.quote_id, sum(l.amount) as amount
    from private.report_quote_lines l
    where l.org_id = p_org and l.status <> 'draft'
    group by l.quote_id
  )
  select q.id, q.number, q.title, q.status, q.currency, coalesce(v.amount, 0), private.sales_quote_gross(q.body),
         case when c.id is not null then c.id::text
              when nullif(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name)), '') is not null
                then 'name:' || lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))) end,
         c.id,
         coalesce(c.name, nullif(trim(q.client_company), ''), nullif(trim(q.client_name), '')),
         q.gig_id, g.gig_type_id, q.created_by, q.sent_at, q.decided_at,
         coalesce((q.sent_at at time zone v_tz)::date, q.issue_date), (q.decided_at at time zone v_tz)::date,
         q.valid_until, q.lost_reason, coalesce(g.custom_values, '{}'::jsonb), coalesce(c.custom_values, '{}'::jsonb)
  from public.quotes q
  left join v on v.quote_id = q.id
  left join public.gigs g on g.id = q.gig_id and g.org_id = p_org
  left join public.clients c on c.id = coalesce(g.client_id, q.client_id) and c.org_id = p_org
  where q.org_id = p_org and q.status <> 'draft';
end $$;
revoke execute on function private.sales_quotes(uuid) from public, anon;
grant execute on function private.sales_quotes(uuid) to authenticated;

-- ── Waiting for an answer ────────────────────────────────────────────────────
-- Each sent quote: age in days (sent date, organisation's time zone), opened by the client (any of
-- its links viewed), expiring = valid until today to 7 days ahead, expired = past its validity (out
-- of the win rate, D42 definitions), follow_up = sent p_days or more days ago and not expired.
create or replace function public.sales_waiting(p_org uuid, p_days integer default 7, p_at timestamptz default now())
returns table(quote_id uuid, quote_number integer, title text, client_key text, client_name text, author_id uuid, author_name text,
              currency text, value numeric, sent_on date, days_waiting integer, valid_until date, days_left integer,
              opened boolean, last_viewed_at timestamptz, expiring boolean, expired boolean, follow_up boolean)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_today date;
begin
  perform private.require_finance(p_org);
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'Bad days' using errcode = '22023'; end if;
  v_today := private.org_today(p_org, p_at);
  return query
  select f.quote_id, f.quote_number, f.title, f.client_key, f.client_label, f.created_by, pr.full_name,
         f.currency, f.value, f.sent_on, (v_today - f.sent_on), f.valid_until, (f.valid_until - v_today),
         sh.viewed is not null, sh.viewed,
         f.valid_until is not null and f.valid_until >= v_today and f.valid_until <= v_today + 7,
         f.valid_until is not null and f.valid_until < v_today,
         (f.valid_until is null or f.valid_until >= v_today) and f.sent_on <= v_today - p_days
  from private.sales_quotes(p_org) f
  left join public.profiles pr on pr.id = f.created_by
  left join lateral (select max(s.viewed_at) as viewed from public.quote_shares s where s.quote_id = f.quote_id) sh on true
  where f.status = 'sent'
  order by f.sent_on, f.quote_number;
end $$;
revoke execute on function public.sales_waiting(uuid, integer, timestamptz) from public, anon;
grant execute on function public.sales_waiting(uuid, integer, timestamptz) to authenticated;

-- ── Win rate ─────────────────────────────────────────────────────────────────
-- Quotes accepted or declined with a decided date in [from, until) (organisation's time zone), per
-- group and currency. Quotes still sent (also expired ones) are never in it. Per row: how many were
-- decided, accepted and declined, their values, win rate by count (accepted ÷ decided) and by value,
-- median days from sent to decided, average value of a decided quote, gross and discount of the
-- accepted ones. group_by: total, month, quarter, gig_type, client, author, lost_reason, or
-- field:<id> (a live custom field of kind "choice" on gigs or clients of this organisation). An
-- empty group_key holds the quotes with no such group, so every grouping adds up to the total.
create or replace function public.sales_win_rate(p_org uuid, p_from date, p_until date, p_group text default 'total')
returns table(group_key text, group_label text, currency text, decided integer, accepted integer, declined integer,
              value_accepted numeric, value_declined numeric, win_rate_count numeric, win_rate_value numeric,
              median_days numeric, avg_value numeric, gross_accepted numeric, discount_accepted numeric)
language plpgsql stable security invoker set search_path = '' set jit = off as $$
#variable_conflict use_column
declare v_field text; v_entity text;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  if p_group is null then raise exception 'Bad grouping' using errcode = '22023'; end if;
  if p_group like 'field:%' then
    select f.id::text, f.entity into v_field, v_entity
      from public.custom_fields f
     where f.org_id = p_org and f.kind = 'choice' and f.removed_at is null and f.entity in ('gig', 'client')
       and f.id::text = substr(p_group, 7);
    if v_field is null then raise exception 'Bad grouping' using errcode = '22023'; end if;
  elsif p_group not in ('total', 'month', 'quarter', 'gig_type', 'client', 'author', 'lost_reason') then
    raise exception 'Bad grouping' using errcode = '22023';
  end if;
  return query
  with d as (
    select f.*,
           case when p_group = 'total' then 'total'
                when p_group = 'month' then to_char(f.decided_on, 'YYYY-MM')
                when p_group = 'quarter' then to_char(f.decided_on, 'YYYY') || '-Q' || extract(quarter from f.decided_on)::int
                when p_group = 'gig_type' then f.gig_type_id::text
                when p_group = 'client' then f.client_key
                when p_group = 'author' then f.created_by::text
                when p_group = 'lost_reason' then f.lost_reason
                when v_entity = 'gig' then nullif(trim(f.gig_custom ->> v_field), '')
                else nullif(trim(f.client_custom ->> v_field), '') end as k,
           case when f.sent_at is not null and f.decided_at >= f.sent_at
                then extract(epoch from (f.decided_at - f.sent_at)) / 86400.0 end as days
    from private.sales_quotes(p_org) f
    where f.status in ('accepted', 'declined') and f.decided_on >= p_from and f.decided_on < p_until
  )
  select d.k,
         max(case when p_group = 'gig_type' then gt.name when p_group = 'client' then d.client_label
                  when p_group = 'author' then coalesce(pr.full_name, '') else d.k end),
         d.currency,
         count(*)::integer,
         count(*) filter (where d.status = 'accepted')::integer,
         count(*) filter (where d.status = 'declined')::integer,
         coalesce(sum(d.value) filter (where d.status = 'accepted'), 0),
         coalesce(sum(d.value) filter (where d.status = 'declined'), 0),
         round(count(*) filter (where d.status = 'accepted')::numeric / count(*), 4),
         case when sum(d.value) > 0 then round(coalesce(sum(d.value) filter (where d.status = 'accepted'), 0) / sum(d.value), 4) end,
         round((percentile_cont(0.5) within group (order by d.days))::numeric, 1),
         round(avg(d.value), 2),
         coalesce(sum(d.gross) filter (where d.status = 'accepted'), 0),
         coalesce(sum(d.gross - d.value) filter (where d.status = 'accepted'), 0)
  from d
  left join public.gig_types gt on gt.id = d.gig_type_id and p_group = 'gig_type'
  left join public.profiles pr on pr.id = d.created_by and p_group = 'author'
  group by d.k, d.currency
  order by d.k nulls last, d.currency;
end $$;
revoke execute on function public.sales_win_rate(uuid, date, date, text) from public, anon;
grant execute on function public.sales_win_rate(uuid, date, date, text) to authenticated;

-- ── Clients ──────────────────────────────────────────────────────────────────
-- One row per client and currency for [from, until): revenue and gross margin (finance_results by
-- client: accepted quotes, gigs dated by their start); quotes sent in the period; win rate (decided
-- in the period: by count over every currency, by value in the row's currency). Gigs (the client's
-- gigs, drafts and cancelled ones left out): how many start in the period, the first ever, the last
-- one up to today and the next one after today; new = their first gig starts in the period;
-- returning = a gig in the period and one before it. Counts and gig dates are the same on every row
-- of a client. client_key '' holds revenue and margin with no client. p_client limits it to one
-- client (the numbers card in Contacts).
create or replace function public.sales_clients(p_org uuid, p_from date, p_until date, p_client uuid default null,
                                                p_at timestamptz default now())
returns table(client_key text, client_id uuid, client_name text, currency text, revenue numeric, gross_margin numeric,
              margin_pct numeric, gigs integer, avg_gig_value numeric, quotes integer, decided integer, accepted integer,
              win_rate_count numeric, win_rate_value numeric, first_gig date, last_gig date, next_gig date,
              is_new boolean, is_returning boolean)
language plpgsql stable security invoker set search_path = '' set jit = off set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare v_today date;
begin
  perform private.require_finance(p_org);
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'Bad period' using errcode = '22023';
  end if;
  v_today := private.org_today(p_org, p_at);
  return query
  with fr as (
    select coalesce(r.group_key, '') as k, r.group_label as label, r.currency, r.revenue, r.gross_margin
    from public.finance_results(p_org, p_from, p_until, 'client') r
    where p_client is null or r.group_key = p_client::text
  ), sq as materialized (
    select * from private.sales_quotes(p_org) f
    where f.client_key is not null and (p_client is null or f.client_key = p_client::text)
  ), qk as (
    select sq.client_key as k, max(sq.client_label) as label,
           count(*) filter (where sq.sent_on >= p_from and sq.sent_on < p_until)::integer as quotes,
           count(*) filter (where sq.status in ('accepted', 'declined') and sq.decided_on >= p_from and sq.decided_on < p_until)::integer as decided,
           count(*) filter (where sq.status = 'accepted' and sq.decided_on >= p_from and sq.decided_on < p_until)::integer as accepted
    from sq group by sq.client_key
  ), qc as (
    select sq.client_key as k, sq.currency,
           sum(sq.value) filter (where sq.status = 'accepted') as won, sum(sq.value) as total
    from sq
    where sq.status in ('accepted', 'declined') and sq.decided_on >= p_from and sq.decided_on < p_until
    group by 1, 2
  ), gk as (
    select g.client_id::text as k, max(c.name) as label,
           count(*) filter (where g.start_date >= p_from and g.start_date < p_until)::integer as gigs,
           min(g.start_date) as first_gig,
           max(g.start_date) filter (where g.start_date <= v_today) as last_gig,
           min(g.start_date) filter (where g.start_date > v_today) as next_gig
    from public.gigs g
    join public.clients c on c.id = g.client_id and c.org_id = p_org
    where g.org_id = p_org and g.status not in ('draft', 'cancelled') and g.start_date is not null
      and (p_client is null or g.client_id = p_client)
    group by g.client_id
  ), keys as (
    select fr.k, fr.currency from fr
    union select qc.k, qc.currency from qc
    union select k.k, 'EUR' from (select qk.k from qk union select gk.k from gk) k
     where not exists (select 1 from fr where fr.k = k.k) and not exists (select 1 from qc where qc.k = k.k)
  )
  select keys.k,
         case when keys.k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then keys.k::uuid end,
         coalesce(gk.label, (select max(fr2.label) from fr fr2 where fr2.k = keys.k), qk.label),
         keys.currency,
         coalesce(fr.revenue, 0), coalesce(fr.gross_margin, 0),
         case when coalesce(fr.revenue, 0) <> 0 then round(fr.gross_margin / fr.revenue * 100, 1) end,
         coalesce(gk.gigs, 0),
         case when coalesce(gk.gigs, 0) > 0 then round(coalesce(fr.revenue, 0) / gk.gigs, 2) end,
         coalesce(qk.quotes, 0), coalesce(qk.decided, 0), coalesce(qk.accepted, 0),
         case when coalesce(qk.decided, 0) > 0 then round(qk.accepted::numeric / qk.decided, 4) end,
         case when coalesce(qc.total, 0) > 0 then round(coalesce(qc.won, 0) / qc.total, 4) end,
         gk.first_gig, gk.last_gig, gk.next_gig,
         coalesce(gk.first_gig >= p_from and gk.first_gig < p_until, false),
         coalesce(gk.gigs > 0 and gk.first_gig < p_from, false)
  from keys
  left join fr on fr.k = keys.k and fr.currency = keys.currency
  left join qc on qc.k = keys.k and qc.currency = keys.currency
  left join qk on qk.k = keys.k
  left join gk on gk.k = keys.k
  order by coalesce(fr.revenue, 0) desc, keys.k, keys.currency;
end $$;
revoke execute on function public.sales_clients(uuid, date, date, uuid, timestamptz) from public, anon;
grant execute on function public.sales_clients(uuid, date, date, uuid, timestamptz) to authenticated;

-- ── Overview tiles (K4) ──────────────────────────────────────────────────────
-- follow_up {count, totals {currency: value}}: quotes to follow up (sent 7 or more days ago, no
-- answer, still valid). win_rate_90 {by_count, by_value, currency, decided}: quotes decided in the 90
-- days up to today; by value in the currency with the most decided value. top_client_year
-- {key, name, currency, amount, share}: the client with the most revenue this year up to today, in
-- the currency with the most revenue; share of that currency's revenue (0–1). The quotes waiting
-- tile is K1's (report_overview); this function stands next to it and doesn't change it.
create or replace function public.report_overview_k4(p_org uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security invoker set search_path = '' set jit = off as $$
declare v_today date; v_follow jsonb; v_rate jsonb; v_top jsonb;
begin
  perform private.require_finance(p_org);
  v_today := private.org_today(p_org, p_at);

  select jsonb_build_object('count', coalesce(sum(t.n), 0), 'totals', coalesce(jsonb_object_agg(t.currency, t.amount), '{}'::jsonb))
    into v_follow
  from (select w.currency, count(*) as n, sum(w.value) as amount
          from public.sales_waiting(p_org, 7, p_at) w where w.follow_up group by w.currency) t;

  with d as (
    select f.status, f.currency, f.value from private.sales_quotes(p_org) f
    where f.status in ('accepted', 'declined') and f.decided_on >= v_today - 89 and f.decided_on <= v_today
  ), cur as (
    select d.currency from d group by d.currency order by sum(d.value) desc, (d.currency = 'EUR') desc, d.currency limit 1
  )
  select jsonb_build_object(
           'decided', (select count(*) from d),
           'by_count', (select case when count(*) > 0 then round(count(*) filter (where d.status = 'accepted')::numeric / count(*), 4) end from d),
           'currency', (select cur.currency from cur),
           'by_value', (select case when sum(d.value) > 0 then round(coalesce(sum(d.value) filter (where d.status = 'accepted'), 0) / sum(d.value), 4) end
                          from d where d.currency = (select cur.currency from cur)))
    into v_rate;

  with r as (
    select * from public.finance_results(p_org, date_trunc('year', v_today)::date, v_today + 1, 'client')
  ), cur as (
    select r.currency from r group by r.currency having sum(r.revenue) > 0
    order by sum(r.revenue) desc, (r.currency = 'EUR') desc, r.currency limit 1
  ), top as (
    select r.group_key, r.group_label, r.currency, r.revenue from r
    where r.currency = (select cur.currency from cur) and r.group_key is not null and r.revenue > 0
    order by r.revenue desc, r.group_label limit 1
  )
  select case when top.group_key is null then null else jsonb_build_object(
           'key', top.group_key, 'name', top.group_label, 'currency', top.currency, 'amount', top.revenue,
           'share', round(top.revenue / nullif((select sum(r.revenue) from r where r.currency = top.currency), 0), 4)) end
    into v_top
  from (select 1) one left join top on true;

  return jsonb_build_object('follow_up', v_follow, 'win_rate_90', v_rate, 'top_client_year', v_top);
end $$;
revoke execute on function public.report_overview_k4(uuid, timestamptz) from public, anon;
grant execute on function public.report_overview_k4(uuid, timestamptz) to authenticated;
