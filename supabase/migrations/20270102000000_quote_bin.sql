-- Quote bin (#124): "Delete" on a quote now moves it to Recently deleted for 15 days instead of
-- erasing it at once. Written without destructive statements; only adds.
--
-- - quotes.removed_at / removed_by: when and by whom a quote was put in the bin.
-- - quotes_select hides quotes in the bin, so every list, search, count and report that runs as
--   the reader skips them. quotes_insert / quotes_update can't set removed_at (only the functions
--   below can), and the app can no longer erase a quote directly.
-- - Readers that don't run as the reader get the same filter by hand: private.report_quote_lines
--   (finance_results, shared report links), public.gig_finance (gig wrap-up), private.can_see_card
--   (quote cards in chat), private.guest_resolve (the client's chat on a quote link) and
--   public.clients_from_quotes.
-- - public.remove_quote(id) / public.restore_quote(id): the same people as before (an organisation
--   admin or the quote's author). public.removed_quotes(org): the bin, only the quotes the reader
--   may restore.
-- - private.erase_removed_quotes(): erases for good what has been in the bin for more than
--   15 days; pg_cron runs it every night. Versions and client links go with the quote (as before);
--   crew positions, gig equipment and invoices keep their rows without the link.
-- A quote keeps its versions, links and number while it's in the bin, and gets them all back on
-- restore. The quote-public Edge Function answers "not found" for a quote in the bin.

-- ── The columns ──────────────────────────────────────────────────────────────
alter table public.quotes add column if not exists removed_at timestamptz;
alter table public.quotes add column if not exists removed_by uuid references auth.users(id) on delete set null;
create index if not exists quotes_removed_idx on public.quotes (org_id, removed_at) where removed_at is not null;

-- ── Who sees and changes a quote in the bin ──────────────────────────────────
alter policy quotes_select on public.quotes using (private.can_quote(org_id) and removed_at is null);
alter policy quotes_insert on public.quotes with check (private.can_quote(org_id) and removed_at is null);
alter policy quotes_update on public.quotes using (private.can_quote(org_id) and removed_at is null)
  with check (private.can_quote(org_id) and removed_at is null);
-- Putting a quote in the bin goes through remove_quote; erasing is left to the nightly clean-up
revoke delete on public.quotes from authenticated;

-- ── Readers that don't run as the reader ─────────────────────────────────────
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
where not pp.optional and k.kind <> 'comment'
  and q.removed_at is null;  -- quote bin: a quote in Recently deleted counts nowhere

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
    from public.quotes q where q.org_id = p_org and q.gig_id = any(v_gigs) and q.status = 'accepted' and q.removed_at is null
    union all
    (select distinct on (q.gig_id) q.gig_id, q.id, true
     from public.quotes q
     where q.org_id = p_org and q.gig_id = any(v_gigs) and q.status = 'sent' and q.removed_at is null
       and not exists (select 1 from public.quotes a where a.gig_id = q.gig_id and a.org_id = p_org and a.status = 'accepted' and a.removed_at is null)
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

create or replace function private.can_see_card(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'gig' then private.can_access_gig(p_id)
    when 'callsheet' then private.can_access_gig(p_id)
    when 'schedule' then exists (select 1 from public.gig_schedule s where s.id = p_id and private.can_access_gig(s.gig_id))
    when 'asset' then exists (select 1 from public.assets a where a.id = p_id and private.can_access_gig(a.gig_id))
    when 'quote' then exists (select 1 from public.quotes q where q.id = p_id and q.removed_at is null and private.can_quote(q.org_id))
    when 'item' then exists (select 1 from public.price_items i where i.id = p_id and private.can_quote(i.org_id))
    else false end
$$;

create or replace function private.guest_resolve(p_token text)
returns table(conversation_id uuid, org_id uuid, context_type text, context_id uuid, link_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare v_hash text; v_share record; v_link record; v_title text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then return; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select s.id, s.quote_id, s.org_id, s.created_by, q.title into v_share
    from public.quote_shares s join public.quotes q on q.id = s.quote_id
   where s.token_hash = v_hash and s.status <> 'revoked' and q.removed_at is null;
  if v_share.id is not null then
    return query select private.ensure_context('quote', v_share.quote_id, v_share.org_id, v_share.title, v_share.created_by),
                        v_share.org_id, 'quote'::text, v_share.quote_id, v_share.id;
    return;
  end if;
  select l.id, l.subrental_id, l.org_id, l.created_by into v_link
    from public.supplier_links l where l.token_hash = v_hash and l.revoked_at is null;
  if v_link.id is not null then
    select coalesce(sp.name, '') into v_title from public.subrentals s left join public.suppliers sp on sp.id = s.supplier_id where s.id = v_link.subrental_id;
    update public.supplier_links set last_seen_at = now() where id = v_link.id;
    return query select private.ensure_context('supplier', v_link.subrental_id, v_link.org_id, v_title, v_link.created_by),
                        v_link.org_id, 'supplier'::text, v_link.subrental_id, v_link.id;
  end if;
end $$;

create or replace function public.clients_from_quotes(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_id uuid; n_created integer := 0; n_linked integer := 0; v_count integer;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  for r in
    select distinct on (lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))))
      lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))) as key,
      trim(coalesce(nullif(trim(q.client_company), ''), q.client_name)) as name,
      case when nullif(trim(q.client_company), '') is not null then nullif(trim(q.client_name), '') end as contact_name,
      nullif(trim(q.client_email), '') as email, nullif(trim(q.client_address), '') as address, nullif(trim(q.client_tax_id), '') as tax_id
    from public.quotes q
    where q.org_id = p_org and q.client_id is null and q.removed_at is null and nullif(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name)), '') is not null
    order by lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))), q.updated_at desc
  loop
    select c.id into v_id from public.clients c where c.org_id = p_org and lower(c.name) = r.key order by c.archived_at nulls first, c.created_at limit 1;
    if v_id is null then
      insert into public.clients (org_id, name, contact_name, email, address, tax_id)
      values (p_org, left(r.name, 200), left(r.contact_name, 120), r.email, r.address, r.tax_id) returning id into v_id;
      n_created := n_created + 1;
    end if;
    update public.quotes q set client_id = v_id
     where q.org_id = p_org and q.client_id is null and q.removed_at is null and lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))) = r.key;
    get diagnostics v_count = row_count;
    n_linked := n_linked + v_count;
  end loop;
  return jsonb_build_object('created', n_created, 'linked', n_linked);
end $$;
-- ── Remove, restore, list ────────────────────────────────────────────────────
-- The same rule as before: an organisation admin, or the person who made the quote.
create or replace function private.can_remove_quote(p_org uuid, p_created_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_quote(p_org) and (private.is_org_admin(p_org) or p_created_by = auth.uid())
$$;
revoke execute on function private.can_remove_quote(uuid, uuid) from public, anon;
grant execute on function private.can_remove_quote(uuid, uuid) to authenticated;

create or replace function public.remove_quote(p_quote uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_by uuid;
begin
  perform private.require_mfa();
  select q.org_id, q.created_by into v_org, v_by from public.quotes q where q.id = p_quote and q.removed_at is null for update;
  if v_org is null or not private.can_remove_quote(v_org, v_by) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.quotes set removed_at = now(), removed_by = auth.uid() where id = p_quote;
end $$;
revoke execute on function public.remove_quote(uuid) from public, anon;
grant execute on function public.remove_quote(uuid) to authenticated;

create or replace function public.restore_quote(p_quote uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_by uuid;
begin
  perform private.require_mfa();
  select q.org_id, q.created_by into v_org, v_by from public.quotes q where q.id = p_quote and q.removed_at is not null for update;
  if v_org is null or not private.can_remove_quote(v_org, v_by) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.quotes set removed_at = null, removed_by = null where id = p_quote;
end $$;
revoke execute on function public.restore_quote(uuid) from public, anon;
grant execute on function public.restore_quote(uuid) to authenticated;

-- The bin: quotes the reader may restore, most recently removed first
create or replace function public.removed_quotes(p_org uuid)
returns table(id uuid, number integer, title text, status text, client_name text, client_company text,
              total_net numeric, currency text, removed_at timestamptz, erase_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select q.id, q.number, q.title, q.status, q.client_name, q.client_company, q.total_net, q.currency,
         q.removed_at, q.removed_at + interval '15 days'
  from public.quotes q
  where q.org_id = p_org and q.removed_at is not null and private.can_remove_quote(q.org_id, q.created_by)
  order by q.removed_at desc, q.id;
end $$;
revoke execute on function public.removed_quotes(uuid) from public, anon;
grant execute on function public.removed_quotes(uuid) to authenticated;

-- ── The nightly clean-up ─────────────────────────────────────────────────────
-- Erases quotes that have been in the bin for more than 15 days. Returns how many.
create or replace function private.erase_removed_quotes() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.quotes q where q.removed_at is not null and q.removed_at < now() - interval '15 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function private.erase_removed_quotes() from public, anon, authenticated;

select cron.schedule('avx-quote-bin', '41 3 * * *', 'select private.erase_removed_quotes()');
