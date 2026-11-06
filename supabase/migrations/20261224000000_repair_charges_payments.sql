-- Step 12: repairs charged to the client, and payments against invoices.
--
-- 1. A repair marked "charge client" can be added once to an invoice draft as a line that points to
--    it (`repair_id`). Saving the draft links the repair to the invoice (`repairs.invoice_id`);
--    taking the line out or removing the draft frees it. Another live invoice can't bill it again.
-- 2. Payments (date, amount, method, note) are recorded against issued invoices. Partial payments
--    add up; the invoice turns paid when they cover what's owed (its total less issued credit
--    notes), and back to issued when a payment is removed. Whether an invoice is paid now follows
--    its payments only: the app can't set it by hand any more ("Mark as paid" records a payment of
--    what is left). Paying more than is left is refused.
-- 3. invoice_summary counts partial payments; payments_by_month for the reports (K3); overdue
--    reminders skip invoices with nothing left to pay; organisation export gets the payments.
-- 4. Every invoice already marked paid gets one payment of its amount (method "other", its paid date).
-- Checks in supabase/tests/payments.sql (and invoices.sql, updated for payments).

-- ── 1. Charged repairs on invoices ──────────────────────────────────────────
alter table public.repairs add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
create index if not exists repairs_invoice_idx on public.repairs (invoice_id) where invoice_id is not null;
create index if not exists repairs_charged_gig_idx on public.repairs (gig_id) where charge_client;

-- The invoice link is written by the invoice trigger only; a billed repair stays "charge client"
create or replace function private.repairs_invoice_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.invoice_id := null;
  else
    new.invoice_id := old.invoice_id;
    if old.invoice_id is not null then new.charge_client := true; end if;
  end if;
  return new;
end $$;
revoke execute on function private.repairs_invoice_guard() from public, anon, authenticated;
create or replace trigger repairs_invoice_guard before insert or update on public.repairs
  for each row execute function private.repairs_invoice_guard();

-- Invoice lines may carry the repair they bill (kind "repair", repair_id); otherwise as in step 11
create or replace function private.invoice_clean_lines(p_lines jsonb) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare v_out jsonb := '[]'::jsonb; l jsonb; v_rate numeric; v_disc numeric; v_qty numeric; v_price numeric; v_ex text;
begin
  for l in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(l) <> 'object' or char_length(trim(coalesce(l ->> 'description', ''))) not between 1 and 300
       or coalesce(jsonb_typeof(l -> 'qty'), '') <> 'number' or coalesce(jsonb_typeof(l -> 'unit_price'), '') <> 'number'
       or coalesce(jsonb_typeof(l -> 'vat_rate'), '') <> 'number' then
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
      'kind', case when l ->> 'kind' in ('rental', 'sale', 'crew', 'transport', 'other', 'deposit', 'repair') then l ->> 'kind' else 'other' end,
      'description', trim(l ->> 'description'),
      'details', nullif(left(trim(coalesce(l ->> 'details', '')), 1000), ''),
      'qty', v_qty, 'unit_price', v_price, 'discount_pct', v_disc, 'vat_rate', v_rate, 'vat_exemption', v_ex,
      'source_id', nullif(left(coalesce(l ->> 'source_id', ''), 64), ''),
      'repair_id', case when l ->> 'repair_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then l ->> 'repair_id' end)));
  end loop;
  return v_out;
end $$;
revoke execute on function private.invoice_clean_lines(jsonb) from public, anon, authenticated;

-- ── 2. Payments ─────────────────────────────────────────────────────────────
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  paid_on date not null,
  amount numeric(14,2) not null check (amount > 0 and amount < 1e11),
  method text not null default 'transfer' check (method in ('transfer', 'mbway', 'multibanco', 'card', 'cash', 'cheque', 'other')),
  note text check (char_length(coalesce(note, '')) <= 500),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx on public.invoice_payments (invoice_id) where removed_at is null;
create index if not exists invoice_payments_org_idx on public.invoice_payments (org_id, paid_on) where removed_at is null;
alter table public.invoice_payments enable row level security;

create policy invoice_payments_select on public.invoice_payments for select to authenticated using (private.can_see_finance(org_id));
create policy invoice_payments_insert on public.invoice_payments for insert to authenticated with check (private.can_see_finance(org_id));
create policy invoice_payments_update on public.invoice_payments for update to authenticated
  using (private.can_see_finance(org_id)) with check (private.can_see_finance(org_id));
create policy mfa_required on public.invoice_payments as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No rule for removing rows: a payment is removed by marking it (removed_at)

revoke all on public.invoice_payments from anon, authenticated;
grant select on public.invoice_payments to authenticated;
grant insert (org_id, invoice_id, paid_on, amount, method, note) on public.invoice_payments to authenticated;
grant update (removed_at) on public.invoice_payments to authenticated;

-- What an invoice asks for: its total less its issued credit notes
create or replace function private.invoice_due(p_invoice uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select i.total - coalesce((select sum(c.total) from public.invoices c
                              where c.credited_invoice_id = i.id and c.removed_at is null and c.status in ('issued', 'paid')), 0)
    from public.invoices i where i.id = p_invoice
$$;
create or replace function private.invoice_paid(p_invoice uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.amount), 0) from public.invoice_payments p where p.invoice_id = p_invoice and p.removed_at is null
$$;
revoke execute on function private.invoice_due(uuid) from public, anon, authenticated;
revoke execute on function private.invoice_paid(uuid) from public, anon, authenticated;

create or replace function private.invoice_payments_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_left numeric;
begin
  if tg_op = 'UPDATE' then
    if old.removed_at is not null then
      raise exception 'This payment was removed' using errcode = '55000';
    end if;
    new.id := old.id; new.org_id := old.org_id; new.invoice_id := old.invoice_id; new.paid_on := old.paid_on;
    new.amount := old.amount; new.method := old.method; new.note := old.note;
    new.created_by := old.created_by; new.created_at := old.created_at;
    new.removed_by := case when new.removed_at is not null then auth.uid() end;
    return new;
  end if;
  select * into v_inv from public.invoices i where i.id = new.invoice_id for update;
  if v_inv.id is null or v_inv.org_id <> new.org_id then
    raise exception 'That invoice belongs to another organisation' using errcode = '42501';
  end if;
  if v_inv.kind <> 'invoice' or v_inv.status not in ('issued', 'paid') or v_inv.removed_at is not null then
    raise exception 'Payments are recorded on issued invoices' using errcode = '22023';
  end if;
  new.paid_on := coalesce(new.paid_on, private.org_today(new.org_id));
  if new.paid_on > private.org_today(new.org_id) then
    raise exception 'A payment can''t be in the future' using errcode = '22023';
  end if;
  v_left := private.invoice_due(v_inv.id) - private.invoice_paid(v_inv.id);
  if new.amount > v_left then
    raise exception 'That is more than is left to pay' using errcode = '22023', hint = greatest(v_left, 0)::text;
  end if;
  new.note := nullif(trim(coalesce(new.note, '')), '');
  new.removed_at := null; new.removed_by := null;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
revoke execute on function private.invoice_payments_before() from public, anon, authenticated;
create or replace trigger invoice_payments_before before insert or update on public.invoice_payments
  for each row execute function private.invoice_payments_before();

-- Paid when its payments cover what it asks for; paid on the last payment's date
create or replace function private.sync_invoice_paid(p_invoice uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v public.invoices; v_paid numeric; v_last date; v_status text;
begin
  select * into v from public.invoices i where i.id = p_invoice;
  if v.id is null or v.kind <> 'invoice' or v.status not in ('issued', 'paid') or v.removed_at is not null then return; end if;
  select coalesce(sum(p.amount), 0), max(p.paid_on) into v_paid, v_last
    from public.invoice_payments p where p.invoice_id = p_invoice and p.removed_at is null;
  v_status := case when v_paid > 0 and v_paid >= private.invoice_due(p_invoice) then 'paid' else 'issued' end;
  if v_status <> v.status or (v_status = 'paid' and v.paid_on is distinct from v_last) then
    update public.invoices set status = v_status, paid_on = case when v_status = 'paid' then v_last end where id = p_invoice;
  end if;
end $$;
revoke execute on function private.sync_invoice_paid(uuid) from public, anon, authenticated;

create or replace function private.invoice_payments_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_invoice_paid(new.invoice_id);
  return null;
end $$;
revoke execute on function private.invoice_payments_after() from public, anon, authenticated;
create or replace trigger invoice_payments_after after insert or update on public.invoice_payments
  for each row execute function private.invoice_payments_after();

-- From the app, "paid" follows the payments: it can't be set or undone directly, nor its date
-- changed. (Runs after invoices_before_write: triggers fire in name order.)
create or replace function private.invoices_payment_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status and (new.status = 'paid' or old.status = 'paid') then
      raise exception 'Record or remove a payment to change whether it is paid' using errcode = '22023';
    end if;
    if new.status = 'paid' then new.paid_on := old.paid_on; end if;
  end if;
  return new;
end $$;
revoke execute on function private.invoices_payment_status() from public, anon, authenticated;
create or replace trigger invoices_payment_status before update on public.invoices
  for each row execute function private.invoices_payment_status();

-- After an invoice is saved: link or free the repairs its lines bill; after a credit note is issued
-- or removed, the invoice it credits may now be covered (or not)
create or replace function private.invoices_after_step12() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_found integer;
begin
  if new.kind = 'credit_note' then
    if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.removed_at is distinct from old.removed_at) then
      perform private.sync_invoice_paid(new.credited_invoice_id);
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.lines is not distinct from old.lines and new.removed_at is not distinct from old.removed_at then
    return null;
  end if;
  v_ids := '{}';
  if new.removed_at is null then
    select coalesce(array_agg(distinct (l ->> 'repair_id')::uuid), '{}') into v_ids
      from jsonb_array_elements(new.lines) l where l ? 'repair_id';
  end if;
  if cardinality(v_ids) > 0 then
    select count(*) into v_found from public.repairs r
     where r.id = any(v_ids) and r.org_id = new.org_id and r.charge_client;
    if v_found <> cardinality(v_ids) then
      raise exception 'That repair isn''t charged to the client' using errcode = '22023';
    end if;
    if exists (select 1 from public.repairs r join public.invoices o on o.id = r.invoice_id
                where r.id = any(v_ids) and r.invoice_id <> new.id and o.removed_at is null) then
      raise exception 'That repair is already on another invoice' using errcode = '23505';
    end if;
    update public.repairs set invoice_id = new.id where id = any(v_ids) and invoice_id is distinct from new.id;
  end if;
  update public.repairs set invoice_id = null where invoice_id = new.id and not (id = any(v_ids));
  return null;
end $$;
revoke execute on function private.invoices_after_step12() from public, anon, authenticated;
create or replace trigger invoices_after_step12 after insert or update on public.invoices
  for each row execute function private.invoices_after_step12();

-- ── 3. Totals, reports, reminders, export ───────────────────────────────────
-- As step 11, with payments: paid = payments received (partial ones too), outstanding and overdue
-- = what is left to pay on issued invoices, last_paid = the last payment's date
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
                      where c.credited_invoice_id = i.id and c.removed_at is null and c.status in ('issued', 'paid')), 0) as credit_net,
           coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id = i.id and p.removed_at is null), 0) as paid_amount,
           (select max(p.paid_on) from public.invoice_payments p where p.invoice_id = i.id and p.removed_at is null) as last_payment
      from public.invoices i
     where i.org_id = p_org and i.removed_at is null and i.kind = 'invoice'
  )
  select inv.ref, inv.currency,
         coalesce(sum(inv.net - inv.credit_net) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(inv.total) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(inv.credit_total) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(inv.paid_amount) filter (where inv.status in ('issued', 'paid')), 0),
         coalesce(sum(greatest(inv.total - inv.credit_total - inv.paid_amount, 0)) filter (where inv.status = 'issued'), 0),
         coalesce(sum(greatest(inv.total - inv.credit_total - inv.paid_amount, 0)) filter (where inv.status = 'issued' and inv.due_date < v_today), 0),
         coalesce(sum(inv.total) filter (where inv.status in ('draft', 'sent')), 0),
         count(*)::integer,
         max(inv.issue_date) filter (where inv.status in ('issued', 'paid')),
         max(inv.last_payment)
    from inv
   where inv.ref is not null and (p_ids is null or inv.ref = any(p_ids))
   group by inv.ref, inv.currency;
end $$;
revoke execute on function public.invoice_summary(uuid, text, uuid[]) from public, anon;
grant execute on function public.invoice_summary(uuid, text, uuid[]) to authenticated;

-- Money received per month (by payment date, in each currency), for the reports (K3)
create or replace function public.payments_by_month(p_org uuid, p_from date default null, p_until date default null)
returns table(month date, currency text, amount numeric, payments integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.require_finance(p_org);
  return query
  select date_trunc('month', p.paid_on)::date, i.currency, sum(p.amount), count(*)::integer
    from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
   where p.org_id = p_org and p.removed_at is null
     and (p_from is null or p.paid_on >= p_from) and (p_until is null or p.paid_on < p_until)
   group by 1, 2
   order by 1, 2;
end $$;
revoke execute on function public.payments_by_month(uuid, date, date) from public, anon;
grant execute on function public.payments_by_month(uuid, date, date) to authenticated;

-- Overdue reminders (as step 11), skipping invoices with nothing left to pay; the notice carries
-- what is left
create or replace function private.remind_overdue_invoices() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in
    select i.id, i.org_id, i.legal_number, i.number, i.client_name, i.total, i.currency, i.due_date, i.quote_id, q.created_by as quote_author,
           private.invoice_due(i.id) - private.invoice_paid(i.id) as left_to_pay
      from public.invoices i left join public.quotes q on q.id = i.quote_id
     where i.kind = 'invoice' and i.status = 'issued' and i.removed_at is null and i.due_date is not null
       and i.due_date < private.org_today(i.org_id)
       and (i.last_reminded_at is null or i.last_reminded_at < now() - interval '6 days 12 hours')
       and private.invoice_due(i.id) - private.invoice_paid(i.id) > 0
     order by i.due_date limit 2000
  loop
    insert into public.notifications (user_id, org_id, kind, details)
    select distinct u, r.org_id, 'invoice_overdue', jsonb_build_object(
             'invoice_id', r.id, 'number', coalesce(r.legal_number, r.number::text), 'client', r.client_name,
             'total', r.total, 'left', r.left_to_pay, 'currency', r.currency, 'due_date', r.due_date,
             'days', private.org_today(r.org_id) - r.due_date)
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

-- Organisation export: the payments
do $$ begin
  if to_regprocedure('private.export_org_part_pre_step12(uuid, text, integer)') is null then
    alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step12;
  end if;
end $$;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_part = 'invoice_payments' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.number as avx_number, i.legal_number, p.paid_on, p.amount, i.currency, p.method, p.note,
             p.created_at, p.removed_at
        from public.invoice_payments p join public.invoices i on i.id = p.invoice_id
       where p.org_id = p_org
       order by p.paid_on, p.created_at offset v_off limit v_lim) x;
    return coalesce(v_out, '[]'::jsonb);
  end if;
  return private.export_org_part_pre_step12(p_org, p_part, p_offset);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step12(uuid, text, integer) from public, anon, authenticated;

-- ── 4. Invoices already paid get one payment of what they asked for ─────────
insert into public.invoice_payments (org_id, invoice_id, paid_on, amount, method)
select i.org_id, i.id, least(coalesce(i.paid_on, i.issue_date, private.org_today(i.org_id)), private.org_today(i.org_id)),
       private.invoice_due(i.id), 'other'
  from public.invoices i
 where i.kind = 'invoice' and i.status = 'paid' and i.removed_at is null
   and private.invoice_due(i.id) > 0
   and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id);
