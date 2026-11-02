-- K0 · Capture for reports, part 3: the equipment import (docs/SWITCHING.md) takes a cost price
-- and a write-off period per item; an opening quantity's purchase row gets the cost price as its
-- cost each. The function is as in 20261115000000 otherwise.
-- Written without destructive statements.

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
    'depreciation_months', nullif(r ->> 'depreciation_months', '')::integer));
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
      weight_kg, power_w, dimensions, replacement_value, min_stock, packing_note, cost_price, depreciation_months)
    values (p_org, auth.uid(), v_name, v_code, v_new ->> 'category', v_new ->> 'brand', v_new ->> 'model', v_new ->> 'details', v_kind,
      coalesce(v_new ->> 'unit', case when v_kind = 'rental' then 'day' else 'unit' end),
      coalesce(v_new ->> 'tracking', case when coalesce(v_qty, 0) > 0 then 'bulk' else 'none' end),
      coalesce((v_new ->> 'unit_price')::numeric, 0), (v_new ->> 'weight_kg')::numeric, (v_new ->> 'power_w')::integer,
      v_new ->> 'dimensions', (v_new ->> 'replacement_value')::numeric, (v_new ->> 'min_stock')::integer, v_new ->> 'packing_note',
      (v_new ->> 'cost_price')::numeric, (v_new ->> 'depreciation_months')::integer)
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
    depreciation_months = coalesce((v_new ->> 'depreciation_months')::integer, i.depreciation_months)
  where i.id = v.id;
  perform private.import_log(p_batch, 'price_items', v.id::text, 'updated', d -> 'before', d -> 'after');
  result := 'updated';
end $$;
revoke execute on function private.import_item_row(uuid, uuid, jsonb) from public, anon, authenticated;
