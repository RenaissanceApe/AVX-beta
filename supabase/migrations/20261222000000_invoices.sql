-- Step 11 (docs/BUSINESS.md): invoices, handed to a certified program (Moloni). AVX never issues a
-- legal invoice: it prepares one, sends it to Moloni as a draft, and stores the number and PDF link
-- that Moloni gives it once you finalise it there.
--
-- - VAT per line on quotes: each priced line of every quote (and every saved version) gets its
--   quote's single rate, so nothing changes. Lines saved later carry their own rate; a line without
--   one still uses the quote's (quotes.js lineVatRate). The edit counter is not touched, so nobody
--   with a quote open sees "changed elsewhere".
-- - private.report_quote_lines (the revenue rule, K1) gains each line's vat_rate at the end. Amounts
--   don't change. report_revenue_lines and gig_finance keep their columns (adding one would need a
--   drop); readers that need VAT read the view.
-- - organisations.invoice_due_days: the default payment term (Company details), 30 days.
-- - public.invoices: invoices and credit notes. Admins and members only (can_see_finance), with
--   two-step sign-in when set up. The AVX number is given by the database and nobody can set or
--   change it; the totals are worked out here from the lines (the twin of invoiceTotals in
--   src/lib/invoices.js). Status draft → sent (to Moloni) → issued (Moloni's number) → paid;
--   overdue is worked out (issued, unpaid, past its due date). Only drafts can be changed or
--   removed (marked); a credit note can't credit more than is left on its invoice.
-- - public.moloni_connections: each organisation's Moloni tokens and settings. No rules, so only
--   the moloni Edge Function (service role) reads it; the app asks moloni_status().
-- - public.invoice_summary(org, by, ids): invoiced, credited, paid, outstanding and overdue per
--   quote, gig or client (quotes, contacts and gig finance show it; K3 reads the dates).
-- - A daily job notifies the quote's author and the admins of each overdue invoice, once a week.
-- - The organisation export gains invoices and invoice_lines files (export function renamed
--   export_org_part_pre_step11 and wrapped).
-- Written without destructive statements.

-- ── VAT per line on quotes ───────────────────────────────────────────────────
-- Each priced line without a rate gets p_rate. Bodies that aren't the expected shape are left as they are.
create or replace function private.with_line_vat(p_body jsonb, p_rate numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case when coalesce(jsonb_typeof(p_body -> 'phases'), '') <> 'array' or p_rate is null then p_body else
    jsonb_set(p_body, '{phases}', coalesce((
      select jsonb_agg(case when jsonb_typeof(ph) = 'object' and jsonb_typeof(ph -> 'sections') = 'array' then
        jsonb_set(ph, '{sections}', coalesce((
          select jsonb_agg(case when jsonb_typeof(s) = 'object' and jsonb_typeof(s -> 'lines') = 'array' then
            jsonb_set(s, '{lines}', coalesce((
              select jsonb_agg(case when jsonb_typeof(l) = 'object' and coalesce(l ->> 'kind', '') <> 'comment'
                                         and coalesce(jsonb_typeof(l -> 'vat_rate'), 'null') = 'null'
                                    then l || jsonb_build_object('vat_rate', least(100, greatest(0, p_rate))) else l end order by li)
                from jsonb_array_elements(s -> 'lines') with ordinality x(l, li)), '[]'::jsonb))
            else s end order by si)
            from jsonb_array_elements(ph -> 'sections') with ordinality y(s, si)), '[]'::jsonb))
        else ph end order by pi)
        from jsonb_array_elements(p_body -> 'phases') with ordinality z(ph, pi)), '[]'::jsonb))
  end
$$;
revoke execute on function private.with_line_vat(jsonb, numeric) from public, anon, authenticated;

alter table public.quotes disable trigger quotes_before_write;
update public.quotes q set body = private.with_line_vat(q.body, q.vat_rate)
 where private.with_line_vat(q.body, q.vat_rate) is distinct from q.body;
alter table public.quotes enable trigger quotes_before_write;

-- Saved versions keep their own rate (the one frozen with them), else their quote's
update public.quote_versions v
   set snapshot = jsonb_set(v.snapshot, '{body}', private.with_line_vat(v.snapshot -> 'body',
         case when replace(coalesce(v.snapshot ->> 'vat_rate', ''), ',', '.') ~ '^([0-9]+\.?[0-9]*|\.[0-9]+)$'
              then replace(v.snapshot ->> 'vat_rate', ',', '.')::numeric
              else (select q.vat_rate from public.quotes q where q.id = v.quote_id) end))
 where jsonb_typeof(v.snapshot -> 'body') = 'object'
   and private.with_line_vat(v.snapshot -> 'body', 0) is distinct from v.snapshot -> 'body';

-- ── The revenue rule's view gains the VAT rate ───────────────────────────────
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
              else q.vat_rate end)) as vat_rate
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

-- ── Payment term ─────────────────────────────────────────────────────────────
alter table public.organisations add column if not exists invoice_due_days integer not null default 30;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_invoice_due_days_check' and conrelid = 'public.organisations'::regclass) then
    alter table public.organisations add constraint organisations_invoice_due_days_check check (invoice_due_days between 0 and 365);
  end if;
end $$;

-- ── Invoices and credit notes ────────────────────────────────────────────────
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  number integer not null,                         -- AVX's own reference, given by the database
  kind text not null default 'invoice' check (kind in ('invoice', 'credit_note')),
  credited_invoice_id uuid references public.invoices(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  gig_id uuid references public.gigs(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default '' check (char_length(client_name) <= 200),
  client_tax_id text check (char_length(coalesce(client_tax_id, '')) <= 40),
  client_address text check (char_length(coalesce(client_address, '')) <= 500),
  client_email text check (char_length(coalesce(client_email, '')) <= 200),
  scope text not null default 'all' check (scope in ('all', 'phases', 'deposit', 'rest', 'credit', 'custom')),
  phase_ids text[],
  deposit_pct numeric(5,2) check (deposit_pct is null or deposit_pct > 0 and deposit_pct <= 100),
  language text not null default 'pt' check (language in ('pt', 'en')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- [{ id, description, qty, unit_price, discount_pct, vat_rate, vat_exemption, kind }]
  lines jsonb not null default '[]',
  net numeric(14,2) not null default 0,             -- worked out from the lines on every save
  vat numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text check (char_length(coalesce(notes, '')) <= 2000),
  issue_date date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'issued', 'paid')),
  sent_at timestamptz,
  issued_at timestamptz,
  paid_on date,
  legal_number text check (char_length(coalesce(legal_number, '')) <= 60),   -- Moloni's, e.g. "FT 2026/12"
  pdf_url text check (pdf_url is null or (char_length(pdf_url) <= 2000 and pdf_url ~* '^https://')),
  moloni_document_id bigint,                        -- set by the moloni Edge Function only
  last_reminded_at timestamptz,                     -- the weekly overdue notification
  client_reminded_at timestamptz,                   -- the last email reminder to the client
  removed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number),
  constraint invoices_lines_check check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 500 and pg_column_size(lines) < 400000),
  constraint invoices_credit_check check ((kind = 'credit_note') = (credited_invoice_id is not null)),
  constraint invoices_dates_check check (due_date is null or issue_date is null or due_date >= issue_date)
);
create index if not exists invoices_org_idx on public.invoices (org_id, number desc);
create index if not exists invoices_quote_idx on public.invoices (quote_id) where quote_id is not null;
create index if not exists invoices_gig_idx on public.invoices (gig_id) where gig_id is not null;
create index if not exists invoices_client_idx on public.invoices (client_id) where client_id is not null;
create index if not exists invoices_credited_idx on public.invoices (credited_invoice_id) where credited_invoice_id is not null;
create index if not exists invoices_due_idx on public.invoices (due_date) where status = 'issued' and kind = 'invoice' and removed_at is null;
alter table public.invoices enable row level security;

create policy invoices_select on public.invoices for select to authenticated using (private.can_see_finance(org_id));
create policy invoices_insert on public.invoices for insert to authenticated with check (private.can_see_finance(org_id));
create policy invoices_update on public.invoices for update to authenticated
  using (private.can_see_finance(org_id)) with check (private.can_see_finance(org_id));
create policy mfa_required on public.invoices as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete rule: drafts are removed by marking them (removed_at); sent ones stay

-- Only these columns can be written from the app. The number, totals, Moloni's document and the
-- reminder dates are written by the database or the moloni Edge Function.
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;
grant insert (org_id, kind, credited_invoice_id, quote_id, gig_id, client_id, client_name, client_tax_id, client_address,
              client_email, scope, phase_ids, deposit_pct, language, currency, lines, notes, issue_date, due_date)
  on public.invoices to authenticated;
grant update (client_id, client_name, client_tax_id, client_address, client_email, scope, phase_ids, deposit_pct, language,
              currency, lines, notes, issue_date, due_date, status, legal_number, pdf_url, paid_on, removed_at)
  on public.invoices to authenticated;

-- A line's amount excl. VAT: qty × unit price, less its discount, to the cent
create or replace function private.invoice_line_net(p_line jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select round(coalesce((p_line ->> 'qty')::numeric, 0) * coalesce((p_line ->> 'unit_price')::numeric, 0)
               * (1 - coalesce((p_line ->> 'discount_pct')::numeric, 0) / 100), 2)
$$;

-- Lines are checked and cleaned on every save (numbers as numbers, rates within 0–100)
create or replace function private.invoice_clean_lines(p_lines jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare v_out jsonb := '[]'::jsonb; l jsonb; v_rate numeric; v_disc numeric; v_qty numeric; v_price numeric; v_ex text;
begin
  for l in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(l) <> 'object' or char_length(trim(coalesce(l ->> 'description', ''))) not between 1 and 300
       or jsonb_typeof(l -> 'qty') <> 'number' or jsonb_typeof(l -> 'unit_price') <> 'number'
       or jsonb_typeof(l -> 'vat_rate') <> 'number' then
      raise exception 'Bad invoice line' using errcode = '22023';
    end if;
    v_qty := (l ->> 'qty')::numeric; v_price := (l ->> 'unit_price')::numeric; v_rate := (l ->> 'vat_rate')::numeric;
    v_disc := case when jsonb_typeof(l -> 'discount_pct') = 'number' then (l ->> 'discount_pct')::numeric else 0 end;
    if v_rate not between 0 and 100 or v_disc not between 0 and 100 or abs(v_qty) > 1e6 or abs(v_price) > 1e9 then
      raise exception 'Bad invoice line' using errcode = '22023';
    end if;
    v_ex := case when v_rate = 0 and l ->> 'vat_exemption' ~ '^M[0-9]{2}$' then l ->> 'vat_exemption' end;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', left(coalesce(l ->> 'id', gen_random_uuid()::text), 64),
      'kind', case when l ->> 'kind' in ('rental', 'sale', 'crew', 'transport', 'other', 'deposit') then l ->> 'kind' else 'other' end,
      'description', trim(l ->> 'description'),
      'details', nullif(left(trim(coalesce(l ->> 'details', '')), 1000), ''),
      'qty', v_qty, 'unit_price', v_price, 'discount_pct', v_disc, 'vat_rate', v_rate, 'vat_exemption', v_ex,
      'source_id', nullif(left(coalesce(l ->> 'source_id', ''), 64), ''))));
  end loop;
  return v_out;
end $$;

create or replace function private.invoices_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_credited numeric; v_net numeric; v_vat numeric;
begin
  if tg_op = 'INSERT' then
    -- One AVX number sequence per organisation (invoices and credit notes); the lock stops two
    -- invoices getting the same number
    perform pg_advisory_xact_lock(hashtext('invoice-number:' || new.org_id::text));
    new.number := coalesce((select max(i.number) from public.invoices i where i.org_id = new.org_id), 0) + 1;
    new.status := 'draft';
    new.sent_at := null; new.issued_at := null; new.paid_on := null; new.legal_number := null; new.pdf_url := null;
    new.moloni_document_id := null; new.last_reminded_at := null; new.client_reminded_at := null; new.removed_at := null;
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.id := old.id; new.org_id := old.org_id; new.number := old.number; new.kind := old.kind;
    new.credited_invoice_id := old.credited_invoice_id; new.quote_id := old.quote_id; new.gig_id := old.gig_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if old.removed_at is not null then
      raise exception 'This invoice was removed' using errcode = '55000';
    end if;
    if old.status <> 'draft' and (new.lines is distinct from old.lines or new.currency is distinct from old.currency
        or new.client_id is distinct from old.client_id or new.client_name is distinct from old.client_name
        or new.client_tax_id is distinct from old.client_tax_id or new.client_address is distinct from old.client_address
        or new.scope is distinct from old.scope or new.phase_ids is distinct from old.phase_ids
        or new.deposit_pct is distinct from old.deposit_pct or new.language is distinct from old.language) then
      raise exception 'Only a draft can be changed' using errcode = '55000';
    end if;
    if new.removed_at is not null and old.status <> 'draft' then
      raise exception 'Only a draft can be removed' using errcode = '55000';
    end if;
    -- Status: draft ⇄ sent → issued ⇄ paid (credit notes are never "paid")
    if new.status <> old.status and not (
         (old.status = 'draft' and new.status = 'sent') or (old.status = 'sent' and new.status in ('draft', 'issued'))
      or (old.status = 'issued' and new.status = 'paid' and old.kind = 'invoice') or (old.status = 'paid' and new.status = 'issued')) then
      raise exception 'That status change isn''t allowed' using errcode = '22023';
    end if;
    if old.status in ('issued', 'paid') then
      new.legal_number := old.legal_number; new.issue_date := old.issue_date; new.issued_at := old.issued_at;
    end if;
    if new.status = 'issued' and old.status = 'sent' then
      if char_length(trim(coalesce(new.legal_number, ''))) = 0 then
        raise exception 'The certified program''s invoice number is needed' using errcode = '22023';
      end if;
      new.legal_number := trim(new.legal_number);
      new.issued_at := now();
      new.issue_date := coalesce(new.issue_date, private.org_today(new.org_id));
    end if;
    if new.status = 'sent' and old.status = 'draft' then new.sent_at := now(); end if;
    if new.status = 'draft' and old.status = 'sent' then
      new.sent_at := null; new.moloni_document_id := null; new.legal_number := null; new.pdf_url := null;
    end if;
    -- A paid date only on a paid invoice (today when none is given)
    new.paid_on := case when new.status = 'paid' then coalesce(new.paid_on, private.org_today(new.org_id)) end;
  end if;

  -- What it links to belongs to the same organisation
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.org_id = new.org_id) then
    raise exception 'That client belongs to another organisation' using errcode = '42501';
  end if;
  if new.quote_id is not null and not exists (select 1 from public.quotes q where q.id = new.quote_id and q.org_id = new.org_id) then
    raise exception 'That quote belongs to another organisation' using errcode = '42501';
  end if;
  if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = new.org_id) then
    raise exception 'That gig belongs to another organisation' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.lines is distinct from old.lines then
    new.lines := private.invoice_clean_lines(new.lines);
  end if;
  -- Totals: each line to the cent, VAT per rate on the sum of its lines (invoiceTotals in invoices.js)
  select coalesce(sum(private.invoice_line_net(l)), 0) into v_net from jsonb_array_elements(new.lines) l;
  select coalesce(sum(round(b.base * b.rate / 100, 2)), 0) into v_vat
    from (select (l ->> 'vat_rate')::numeric as rate, sum(private.invoice_line_net(l)) as base
            from jsonb_array_elements(new.lines) l group by 1) b;
  new.net := v_net; new.vat := v_vat; new.total := v_net + v_vat;
  if new.total < 0 then
    raise exception 'An invoice can''t be negative' using errcode = '22023';
  end if;

  -- A credit note credits an issued invoice of the same organisation, never more than is left on it
  if new.kind = 'credit_note' then
    select * into v_inv from public.invoices i where i.id = new.credited_invoice_id;
    if v_inv.id is null or v_inv.org_id <> new.org_id or v_inv.kind <> 'invoice' or v_inv.status not in ('issued', 'paid') or v_inv.removed_at is not null then
      raise exception 'A credit note needs an issued invoice' using errcode = '22023';
    end if;
    if new.removed_at is null then
      select coalesce(sum(c.total), 0) into v_credited from public.invoices c
       where c.credited_invoice_id = v_inv.id and c.removed_at is null and c.id <> new.id;
      if v_credited + new.total > v_inv.total then
        raise exception 'That credits more than is left on the invoice' using errcode = '22023', hint = (v_inv.total - v_credited)::text;
      end if;
    end if;
    new.currency := v_inv.currency;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.invoices_before_write() from public, anon, authenticated;
create or replace trigger invoices_before_write before insert or update on public.invoices
  for each row execute function private.invoices_before_write();

-- ── Moloni connection ────────────────────────────────────────────────────────
-- Tokens and the chosen company and series. No rules and no grants: only the moloni Edge Function
-- (service role) reads and writes it. The app asks moloni_status().
create table if not exists public.moloni_connections (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  access_token text,
  access_expires_at timestamptz,
  refresh_token text,
  refresh_expires_at timestamptz,
  company_id bigint,
  company_name text,
  document_set_id bigint,
  document_set_name text,
  product_id bigint,                -- the one "AVX service" product every line uses
  state_hash text,                  -- a connection being made (the OAuth "state"), for 10 minutes
  state_user uuid,
  state_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.moloni_connections enable row level security;
revoke all on public.moloni_connections from anon, authenticated;

-- Whether Moloni is connected, and to which company and series (no tokens)
create or replace function public.moloni_status(p_org uuid)
returns table(connected boolean, expired boolean, company_name text, document_set_name text, ready boolean, connected_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or not private.can_see_finance(p_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select c.refresh_token is not null, c.refresh_token is not null and coalesce(c.refresh_expires_at, now()) <= now(),
         c.company_name, c.document_set_name,
         c.refresh_token is not null and coalesce(c.refresh_expires_at, now()) > now() and c.company_id is not null and c.document_set_id is not null,
         c.connected_at
    from public.moloni_connections c where c.org_id = p_org;
end $$;
revoke execute on function public.moloni_status(uuid) from public, anon;
grant execute on function public.moloni_status(uuid) to authenticated;

-- ── Totals per quote, gig or client ──────────────────────────────────────────
-- Amounts in each currency (never added across currencies). Issued and paid invoices count as
-- invoiced; credit notes count once issued; drafts and sent ones are "to issue".
-- invoiced_net is excl. VAT (to compare with a quote or the revenue rule), the rest incl. VAT.
create or replace function public.invoice_summary(p_org uuid, p_by text, p_ids uuid[] default null)
returns table(ref_id uuid, currency text, invoiced_net numeric, invoiced numeric, credited numeric, paid numeric,
              outstanding numeric, overdue numeric, to_issue numeric, invoices integer, last_issue date, last_paid date)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare v_today date;
begin
  perform private.require_finance(p_org);
  if p_by not in ('quote', 'gig', 'client') then raise exception 'Bad grouping' using errcode = '22023'; end if;
  v_today := private.org_today(p_org);
  return query
  with inv as (
    select i.*, case p_by when 'quote' then i.quote_id when 'gig' then i.gig_id else i.client_id end as ref,
           coalesce((select sum(c.total) from public.invoices c
                      where c.credited_invoice_id = i.id and c.removed_at is null and c.status in ('issued', 'paid')), 0) as credit_total,
           coalesce((select sum(c.net) from public.invoices c
                      where c.credited_invoice_id = i.id and c.removed_at is null and c.status in ('issued', 'paid')), 0) as credit_net
      from public.invoices i
     where i.org_id = p_org and i.removed_at is null and i.kind = 'invoice'
  )
  select inv.ref, inv.currency,
         coalesce(sum(inv.net - inv.credit_net) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(inv.total) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(inv.credit_total) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(inv.total - inv.credit_total) filter (where inv.status = 'paid'), 0),
         coalesce(sum(inv.total - inv.credit_total) filter (where inv.status = 'issued'), 0),
         coalesce(sum(inv.total - inv.credit_total) filter (where inv.status = 'issued' and inv.due_date < v_today), 0),
         coalesce(sum(inv.total) filter (where inv.status in ('draft', 'sent')), 0),
         count(*)::integer,
         max(inv.issue_date) filter (where inv.status in ('issued', 'paid')),
         max(inv.paid_on)
    from inv
   where inv.ref is not null and (p_ids is null or inv.ref = any(p_ids))
   group by inv.ref, inv.currency;
end $$;
revoke execute on function public.invoice_summary(uuid, text, uuid[]) from public, anon;
grant execute on function public.invoice_summary(uuid, text, uuid[]) to authenticated;

-- ── Overdue reminders ────────────────────────────────────────────────────────
-- Every morning: each issued invoice past its due date (in the organisation's time zone) notifies
-- its quote's author and the organisation's admins, then again each week while it stays unpaid.
create or replace function private.remind_overdue_invoices() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in
    select i.id, i.org_id, i.legal_number, i.number, i.client_name, i.total, i.currency, i.due_date, i.quote_id, q.created_by as quote_author
      from public.invoices i left join public.quotes q on q.id = i.quote_id
     where i.kind = 'invoice' and i.status = 'issued' and i.removed_at is null and i.due_date is not null
       and i.due_date < private.org_today(i.org_id)
       and (i.last_reminded_at is null or i.last_reminded_at < now() - interval '6 days 12 hours')
     order by i.due_date limit 2000
  loop
    insert into public.notifications (user_id, org_id, kind, details)
    select distinct u, r.org_id, 'invoice_overdue', jsonb_build_object(
             'invoice_id', r.id, 'number', coalesce(r.legal_number, r.number::text), 'client', r.client_name,
             'total', r.total, 'currency', r.currency, 'due_date', r.due_date, 'days', private.org_today(r.org_id) - r.due_date)
      from (select m.user_id as u from public.org_members m where m.org_id = r.org_id and m.role = 'admin'
            union
            select m.user_id from public.org_members m
             where m.org_id = r.org_id and m.user_id = r.quote_author and m.role in ('admin', 'member')) who;
    update public.invoices set last_reminded_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function private.remind_overdue_invoices() from public, anon, authenticated;

select cron.schedule('avx-overdue-invoices', '23 7 * * *', 'select private.remind_overdue_invoices()');

-- ── Organisation export: invoices and their lines ────────────────────────────
alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step11;

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
             i.sent_at, i.issued_at, i.removed_at, i.created_at
        from public.invoices i
        left join public.invoices ci on ci.id = i.credited_invoice_id
        left join public.quotes q on q.id = i.quote_id
        left join public.gigs g on g.id = i.gig_id
       where i.org_id = p_org
       order by i.number offset v_off limit v_lim) x;
    return coalesce(v_out, '[]'::jsonb);
  end if;
  if p_part = 'invoice_lines' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.number as avx_number, i.legal_number, o as line, l ->> 'kind' as kind, l ->> 'description' as description,
             (l ->> 'qty')::numeric as qty, (l ->> 'unit_price')::numeric as unit_price, (l ->> 'discount_pct')::numeric as discount_pct,
             (l ->> 'vat_rate')::numeric as vat_rate, l ->> 'vat_exemption' as vat_exemption, private.invoice_line_net(l) as net, i.currency
        from public.invoices i cross join lateral jsonb_array_elements(i.lines) with ordinality t(l, o)
       where i.org_id = p_org and i.removed_at is null
       order by i.number, o offset v_off limit v_lim) x;
    return coalesce(v_out, '[]'::jsonb);
  end if;
  return private.export_org_part_pre_step11(p_org, p_part, p_offset);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step11(uuid, text, integer) from public, anon, authenticated;
