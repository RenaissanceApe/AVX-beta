-- 0.82.4 (issue #195): people who made, asked for, sent, reported or removed things in an organisation
-- they don't solely own can close their account.
-- When an account is closed, Postgres empties the columns that point at it (their foreign key rule:
-- set null). Sixteen "keep rows honest" triggers put the old value back, or refuse any change to a
-- sent invite or a removed invoice or payment, so the account couldn't be closed.
-- Now each of those triggers starts with one guard: when the only change is that columns naming a
-- person whose account no longer exists became empty, the row is let through as it is. That only
-- happens while the account itself is being removed, so signed-in people still can't clear or change
-- who made something. Every other line of each function is its newest body (migration named above it).
-- Expenses: a claim still waiting for a decision becomes a draft when the person who claimed it leaves
-- (a waiting claim must have its claimant), so finance can confirm or remove it.
-- Add-only: one new helper and create or replace of seventeen trigger functions; their existing
-- revokes are re-stated as they were.

-- True when the only change from p_old to p_new (updated_at aside) is that some of p_cols went from a
-- user id that no longer exists to empty, i.e. the database is emptying a closed account's columns.
create or replace function private.account_closing_update(p_old jsonb, p_new jsonb, p_cols text[])
returns boolean language sql security definer set search_path = '' as $$
  select exists (
      select 1 from jsonb_each(p_old) o
      where o.key = any(p_cols) and o.value <> 'null'::jsonb and p_new -> o.key = 'null'::jsonb)
    and not exists (
      select 1 from jsonb_each(p_old) o
      where o.key <> 'updated_at' and o.value is distinct from p_new -> o.key
        and not (o.key = any(p_cols) and p_new -> o.key = 'null'::jsonb
                 and not exists (select 1 from auth.users u where u.id::text = o.value #>> '{}')))
$$;
revoke execute on function private.account_closing_update(jsonb, jsonb, text[]) from public, anon, authenticated;

-- From 20261024000000_reservations_people.sql
create or replace function private.availability_requests_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{asked_by}') then return new; end if;
  if tg_op = 'INSERT' then
    select g.org_id into new.org_id from public.gigs g where g.id = new.gig_id;
    new.asked_by := auth.uid();
    new.status := 'pending';
    new.reply_note := null;
    new.replied_at := null;
    new.created_at := now();
    if new.period is null then new.period := private.gig_period(new.gig_id); end if;
  else
    new.gig_id := old.gig_id; new.org_id := old.org_id; new.person_id := old.person_id;
    new.asked_by := old.asked_by; new.period := old.period; new.message := old.message; new.created_at := old.created_at;
    if auth.uid() is distinct from old.person_id then new.reply_note := old.reply_note; end if;
    if new.status in ('available', 'unavailable') then new.replied_at := now(); end if;
  end if;
  return new;
end $$;

-- From 20261117000000_contacts.sql
create or replace function private.clients_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  new.updated_at := now();
  new.name := trim(new.name);
  return new;
end $$;
revoke execute on function private.clients_before() from public, anon, authenticated;

-- From 20270104000000_mvr_gdtf.sql
create or replace function private.fixture_types_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if not exists (select 1 from public.price_items i where i.id = new.item_id and i.org_id = new.org_id) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  if new.file_path is not null and private.path_uuid(new.file_path, 1) is distinct from new.org_id then
    raise exception 'File not in this organisation''s folder' using errcode = '23514';
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.fixture_types_before() from public, anon, authenticated;

-- From 20261027000000_warehouse.sql
create or replace function private.gig_equipment_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record; v_org uuid;
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.org_id := old.org_id; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
  else
    select g.org_id into v_org from public.gigs g where g.id = new.gig_id;
    select i.org_id, i.name, i.category, i.tracking, i.kind into v_item from public.price_items i where i.id = new.item_id;
    if v_org is null or v_item.org_id is distinct from v_org then
      raise exception 'Item not in this organisation''s inventory' using errcode = '23514';
    end if;
    if v_item.tracking = 'none' or v_item.kind not in ('rental', 'sale') then
      raise exception 'Only stock-tracked items can be planned' using errcode = '23514';
    end if;
    new.org_id := v_org;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  -- The name, category and packing note travel with the line, so crew see them without the catalogue
  select i.name, i.category, i.packing_note into new.item_name, new.category, new.packing_note
    from public.price_items i where i.id = new.item_id;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_equipment_before() from public, anon, authenticated;

-- From 20261113000000_light_plot.sql
create or replace function private.gig_fixtures_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    if (select count(*) from public.gig_fixtures f where f.gig_id = new.gig_id) >= 1000 then
      raise exception 'A DMX patch holds up to 1000 fixtures' using errcode = '54000';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.price_items i join public.gigs g on g.org_id = i.org_id where i.id = new.item_id and g.id = new.gig_id
  ) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  -- A new fixture takes what wasn't typed; a fixture given another item takes the new item's
  -- figures unless they were changed in the same edit
  if new.item_id is not null and tg_op = 'INSERT' then
    select coalesce(new.power_w, i.power_w), coalesce(new.weight_kg, i.weight_kg::numeric(7,2))
      into new.power_w, new.weight_kg from public.price_items i where i.id = new.item_id;
  elsif new.item_id is not null and new.item_id is distinct from old.item_id then
    select case when new.power_w is not distinct from old.power_w then coalesce(i.power_w, new.power_w) else new.power_w end,
           case when new.weight_kg is not distinct from old.weight_kg then coalesce(i.weight_kg::numeric(7,2), new.weight_kg) else new.weight_kg end
      into new.power_w, new.weight_kg from public.price_items i where i.id = new.item_id;
  end if;
  new.name := trim(new.name);
  new.fixture_type := trim(new.fixture_type);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_fixtures_before() from public, anon, authenticated;

-- From 20261110000000_field_tools.sql
create or replace function private.gig_inputs_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.price_items i join public.gigs g on g.org_id = i.org_id where i.id = new.item_id and g.id = new.gig_id
  ) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  new.source := trim(new.source);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_inputs_before() from public, anon, authenticated;

-- From 20261111000000_stage_plot.sql
create or replace function private.gig_plot_items_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    if (select count(*) from public.gig_plot_items p where p.gig_id = new.gig_id) >= 300 then
      raise exception 'A stage plot holds up to 300 things' using errcode = '54000';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if new.item_id is not null and not exists (
    select 1 from public.price_items i join public.gigs g on g.org_id = i.org_id where i.id = new.item_id and g.id = new.gig_id
  ) then
    raise exception 'Item not in this organisation''s catalogue' using errcode = '23514';
  end if;
  new.label := nullif(trim(coalesce(new.label, '')), '');
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_plot_items_before() from public, anon, authenticated;

-- From 20270111000000_held_invite_expiry.sql
create or replace function private.held_invites_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by,sent_by}') then return new; end if;
  new.id := old.id; new.org_id := old.org_id; new.email := old.email; new.created_by := old.created_by;
  new.created_at := old.created_at; new.import_file := old.import_file;
  if coalesce(current_setting('avx.held_upkeep', true), 'off') <> 'on' then
    new.reminded_at := old.reminded_at; new.expired_at := old.expired_at;
  end if;
  if old.status <> 'held' then
    raise exception 'This invitation was already %', old.status using errcode = '22023';
  end if;
  if new.status = 'sent' then
    new.sent_at := now(); new.sent_by := auth.uid();
  else
    new.sent_at := null; new.sent_by := null; new.result := null;
  end if;
  return new;
end $$;
revoke execute on function private.held_invites_before() from public, anon, authenticated;

-- From 20270107000000_rigging.sql
create or replace function private.hoist_models_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    new.needs_check := old.needs_check or new.wll_kg is distinct from old.wll_kg or new.class is distinct from old.class;
  else
    if (select count(*) from public.hoist_models m where m.org_id = new.org_id) >= 200 then
      raise exception 'An organisation keeps up to 200 hoist models' using errcode = '54000';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.needs_check := true;
    new.removed_at := null;
  end if;
  return new;
end $$;
revoke execute on function private.hoist_models_before() from public, anon, authenticated;

-- From 20261224000000_repair_charges_payments.sql
create or replace function private.invoice_payments_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_left numeric;
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by,removed_by}') then return new; end if;
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

-- From 20261222000000_invoices.sql
create or replace function private.invoices_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_credited numeric; v_net numeric; v_vat numeric;
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by,updated_by}') then return new; end if;
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

-- From 20261020000000_branding_pricelist_deletion.sql
create or replace function private.quotes_before_write() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by,removed_by,updated_by}') then return new; end if;
  if new.gig_id is not null and not exists (select 1 from gigs where id = new.gig_id and org_id = new.org_id) then
    raise exception 'That gig belongs to another organisation';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('quote-number:' || new.org_id::text));
    new.number := greatest(
      coalesce((select max(number) from quotes where org_id = new.org_id), 0) + 1,
      coalesce((select quote_next_number from organisations where id = new.org_id), 1));
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
  else
    new.org_id := old.org_id;
    new.number := old.number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;
revoke execute on function private.quotes_before_write() from public, anon, authenticated;

-- From 20261029000000_maintenance.sql
create or replace function private.repairs_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record; v_unit record;
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{reported_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.item_id := old.item_id; new.unit_id := old.unit_id;
    new.gig_id := old.gig_id; new.reported_by := old.reported_by; new.created_at := old.created_at;
    if new.unit_id is not null then new.quantity := 1; end if;
  else
    select i.org_id, i.tracking into v_item from public.price_items i where i.id = new.item_id;
    if v_item.org_id is null or v_item.tracking = 'none' then
      raise exception 'Only stock-tracked items can be repaired' using errcode = '23514';
    end if;
    if new.unit_id is not null then
      select u.item_id into v_unit from public.stock_units u where u.id = new.unit_id;
      if v_unit.item_id is distinct from new.item_id then
        raise exception 'That unit isn''t this item' using errcode = '23514';
      end if;
      new.quantity := 1;
    elsif v_item.tracking = 'serial' then
      raise exception 'Choose the unit to repair' using errcode = '23514';
    end if;
    if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = v_item.org_id) then
      new.gig_id := null;
    end if;
    new.org_id := v_item.org_id;
    new.created_at := now();
    if auth.uid() is not null then new.reported_by := auth.uid(); end if;
  end if;
  new.problem := trim(new.problem);
  if new.status in ('done', 'written_off') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.repairs_before() from public, anon, authenticated;

-- From 20261027000000_warehouse.sql
create or replace function private.stock_units_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'INSERT' then
    select i.org_id, i.tracking into v_item from public.price_items i where i.id = new.item_id;
    if not found then raise exception 'Unknown item' using errcode = '23503'; end if;
    if v_item.tracking <> 'serial' then
      raise exception 'This item is counted in bulk, not per unit' using errcode = '23514';
    end if;
    new.org_id := v_item.org_id;
    new.code := coalesce(nullif(trim(new.code), ''), private.short_code('U'));
    new.created_at := now();
    new.out_on_gig := null; new.out_since := null;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    perform private.check_location(new.org_id, new.location_id, true);
  else
    new.id := old.id; new.org_id := old.org_id; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if coalesce(current_setting('avx.dispatch', true), '') <> 'on' then
      new.out_on_gig := old.out_on_gig; new.out_since := old.out_since;
    end if;
    if new.location_id is distinct from old.location_id then
      perform private.check_location(new.org_id, new.location_id, true);
    end if;
  end if;
  if new.status in ('lost', 'retired') then new.out_on_gig := null; new.out_since := null; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.stock_units_before() from public, anon, authenticated;

-- From 20261030000000_subrentals.sql
create or replace function private.subrentals_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if coalesce(current_setting('avx.partner', true), '') <> 'on' then
      new.reply_note := old.reply_note; new.quoted_total := old.quoted_total; new.answered_at := old.answered_at;
    end if;
  else
    new.reply_note := null; new.quoted_total := null; new.answered_at := null;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  if not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.org_id = new.org_id) then
    raise exception 'Supplier not in this organisation' using errcode = '23514';
  end if;
  if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = new.org_id) then
    raise exception 'Gig not in this organisation' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.subrentals_before() from public, anon, authenticated;

-- From 20261030000000_subrentals.sql
create or replace function private.suppliers_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A closed account's name is being emptied: let only that through
  if tg_op = 'UPDATE' and private.account_closing_update(to_jsonb(old), to_jsonb(new), '{created_by}') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.partner_org_id is not null and new.partner_org_id is distinct from old.partner_org_id
       and coalesce(current_setting('avx.partner', true), '') <> 'on' then
      new.partner_org_id := old.partner_org_id;
    end if;
  else
    new.partner_org_id := null;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  new.name := trim(new.name);
  return new;
end $$;
revoke execute on function private.suppliers_before() from public, anon, authenticated;

-- From 20261214000000_expenses.sql
create or replace function private.expenses_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_me uuid := auth.uid(); v_fin boolean;
begin
  new.description := trim(new.description);
  new.supplier_name := nullif(trim(new.supplier_name), '');
  new.invoice_number := nullif(trim(new.invoice_number), '');
  new.notes := nullif(trim(new.notes), '');
  if new.supplier_id is not null then new.supplier_name := null; end if;
  if new.receipt_path is null then new.receipt_name := null; end if;
  if new.receipt_path is not null and new.receipt_path not like new.org_id::text || '/' || new.id::text || '/%' then
    raise exception 'Receipt belongs to another expense' using errcode = '22023';
  end if;
  if not private.finance_refs_ok(new.org_id, new.supplier_id, new.category_id) then
    raise exception 'Supplier or category of another organisation' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or (new.gig_id, new.subrental_id, new.repair_id, new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id)
       is distinct from (old.gig_id, old.subrental_id, old.repair_id, old.crew_fee_user_id, old.stock_movement_id, old.stock_unit_id) then
    new.gig_id := private.expense_links_gig(new.org_id, new.gig_id, new.subrental_id, new.repair_id,
                                            new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id);
  end if;
  if current_user not in ('authenticated', 'anon') then
    -- The claimant closed their account: a claim still waiting becomes a draft for finance
    if tg_op = 'UPDATE' and old.claimed_by is not null and new.claimed_by is null and new.status in ('claimed', 'returned') then new.status := 'draft'; end if;
    new.updated_at := clock_timestamp();
    return new;
  end if;
  v_fin := private.can_see_finance(new.org_id);
  if tg_op = 'INSERT' then
    new.created_by := v_me; new.created_at := now();
    new.recurrence_id := null; new.recurrence_due := null;
    new.review_note := null; new.decided_by := null; new.decided_at := null;
    if new.claimed_by is not null then
      if new.claimed_by <> v_me then raise exception 'A claim is your own' using errcode = '42501'; end if;
      new.status := 'claimed';
    else
      new.status := 'confirmed';
    end if;
  else
    new.id := old.id; new.org_id := old.org_id; new.claimed_by := old.claimed_by;
    new.recurrence_id := old.recurrence_id; new.recurrence_due := old.recurrence_due;
    new.review_note := old.review_note; new.decided_by := old.decided_by; new.decided_at := old.decided_at;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
    -- Only a draft can be confirmed here; a returned claim goes back for approval when its owner edits it
    if old.status = 'draft' and new.status = 'confirmed' and v_fin then
      null;
    elsif old.status = 'returned' and old.claimed_by = v_me and new.removed_at is null then
      new.status := 'claimed';
    else
      new.status := old.status;
    end if;
  end if;
  -- A pending claim links only to its gig; its owner can't mark it paid
  if new.status in ('claimed', 'returned') then
    if num_nonnulls(new.subrental_id, new.repair_id, new.crew_fee_user_id, new.stock_movement_id, new.stock_unit_id) > 0 then
      raise exception 'A claim links only to its gig' using errcode = '22023';
    end if;
    if new.gig_id is null then raise exception 'A claim needs a gig' using errcode = '22023'; end if;
    if not v_fin then new.paid_on := null; new.paid_how := null; end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.expenses e where e.org_id = new.org_id and e.created_at > now() - interval '1 day') >= 2000 then
    raise exception 'Too many expenses today' using errcode = '54000';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function private.expenses_before() from public, anon, authenticated;
