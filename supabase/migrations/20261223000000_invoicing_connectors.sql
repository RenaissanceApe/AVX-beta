-- Step 11b (docs/BUSINESS.md "How invoicing connectors work"): each organisation can connect ONE
-- certified invoicing program (Moloni, InvoiceXpress or TOConline) or stay manual. AVX still never
-- issues a legal invoice: the invoicing Edge Function sends a DRAFT to the program and reads back the
-- number, dates and PDF link once it is finalised there. Manual stays available for everyone.
--
-- - moloni_connections (step 11, unused) is renamed invoicing_connections and gains a provider and
--   the keys some programs need. Still no rules and no grants: only the Edge Function (service role)
--   reads it, so nobody in the app, admins included, can read a key back.
-- - invoicing_status() replaces moloni_status() (which loses its grant; it is kept).
-- - invoices.provider / provider_document_id: which program a sent draft went to, and its id there.
--   Written by the Edge Function only (no column grants); cleared when an invoice is back to draft.
-- - The organisation export gains an invoicing_connection file (no keys) and the invoices file
--   gains the program.
-- Checks: supabase/tests/invoicing_connectors.sql (nothing destructive).

-- ── Connections ──────────────────────────────────────────────────────────────
alter table if exists public.moloni_connections rename to invoicing_connections;
alter index if exists public.moloni_connections_pkey rename to invoicing_connections_pkey;

alter table public.invoicing_connections
  add column if not exists provider text,       -- null: manual (or disconnected)
  add column if not exists account text,        -- InvoiceXpress: account name; TOConline: client id
  add column if not exists api_key text,        -- InvoiceXpress: API key; TOConline: client secret
  add column if not exists settings jsonb not null default '{}'::jsonb;  -- TOConline: oauth_url, api_url

do $$ begin
  alter table public.invoicing_connections add constraint invoicing_connections_provider_check
    check (provider is null or provider in ('moloni', 'invoicexpress', 'toconline'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.invoicing_connections add constraint invoicing_connections_sizes_check
    check (char_length(coalesce(account, '')) <= 200 and char_length(coalesce(api_key, '')) <= 500
           and jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 4000);
exception when duplicate_object then null; end $$;

-- A Moloni connection begun before this step stays Moloni's
update public.invoicing_connections set provider = 'moloni'
 where provider is null and (refresh_token is not null or state_hash is not null);

alter table public.invoicing_connections enable row level security;
revoke all on public.invoicing_connections from anon, authenticated;

-- The old status function read the old table name; it stays, without a grant
revoke execute on function public.moloni_status(uuid) from public, anon, authenticated;

-- Which program the organisation uses, and whether it is ready (never a key or token).
-- Admins and members (the people who see invoices) ask it to show the program's buttons.
create or replace function public.invoicing_status(p_org uuid)
returns table(provider text, connected boolean, expired boolean, account text, company_name text,
              document_set_name text, ready boolean, connected_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not private.can_see_finance(p_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with c as (
    select x.*,
           case x.provider when 'invoicexpress' then x.api_key is not null and x.account is not null
                           else x.refresh_token is not null end as is_connected,
           case x.provider when 'moloni' then x.refresh_token is not null and coalesce(x.refresh_expires_at, now()) <= now()
                           when 'toconline' then x.refresh_token is not null and x.refresh_expires_at is not null and x.refresh_expires_at <= now()
                           else false end as is_expired
      from public.invoicing_connections x where x.org_id = p_org and x.provider is not null)
  select c.provider, c.is_connected, c.is_expired,
         case when c.provider = 'invoicexpress' then c.account end,
         c.company_name, c.document_set_name,
         c.is_connected and not c.is_expired and (c.provider <> 'moloni' or (c.company_id is not null and c.document_set_id is not null)),
         c.connected_at
    from c;
end $$;
revoke execute on function public.invoicing_status(uuid) from public, anon;
grant execute on function public.invoicing_status(uuid) to authenticated;

-- ── Invoices: where a sent draft went ────────────────────────────────────────
alter table public.invoices
  add column if not exists provider text,
  add column if not exists provider_document_id text;
do $$ begin
  alter table public.invoices add constraint invoices_provider_check
    check ((provider is null or provider in ('moloni', 'invoicexpress', 'toconline'))
           and char_length(coalesce(provider_document_id, '')) <= 100);
exception when duplicate_object then null; end $$;
-- (Column grants from step 11 cover only the app's fields, so the app can't write these two.)

-- A new invoice, or one back to draft, belongs to no program
create or replace function private.invoices_provider_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status = 'draft' then
    new.provider := null;
    new.provider_document_id := null;
  end if;
  return new;
end $$;
revoke execute on function private.invoices_provider_fields() from public, anon, authenticated;
create or replace trigger invoices_provider_fields before insert or update on public.invoices
  for each row execute function private.invoices_provider_fields();

-- ── Organisation export ──────────────────────────────────────────────────────
do $$ begin
  if to_regprocedure('private.export_org_part_pre_step11b(uuid, text, integer)') is null then
    alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step11b;
  end if;
end $$;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_part = 'invoices' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.number as avx_number, i.kind, i.legal_number, ci.legal_number as credits, i.status,
             (i.kind = 'invoice' and i.status = 'issued' and i.due_date < private.org_today(p_org)) as overdue,
             q.number as quote_number, g.name as gig, i.client_name as client, i.client_tax_id, i.scope, i.deposit_pct,
             i.issue_date, i.due_date, i.paid_on, i.currency, i.net, i.vat, i.total, i.pdf_url, i.notes,
             i.sent_at, i.issued_at, i.removed_at, i.created_at, i.provider as program
        from public.invoices i
        left join public.invoices ci on ci.id = i.credited_invoice_id
        left join public.quotes q on q.id = i.quote_id
        left join public.gigs g on g.id = i.gig_id
       where i.org_id = p_org
       order by i.number offset v_off limit v_lim) x;
    return coalesce(v_out, '[]'::jsonb);
  end if;
  if p_part = 'invoicing_connection' then
    -- Which program, company and series; never a key or token
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select c.provider as program, case when c.provider = 'invoicexpress' then c.account end as account,
             c.company_name as company, c.document_set_name as series, c.connected_at
        from public.invoicing_connections c
       where c.org_id = p_org and c.provider is not null and v_off = 0) x;
    return coalesce(v_out, '[]'::jsonb);
  end if;
  return private.export_org_part_pre_step11b(p_org, p_part, p_offset);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step11b(uuid, text, integer) from public, anon, authenticated;
