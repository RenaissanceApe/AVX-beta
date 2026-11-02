-- K0 · Capture for reports (docs/ANALYTICS.md). Only fields, so history starts now; no report
-- screens. Quotes get their sent and decided dates and a lost reason; gigs get a client of their
-- own; items, stock purchases and sales, units and inspections get costs. Amounts are excl. VAT.
-- Every new column sits on a table that only admins and members (can_quote) can read, except
-- gigs.client_id, which crew can read as an id only (client records stay admins and members only).
-- Written without destructive statements.

-- ── Quotes: sent and decided dates, lost reason ──────────────────────────────
alter table public.quotes add column if not exists sent_at timestamptz;
alter table public.quotes add column if not exists decided_at timestamptz;
alter table public.quotes add column if not exists lost_reason text;
alter table public.quotes add column if not exists lost_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_lost_check') then
    alter table public.quotes add constraint quotes_lost_check check (
      (lost_reason is null or lost_reason in ('price', 'competitor', 'cancelled', 'unavailable', 'scope', 'other'))
      and char_length(coalesce(lost_note, '')) <= 500);
  end if;
end $$;

-- One trigger for every way a status changes (the editor, send-quote, quote-public):
-- sent_at   the first time the quote leaves draft; never changed after that
-- decided_at when it becomes accepted or declined; cleared if it goes back to draft or sent
-- lost_*    kept only while declined; a client's note from the link fills an empty lost_note
-- Dates sent by the app are ignored, so only this trigger writes them.
create or replace function private.quotes_report_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.sent_at := case when new.status <> 'draft' then now() end;
    new.decided_at := case when new.status in ('accepted', 'declined') then now() end;
  else
    new.sent_at := old.sent_at;
    new.decided_at := old.decided_at;
    if new.status is distinct from old.status then
      if new.status <> 'draft' and new.sent_at is null then new.sent_at := now(); end if;
      new.decided_at := case when new.status in ('accepted', 'declined') then now() end;
    end if;
  end if;
  if new.status = 'declined' then
    if new.lost_note is null then
      select nullif(trim(s.responder_note), '') into new.lost_note
        from public.quote_shares s
       where s.quote_id = new.id and s.status = 'declined'
       order by s.responded_at desc nulls last limit 1;
    end if;
  else
    new.lost_reason := null;
    new.lost_note := null;
  end if;
  return new;
end $$;
revoke execute on function private.quotes_report_dates() from public, anon, authenticated;
create or replace trigger quotes_report_dates before insert or update on public.quotes
  for each row execute function private.quotes_report_dates();

-- ── Gigs: a client of their own ──────────────────────────────────────────────
alter table public.gigs add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists gigs_client_idx on public.gigs (client_id) where client_id is not null;

-- The client belongs to the gig's organisation, and only admins and members (who can see
-- clients) set or change it; a crew member who manages a gig can't. Database jobs (no
-- signed-in user) may, for the backfill.
create or replace function private.gigs_client_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.org_id = new.org_id) then
    raise exception 'That client belongs to another organisation' using errcode = '42501';
  end if;
  if (tg_op = 'INSERT' or new.client_id is distinct from old.client_id)
     and auth.uid() is not null and not private.can_quote(new.org_id) then
    raise exception 'Only admins and members can set a gig''s client' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.gigs_client_check() from public, anon, authenticated;
create or replace trigger gigs_client_check before insert or update of client_id, org_id on public.gigs
  for each row execute function private.gigs_client_check();

-- ── Equipment costs ──────────────────────────────────────────────────────────
-- cost_price: usual purchase cost per unit. depreciation_months: the default write-off period
-- for its units and bulk purchases (empty means 60, as for units).
alter table public.price_items add column if not exists cost_price numeric(12,2);
alter table public.price_items add column if not exists depreciation_months integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_items_cost_check') then
    alter table public.price_items add constraint price_items_cost_check check (
      (cost_price is null or cost_price >= 0)
      and (depreciation_months is null or depreciation_months between 1 and 600));
  end if;
end $$;

-- unit_cost: cost each on a purchase, price each on a sale; no other kind of movement has one
alter table public.stock_movements add column if not exists unit_cost numeric(12,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_unit_cost_check') then
    alter table public.stock_movements add constraint stock_movements_unit_cost_check check (
      unit_cost is null or (unit_cost >= 0 and kind in ('purchase', 'sale')));
  end if;
end $$;

alter table public.inspections add column if not exists cost numeric(12,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inspections_cost_check') then
    alter table public.inspections add constraint inspections_cost_check check (cost is null or cost >= 0);
  end if;
end $$;

-- A unit that is lost or retired keeps what it brought in (sale price, insurance payout or 0)
-- and when. Back in use, both are cleared.
alter table public.stock_units add column if not exists disposal_value numeric(12,2);
alter table public.stock_units add column if not exists disposed_on date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_units_disposal_check') then
    alter table public.stock_units add constraint stock_units_disposal_check check (disposal_value is null or disposal_value >= 0);
  end if;
end $$;

create or replace function private.stock_units_disposal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('lost', 'retired') then
    if new.disposed_on is null then
      select (now() at time zone coalesce(o.time_zone, 'Europe/Lisbon'))::date into new.disposed_on
        from public.organisations o where o.id = new.org_id;
    end if;
  else
    new.disposal_value := null;
    new.disposed_on := null;
  end if;
  return new;
end $$;
revoke execute on function private.stock_units_disposal() from public, anon, authenticated;
create or replace trigger stock_units_disposal before update on public.stock_units
  for each row execute function private.stock_units_disposal();

-- ── Backfill (approximate for records made before this step) ─────────────────
-- Quotes: sent from the first client link, else updated_at; decided from the link's answer,
-- else updated_at; a declined link's note as lost_note. Gigs: the client of the gig's accepted
-- quote, else its newest quote. Units already lost or retired: the date of that change.
-- The tables' own triggers are paused while it runs, so the backfill doesn't count as an edit
-- (no new version, updated_at, activity entry or notification).
-- A function so the test file can run it on its fixtures; p_org null means every organisation.
create or replace function private.report_capture_backfill(p_org uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  alter table public.quotes disable trigger user;
  update public.quotes q set
    sent_at = coalesce(q.sent_at,
      (select min(s.created_at) from public.quote_shares s where s.quote_id = q.id),
      case when q.status <> 'draft' then q.updated_at end),
    decided_at = coalesce(q.decided_at, case when q.status in ('accepted', 'declined') then coalesce(
      (select max(s.responded_at) from public.quote_shares s where s.quote_id = q.id and s.status = q.status),
      q.updated_at) end),
    lost_note = coalesce(q.lost_note, case when q.status = 'declined' then
      (select nullif(trim(s.responder_note), '') from public.quote_shares s
        where s.quote_id = q.id and s.status = 'declined' order by s.responded_at desc nulls last limit 1) end)
   where (p_org is null or q.org_id = p_org)
     and (q.sent_at is null or (q.decided_at is null and q.status in ('accepted', 'declined')));
  alter table public.quotes enable trigger user;

  alter table public.gigs disable trigger user;
  update public.gigs g set client_id = (
      select q.client_id from public.quotes q
       where q.gig_id = g.id and q.client_id is not null
       order by (q.status = 'accepted') desc, q.created_at desc limit 1)
   where (p_org is null or g.org_id = p_org) and g.client_id is null
     and exists (select 1 from public.quotes q where q.gig_id = g.id and q.client_id is not null);
  alter table public.gigs enable trigger user;

  alter table public.stock_units disable trigger user;

  update public.stock_units u set disposed_on = coalesce(
      (select (max(m.created_at) at time zone coalesce(o.time_zone, 'Europe/Lisbon'))::date
         from public.stock_movements m where m.unit_id = u.id and m.kind in ('lost', 'retire')),
      (u.updated_at at time zone coalesce(o.time_zone, 'Europe/Lisbon'))::date)
    from public.organisations o
   where o.id = u.org_id and (p_org is null or u.org_id = p_org)
     and u.status in ('lost', 'retired') and u.disposed_on is null;
  alter table public.stock_units enable trigger user;
end $$;
revoke execute on function private.report_capture_backfill(uuid) from public, anon, authenticated;

select private.report_capture_backfill(null);

-- ── Organisation export ──────────────────────────────────────────────────────
-- As in 20261203000001: the current export is renamed and the new one handles the files that
-- gain columns (items, units, stock movements, gigs, quotes, inspections), handing every other
-- part to it.
alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_k0;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0); v_prefix text;
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select coalesce(o.quote_number_prefix, 'Q') into v_prefix from public.organisations o where o.id = p_org;
  case p_part
  when 'items' then
    select jsonb_agg(private.custom_columns(p_org, 'item', x.custom_values) || (to_jsonb(x) - 'custom_values')) into v_out from (
      select i.name, i.code, i.category, i.brand, i.model, i.kind, i.unit as charged_per, i.unit_price, i.tracking,
             i.kit_type, i.weight_kg, i.power_w, i.dimensions, i.replacement_value, i.cost_price, i.depreciation_months, i.min_stock,
             i.packing_note, i.details, i.inspection_kind, i.inspection_months, i.archived_at, i.created_at, i.custom_values
        from public.price_items i where i.org_id = p_org
       order by i.category nulls last, i.name, i.id offset v_off limit v_lim) x;
  when 'units' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.name as item, i.code as item_code, u.code, u.serial, l.name as location, u.status,
             u.purchase_date, u.purchase_cost, u.depreciation_months, u.disposal_value, u.disposed_on,
             c.code as in_case, u.notes, u.created_at
        from public.stock_units u
        join public.price_items i on i.id = u.item_id
        left join public.stock_locations l on l.id = u.location_id
        left join public.stock_units c on c.id = u.case_unit_id
       where u.org_id = p_org
       order by i.name, u.code nulls last, u.id offset v_off limit v_lim) x;
  when 'stock_movements' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select m.created_at, i.name as item, i.code as item_code, u.code as unit_code, m.kind, m.quantity, m.unit_cost,
             f.name as from_location, t.name as to_location, m.note, p.full_name as by
        from public.stock_movements m
        join public.price_items i on i.id = m.item_id
        left join public.stock_units u on u.id = m.unit_id
        left join public.stock_locations f on f.id = m.from_location_id
        left join public.stock_locations t on t.id = m.to_location_id
        left join public.profiles p on p.id = m.created_by
       where m.org_id = p_org
       order by m.created_at, m.id offset v_off limit v_lim) x;
  when 'gigs' then
    select jsonb_agg(private.custom_columns(p_org, 'gig', x.custom_values) || (to_jsonb(x) - 'custom_values')) into v_out from (
      select coalesce(g.import_ref, g.id::text) as ref, g.name, g.start_date, g.end_date, g.venue, g.status,
             s.name as status_label, ty.name as gig_type,
             coalesce(cl.name, (select q.client_company from public.quotes q where q.gig_id = g.id and q.client_company is not null order by q.created_at limit 1)) as client,
             g.description as notes, g.created_at, g.custom_values
        from public.gigs g
        left join public.clients cl on cl.id = g.client_id
        left join public.gig_statuses s on s.id = g.custom_status_id
        left join public.gig_types ty on ty.id = g.gig_type_id
       where g.org_id = p_org
       order by g.start_date nulls last, g.name, g.id offset v_off limit v_lim) x;
  when 'quotes' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select case when v_prefix = '' then q.number::text else v_prefix || lpad(q.number::text, 4, '0') end as quote_number, q.title, q.status, coalesce(c.name, q.client_company, q.client_name) as client,
             q.client_name as client_contact, q.client_email, q.issue_date, q.valid_until, q.currency, q.vat_rate, q.discount_pct,
             q.total_net, q.version, g.name as gig, q.manager_name, q.payment_terms, q.sent_at, q.decided_at, q.lost_reason, q.lost_note, q.created_at
        from public.quotes q
        left join public.clients c on c.id = q.client_id
        left join public.gigs g on g.id = q.gig_id
       where q.org_id = p_org
       order by q.created_at, q.id offset v_off limit v_lim) x;
  when 'inspections' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select n.done_on, i.name as item, i.code as item_code, u.code as unit_code, n.result, n.inspector, n.cost, n.notes
        from public.inspections n
        join public.price_items i on i.id = n.item_id
        left join public.stock_units u on u.id = n.unit_id
       where n.org_id = p_org
       order by n.done_on, n.id offset v_off limit v_lim) x;
  else
    return private.export_org_part_pre_k0(p_org, p_part, p_offset);
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_k0(uuid, text, integer) from public, anon, authenticated;
