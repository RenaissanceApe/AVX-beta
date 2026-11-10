-- IM2 · Columns into your own fields (docs/SWITCHING.md, "Import overhaul: fix it here", Match step;
-- docs/BUSINESS.md, custom fields). The equipment, contacts and jobs imports read an optional
-- custom_values object from each row (field id → value, cleaned by the page) and save it with the
-- record: a new record gets it, an existing one gets the fields the file gives merged over its own
-- (empty cells keep what's there, as for the other columns). On an update the whole object is part
-- of the before/after the import logs, so Undo in Earlier imports puts the old values back.
-- The values are checked by the existing custom_values trigger (the organisation's own current
-- field for that kind of record, and a value of its kind); a refused value comes back as the row's
-- problem. The functions are as before otherwise (20270106000000, 20261117000000, 20261210000001).
-- Only replaces functions, with the same signatures and grants; no table, policy or grant changes.

create or replace function private.import_item_row(p_batch uuid, p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.price_items; v_name text := private.import_text(r, 'name'); v_code text := private.import_text(r, 'code');
  v_qty integer := nullif(r ->> 'quantity', '')::integer; v_loc uuid; v_new jsonb; d jsonb; v_move bigint; v_kind text;
  -- The organisation's own fields the file gives (field id → value); empty cells keep what's there
  v_cv jsonb := case when jsonb_typeof(r -> 'custom_values') = 'object' then jsonb_strip_nulls(r -> 'custom_values') end;
begin
  v := private.import_item_find(p_org, v_code, v_name);
  -- Only what the file gives; empty cells keep what's there
  v_new := jsonb_strip_nulls(jsonb_build_object(
    'name', v_name, 'code', v_code, 'category', private.import_text(r, 'category'), 'brand', private.import_text(r, 'brand'),
    'model', private.import_text(r, 'model'), 'details', private.import_text(r, 'details'), 'kind', private.import_text(r, 'kind'),
    'unit', private.import_text(r, 'unit'), 'tracking', private.import_text(r, 'tracking'),
    'unit_price', nullif(r ->> 'unit_price', '')::numeric, 'weight_kg', nullif(r ->> 'weight_kg', '')::numeric,
    'power_w', nullif(r ->> 'power_w', '')::integer, 'dimensions', private.import_text(r, 'dimensions'),
    'replacement_value', nullif(r ->> 'replacement_value', '')::numeric, 'min_stock', nullif(r ->> 'min_stock', '')::integer,
    'packing_note', private.import_text(r, 'packing_note'), 'cost_price', nullif(r ->> 'cost_price', '')::numeric,
    'depreciation_months', nullif(r ->> 'depreciation_months', '')::integer,
    'speaker_type', private.import_text(r, 'speaker_type'), 'sensitivity_db', nullif(r ->> 'sensitivity_db', '')::numeric,
    'max_spl_db', nullif(r ->> 'max_spl_db', '')::numeric, 'dispersion_h', nullif(r ->> 'dispersion_h', '')::numeric,
    'dispersion_v', nullif(r ->> 'dispersion_v', '')::numeric, 'freq_low_hz', nullif(r ->> 'freq_low_hz', '')::numeric,
    'freq_high_hz', nullif(r ->> 'freq_high_hz', '')::numeric, 'impedance_ohm', nullif(r ->> 'impedance_ohm', '')::numeric,
    'amp_channels', nullif(r ->> 'amp_channels', '')::smallint, 'speaker_preset', private.import_text(r, 'speaker_preset'),
    'spec_source', private.import_text(r, 'spec_source'),
    'rigging', case when jsonb_typeof(r -> 'rigging') = 'object' then r -> 'rigging' end,
    'power_typical_w', nullif(r ->> 'power_typical_w', '')::integer, 'power_factor', nullif(r ->> 'power_factor', '')::numeric,
    'inrush_a', nullif(r ->> 'inrush_a', '')::numeric, 'current_a', nullif(r ->> 'current_a', '')::numeric,
    'current_v', nullif(r ->> 'current_v', '')::smallint, 'connector_in', private.import_text(r, 'connector_in'),
    'connector_out', private.import_text(r, 'connector_out')));
  if v.id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    v_kind := coalesce(v_new ->> 'kind', 'rental');
    -- An opening quantity makes the item counted in bulk unless it says otherwise
    if coalesce(v_qty, 0) > 0 and coalesce(v_new ->> 'tracking', 'bulk') = 'serial' then
      raise exception 'Serial-numbered items get their stock from the units import, not a quantity' using errcode = '22023';
    end if;
    if coalesce(v_qty, 0) > 0 then v_loc := private.import_location_id(p_org, private.import_text(r, 'location'));
      if v_loc is null then raise exception 'A quantity needs a location' using errcode = '22023'; end if;
    end if;
    insert into public.price_items (org_id, created_by, name, code, category, brand, model, details, kind, unit, tracking, unit_price,
      weight_kg, power_w, dimensions, replacement_value, min_stock, packing_note, cost_price, depreciation_months,
      speaker_type, sensitivity_db, max_spl_db, dispersion_h, dispersion_v, freq_low_hz, freq_high_hz, impedance_ohm, amp_channels,
      speaker_preset, spec_source, rigging, power_typical_w, power_factor, inrush_a, current_a, current_v, connector_in, connector_out, custom_values)
    values (p_org, auth.uid(), v_name, v_code, v_new ->> 'category', v_new ->> 'brand', v_new ->> 'model', v_new ->> 'details', v_kind,
      coalesce(v_new ->> 'unit', case when v_kind = 'rental' then 'day' else 'unit' end),
      coalesce(v_new ->> 'tracking', case when coalesce(v_qty, 0) > 0 then 'bulk' else 'none' end),
      coalesce((v_new ->> 'unit_price')::numeric, 0), (v_new ->> 'weight_kg')::numeric, (v_new ->> 'power_w')::integer,
      v_new ->> 'dimensions', (v_new ->> 'replacement_value')::numeric, (v_new ->> 'min_stock')::integer, v_new ->> 'packing_note',
      (v_new ->> 'cost_price')::numeric, (v_new ->> 'depreciation_months')::integer,
      v_new ->> 'speaker_type', (v_new ->> 'sensitivity_db')::numeric, (v_new ->> 'max_spl_db')::numeric, (v_new ->> 'dispersion_h')::numeric,
      (v_new ->> 'dispersion_v')::numeric, (v_new ->> 'freq_low_hz')::numeric, (v_new ->> 'freq_high_hz')::numeric,
      (v_new ->> 'impedance_ohm')::numeric, (v_new ->> 'amp_channels')::smallint, v_new ->> 'speaker_preset', v_new ->> 'spec_source',
      v_new -> 'rigging', (v_new ->> 'power_typical_w')::integer, (v_new ->> 'power_factor')::numeric, (v_new ->> 'inrush_a')::numeric,
      (v_new ->> 'current_a')::numeric, (v_new ->> 'current_v')::smallint, v_new ->> 'connector_in', v_new ->> 'connector_out',
      coalesce(v_cv, '{}'::jsonb))
    returning * into v;
    perform private.import_log(p_batch, 'price_items', v.id::text, 'created', null, null);
    if coalesce(v_qty, 0) > 0 then
      insert into public.stock_movements (org_id, item_id, kind, quantity, to_location_id, note, unit_cost)
      values (p_org, v.id, 'purchase', v_qty, v_loc, 'Import', v.cost_price) returning id into v_move;
      perform private.import_log(p_batch, 'stock_movements', v_move::text, 'created', null, null);
    end if;
    result := 'created';
    return;
  end if;
  if coalesce(v_qty, 0) > 0 then note := 'Quantity not added: the item already existed (use a stock count)'; end if;
  -- A name or code that only differs in capitals isn't a change
  if lower(v.name) = lower(v_name) then v_new := v_new - 'name'; end if;
  if upper(v.code) = upper(v_code) then v_new := v_new - 'code'; end if;
  if v_cv is not null and v_cv <> '{}'::jsonb then v_new := v_new || jsonb_build_object('custom_values', coalesce(v.custom_values, '{}'::jsonb) || v_cv); end if;
  d := private.import_diff(to_jsonb(v), v_new);
  if d is null then result := 'unchanged'; return; end if;
  update public.price_items i set
    name = coalesce(v_new ->> 'name', i.name), code = coalesce(v_new ->> 'code', i.code), category = coalesce(v_new ->> 'category', i.category),
    brand = coalesce(v_new ->> 'brand', i.brand), model = coalesce(v_new ->> 'model', i.model), details = coalesce(v_new ->> 'details', i.details),
    kind = coalesce(v_new ->> 'kind', i.kind), unit = coalesce(v_new ->> 'unit', i.unit), tracking = coalesce(v_new ->> 'tracking', i.tracking),
    unit_price = coalesce((v_new ->> 'unit_price')::numeric, i.unit_price), weight_kg = coalesce((v_new ->> 'weight_kg')::numeric, i.weight_kg),
    power_w = coalesce((v_new ->> 'power_w')::integer, i.power_w), dimensions = coalesce(v_new ->> 'dimensions', i.dimensions),
    replacement_value = coalesce((v_new ->> 'replacement_value')::numeric, i.replacement_value),
    min_stock = coalesce((v_new ->> 'min_stock')::integer, i.min_stock), packing_note = coalesce(v_new ->> 'packing_note', i.packing_note),
    cost_price = coalesce((v_new ->> 'cost_price')::numeric, i.cost_price),
    depreciation_months = coalesce((v_new ->> 'depreciation_months')::integer, i.depreciation_months),
    speaker_type = coalesce(v_new ->> 'speaker_type', i.speaker_type),
    sensitivity_db = coalesce((v_new ->> 'sensitivity_db')::numeric, i.sensitivity_db),
    max_spl_db = coalesce((v_new ->> 'max_spl_db')::numeric, i.max_spl_db),
    dispersion_h = coalesce((v_new ->> 'dispersion_h')::numeric, i.dispersion_h),
    dispersion_v = coalesce((v_new ->> 'dispersion_v')::numeric, i.dispersion_v),
    freq_low_hz = coalesce((v_new ->> 'freq_low_hz')::numeric, i.freq_low_hz),
    freq_high_hz = coalesce((v_new ->> 'freq_high_hz')::numeric, i.freq_high_hz),
    impedance_ohm = coalesce((v_new ->> 'impedance_ohm')::numeric, i.impedance_ohm),
    amp_channels = coalesce((v_new ->> 'amp_channels')::smallint, i.amp_channels),
    speaker_preset = coalesce(v_new ->> 'speaker_preset', i.speaker_preset),
    spec_source = coalesce(v_new ->> 'spec_source', i.spec_source),
    rigging = coalesce(v_new -> 'rigging', i.rigging),
    power_typical_w = coalesce((v_new ->> 'power_typical_w')::integer, i.power_typical_w),
    power_factor = coalesce((v_new ->> 'power_factor')::numeric, i.power_factor),
    inrush_a = coalesce((v_new ->> 'inrush_a')::numeric, i.inrush_a),
    current_a = coalesce((v_new ->> 'current_a')::numeric, i.current_a),
    current_v = coalesce((v_new ->> 'current_v')::smallint, i.current_v),
    connector_in = coalesce(v_new ->> 'connector_in', i.connector_in),
    connector_out = coalesce(v_new ->> 'connector_out', i.connector_out),
    custom_values = coalesce(v_new -> 'custom_values', i.custom_values)
  where i.id = v.id;
  perform private.import_log(p_batch, 'price_items', v.id::text, 'updated', d -> 'before', d -> 'after');
  result := 'updated';
end $$;
revoke execute on function private.import_item_row(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function private.import_contact_row(p_batch uuid, p_org uuid, p_tbl text, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.import_text(r, 'name'); v_tax text := private.import_text(r, 'tax_id'); v_email text := private.import_text(r, 'email');
  v_id uuid; v_cur jsonb; v_new jsonb; d jsonb; n integer;
  -- The organisation's own fields the file gives (field id → value); empty cells keep what's there
  v_cv jsonb := case when jsonb_typeof(r -> 'custom_values') = 'object' then nullif(jsonb_strip_nulls(r -> 'custom_values'), '{}'::jsonb) end;
begin
  if p_tbl not in ('clients', 'suppliers') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'Not an e-mail address: %', v_email using errcode = '22023'; end if;
  if private.import_tax_key(v_tax) is not null then
    execute format('select id from public.%I where org_id = $1 and private.import_tax_key(tax_id) = $2 order by archived_at nulls first, created_at limit 1', p_tbl)
      into v_id using p_org, private.import_tax_key(v_tax);
  end if;
  if v_id is null and v_name is not null then
    execute format('select count(*) from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null', p_tbl) into n using p_org, v_name;
    if n > 1 and v_email is not null then
      execute format('select count(*) from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null and lower(email) = lower($3)', p_tbl)
        into n using p_org, v_name, v_email;
      if n = 1 then
        execute format('select id from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null and lower(email) = lower($3)', p_tbl)
          into v_id using p_org, v_name, v_email;
      end if;
    elsif n = 1 then
      execute format('select id from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null', p_tbl) into v_id using p_org, v_name;
    end if;
    if v_id is null and n > 1 then raise exception 'Several contacts are called %: add their tax numbers to the file', v_name using errcode = '22023'; end if;
  end if;
  -- Only what the file gives; empty cells keep what's there
  v_new := jsonb_strip_nulls(jsonb_build_object(
    'name', v_name, 'contact_name', private.import_text(r, 'contact_name'), 'email', v_email, 'phone', private.import_text(r, 'phone'),
    'address', private.import_text(r, 'address'), 'tax_id', v_tax, 'notes', private.import_text(r, 'notes')));
  if v_id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    execute format('insert into public.%I (org_id, name, contact_name, email, phone, address, tax_id, notes, custom_values)
      select $1, x.name, x.contact_name, x.email, x.phone, x.address, x.tax_id, x.notes, coalesce($3, ''{}''::jsonb)
      from jsonb_populate_record(null::public.%I, $2) x returning id', p_tbl, p_tbl) into v_id using p_org, v_new, v_cv;
    perform private.import_log(p_batch, p_tbl, v_id::text, 'created', null, null);
    return 'created';
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tbl) into v_cur using v_id;
  -- A name or e-mail address that only differs in capitals, or a tax number written
  -- differently, isn't a change
  if lower(v_cur ->> 'name') = lower(v_name) then v_new := v_new - 'name'; end if;
  if lower(v_cur ->> 'email') = lower(v_email) then v_new := v_new - 'email'; end if;
  if private.import_tax_key(v_cur ->> 'tax_id') = private.import_tax_key(v_tax) then v_new := v_new - 'tax_id'; end if;
  if v_cv is not null then v_new := v_new || jsonb_build_object('custom_values', coalesce(v_cur -> 'custom_values', '{}'::jsonb) || v_cv); end if;
  d := private.import_diff(v_cur - 'updated_at', v_new);
  if d is null then return 'unchanged'; end if;
  execute format('update public.%I t set name = coalesce(x.name, t.name), contact_name = coalesce(x.contact_name, t.contact_name),
      email = coalesce(x.email, t.email), phone = coalesce(x.phone, t.phone), address = coalesce(x.address, t.address),
      tax_id = coalesce(x.tax_id, t.tax_id), notes = coalesce(x.notes, t.notes), custom_values = coalesce(x.custom_values, t.custom_values)
    from jsonb_populate_record(null::public.%I, $2) x where t.id = $1', p_tbl, p_tbl) using v_id, v_new;
  perform private.import_log(p_batch, p_tbl, v_id::text, 'updated', d -> 'before', d -> 'after');
  return 'updated';
end $$;
revoke execute on function private.import_contact_row(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.import_gig_row(p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.gigs; v_ref text := left(private.import_text(r, 'ref'), 80); v_name text := left(private.import_text(r, 'name'), 200);
  v_start date := nullif(r ->> 'start_date', '')::date; v_end date := nullif(r ->> 'end_date', '')::date;
  v_status text := private.import_gig_status(private.import_text(r, 'status'));
  v_desc text; v_new jsonb; d jsonb; v_client uuid;
  -- The organisation's own fields the file gives (field id → value); empty cells keep what's there
  v_cv jsonb := case when jsonb_typeof(r -> 'custom_values') = 'object' then nullif(jsonb_strip_nulls(r -> 'custom_values'), '{}'::jsonb) end;
begin
  if v_status = 'unknown' then raise exception 'Unknown status: %', private.import_text(r, 'status') using errcode = '22023'; end if;
  if v_status = 'cancelled' then result := 'unchanged'; note := 'Cancelled job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if coalesce(v_end, v_start) < current_date then result := 'unchanged'; note := 'Past job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if v_end is not null and v_start is not null and v_end < v_start then raise exception 'The job ends before it starts' using errcode = '22023'; end if;
  -- The client from the directory when the name matches one (as the quotes import does)
  if private.import_text(r, 'client') is not null then
    select c.id into v_client from public.clients c
     where c.org_id = p_org and lower(c.name) = lower(private.import_text(r, 'client')) and c.archived_at is null
     order by c.created_at limit 1;
  end if;
  v_desc := nullif(concat_ws(E'\n',
    case when private.import_text(r, 'client') is not null then 'Client: ' || private.import_text(r, 'client') end,
    private.import_text(r, 'notes')), '');
  v := private.import_gig_find(p_org, v_ref, v_name, v_start);
  if v.id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    if v_start is null then raise exception 'The start date is missing' using errcode = '22023'; end if;
    insert into public.gigs (org_id, name, venue, start_date, end_date, description, status, created_by, import_ref, client_id, custom_values)
    values (p_org, v_name, left(private.import_text(r, 'venue'), 300), v_start, coalesce(v_end, v_start), left(v_desc, 5000),
      coalesce(v_status, 'draft'), auth.uid(), v_ref, v_client, coalesce(v_cv, '{}'::jsonb));
    result := 'created';
    return;
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
