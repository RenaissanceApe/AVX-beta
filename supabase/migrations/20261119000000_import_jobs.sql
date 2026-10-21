-- Switching S3b (docs/SWITCHING.md): upcoming jobs, their equipment and open quotes.
-- import_jobs(org, kind, rows, file), for organisation admins and members:
--   'gigs'           one row per job → a gig (name, dates, venue, status; the client and notes go
--                    in its description). Past and cancelled jobs are left out: they stay in the
--                    old tool's export.
--   'gig_equipment'  one row per line → planned equipment on that gig (which books the gear)
--   'quotes'         one row per quote line, grouped by quote → a draft quote with its lines
-- Gigs and quotes keep the old tool's number (import_ref), so importing again updates them
-- instead of doubling. These imports aren't kept as batches: what they add is removed the usual
-- way (a gig or a quote can be deleted; an equipment line taken off), so they need no undo and
-- no change to the import tables.
-- Written without destructive statements so it applies without manual confirmation.

alter table public.gigs add column if not exists import_ref text;
alter table public.quotes add column if not exists import_ref text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gigs_import_ref_check') then
    alter table public.gigs add constraint gigs_import_ref_check check (char_length(coalesce(import_ref, '')) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_import_ref_check') then
    alter table public.quotes add constraint quotes_import_ref_check check (char_length(coalesce(import_ref, '')) <= 80);
  end if;
end $$;
create unique index if not exists gigs_import_ref_uniq on public.gigs (org_id, lower(import_ref)) where import_ref is not null;
create unique index if not exists quotes_import_ref_uniq on public.quotes (org_id, lower(import_ref)) where import_ref is not null;

-- "Bevestigd", "Optie", "Confirmado"… → a gig status; 'cancelled' and 'unknown' are left out
create or replace function private.import_gig_status(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or trim(p) = '' then null
    when lower(trim(p)) in ('confirmed', 'bevestigd', 'confirmado', 'booked', 'geboekt', 'reservado', 'definitive', 'definitief', 'definitivo') then 'confirmed'
    when lower(trim(p)) in ('draft', 'concept', 'option', 'optie', 'opção', 'opcao', 'request', 'aanvraag', 'pedido', 'pending', 'in afwachting', 'pendente', 'rascunho', 'quote', 'offerte', 'orçamento', 'orcamento', 'tentative') then 'draft'
    when lower(trim(p)) in ('active', 'in progress', 'lopend', 'em curso', 'on site') then 'active'
    when lower(trim(p)) in ('completed', 'finished', 'done', 'closed', 'afgerond', 'voltooid', 'gesloten', 'concluído', 'concluido', 'terminado', 'fechado') then 'completed'
    when lower(trim(p)) in ('cancelled', 'canceled', 'geannuleerd', 'cancelado', 'anulado', 'lost', 'verloren', 'perdido') then 'cancelled'
    else 'unknown'
  end
$$;
revoke execute on function private.import_gig_status(text) from public, anon, authenticated;

-- A gig by its old number, then by name (and start date when given), among the organisation's
create or replace function private.import_gig_find(p_org uuid, p_ref text, p_name text, p_start date) returns public.gigs
language plpgsql stable security definer set search_path = '' as $$
declare v public.gigs; n integer;
begin
  if p_ref is not null then
    select * into v from public.gigs g where g.org_id = p_org and lower(g.import_ref) = lower(p_ref);
    if found then return v; end if;
  end if;
  if p_name is not null then
    select count(*) into n from public.gigs g where g.org_id = p_org and lower(g.name) = lower(p_name) and (p_start is null or g.start_date = p_start);
    if n > 1 then raise exception 'Several gigs are called %: add the job numbers to the file', p_name using errcode = '22023'; end if;
    select * into v from public.gigs g where g.org_id = p_org and lower(g.name) = lower(p_name) and (p_start is null or g.start_date = p_start);
    if found then return v; end if;
  end if;
  return null;
end $$;
revoke execute on function private.import_gig_find(uuid, text, text, date) from public, anon, authenticated;

create or replace function private.import_gig_row(p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.gigs; v_ref text := left(private.import_text(r, 'ref'), 80); v_name text := left(private.import_text(r, 'name'), 200);
  v_start date := nullif(r ->> 'start_date', '')::date; v_end date := nullif(r ->> 'end_date', '')::date;
  v_status text := private.import_gig_status(private.import_text(r, 'status'));
  v_desc text; v_new jsonb; d jsonb;
begin
  if v_status = 'unknown' then raise exception 'Unknown status: %', private.import_text(r, 'status') using errcode = '22023'; end if;
  if v_status = 'cancelled' then result := 'unchanged'; note := 'Cancelled job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if coalesce(v_end, v_start) < current_date then result := 'unchanged'; note := 'Past job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if v_end is not null and v_start is not null and v_end < v_start then raise exception 'The job ends before it starts' using errcode = '22023'; end if;
  v_desc := nullif(concat_ws(E'\n',
    case when private.import_text(r, 'client') is not null then 'Client: ' || private.import_text(r, 'client') end,
    private.import_text(r, 'notes')), '');
  v := private.import_gig_find(p_org, v_ref, v_name, v_start);
  if v.id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    if v_start is null then raise exception 'The start date is missing' using errcode = '22023'; end if;
    insert into public.gigs (org_id, name, venue, start_date, end_date, description, status, created_by, import_ref)
    values (p_org, v_name, left(private.import_text(r, 'venue'), 300), v_start, coalesce(v_end, v_start), left(v_desc, 5000),
      coalesce(v_status, 'draft'), auth.uid(), v_ref);
    result := 'created';
    return;
  end if;
  -- Only what the file gives; a gig already under way or done keeps its status
  v_new := jsonb_strip_nulls(jsonb_build_object('name', v_name, 'venue', left(private.import_text(r, 'venue'), 300),
    'start_date', v_start, 'end_date', v_end, 'description', left(v_desc, 5000), 'import_ref', v_ref,
    'status', case when v.status in ('draft', 'confirmed') then v_status end));
  if lower(v.name) = lower(v_name) then v_new := v_new - 'name'; end if;
  d := private.import_diff(to_jsonb(v), v_new);
  if d is null then result := 'unchanged'; return; end if;
  update public.gigs g set name = coalesce(v_new ->> 'name', g.name), venue = coalesce(v_new ->> 'venue', g.venue),
    start_date = coalesce((v_new ->> 'start_date')::date, g.start_date), end_date = coalesce((v_new ->> 'end_date')::date, g.end_date),
    description = coalesce(v_new ->> 'description', g.description), status = coalesce(v_new ->> 'status', g.status),
    import_ref = coalesce(v_new ->> 'import_ref', g.import_ref)
   where g.id = v.id;
  result := 'updated';
end $$;
revoke execute on function private.import_gig_row(uuid, jsonb) from public, anon, authenticated;

create or replace function private.import_gig_equipment_row(p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_gig public.gigs; v_item public.price_items; v_line public.gig_equipment;
  v_qty integer := coalesce(nullif(r ->> 'quantity', '')::integer, 1);
begin
  v_gig := private.import_gig_find(p_org, private.import_text(r, 'gig_ref'), private.import_text(r, 'gig'), null);
  if v_gig.id is null then raise exception 'Unknown job: %', coalesce(private.import_text(r, 'gig_ref'), private.import_text(r, 'gig'), '—') using errcode = '22023'; end if;
  v_item := private.import_item_find(p_org, private.import_text(r, 'item_code'), private.import_text(r, 'item'));
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

-- One quote from its lines (rows already grouped, in file order). Returns { result, note }.
create or replace function private.import_quote(p_org uuid, p_rows jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  f jsonb := p_rows -> 0; r jsonb; v_ref text := left(private.import_text(p_rows -> 0, 'quote_ref'), 80);
  v_title text := left(coalesce(private.import_text(p_rows -> 0, 'title'), private.import_text(p_rows -> 0, 'quote_ref')), 200);
  v_quote public.quotes; v_org public.organisations; v_client public.clients; v_item public.price_items;
  v_sections jsonb := '[]'::jsonb; v_section text; v_idx integer; v_line jsonb; v_net numeric := 0;
  v_qty numeric; v_factor numeric; v_price numeric; v_disc numeric; v_issue date; v_body jsonb;
begin
  if v_title is null then raise exception 'The quote has no title or number' using errcode = '22023'; end if;
  select * into v_org from public.organisations o where o.id = p_org;
  for r in select value from jsonb_array_elements(p_rows) loop
    if private.import_text(r, 'description') is null and private.import_text(r, 'item_code') is null and private.import_text(r, 'item') is null then
      raise exception 'A line has no description or item' using errcode = '22023';
    end if;
    v_item := null;
    if private.import_text(r, 'item_code') is not null or private.import_text(r, 'item') is not null then
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
  -- The client from the directory when the name matches one, otherwise as written
  if private.import_text(f, 'client') is not null then
    select * into v_client from public.clients c where c.org_id = p_org and lower(c.name) = lower(private.import_text(f, 'client')) and c.archived_at is null
     order by c.created_at limit 1;
  end if;
  v_issue := coalesce(nullif(f ->> 'issue_date', '')::date, current_date);
  if v_ref is not null then select * into v_quote from public.quotes q where q.org_id = p_org and lower(q.import_ref) = lower(v_ref); end if;
  if v_quote.id is null then
    insert into public.quotes (org_id, title, status, language, client_id, client_company, client_name, client_email, client_address, client_tax_id,
      issue_date, valid_until, terms, vat_rate, body, total_net, import_ref)
    values (p_org, v_title, 'draft', 'pt', v_client.id, coalesce(v_client.name, left(private.import_text(f, 'client'), 200)), left(v_client.contact_name, 200),
      v_client.email, v_client.address, v_client.tax_id, v_issue,
      greatest(v_issue, coalesce(nullif(f ->> 'valid_until', '')::date, v_issue + coalesce(v_org.quote_validity_days, 30))),
      v_org.quote_terms, coalesce(v_org.default_vat_rate, 23), v_body, v_net, v_ref);
    result := 'created';
    return;
  end if;
  if v_quote.status <> 'draft' then
    result := 'unchanged'; note := 'Quote already sent, left as it is: ' || v_title;
    return;
  end if;
  -- A draft imported earlier gets the file's lines again (its other details stay)
  if (select jsonb_agg(jsonb_build_object('s', s ->> 'name', 'l', (select jsonb_agg(l - 'id') from jsonb_array_elements(s -> 'lines') l)))
        from jsonb_array_elements(v_quote.body -> 'phases' -> 0 -> 'sections') s)
     is not distinct from
     (select jsonb_agg(jsonb_build_object('s', s ->> 'name', 'l', (select jsonb_agg(l - 'id') from jsonb_array_elements(s -> 'lines') l)))
        from jsonb_array_elements(v_sections) s)
     and v_quote.title = v_title then
    result := 'unchanged';
    return;
  end if;
  update public.quotes q set title = v_title, body = v_body, total_net = v_net where q.id = v_quote.id;
  result := 'updated';
end $$;
revoke execute on function private.import_quote(uuid, jsonb) from public, anon, authenticated;

-- Rows like run_import's; returns { created, updated, unchanged, skipped, problems }. For quotes,
-- the counts are quotes (a quote is skipped as a whole when one of its lines can't be read).
create or replace function public.import_jobs(p_org uuid, p_kind text, p_rows jsonb, p_file text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; g record; v_n integer := 0; v_line integer; v_res text; v_note text;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; v_problems jsonb := '[]'::jsonb;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('gigs', 'gig_equipment', 'quotes') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Up to 5000 rows per import' using errcode = '54000'; end if;

  if p_kind = 'quotes' then
    -- One quote per number (or title), its lines in file order; the first line's row number names it
    for g in
      select min(n) as first_n, jsonb_agg(value order by n) as rows
        from jsonb_array_elements(p_rows) with ordinality e(value, n)
       group by lower(coalesce(nullif(trim(value ->> 'quote_ref'), ''), nullif(trim(value ->> 'title'), ''), '#' || n))
       order by min(n)
    loop
      v_line := coalesce(nullif(g.rows -> 0 ->> '_row', '')::integer, g.first_n::integer);
      begin
        select result, note into v_res, v_note from private.import_quote(p_org, g.rows);
        if v_res = 'created' then c_created := c_created + 1; elsif v_res = 'updated' then c_updated := c_updated + 1; else c_same := c_same + 1; end if;
        if v_note is not null and jsonb_array_length(v_problems) < 1000 then
          v_problems := v_problems || jsonb_build_object('row', v_line, 'message', v_note, 'level', 'note');
        end if;
      exception when others then
        c_skipped := c_skipped + 1;
        if jsonb_array_length(v_problems) < 1000 then
          v_problems := v_problems || jsonb_build_object('row', v_line, 'message', left(sqlerrm, 300), 'level', 'skip');
        end if;
      end;
    end loop;
    return jsonb_build_object('created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems);
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_line := coalesce(nullif(r ->> '_row', '')::integer, v_n);
    v_note := null;
    begin
      if p_kind = 'gigs' then select result, note into v_res, v_note from private.import_gig_row(p_org, r);
      else v_res := private.import_gig_equipment_row(p_org, r);
      end if;
      if v_res = 'created' then c_created := c_created + 1; elsif v_res = 'updated' then c_updated := c_updated + 1; else c_same := c_same + 1; end if;
      if v_note is not null and jsonb_array_length(v_problems) < 1000 then
        v_problems := v_problems || jsonb_build_object('row', v_line, 'message', v_note, 'level', 'note');
      end if;
    exception when others then
      c_skipped := c_skipped + 1;
      if jsonb_array_length(v_problems) < 1000 then
        v_problems := v_problems || jsonb_build_object('row', v_line, 'message', left(sqlerrm, 300), 'level', 'skip');
      end if;
    end;
  end loop;
  return jsonb_build_object('created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems);
end $$;
revoke execute on function public.import_jobs(uuid, text, jsonb, text) from public, anon;
grant execute on function public.import_jobs(uuid, text, jsonb, text) to authenticated;
