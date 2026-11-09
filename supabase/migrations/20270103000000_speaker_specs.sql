-- A1 · Speaker library (docs/TOOLS_PLAN.md §6; docs/INVENTORY.md, "How the speaker library works").
-- 1. Catalogue items get speaker specs: the kind of speaker, sensitivity (1 W / 1 m), maximum SPL,
--    nominal dispersion (horizontal × vertical), frequency range, impedance and amplifier channels
--    per cabinet. Weight and power draw stay in the existing weight_kg and power_w.
-- 2. rigging: the manufacturer's rigging data for RG3 (centre of gravity, pickup points,
--    bumper/frame limits) as printed, with its source. Safety-relevant: the app shows it as "needs
--    a second person's check before use" (the rule in docs/TRUSS_DATA.md); RG3 adds the check.
-- 3. speaker_preset and spec_source: the preset that filled the specs (src/data/speakers.js) and
--    the datasheet they come from.
-- 4. The import (run_import, items) takes the new fields; as in 20261210000002 otherwise.
-- No new access rules: the columns follow price_items' policies (admins and members).
-- Written without destructive statements. Checks: supabase/tests/speaker_specs.sql.

alter table public.price_items add column if not exists speaker_type text;
alter table public.price_items add column if not exists sensitivity_db numeric(4,1);
alter table public.price_items add column if not exists max_spl_db numeric(4,1);
alter table public.price_items add column if not exists dispersion_h numeric(4,1);
alter table public.price_items add column if not exists dispersion_v numeric(4,1);
alter table public.price_items add column if not exists freq_low_hz numeric(7,1);
alter table public.price_items add column if not exists freq_high_hz numeric(7,1);
alter table public.price_items add column if not exists impedance_ohm numeric(5,2);
alter table public.price_items add column if not exists amp_channels smallint;
alter table public.price_items add column if not exists speaker_preset text;
alter table public.price_items add column if not exists spec_source text;
alter table public.price_items add column if not exists rigging jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_items_speaker_check') then
    alter table public.price_items add constraint price_items_speaker_check check (
      (speaker_type is null or speaker_type in ('point_source', 'line_array', 'subwoofer', 'monitor', 'column'))
      and (sensitivity_db is null or sensitivity_db between 60 and 130)
      and (max_spl_db is null or max_spl_db between 60 and 160)
      and (dispersion_h is null or (dispersion_h > 0 and dispersion_h <= 360))
      and (dispersion_v is null or (dispersion_v > 0 and dispersion_v <= 360))
      and (freq_low_hz is null or freq_low_hz between 1 and 20000)
      and (freq_high_hz is null or freq_high_hz between 20 and 100000)
      and (freq_low_hz is null or freq_high_hz is null or freq_low_hz < freq_high_hz)
      and (impedance_ohm is null or (impedance_ohm > 0 and impedance_ohm <= 100))
      and (amp_channels is null or amp_channels between 1 and 16)
      and (speaker_preset is null or speaker_preset ~ '^[a-z0-9][a-z0-9-]{0,59}$')
      and char_length(coalesce(spec_source, '')) <= 500
      and (rigging is null or (jsonb_typeof(rigging) = 'object' and octet_length(rigging::text) <= 4000)));
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
    'rigging', case when jsonb_typeof(r -> 'rigging') = 'object' then r -> 'rigging' end));
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
      speaker_preset, spec_source, rigging)
    values (p_org, auth.uid(), v_name, v_code, v_new ->> 'category', v_new ->> 'brand', v_new ->> 'model', v_new ->> 'details', v_kind,
      coalesce(v_new ->> 'unit', case when v_kind = 'rental' then 'day' else 'unit' end),
      coalesce(v_new ->> 'tracking', case when coalesce(v_qty, 0) > 0 then 'bulk' else 'none' end),
      coalesce((v_new ->> 'unit_price')::numeric, 0), (v_new ->> 'weight_kg')::numeric, (v_new ->> 'power_w')::integer,
      v_new ->> 'dimensions', (v_new ->> 'replacement_value')::numeric, (v_new ->> 'min_stock')::integer, v_new ->> 'packing_note',
      (v_new ->> 'cost_price')::numeric, (v_new ->> 'depreciation_months')::integer,
      v_new ->> 'speaker_type', (v_new ->> 'sensitivity_db')::numeric, (v_new ->> 'max_spl_db')::numeric, (v_new ->> 'dispersion_h')::numeric,
      (v_new ->> 'dispersion_v')::numeric, (v_new ->> 'freq_low_hz')::numeric, (v_new ->> 'freq_high_hz')::numeric,
      (v_new ->> 'impedance_ohm')::numeric, (v_new ->> 'amp_channels')::smallint, v_new ->> 'speaker_preset', v_new ->> 'spec_source',
      v_new -> 'rigging')
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
    rigging = coalesce(v_new -> 'rigging', i.rigging)
  where i.id = v.id;
  perform private.import_log(p_batch, 'price_items', v.id::text, 'updated', d -> 'before', d -> 'after');
  result := 'updated';
end $$;
revoke execute on function private.import_item_row(uuid, uuid, jsonb) from public, anon, authenticated;
