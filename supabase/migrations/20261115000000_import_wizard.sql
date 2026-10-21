-- Switching S1a (docs/SWITCHING.md): the import wizard's database side.
-- 1. import_batches: one per import (what, which file, counts, problems), undone_at once undone.
-- 2. import_changes: every row a batch created or changed (with the values before and after),
--    which is what makes a batch undoable. Only the functions below read and write it.
-- 3. import_presets: saved column matchings ("Rentman equipment export"), per organisation.
-- 4. run_import(org, kind, rows): imports locations, catalogue items or units in one go. Each
--    row is matched to an existing record (items by code then name, units by code then serial,
--    locations by name) and updated, or created. A row that can't be imported is skipped with
--    the reason; the others go in.
-- 5. Undoing a batch is in the next migration (20261115000001_import_undo.sql, run by hand: it
--    removes records).
-- Admins and members (who manage inventory) import and undo. Written without destructive
-- statements so it applies without manual confirmation.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('locations', 'items', 'units')),
  file_name text check (char_length(coalesce(file_name, '')) <= 200),
  preset text check (char_length(coalesce(preset, '')) <= 80),
  created integer not null default 0,
  updated integer not null default 0,
  unchanged integer not null default 0,
  skipped integer not null default 0,
  problems jsonb not null default '[]'::jsonb check (jsonb_typeof(problems) = 'array' and pg_column_size(problems) <= 262144),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null
);
create index if not exists import_batches_org_idx on public.import_batches (org_id, created_at desc);
alter table public.import_batches enable row level security;
create policy import_batches_select on public.import_batches for select to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.import_batches as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Written only by run_import and undo_import

create table if not exists public.import_changes (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  tbl text not null check (tbl in ('stock_locations', 'price_items', 'stock_units', 'stock_movements')),
  row_id text not null,
  action text not null check (action in ('created', 'updated')),
  before jsonb,
  after jsonb
);
create index if not exists import_changes_batch_idx on public.import_changes (batch_id, tbl, action);
alter table public.import_changes enable row level security;
-- No policies: only the functions below use it

create table if not exists public.import_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  kind text not null check (kind in ('locations', 'items', 'units')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object' and pg_column_size(mapping) <= 8192),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists import_presets_name_uniq on public.import_presets (org_id, kind, lower(name));
alter table public.import_presets enable row level security;
create policy import_presets_select on public.import_presets for select to authenticated using (private.can_quote(org_id));
create policy import_presets_insert on public.import_presets for insert to authenticated with check (private.can_quote(org_id));
create policy import_presets_update on public.import_presets for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy import_presets_remove on public.import_presets for delete to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.import_presets as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- A text field from a row: trimmed, empty → null
create or replace function private.import_text(r jsonb, k text) returns text
language sql immutable set search_path = '' as $$ select nullif(trim(r ->> k), '') $$;
revoke execute on function private.import_text(jsonb, text) from public, anon, authenticated;

create or replace function private.import_log(p_batch uuid, p_tbl text, p_id text, p_action text, p_before jsonb, p_after jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.import_changes (batch_id, tbl, row_id, action, before, after) values (p_batch, p_tbl, p_id, p_action, p_before, p_after)
$$;
revoke execute on function private.import_log(uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- The fields of `next` that differ from `cur` (both jsonb objects): { before, after }, or null
create or replace function private.import_diff(cur jsonb, nxt jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'before', jsonb_object_agg(k, cur -> k), 'after', jsonb_object_agg(k, nxt -> k)) end
  from jsonb_object_keys(nxt) k where (cur -> k) is distinct from (nxt -> k)
$$;
revoke execute on function private.import_diff(jsonb, jsonb) from public, anon, authenticated;

-- A location by name (not archived), or an error naming it
create or replace function private.import_location_id(p_org uuid, p_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if p_name is null then return null; end if;
  select l.id into v from public.stock_locations l where l.org_id = p_org and lower(l.name) = lower(p_name) and l.archived_at is null;
  if v is null then raise exception 'Unknown location: %', p_name using errcode = '22023'; end if;
  return v;
end $$;
revoke execute on function private.import_location_id(uuid, text) from public, anon, authenticated;

-- An item by code, then by name
create or replace function private.import_item_find(p_org uuid, p_code text, p_name text) returns public.price_items
language plpgsql stable security definer set search_path = '' as $$
declare v public.price_items; n int;
begin
  if p_code is not null then
    select * into v from public.price_items i where i.org_id = p_org and upper(i.code) = upper(p_code);
    if found then
      if v.archived_at is not null then raise exception 'Item % is archived', p_code using errcode = '22023'; end if;
      return v;
    end if;
  end if;
  if p_name is not null then
    select count(*) into n from public.price_items i where i.org_id = p_org and lower(i.name) = lower(p_name) and i.archived_at is null;
    if n > 1 then raise exception 'Several items are called %: add their codes to the file', p_name using errcode = '22023'; end if;
    select * into v from public.price_items i where i.org_id = p_org and lower(i.name) = lower(p_name) and i.archived_at is null;
    if found then return v; end if;
  end if;
  return null;
end $$;
revoke execute on function private.import_item_find(uuid, text, text) from public, anon, authenticated;

-- ── One row of each kind: returns 'created', 'updated' or 'unchanged' ────────
create or replace function private.import_location_row(p_batch uuid, p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.stock_locations; v_name text := private.import_text(r, 'name'); v_new jsonb; d jsonb;
begin
  if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
  select * into v from public.stock_locations l where l.org_id = p_org and lower(l.name) = lower(v_name) and l.archived_at is null;
  if not found then
    insert into public.stock_locations (org_id, name, kind, address, notes)
    values (p_org, v_name, coalesce(private.import_text(r, 'kind'), 'warehouse'), private.import_text(r, 'address'), private.import_text(r, 'notes'))
    returning * into v;
    perform private.import_log(p_batch, 'stock_locations', v.id::text, 'created', null, null);
    return 'created';
  end if;
  v_new := jsonb_strip_nulls(jsonb_build_object('kind', private.import_text(r, 'kind'), 'address', private.import_text(r, 'address'), 'notes', private.import_text(r, 'notes')));
  d := private.import_diff(to_jsonb(v), v_new);
  if d is null then return 'unchanged'; end if;
  update public.stock_locations l set kind = coalesce(v_new ->> 'kind', l.kind), address = coalesce(v_new ->> 'address', l.address),
    notes = coalesce(v_new ->> 'notes', l.notes) where l.id = v.id;
  perform private.import_log(p_batch, 'stock_locations', v.id::text, 'updated', d -> 'before', d -> 'after');
  return 'updated';
end $$;
revoke execute on function private.import_location_row(uuid, uuid, jsonb) from public, anon, authenticated;

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
    'packing_note', private.import_text(r, 'packing_note')));
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
      weight_kg, power_w, dimensions, replacement_value, min_stock, packing_note)
    values (p_org, auth.uid(), v_name, v_code, v_new ->> 'category', v_new ->> 'brand', v_new ->> 'model', v_new ->> 'details', v_kind,
      coalesce(v_new ->> 'unit', case when v_kind = 'rental' then 'day' else 'unit' end),
      coalesce(v_new ->> 'tracking', case when coalesce(v_qty, 0) > 0 then 'bulk' else 'none' end),
      coalesce((v_new ->> 'unit_price')::numeric, 0), (v_new ->> 'weight_kg')::numeric, (v_new ->> 'power_w')::integer,
      v_new ->> 'dimensions', (v_new ->> 'replacement_value')::numeric, (v_new ->> 'min_stock')::integer, v_new ->> 'packing_note')
    returning * into v;
    perform private.import_log(p_batch, 'price_items', v.id::text, 'created', null, null);
    if coalesce(v_qty, 0) > 0 then
      insert into public.stock_movements (org_id, item_id, kind, quantity, to_location_id, note)
      values (p_org, v.id, 'purchase', v_qty, v_loc, 'Import') returning id into v_move;
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
    min_stock = coalesce((v_new ->> 'min_stock')::integer, i.min_stock), packing_note = coalesce(v_new ->> 'packing_note', i.packing_note)
  where i.id = v.id;
  perform private.import_log(p_batch, 'price_items', v.id::text, 'updated', d -> 'before', d -> 'after');
  result := 'updated';
end $$;
revoke execute on function private.import_item_row(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function private.import_unit_row(p_batch uuid, p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.price_items; v public.stock_units; v_code text := private.import_text(r, 'code'); v_serial text := private.import_text(r, 'serial');
  v_loc uuid := private.import_location_id(p_org, private.import_text(r, 'location')); v_new jsonb; d jsonb; m record;
begin
  v_item := private.import_item_find(p_org, private.import_text(r, 'item_code'), private.import_text(r, 'item'));
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

-- ── Import ───────────────────────────────────────────────────────────────────
-- rows: [{ _row: line number in the file, field: value, … }], up to 5000. Returns the batch with
-- its counts and problems ([{ row, message, level: 'skip' | 'note' }]).
create or replace function public.run_import(p_org uuid, p_kind text, p_rows jsonb, p_file text default null, p_preset text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid; r jsonb; v_n integer := 0; v_line integer; v_res text; v_note text;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; v_problems jsonb := '[]'::jsonb;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('locations', 'items', 'units') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Up to 5000 rows per import' using errcode = '54000'; end if;
  insert into public.import_batches (org_id, kind, file_name, preset) values (p_org, p_kind, left(p_file, 200), left(p_preset, 80)) returning id into v_batch;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_line := coalesce(nullif(r ->> '_row', '')::integer, v_n);
    v_note := null;
    begin
      if p_kind = 'locations' then v_res := private.import_location_row(v_batch, p_org, r);
      elsif p_kind = 'items' then select result, note into v_res, v_note from private.import_item_row(v_batch, p_org, r);
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
  update public.import_batches set created = c_created, updated = c_updated, unchanged = c_same, skipped = c_skipped, problems = v_problems
   where id = v_batch;
  return jsonb_build_object('batch', v_batch, 'created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems);
end $$;
revoke execute on function public.run_import(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.run_import(uuid, text, jsonb, text, text) to authenticated;
