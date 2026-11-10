-- IM3 · The import's database part (docs/SWITCHING.md, "Import overhaul: fix it here", Parts;
-- "How IM3 works"). Add-only: new columns, new helper functions, and the import functions replaced
-- with create or replace (same signatures and grants), built on the bodies of
-- 20270114000000_import_custom_values.sql (custom_values kept), 20261115000000, 20261116000000,
-- 20261117000000 and 20261119000000.
-- 1. Fix rows: run_import and import_jobs read the rows carrying "_fix" first, in order, in the
--    same call and the same batch: add_location, add_item, add_client, restore_location,
--    restore_item, track (start counting an item in stock), per_unit (switch a bulk item to per
--    unit). They are logged in import_changes like any row (created, or archived_at/tracking
--    before → after), so the existing undo_import removes or reverses them. If one fails, the whole
--    call fails ("Fix not saved: …") and nothing is imported. They are counted in
--    import_batches.added. import_jobs keeps its gigs, equipment lines and quotes outside batches,
--    as before; what its fixes add goes in a batch of its own, made in the same call.
-- 2. Exact picks: a row may carry the id a fix chose (_item_id, _kit_id, _location_id, _gig_id,
--    _client_id, _contact_id) and _new (a contacts row that is always a new contact). An id must be
--    of the organisation and not archived (a gig: not archived); it is used before the code and the
--    name.
-- 3. import_presets.fixes: fixes remembered with a saved matching (an array, up to 32 KB).
-- 4. import_in_use(batch): what uses the records an import added, with names, for Earlier imports;
--    import_per_unit_ok(org, items): which bulk items could switch to per unit.
-- Switching to per unit removes a stock movement and undoing the rest removes records: both are
-- in the hand-run file 20270115000001_import_fixes_undo.sql. Until it has run, per_unit fails with
-- "isn't switched on yet". Policies and grants on tables are unchanged.
-- Checks: supabase/tests/import_fixes.sql.

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table public.import_batches add column if not exists added integer not null default 0;
alter table public.import_batches add column if not exists kept jsonb;
alter table public.import_presets add column if not exists fixes jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'import_batches_kept_check') then
    alter table public.import_batches add constraint import_batches_kept_check
      check (kept is null or (jsonb_typeof(kept) = 'array' and pg_column_size(kept) <= 16384));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_presets_fixes_check') then
    alter table public.import_presets add constraint import_presets_fixes_check
      check (jsonb_typeof(fixes) = 'array' and pg_column_size(fixes) <= 32768);
  end if;
end $$;

-- ── Picks ────────────────────────────────────────────────────────────────────
-- The id a fix chose, from a row (null when there is none); one that isn't an id is the row's problem
create or replace function private.import_pick(r jsonb, k text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare v text := nullif(trim(r ->> k), '');
begin
  if v is null then return null; end if;
  if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'The chosen record isn''t one AVX knows' using errcode = '22023';
  end if;
  return v::uuid;
end $$;
revoke execute on function private.import_pick(jsonb, text) from public, anon, authenticated;

-- An item by the id a fix chose, else by code, then by name
create or replace function private.import_item_find(p_org uuid, p_id uuid, p_code text, p_name text) returns public.price_items
language plpgsql stable security definer set search_path = '' as $$
declare v public.price_items;
begin
  if p_id is null then return private.import_item_find(p_org, p_code, p_name); end if;
  select * into v from public.price_items i where i.id = p_id and i.org_id = p_org and i.archived_at is null;
  if not found then raise exception 'The chosen item isn''t in this organisation or is archived' using errcode = '22023'; end if;
  return v;
end $$;
revoke execute on function private.import_item_find(uuid, uuid, text, text) from public, anon, authenticated;

-- A location by the id a fix chose, else by name (not archived)
create or replace function private.import_location_id(p_org uuid, p_id uuid, p_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if p_id is null then return private.import_location_id(p_org, p_name); end if;
  select l.id into v from public.stock_locations l where l.id = p_id and l.org_id = p_org and l.archived_at is null;
  if v is null then raise exception 'The chosen location isn''t in this organisation or is archived' using errcode = '22023'; end if;
  return v;
end $$;
revoke execute on function private.import_location_id(uuid, uuid, text) from public, anon, authenticated;

-- A gig by the id a fix chose, else by its old number, then by name (and start date)
create or replace function private.import_gig_find(p_org uuid, p_id uuid, p_ref text, p_name text, p_start date) returns public.gigs
language plpgsql stable security definer set search_path = '' as $$
declare v public.gigs;
begin
  if p_id is null then return private.import_gig_find(p_org, p_ref, p_name, p_start); end if;
  select * into v from public.gigs g where g.id = p_id and g.org_id = p_org and g.status <> 'archived';
  if not found then raise exception 'The chosen gig isn''t in this organisation or is archived' using errcode = '22023'; end if;
  return v;
end $$;
revoke execute on function private.import_gig_find(uuid, uuid, text, text, date) from public, anon, authenticated;

-- A client by the id a fix chose (null when there is none)
create or replace function private.import_client_pick(p_org uuid, p_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if p_id is null then return null; end if;
  select c.id into v from public.clients c where c.id = p_id and c.org_id = p_org and c.archived_at is null;
  if v is null then raise exception 'The chosen client isn''t in this organisation or is archived' using errcode = '22023'; end if;
  return v;
end $$;
revoke execute on function private.import_client_pick(uuid, uuid) from public, anon, authenticated;

-- ── Fixes ────────────────────────────────────────────────────────────────────
-- Switching a bulk item to per unit removes its opening stock: the hand-run file replaces this
create or replace function private.import_switch_per_unit(p_batch uuid, p_org uuid, p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Switching to per unit isn''t switched on yet' using errcode = '0A000';
end $$;
revoke execute on function private.import_switch_per_unit(uuid, uuid, uuid) from public, anon, authenticated;

-- One fix row, in the import's batch. Any failure stops the whole import ("Fix not saved: …").
create or replace function private.import_apply_fix(p_batch uuid, p_org uuid, r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_fix text := r ->> '_fix'; v_row jsonb := r - '_fix'; v_id uuid; v_res text; v_note text; v_ts timestamptz; v_track text;
begin
  begin
    if v_fix = 'add_location' then
      v_res := private.import_location_row(p_batch, p_org, v_row);
    elsif v_fix = 'add_item' then
      select result, note into v_res, v_note from private.import_item_row(p_batch, p_org, v_row - 'quantity');
    elsif v_fix = 'add_client' then
      v_res := private.import_contact_row(p_batch, p_org, 'clients', v_row);
    elsif v_fix = 'restore_location' then
      v_id := private.import_pick(r, 'id');
      select l.archived_at into v_ts from public.stock_locations l where l.id = v_id and l.org_id = p_org for update;
      if not found then raise exception 'Unknown location' using errcode = '22023'; end if;
      if v_ts is not null then
        update public.stock_locations set archived_at = null where id = v_id;
        perform private.import_log(p_batch, 'stock_locations', v_id::text, 'updated', jsonb_build_object('archived_at', v_ts), '{"archived_at": null}');
      end if;
    elsif v_fix = 'restore_item' then
      v_id := private.import_pick(r, 'id');
      select i.archived_at into v_ts from public.price_items i where i.id = v_id and i.org_id = p_org for update;
      if not found then raise exception 'Unknown item' using errcode = '22023'; end if;
      if v_ts is not null then
        update public.price_items set archived_at = null where id = v_id;
        perform private.import_log(p_batch, 'price_items', v_id::text, 'updated', jsonb_build_object('archived_at', v_ts), '{"archived_at": null}');
      end if;
    elsif v_fix = 'track' then
      v_id := private.import_pick(r, 'id');
      select i.tracking into v_track from public.price_items i where i.id = v_id and i.org_id = p_org and i.archived_at is null for update;
      if not found then raise exception 'Unknown item' using errcode = '22023'; end if;
      if v_track = 'none' then
        update public.price_items set tracking = 'bulk' where id = v_id;
        perform private.import_log(p_batch, 'price_items', v_id::text, 'updated', '{"tracking": "none"}', '{"tracking": "bulk"}');
      end if;
    elsif v_fix = 'per_unit' then
      v_id := private.import_pick(r, 'id');
      if not exists (select 1 from public.price_items i where i.id = v_id and i.org_id = p_org and i.archived_at is null) then
        raise exception 'Unknown item' using errcode = '22023';
      end if;
      perform private.import_switch_per_unit(p_batch, p_org, v_id);
    else
      raise exception 'Unknown fix: %', coalesce(v_fix, '—') using errcode = '22023';
    end if;
  exception when others then
    raise exception 'Fix not saved: %', left(sqlerrm, 250) using errcode = '22023';
  end;
end $$;
revoke execute on function private.import_apply_fix(uuid, uuid, jsonb) from public, anon, authenticated;

-- ── Rows, with picks ─────────────────────────────────────────────────────────
-- As 20270114000000, plus the exact picks (_item_id, _location_id)
create or replace function private.import_item_row(p_batch uuid, p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.price_items; v_name text := private.import_text(r, 'name'); v_code text := private.import_text(r, 'code');
  v_qty integer := nullif(r ->> 'quantity', '')::integer; v_loc uuid; v_new jsonb; d jsonb; v_move bigint; v_kind text;
  -- The organisation's own fields the file gives (field id → value); empty cells keep what's there
  v_cv jsonb := case when jsonb_typeof(r -> 'custom_values') = 'object' then jsonb_strip_nulls(r -> 'custom_values') end;
begin
  v := private.import_item_find(p_org, private.import_pick(r, '_item_id'), v_code, v_name);
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
    if coalesce(v_qty, 0) > 0 then v_loc := private.import_location_id(p_org, private.import_pick(r, '_location_id'), private.import_text(r, 'location'));
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

-- As 20261115000000, plus the exact picks (_item_id, _location_id)
create or replace function private.import_unit_row(p_batch uuid, p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.price_items; v public.stock_units; v_code text := private.import_text(r, 'code'); v_serial text := private.import_text(r, 'serial');
  v_loc uuid := private.import_location_id(p_org, private.import_pick(r, '_location_id'), private.import_text(r, 'location')); v_new jsonb; d jsonb; m record;
begin
  v_item := private.import_item_find(p_org, private.import_pick(r, '_item_id'), private.import_text(r, 'item_code'), private.import_text(r, 'item'));
  if v_item.id is null then raise exception 'Unknown item: %', coalesce(private.import_text(r, 'item_code'), private.import_text(r, 'item'), '—') using errcode = '22023'; end if;
  if v_item.tracking = 'bulk' then raise exception 'Item % is counted in bulk, not per unit', v_item.name using errcode = '22023'; end if;
  if v_item.tracking = 'none' then
    update public.price_items set tracking = 'serial' where id = v_item.id;
    perform private.import_log(p_batch, 'price_items', v_item.id::text, 'updated', '{"tracking": "none"}', '{"tracking": "serial"}');
  end if;
  if v_code is not null then select * into v from public.stock_units u where u.org_id = p_org and upper(u.code) = upper(v_code); end if;
  if v.id is null and v_serial is not null then select * into v from public.stock_units u where u.item_id = v_item.id and upper(u.serial) = upper(v_serial); end if;
  if v.id is not null and v.item_id <> v_item.id then raise exception 'Code % belongs to a unit of another item', v_code using errcode = '22023'; end if;
  v_new := jsonb_strip_nulls(jsonb_build_object('serial', v_serial, 'location_id', v_loc, 'status', private.import_text(r, 'status'),
    'purchase_date', nullif(r ->> 'purchase_date', '')::date, 'purchase_cost', nullif(r ->> 'purchase_cost', '')::numeric, 'notes', private.import_text(r, 'notes')));
  if v.id is null then
    insert into public.stock_units (org_id, item_id, code, serial, location_id, status, purchase_date, purchase_cost, notes)
    values (p_org, v_item.id, v_code, v_serial, v_loc, coalesce(v_new ->> 'status', 'available'), (v_new ->> 'purchase_date')::date,
      (v_new ->> 'purchase_cost')::numeric, v_new ->> 'notes')
    returning * into v;
    perform private.import_log(p_batch, 'stock_units', v.id::text, 'created', null, null);
    -- The unit's own history, written by the database as it was added
    for m in select id from public.stock_movements where unit_id = v.id loop
      perform private.import_log(p_batch, 'stock_movements', m.id::text, 'created', null, null);
    end loop;
    return 'created';
  end if;
  if lower(v.serial) = lower(v_serial) then v_new := v_new - 'serial'; end if;
  d := private.import_diff(to_jsonb(v), v_new);
  if d is null then return 'unchanged'; end if;
  update public.stock_units u set serial = coalesce(v_new ->> 'serial', u.serial), location_id = coalesce((v_new ->> 'location_id')::uuid, u.location_id),
    status = coalesce(v_new ->> 'status', u.status), purchase_date = coalesce((v_new ->> 'purchase_date')::date, u.purchase_date),
    purchase_cost = coalesce((v_new ->> 'purchase_cost')::numeric, u.purchase_cost), notes = coalesce(v_new ->> 'notes', u.notes)
  where u.id = v.id;
  perform private.import_log(p_batch, 'stock_units', v.id::text, 'updated', d -> 'before', d -> 'after');
  return 'updated';
end $$;
revoke execute on function private.import_unit_row(uuid, uuid, jsonb) from public, anon, authenticated;

-- As 20261116000000, plus the exact picks (_kit_id, _item_id)
create or replace function private.import_kit_row(p_batch uuid, p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_kit public.price_items; v_item public.price_items; v_part public.item_parts;
  v_qty integer := coalesce(nullif(r ->> 'quantity', '')::integer, 1);
  v_kind text := private.import_text(r, 'part_kind'); v_type text := private.import_text(r, 'kit_type');
begin
  v_kit := private.import_item_find(p_org, private.import_pick(r, '_kit_id'), private.import_text(r, 'kit_code'), private.import_text(r, 'kit'));
  if v_kit.id is null then raise exception 'Unknown kit: %', coalesce(private.import_text(r, 'kit_code'), private.import_text(r, 'kit'), '—') using errcode = '22023'; end if;
  v_item := private.import_item_find(p_org, private.import_pick(r, '_item_id'), private.import_text(r, 'item_code'), private.import_text(r, 'item'));
  if v_item.id is null then raise exception 'Unknown item: %', coalesce(private.import_text(r, 'item_code'), private.import_text(r, 'item'), '—') using errcode = '22023'; end if;
  if v_qty < 1 or v_qty > 1000 then raise exception 'The quantity must be 1 to 1000' using errcode = '22023'; end if;
  -- Contents unless the kit is a stock-tracked item that isn't a set or case (then accessories)
  v_kind := coalesce(v_kind, case when v_kit.kit_type is null and v_kit.tracking <> 'none' and v_type is null then 'accessory' else 'content' end);
  if v_kind = 'content' and v_kit.kit_type is null then
    v_type := coalesce(v_type, case when v_kit.tracking = 'none' then 'set' else 'case' end);
    update public.price_items set kit_type = v_type where id = v_kit.id;
    perform private.import_log(p_batch, 'price_items', v_kit.id::text, 'updated', '{"kit_type": null}', jsonb_build_object('kit_type', v_type));
  end if;
  select * into v_part from public.item_parts p where p.parent_id = v_kit.id and p.child_id = v_item.id and p.kind = v_kind;
  if v_part.id is null then
    insert into public.item_parts (org_id, parent_id, child_id, kind, quantity) values (p_org, v_kit.id, v_item.id, v_kind, v_qty) returning * into v_part;
    insert into public.import_part_changes (batch_id, part_id, action) values (p_batch, v_part.id, 'created');
    return 'created';
  end if;
  if v_part.quantity = v_qty then return 'unchanged'; end if;
  update public.item_parts set quantity = v_qty where id = v_part.id;
  insert into public.import_part_changes (batch_id, part_id, action, before, after)
  values (p_batch, v_part.id, 'updated', jsonb_build_object('quantity', v_part.quantity), jsonb_build_object('quantity', v_qty));
  return 'updated';
end $$;
revoke execute on function private.import_kit_row(uuid, uuid, jsonb) from public, anon, authenticated;

-- As 20270114000000, plus the exact pick (_contact_id: the contact this row updates) and _new
-- (always a new contact, even when one has its name)
create or replace function private.import_contact_row(p_batch uuid, p_org uuid, p_tbl text, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.import_text(r, 'name'); v_tax text := private.import_text(r, 'tax_id'); v_email text := private.import_text(r, 'email');
  v_id uuid; v_cur jsonb; v_new jsonb; d jsonb; n integer;
  v_pick uuid := private.import_pick(r, '_contact_id');
  v_fresh boolean := coalesce(lower(private.import_text(r, '_new')) in ('yes', 'true', '1'), false);
  -- The organisation's own fields the file gives (field id → value); empty cells keep what's there
  v_cv jsonb := case when jsonb_typeof(r -> 'custom_values') = 'object' then nullif(jsonb_strip_nulls(r -> 'custom_values'), '{}'::jsonb) end;
begin
  if p_tbl not in ('clients', 'suppliers') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'Not an e-mail address: %', v_email using errcode = '22023'; end if;
  if v_pick is not null and not v_fresh then
    execute format('select id from public.%I where id = $1 and org_id = $2 and archived_at is null', p_tbl) into v_id using v_pick, p_org;
    if v_id is null then raise exception 'The chosen contact isn''t in this organisation or is archived' using errcode = '22023'; end if;
  end if;
  if v_id is null and not v_fresh and private.import_tax_key(v_tax) is not null then
    execute format('select id from public.%I where org_id = $1 and private.import_tax_key(tax_id) = $2 order by archived_at nulls first, created_at limit 1', p_tbl)
      into v_id using p_org, private.import_tax_key(v_tax);
  end if;
  if v_id is null and not v_fresh and v_name is not null then
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

-- As 20270114000000, plus the exact picks (_gig_id: the gig this row updates; _client_id)
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

-- As 20261119000000, plus the exact picks (_gig_id, _item_id)
create or replace function private.import_gig_equipment_row(p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_gig public.gigs; v_item public.price_items; v_line public.gig_equipment;
  v_qty integer := coalesce(nullif(r ->> 'quantity', '')::integer, 1);
begin
  v_gig := private.import_gig_find(p_org, private.import_pick(r, '_gig_id'), private.import_text(r, 'gig_ref'), private.import_text(r, 'gig'), null);
  if v_gig.id is null then raise exception 'Unknown job: %', coalesce(private.import_text(r, 'gig_ref'), private.import_text(r, 'gig'), '—') using errcode = '22023'; end if;
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

-- As 20261119000000, plus the exact picks (_client_id on the first line, _item_id on each line)
create or replace function private.import_quote(p_org uuid, p_rows jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  f jsonb := p_rows -> 0; r jsonb; v_ref text := left(private.import_text(p_rows -> 0, 'quote_ref'), 80);
  v_title text := left(coalesce(private.import_text(p_rows -> 0, 'title'), private.import_text(p_rows -> 0, 'quote_ref')), 200);
  v_quote public.quotes; v_org public.organisations; v_client public.clients; v_item public.price_items;
  v_sections jsonb := '[]'::jsonb; v_section text; v_idx integer; v_line jsonb; v_net numeric := 0;
  v_qty numeric; v_factor numeric; v_price numeric; v_disc numeric; v_issue date; v_body jsonb; v_pick uuid;
begin
  if v_title is null then raise exception 'The quote has no title or number' using errcode = '22023'; end if;
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

-- ── Imports ──────────────────────────────────────────────────────────────────
-- As 20261117000000, plus the fix rows first (counted in `added`). Up to 5000 rows and 500 fixes.
create or replace function public.run_import(p_org uuid, p_kind text, p_rows jsonb, p_file text default null, p_preset text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid; r jsonb; v_n integer := 0; v_line integer; v_res text; v_note text; v_rows jsonb; v_fixes jsonb;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; c_added integer := 0; v_problems jsonb := '[]'::jsonb;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('locations', 'items', 'units', 'kits', 'clients', 'suppliers') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if p_kind in ('clients', 'suppliers') and not exists (
    select 1 from pg_constraint where conname = 'import_batches_kind_check' and pg_get_constraintdef(oid) like '%clients%') then
    raise exception 'Importing contacts isn''t switched on yet' using errcode = '0A000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(e.value order by e.n) filter (where not (e.value ? '_fix')), '[]'::jsonb),
         coalesce(jsonb_agg(e.value order by e.n) filter (where e.value ? '_fix'), '[]'::jsonb)
    into v_rows, v_fixes
  from jsonb_array_elements(p_rows) with ordinality e(value, n);
  if jsonb_array_length(v_rows) > 5000 then raise exception 'Up to 5000 rows per import' using errcode = '54000'; end if;
  if jsonb_array_length(v_fixes) > 500 then raise exception 'Up to 500 fixes per import' using errcode = '54000'; end if;
  insert into public.import_batches (org_id, kind, subject, file_name, preset)
  values (p_org, case when p_kind = 'kits' then 'items' else p_kind end, case when p_kind = 'kits' then 'kits' end, left(p_file, 200), left(p_preset, 80))
  returning id into v_batch;
  -- What the fixes add, restore or switch, first: if one fails, nothing is imported
  for r in select value from jsonb_array_elements(v_fixes) loop
    perform private.import_apply_fix(v_batch, p_org, r);
    c_added := c_added + 1;
  end loop;
  for r in select value from jsonb_array_elements(v_rows) loop
    v_n := v_n + 1;
    v_line := coalesce(nullif(r ->> '_row', '')::integer, v_n);
    v_note := null;
    begin
      if p_kind = 'locations' then v_res := private.import_location_row(v_batch, p_org, r);
      elsif p_kind = 'items' then select result, note into v_res, v_note from private.import_item_row(v_batch, p_org, r);
      elsif p_kind = 'kits' then v_res := private.import_kit_row(v_batch, p_org, r);
      elsif p_kind in ('clients', 'suppliers') then v_res := private.import_contact_row(v_batch, p_org, p_kind, r);
      else v_res := private.import_unit_row(v_batch, p_org, r);
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
  update public.import_batches set created = c_created, updated = c_updated, unchanged = c_same, skipped = c_skipped, added = c_added, problems = v_problems
   where id = v_batch;
  return jsonb_build_object('batch', v_batch, 'created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped,
    'added', c_added, 'problems', v_problems);
end $$;
revoke execute on function public.run_import(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.run_import(uuid, text, jsonb, text, text) to authenticated;

-- As 20261119000000, plus the fix rows first: what they add goes in a batch of its own (equipment
-- for equipment on jobs, clients for jobs and quotes), made in the same call, so one undo in
-- Earlier imports takes it back. The jobs, lines and quotes themselves stay outside batches.
create or replace function public.import_jobs(p_org uuid, p_kind text, p_rows jsonb, p_file text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; g record; v_n integer := 0; v_line integer; v_res text; v_note text; v_rows jsonb; v_fixes jsonb; v_batch uuid;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; c_added integer := 0; v_problems jsonb := '[]'::jsonb;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('gigs', 'gig_equipment', 'quotes') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(e.value order by e.n) filter (where not (e.value ? '_fix')), '[]'::jsonb),
         coalesce(jsonb_agg(e.value order by e.n) filter (where e.value ? '_fix'), '[]'::jsonb)
    into v_rows, v_fixes
  from jsonb_array_elements(p_rows) with ordinality e(value, n);
  if jsonb_array_length(v_rows) > 5000 then raise exception 'Up to 5000 rows per import' using errcode = '54000'; end if;
  if jsonb_array_length(v_fixes) > 500 then raise exception 'Up to 500 fixes per import' using errcode = '54000'; end if;

  if jsonb_array_length(v_fixes) > 0 then
    insert into public.import_batches (org_id, kind, file_name)
    values (p_org, case when p_kind = 'gig_equipment' then 'items' else 'clients' end, left(p_file, 200))
    returning id into v_batch;
    for r in select value from jsonb_array_elements(v_fixes) loop
      perform private.import_apply_fix(v_batch, p_org, r);
      c_added := c_added + 1;
    end loop;
    update public.import_batches set added = c_added where id = v_batch;
  end if;

  if p_kind = 'quotes' then
    -- One quote per number (or title), its lines in file order; the first line's row number names it
    for g in
      select min(n) as first_n, jsonb_agg(value order by n) as rows
        from jsonb_array_elements(v_rows) with ordinality e(value, n)
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
    return jsonb_build_object('created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems,
      'added', c_added, 'batch', v_batch);
  end if;

  for r in select value from jsonb_array_elements(v_rows) loop
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
  return jsonb_build_object('created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems,
    'added', c_added, 'batch', v_batch);
end $$;
revoke execute on function public.import_jobs(uuid, text, jsonb, text) from public, anon;
grant execute on function public.import_jobs(uuid, text, jsonb, text) to authenticated;

-- ── What's in use ────────────────────────────────────────────────────────────
-- The records an import created that something else uses now: one line per record and use, with
-- the record's name and what uses it (used_by: movement, kit, alternative, gig, unit, case, quote,
-- invoice, subrental). Undoing the rest (hand-run file) keeps these.
create or replace function private.import_used(p_batch uuid)
returns table (tbl text, row_id text, name text, used_by text, used_name text, rank integer)
language sql stable security definer set search_path = '' as $$
  with c as (select x.tbl, x.row_id from public.import_changes x where x.batch_id = p_batch and x.action = 'created'),
  mv as (select row_id::bigint as id from c where tbl = 'stock_movements'),
  pt as (select p.part_id as id from public.import_part_changes p where p.batch_id = p_batch and p.action = 'created'),
  it as (select row_id::uuid as id from c where tbl = 'price_items'),
  un as (select row_id::uuid as id from c where tbl = 'stock_units'),
  lo as (select row_id::uuid as id from c where tbl = 'stock_locations'),
  cl as (select row_id::uuid as id from c where tbl = 'clients'),
  su as (select row_id::uuid as id from c where tbl = 'suppliers')
  -- Items: on a gig, in a kit, an alternative, units added since, stock moved since
  select 'price_items', i.id::text, i.name, 'gig', g.name, 1 from public.price_items i
    join public.gig_equipment e on e.item_id = i.id join public.gigs g on g.id = e.gig_id where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'gig', g.name, 1 from public.price_items i
    join public.gig_inputs x on x.item_id = i.id join public.gigs g on g.id = x.gig_id where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'gig', g.name, 1 from public.price_items i
    join public.gig_plot_items x on x.item_id = i.id join public.gigs g on g.id = x.gig_id where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'gig', g.name, 1 from public.price_items i
    join public.gig_fixtures x on x.item_id = i.id join public.gigs g on g.id = x.gig_id where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'kit', o.name, 2 from public.price_items i
    join public.item_parts p on (p.parent_id = i.id or p.child_id = i.id) and p.id not in (select id from pt)
    join public.price_items o on o.id = case when p.parent_id = i.id then p.child_id else p.parent_id end
   where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'alternative', o.name, 3 from public.price_items i
    join public.item_alternatives a on a.item_a = i.id or a.item_b = i.id
    join public.price_items o on o.id = case when a.item_a = i.id then a.item_b else a.item_a end
   where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'unit', coalesce(u.code, u.serial), 4 from public.price_items i
    join public.stock_units u on u.item_id = i.id and u.id not in (select id from un) where i.id in (select id from it)
  union all
  select 'price_items', i.id::text, i.name, 'movement', null, 5 from public.price_items i
   where i.id in (select id from it)
     and exists (select 1 from public.stock_movements m where m.item_id = i.id and m.id not in (select id from mv)
                   and (m.unit_id is null or m.unit_id not in (select id from un)))
  union all
  -- Units: holding other units (a case), moved since
  select 'stock_units', u.id::text, coalesce(u.code, u.serial), 'case', coalesce(x.code, x.serial), 2 from public.stock_units u
    join public.stock_units x on x.case_unit_id = u.id where u.id in (select id from un)
  union all
  select 'stock_units', u.id::text, coalesce(u.code, u.serial), 'movement', null, 5 from public.stock_units u
   where u.id in (select id from un)
     and exists (select 1 from public.stock_movements m where m.unit_id = u.id and m.id not in (select id from mv))
  union all
  -- Locations: units kept there or stock moved there since
  select 'stock_locations', l.id::text, l.name, 'unit', coalesce(u.code, u.serial), 4 from public.stock_locations l
    join public.stock_units u on u.location_id = l.id and u.id not in (select id from un) where l.id in (select id from lo)
  union all
  select 'stock_locations', l.id::text, l.name, 'movement', null, 5 from public.stock_locations l
   where l.id in (select id from lo)
     and exists (select 1 from public.stock_movements m where (m.to_location_id = l.id or m.from_location_id = l.id) and m.id not in (select id from mv))
  union all
  -- Clients: on a quote, a gig or an invoice; suppliers: on a subrental
  select 'clients', k.id::text, k.name, 'quote', q.title, 1 from public.clients k
    join public.quotes q on q.client_id = k.id where k.id in (select id from cl)
  union all
  select 'clients', k.id::text, k.name, 'gig', g.name, 1 from public.clients k
    join public.gigs g on g.client_id = k.id where k.id in (select id from cl)
  union all
  select 'clients', k.id::text, k.name, 'invoice', i.number::text, 1 from public.clients k
    join public.invoices i on i.client_id = k.id where k.id in (select id from cl)
  union all
  select 'suppliers', s.id::text, s.name, 'subrental', coalesce(x.reference, ''), 1 from public.suppliers s
    join public.subrentals x on x.supplier_id = s.id where s.id in (select id from su)
$$;
revoke execute on function private.import_used(uuid) from public, anon, authenticated;

-- For Earlier imports: how many records the import added are in use, and the first few (one use
-- each, with names)
create or replace function public.import_in_use(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.import_batches; v jsonb;
begin
  perform private.require_mfa();
  select * into b from public.import_batches where id = p_batch;
  if not found or not private.can_quote(b.org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  with one as (
    select distinct on (u.tbl, u.row_id) u.tbl, u.row_id, u.name, u.used_by, u.used_name
      from private.import_used(p_batch) u order by u.tbl, u.row_id, u.rank, u.used_name
  )
  select jsonb_build_object('count', count(*),
    'items', coalesce((select jsonb_agg(jsonb_build_object('tbl', x.tbl, 'id', x.row_id, 'name', x.name, 'used_by', x.used_by, 'used_name', x.used_name)
                        order by x.name) from (select * from one order by name limit 5) x), '[]'::jsonb))
    into v from one;
  return v;
end $$;
revoke execute on function public.import_in_use(uuid) from public, anon;
grant execute on function public.import_in_use(uuid) to authenticated;

-- Which of these bulk items could switch to per unit: their only stock is opening quantities an
-- import added (not undone), with no units, nothing moved since and not on a gig. Until the
-- hand-run file has run it says switching isn't switched on yet (0A000)
create or replace function private.import_per_unit_check(p_org uuid, p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.price_items i where i.id = p_item and i.org_id = p_org and i.tracking = 'bulk' and i.archived_at is null)
     and exists (select 1 from public.stock_movements m where m.item_id = p_item)
     and not exists (select 1 from public.stock_units u where u.item_id = p_item)
     and not exists (select 1 from public.gig_equipment e where e.item_id = p_item)
     and not exists (
       select 1 from public.stock_movements m
        where m.item_id = p_item
          and (m.kind <> 'purchase' or not exists (
            select 1 from public.import_changes x join public.import_batches b on b.id = x.batch_id
             where x.tbl = 'stock_movements' and x.action = 'created' and x.row_id = m.id::text
               and b.org_id = p_org and b.undone_at is null)))
$$;
revoke execute on function private.import_per_unit_check(uuid, uuid) from public, anon, authenticated;

create or replace function public.import_per_unit_ok(p_org uuid, p_items uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  -- Switching needs the hand-run file (it allows the 'removed' log entries)
  if not exists (select 1 from pg_constraint where conname = 'import_changes_action_check' and pg_get_constraintdef(oid) like '%removed%') then
    raise exception 'Switching to per unit isn''t switched on yet' using errcode = '0A000';
  end if;
  if coalesce(cardinality(p_items), 0) > 5000 then raise exception 'Too many items' using errcode = '54000'; end if;
  return coalesce((select array_agg(x) from unnest(p_items) x where private.import_per_unit_check(p_org, x)), '{}');
end $$;
revoke execute on function public.import_per_unit_ok(uuid, uuid[]) from public, anon;
grant execute on function public.import_per_unit_ok(uuid, uuid[]) to authenticated;
