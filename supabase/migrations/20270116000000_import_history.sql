-- IM4 · The history import (docs/SWITCHING.md, "How IM4 works"; docs/PENDING.md D26). Add-only:
-- one column, and functions replaced with create or replace (same signatures and grants), built on
-- the bodies of 20270115000000_import_fixes.sql (IM3: exact picks; IM2's custom_values kept),
-- 20261210000000_report_capture.sql and 20260926000001_pilot_hardening.sql.
-- 1. gigs.from_history: a past job brought in by the import ("Import as past jobs" in the check).
--    Such a gig gets no production manager row (handle_new_gig), so it books nobody, clashes with
--    nothing and notifies nobody; equipment lines for it are refused, so it books no stock. Org
--    members still open it (can_access_gig), and its creator manages it (can_manage_gig).
-- 2. import_gig_row: a row with _history ('completed' or 'cancelled', sent only for rows the check
--    chose) whose dates are past comes in as a completed gig (a cancelled row as cancelled, only with
--    'cancelled'). Up to 10 years back (the owner's answer): older ones are left out with a note. A
--    gig already in AVX that isn't from history is left as it is. Rows without _history: as before.
-- 3. import_quote: the first line can give the quote's status (draft, sent, accepted, declined), its
--    sent and decided dates and a decline reason. The reports read sent_at and decided_at; while the
--    import writes them (avx.import_history), quotes_report_dates keeps them instead of now().
-- Written without destructive statements. Run in the SQL editor or with the connector.

-- ── 1. Gigs from history ─────────────────────────────────────────────────────
alter table public.gigs add column if not exists from_history boolean not null default false;

-- As 20260926000001, except a gig from history gets no production manager (nobody is booked or told)
create or replace function public.handle_new_gig() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.from_history then return new; end if;
  insert into gig_members (gig_id, user_id, role, function_title)
  values (new.id, new.created_by, 'pm', 'Production Manager')
  on conflict (gig_id, user_id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_gig() from public, anon, authenticated;

-- ── 2. Report dates the history import gives ─────────────────────────────────
-- As 20261210000000, except that while the history import writes a quote (avx.import_history, set
-- only by private.import_quote for its own statement) the sent and decided dates it gives are kept.
create or replace function private.quotes_report_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('avx.import_history', true), '') = 'on' then
    -- The import gives both dates from the file (null where the status has none)
    null;
  elsif tg_op = 'INSERT' then
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

-- ── 3. Words ─────────────────────────────────────────────────────────────────
-- "Aceite", "Afgewezen", "Won"… → a quote status; 'unknown' when it's none of them
create or replace function private.import_quote_status(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or trim(p) = '' then null
    when lower(trim(p)) in ('draft', 'concept', 'rascunho', 'open', 'new', 'nieuw', 'novo') then 'draft'
    when lower(trim(p)) in ('sent', 'verzonden', 'verstuurd', 'enviado', 'enviada', 'pending', 'in afwachting', 'pendente', 'awaiting', 'waiting') then 'sent'
    when lower(trim(p)) in ('accepted', 'won', 'approved', 'confirmed', 'geaccepteerd', 'akkoord', 'gewonnen', 'goedgekeurd', 'aceite', 'aceito',
      'aceitado', 'aprovado', 'aprovada', 'ganho', 'confirmado') then 'accepted'
    when lower(trim(p)) in ('declined', 'rejected', 'lost', 'refused', 'afgewezen', 'verloren', 'geweigerd', 'recusado', 'recusada', 'rejeitado',
      'rejeitada', 'perdido', 'perdida') then 'declined'
    else 'unknown'
  end
$$;
revoke execute on function private.import_quote_status(text) from public, anon, authenticated;

-- A decline reason in the file → one of the reports' reasons ('other' when it's none of them)
create or replace function private.import_lost_reason(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or trim(p) = '' then null
    when lower(trim(p)) in ('price', 'too expensive', 'expensive', 'budget', 'prijs', 'te duur', 'preço', 'preco', 'caro', 'demasiado caro', 'orçamento', 'orcamento') then 'price'
    when lower(trim(p)) in ('competitor', 'competition', 'another supplier', 'concurrent', 'concurrentie', 'concorrência', 'concorrencia', 'concorrente') then 'competitor'
    when lower(trim(p)) in ('cancelled', 'canceled', 'event cancelled', 'geannuleerd', 'cancelado', 'cancelada', 'anulado') then 'cancelled'
    when lower(trim(p)) in ('unavailable', 'not available', 'no availability', 'niet beschikbaar', 'indisponível', 'indisponivel', 'sem disponibilidade') then 'unavailable'
    when lower(trim(p)) in ('scope', 'scope change', 'changed scope', 'omvang', 'âmbito', 'ambito') then 'scope'
    else 'other'
  end
$$;
revoke execute on function private.import_lost_reason(text) from public, anon, authenticated;

-- ── 4. The jobs import ───────────────────────────────────────────────────────
-- As 20270115000000, plus past jobs the check chose to bring in (_history)
create or replace function private.import_gig_row(p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.gigs; v_ref text := left(private.import_text(r, 'ref'), 80); v_name text := left(private.import_text(r, 'name'), 200);
  v_start date := nullif(r ->> 'start_date', '')::date; v_end date := nullif(r ->> 'end_date', '')::date;
  v_status text := private.import_gig_status(private.import_text(r, 'status'));
  v_desc text; v_new jsonb; d jsonb; v_client uuid;
  -- The organisation's own fields the file gives (field id → value); empty cells keep what's there
  v_cv jsonb := case when jsonb_typeof(r -> 'custom_values') = 'object' then nullif(jsonb_strip_nulls(r -> 'custom_values'), '{}'::jsonb) end;
  -- "Import as past jobs" ('completed') or "Import as cancelled" ('cancelled'), chosen in the check
  v_history text := private.import_text(r, '_history');
  v_past boolean := coalesce(v_end, v_start) < current_date;
  v_hist boolean;
begin
  if v_status = 'unknown' then raise exception 'Unknown status: %', private.import_text(r, 'status') using errcode = '22023'; end if;
  if v_history is not null and v_history not in ('completed', 'cancelled') then
    raise exception 'Unknown status: %', v_history using errcode = '22023';
  end if;
  -- Up to 10 years back (the owner's answer, IM4)
  if v_past and v_history is not null and coalesce(v_end, v_start) < (current_date - interval '10 years')::date then
    result := 'unchanged'; note := 'Too old to import: ' || coalesce(v_name, v_ref, '—'); return;
  end if;
  v_hist := coalesce(v_past, false) and v_history is not null;
  if v_status = 'cancelled' and not (v_hist and v_history = 'cancelled') then
    result := 'unchanged'; note := 'Cancelled job left out: ' || coalesce(v_name, v_ref, '—'); return;
  end if;
  if v_past and not v_hist then result := 'unchanged'; note := 'Past job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if v_end is not null and v_start is not null and v_end < v_start then raise exception 'The job ends before it starts' using errcode = '22023'; end if;
  -- The client a fix chose, else from the directory when the name matches one (as the quotes import does)
  v_client := private.import_client_pick(p_org, private.import_pick(r, '_client_id'));
  if v_client is null and private.import_text(r, 'client') is not null then
    select c.id into v_client from public.clients c
     where c.org_id = p_org and lower(c.name) = lower(private.import_text(r, 'client')) and c.archived_at is null
     order by c.created_at limit 1;
  end if;
  v_desc := nullif(concat_ws(E'\n',
    case when private.import_text(r, 'client') is not null then 'Client: ' || private.import_text(r, 'client') end,
    private.import_text(r, 'notes')), '');
  v := private.import_gig_find(p_org, private.import_pick(r, '_gig_id'), v_ref, v_name, v_start);
  if v.id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    if v_start is null then raise exception 'The start date is missing' using errcode = '22023'; end if;
    insert into public.gigs (org_id, name, venue, start_date, end_date, description, status, created_by, import_ref, client_id, custom_values, from_history)
    values (p_org, v_name, left(private.import_text(r, 'venue'), 300), v_start, coalesce(v_end, v_start), left(v_desc, 5000),
      case when not v_hist then coalesce(v_status, 'draft') when v_status = 'cancelled' then 'cancelled' else 'completed' end,
      auth.uid(), v_ref, v_client, coalesce(v_cv, '{}'::jsonb), v_hist);
    result := 'created';
    return;
  end if;
  -- A gig already in AVX is never turned into a past one
  if v_hist and not v.from_history then
    result := 'unchanged'; note := 'Already in AVX, left as it is: ' || v.name; return;
  end if;
  -- Only what the file gives; a gig already under way or done keeps its status
  v_new := jsonb_strip_nulls(jsonb_build_object('name', v_name, 'venue', left(private.import_text(r, 'venue'), 300),
    'start_date', v_start, 'end_date', v_end, 'description', left(v_desc, 5000), 'import_ref', v_ref, 'client_id', v_client,
    'status', case when v.status in ('draft', 'confirmed') then v_status end));
  if lower(v.name) = lower(v_name) then v_new := v_new - 'name'; end if;
  if v_cv is not null then v_new := v_new || jsonb_build_object('custom_values', coalesce(v.custom_values, '{}'::jsonb) || v_cv); end if;
  d := private.import_diff(to_jsonb(v), v_new);
  if d is null then result := 'unchanged'; return; end if;
  update public.gigs g set name = coalesce(v_new ->> 'name', g.name), venue = coalesce(v_new ->> 'venue', g.venue),
    start_date = coalesce((v_new ->> 'start_date')::date, g.start_date), end_date = coalesce((v_new ->> 'end_date')::date, g.end_date),
    description = coalesce(v_new ->> 'description', g.description), status = coalesce(v_new ->> 'status', g.status),
    import_ref = coalesce(v_new ->> 'import_ref', g.import_ref), client_id = coalesce((v_new ->> 'client_id')::uuid, g.client_id),
    custom_values = coalesce(v_new -> 'custom_values', g.custom_values)
   where g.id = v.id;
  result := 'updated';
end $$;
revoke execute on function private.import_gig_row(uuid, jsonb) from public, anon, authenticated;

-- As 20270115000000, except a gig from history never gets equipment (it would book stock)
create or replace function private.import_gig_equipment_row(p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_gig public.gigs; v_item public.price_items; v_line public.gig_equipment;
  v_qty integer := coalesce(nullif(r ->> 'quantity', '')::integer, 1);
begin
  v_gig := private.import_gig_find(p_org, private.import_pick(r, '_gig_id'), private.import_text(r, 'gig_ref'), private.import_text(r, 'gig'), null);
  if v_gig.id is null then raise exception 'Unknown job: %', coalesce(private.import_text(r, 'gig_ref'), private.import_text(r, 'gig'), '—') using errcode = '22023'; end if;
  if v_gig.from_history then raise exception 'Past job: equipment isn''t planned on it' using errcode = '22023'; end if;
  v_item := private.import_item_find(p_org, private.import_pick(r, '_item_id'), private.import_text(r, 'item_code'), private.import_text(r, 'item'));
  if v_item.id is null then raise exception 'Unknown item: %', coalesce(private.import_text(r, 'item_code'), private.import_text(r, 'item'), '—') using errcode = '22023'; end if;
  if v_qty < 1 or v_qty > 100000 then raise exception 'The quantity must be 1 to 100000' using errcode = '22023'; end if;
  select * into v_line from public.gig_equipment e where e.gig_id = v_gig.id and e.item_id = v_item.id;
  if v_line.id is null then
    insert into public.gig_equipment (gig_id, org_id, item_id, item_name, quantity, notes)
    values (v_gig.id, p_org, v_item.id, v_item.name, v_qty, left(private.import_text(r, 'notes'), 500));
    return 'created';
  end if;
  if v_line.quantity = v_qty and (private.import_text(r, 'notes') is null or v_line.notes is not distinct from left(private.import_text(r, 'notes'), 500)) then
    return 'unchanged';
  end if;
  update public.gig_equipment e set quantity = v_qty, notes = coalesce(left(private.import_text(r, 'notes'), 500), e.notes) where e.id = v_line.id;
  return 'updated';
end $$;
revoke execute on function private.import_gig_equipment_row(uuid, jsonb) from public, anon, authenticated;

-- ── 5. The quotes import ─────────────────────────────────────────────────────
-- As 20270115000000, plus the quote's history from its first line: status, sent_date, decided_date,
-- lost_reason. A sent quote is sent on its sent date (else its date); a decided one is decided on
-- its decided date (else sent). Dates are read at noon in the organisation's time zone.
create or replace function private.import_quote(p_org uuid, p_rows jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  f jsonb := p_rows -> 0; r jsonb; v_ref text := left(private.import_text(p_rows -> 0, 'quote_ref'), 80);
  v_title text := left(coalesce(private.import_text(p_rows -> 0, 'title'), private.import_text(p_rows -> 0, 'quote_ref')), 200);
  v_quote public.quotes; v_org public.organisations; v_client public.clients; v_item public.price_items;
  v_sections jsonb := '[]'::jsonb; v_section text; v_idx integer; v_line jsonb; v_net numeric := 0;
  v_qty numeric; v_factor numeric; v_price numeric; v_disc numeric; v_issue date; v_body jsonb; v_pick uuid;
  v_status text := coalesce(private.import_quote_status(private.import_text(p_rows -> 0, 'status')), 'draft');
  v_sent_on date := nullif(p_rows -> 0 ->> 'sent_date', '')::date; v_decided_on date := nullif(p_rows -> 0 ->> 'decided_date', '')::date;
  v_sent date; v_decided date; v_sent_at timestamptz; v_decided_at timestamptz; v_zone text;
  v_lost text; v_lost_note text;
begin
  if v_title is null then raise exception 'The quote has no title or number' using errcode = '22023'; end if;
  if v_status = 'unknown' then raise exception 'Unknown quote status: %', private.import_text(f, 'status') using errcode = '22023'; end if;
  select * into v_org from public.organisations o where o.id = p_org;
  for r in select value from jsonb_array_elements(p_rows) loop
    if private.import_text(r, 'description') is null and private.import_text(r, 'item_code') is null and private.import_text(r, 'item') is null then
      raise exception 'A line has no description or item' using errcode = '22023';
    end if;
    v_item := null;
    v_pick := private.import_pick(r, '_item_id');
    if v_pick is not null then
      v_item := private.import_item_find(p_org, v_pick, null, null);
    elsif private.import_text(r, 'item_code') is not null or private.import_text(r, 'item') is not null then
      begin
        v_item := private.import_item_find(p_org, private.import_text(r, 'item_code'), private.import_text(r, 'item'));
      exception when others then v_item := null;
      end;
    end if;
    v_qty := coalesce(nullif(r ->> 'quantity', '')::numeric, 1);
    v_factor := coalesce(nullif(r ->> 'factor', '')::numeric, 1);
    v_price := coalesce(nullif(r ->> 'unit_price', '')::numeric, v_item.unit_price, 0);
    v_disc := least(100, greatest(0, coalesce(nullif(r ->> 'discount_pct', '')::numeric, 0)));
    v_line := jsonb_strip_nulls(jsonb_build_object(
      'id', gen_random_uuid(), 'kind', case when v_item.kind in ('rental', 'sale', 'crew', 'transport') then v_item.kind else 'rental' end,
      'description', left(coalesce(private.import_text(r, 'description'), v_item.name, private.import_text(r, 'item')), 500), 'details', '',
      'qty', v_qty, 'unit', coalesce(v_item.unit, 'unit'), 'factor', v_factor, 'unit_price', v_price, 'discount_pct', v_disc,
      'item_id', v_item.id));
    v_net := v_net + round(v_qty * v_factor * v_price * (1 - v_disc / 100), 2);
    v_section := coalesce(left(private.import_text(r, 'section'), 120), '');
    select (s.ord - 1)::integer into v_idx from jsonb_array_elements(v_sections) with ordinality s(val, ord) where s.val ->> 'name' = v_section;
    if v_idx is null then
      v_sections := v_sections || jsonb_build_object('id', gen_random_uuid(), 'name', v_section, 'lines', jsonb_build_array(v_line));
    else
      v_sections := jsonb_set(v_sections, array[v_idx::text, 'lines'], (v_sections -> v_idx -> 'lines') || v_line);
    end if;
  end loop;
  v_body := jsonb_build_object('phases', jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'name', '', 'start_date', nullif(f ->> 'start_date', ''), 'end_date', nullif(f ->> 'end_date', ''),
    'start_time', null, 'end_time', null, 'discount_pct', 0, 'optional', false, 'sections', v_sections)));
  -- The client a fix chose, else from the directory when the name matches one, otherwise as written
  v_pick := private.import_client_pick(p_org, private.import_pick(f, '_client_id'));
  if v_pick is not null then
    select * into v_client from public.clients c where c.id = v_pick;
  elsif private.import_text(f, 'client') is not null then
    select * into v_client from public.clients c where c.org_id = p_org and lower(c.name) = lower(private.import_text(f, 'client')) and c.archived_at is null
     order by c.created_at limit 1;
  end if;
  v_issue := coalesce(nullif(f ->> 'issue_date', '')::date, current_date);
  -- The quote's history (IM4): its dates, checked, and the reason it was declined
  if v_status <> 'draft' then
    if greatest(v_sent_on, v_decided_on) > current_date then raise exception 'A date is after today' using errcode = '22023'; end if;
    v_sent := coalesce(v_sent_on, v_issue);
    if v_status in ('accepted', 'declined') then v_decided := coalesce(v_decided_on, v_sent); end if;
    if v_decided < v_sent then raise exception 'The quote is decided before it was sent' using errcode = '22023'; end if;
    if v_decided < (current_date - interval '10 years')::date then
      result := 'unchanged'; note := 'Too old to import: ' || v_title; return;
    end if;
    v_zone := private.org_zone(p_org);
    v_sent_at := (v_sent + time '12:00') at time zone v_zone;
    v_decided_at := (v_decided + time '12:00') at time zone v_zone;
    if v_status = 'declined' then
      v_lost := private.import_lost_reason(private.import_text(f, 'lost_reason'));
      v_lost_note := case when v_lost = 'other' then left(private.import_text(f, 'lost_reason'), 500) end;
    end if;
  end if;
  if v_ref is not null then select * into v_quote from public.quotes q where q.org_id = p_org and lower(q.import_ref) = lower(v_ref); end if;
  if v_quote.id is null then
    -- Only this statement keeps the dates it gives (quotes_report_dates)
    perform set_config('avx.import_history', 'on', true);
    insert into public.quotes (org_id, title, status, language, client_id, client_company, client_name, client_email, client_address, client_tax_id,
      issue_date, valid_until, terms, vat_rate, body, total_net, import_ref, sent_at, decided_at, lost_reason, lost_note)
    values (p_org, v_title, v_status, 'pt', v_client.id, coalesce(v_client.name, left(private.import_text(f, 'client'), 200)), left(v_client.contact_name, 200),
      v_client.email, v_client.address, v_client.tax_id, v_issue,
      greatest(v_issue, coalesce(nullif(f ->> 'valid_until', '')::date, v_issue + coalesce(v_org.quote_validity_days, 30))),
      v_org.quote_terms, coalesce(v_org.default_vat_rate, 23), v_body, v_net, v_ref, v_sent_at, v_decided_at, v_lost, v_lost_note);
    perform set_config('avx.import_history', 'off', true);
    result := 'created';
    return;
  end if;
  if v_quote.status <> 'draft' then
    result := 'unchanged'; note := 'Quote already sent, left as it is: ' || v_title;
    return;
  end if;
  -- A draft imported earlier gets the file's lines again (its other details stay), and its history
  if v_status = 'draft'
     and (select jsonb_agg(jsonb_build_object('s', s ->> 'name', 'l', (select jsonb_agg(l - 'id') from jsonb_array_elements(s -> 'lines') l)))
        from jsonb_array_elements(v_quote.body -> 'phases' -> 0 -> 'sections') s)
     is not distinct from
     (select jsonb_agg(jsonb_build_object('s', s ->> 'name', 'l', (select jsonb_agg(l - 'id') from jsonb_array_elements(s -> 'lines') l)))
        from jsonb_array_elements(v_sections) s)
     and v_quote.title = v_title then
    result := 'unchanged';
    return;
  end if;
  if v_status = 'draft' then
    update public.quotes q set title = v_title, body = v_body, total_net = v_net where q.id = v_quote.id;
  else
    perform set_config('avx.import_history', 'on', true);
    update public.quotes q set title = v_title, body = v_body, total_net = v_net, status = v_status,
      sent_at = v_sent_at, decided_at = v_decided_at, lost_reason = v_lost, lost_note = v_lost_note
     where q.id = v_quote.id;
    perform set_config('avx.import_history', 'off', true);
  end if;
  result := 'updated';
end $$;
revoke execute on function private.import_quote(uuid, jsonb) from public, anon, authenticated;
