-- S09 · P1 power distribution (docs/TOOLS_PLAN.md §4; docs/FIELD_TOOLS.md, "How the power tool works").
-- 1. Catalogue items get electrical fields. power_w stays "watts, max"; new: watts typical, power
--    factor, inrush current, the amps a datasheet prints and the voltage they're given at (D77: some
--    datasheets give amps, not watts; nothing is turned into a made-up watt figure), the connector
--    in and out, and for distros their inputs and outputs (connector, phase, breaker, RCD).
-- 2. gig_show.power: the gig's power plan (supply, distros, loads typed by hand, where each load is
--    plugged in, and a copy of the catalogue figures it uses, so crew who can't read the catalogue
--    see the same numbers). Worked out in the app. Same rights as the rest of the show model.
-- 3. The import (run_import, items) takes the new columns; as in 20270103000000 otherwise.
-- No new access rules: the columns follow price_items' and gig_show's policies.
-- Only adds; written without destructive statements. Checks: supabase/tests/power.sql.
-- Letting organisations and gigs use the 'power' tool replaces two checks, so it is in a separate
-- file run by hand (see docs/notes/S09.md).

alter table public.price_items add column if not exists power_typical_w integer;
alter table public.price_items add column if not exists power_factor numeric(3,2);
alter table public.price_items add column if not exists inrush_a numeric(7,1);
alter table public.price_items add column if not exists current_a numeric(7,2);
alter table public.price_items add column if not exists current_v smallint;
alter table public.price_items add column if not exists connector_in text;
alter table public.price_items add column if not exists connector_out text;
alter table public.price_items add column if not exists distro jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_items_power_check') then
    alter table public.price_items add constraint price_items_power_check check (
      (power_typical_w is null or power_typical_w between 0 and 1000000)
      and (power_factor is null or power_factor between 0.30 and 1.00)
      and (inrush_a is null or inrush_a between 0 and 10000)
      and (current_a is null or (current_a > 0 and current_a <= 10000))
      and (current_v is null or current_v between 100 and 480)
      and (current_a is null or current_v is not null)
      and (connector_in is null or connector_in in ('schuko', 'cee16_1', 'cee16_3', 'cee32_1', 'cee32_3', 'cee63_1', 'cee63_3',
        'cee125_3', 'powerlock', 'socapex', 'powercon', 'powercon_true1'))
      and (connector_out is null or connector_out in ('schuko', 'cee16_1', 'cee16_3', 'cee32_1', 'cee32_3', 'cee63_1', 'cee63_3',
        'cee125_3', 'powerlock', 'socapex', 'powercon', 'powercon_true1'))
      and (distro is null or (jsonb_typeof(distro) = 'object' and jsonb_typeof(distro -> 'outputs') = 'array'
        and jsonb_array_length(distro -> 'outputs') between 1 and 48 and octet_length(distro::text) <= 8000)));
  end if;
end $$;

alter table public.gig_show add column if not exists power jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gig_show_power_check') then
    alter table public.gig_show add constraint gig_show_power_check
      check (jsonb_typeof(power) = 'object' and pg_column_size(power) <= 65536);
  end if;
end $$;

create or replace function private.import_item_row(p_batch uuid, p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.price_items; v_name text := private.import_text(r, 'name'); v_code text := private.import_text(r, 'code');
  v_qty integer := nullif(r ->> 'quantity', '')::integer; v_loc uuid; v_new jsonb; d jsonb; v_move bigint; v_kind text;
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
      speaker_preset, spec_source, rigging, power_typical_w, power_factor, inrush_a, current_a, current_v, connector_in, connector_out)
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
      (v_new ->> 'current_a')::numeric, (v_new ->> 'current_v')::smallint, v_new ->> 'connector_in', v_new ->> 'connector_out')
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
    connector_out = coalesce(v_new ->> 'connector_out', i.connector_out)
  where i.id = v.id;
  perform private.import_log(p_batch, 'price_items', v.id::text, 'updated', d -> 'before', d -> 'after');
  result := 'updated';
end $$;
revoke execute on function private.import_item_row(uuid, uuid, jsonb) from public, anon, authenticated;
