-- IM3 · The import's database part, the hand-run file (docs/SWITCHING.md, "How IM3 works").
-- RUN BY HAND in the SQL editor (test project first, then production), AFTER
-- 20270115000000_import_fixes.sql: it removes records, so it needs a person to confirm it.
-- 1. Undo says what's in use and can undo the rest: undo_import(batch, rest). Called with the batch
--    only, it works as before: when something the import added is in use, it refuses with the same
--    message (Earlier imports then asks import_in_use what uses it). With rest = true it keeps what
--    is in use (private.import_used) and what that needs (a delete the database refuses because
--    something still points at the record keeps that record too), undoes everything else, and
--    records what was kept in import_batches.kept.
-- 2. "Switch X to per unit" in the units import: private.import_switch_per_unit replaces the stub.
--    Only while the item's stock is just the opening quantity an import added (not undone), with no
--    units and not on a gig: those stock movements are removed (logged as 'removed', with the whole
--    row) and the item is kept per unit from then on. Undoing that units import puts the item back
--    to bulk and the movements back, with the same ids.
-- What it removes: the old undo_import(uuid) function (replaced by the two-argument one), the
-- import_changes action check (replaced to allow 'removed'), and, when used, the opening stock
-- movements of an item switched to per unit and the records an undo removes (as before).
-- Checks: supabase/tests/import_undo.sql (the last blocks).

alter table public.import_changes drop constraint if exists import_changes_action_check;
alter table public.import_changes add constraint import_changes_action_check check (action in ('created', 'updated', 'removed'));

create or replace function private.import_switch_per_unit(p_batch uuid, p_org uuid, p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.stock_movements;
begin
  perform 1 from public.price_items i where i.id = p_item and i.org_id = p_org for update;
  if not private.import_per_unit_check(p_org, p_item) then
    raise exception 'This item can''t switch to per unit: its stock has changed since it was imported, or it is on a gig' using errcode = '22023';
  end if;
  for m in select * from public.stock_movements x where x.item_id = p_item order by x.id loop
    perform private.import_log(p_batch, 'stock_movements', m.id::text, 'removed', to_jsonb(m), null);
    delete from public.stock_movements where id = m.id;
  end loop;
  update public.price_items set tracking = 'serial' where id = p_item;
  perform private.import_log(p_batch, 'price_items', p_item::text, 'updated', '{"tracking": "bulk"}', '{"tracking": "serial"}');
end $$;
revoke execute on function private.import_switch_per_unit(uuid, uuid, uuid) from public, anon, authenticated;

drop function if exists public.undo_import(uuid);

create or replace function public.undo_import(p_batch uuid, p_rest boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.import_batches; c record; v_cur jsonb; v_set text; v_id uuid; v_name text;
  v_items uuid[]; v_units uuid[]; v_locs uuid[]; v_moves bigint[]; v_parts uuid[]; v_clients uuid[]; v_suppliers uuid[]; v_qty integer;
  v_used text[] := '{}'; v_kept jsonb := '[]'::jsonb; n_in_use integer := 0;
  n_removed integer := 0; n_restored integer := 0; n_kept integer := 0; v_count integer;
begin
  perform private.require_mfa();
  select * into b from public.import_batches where id = p_batch for update;
  if not found or not private.can_quote(b.org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if b.undone_at is not null then raise exception 'This import was already undone' using errcode = '22023'; end if;

  select coalesce(array_agg(row_id::uuid) filter (where tbl = 'price_items'), '{}'),
         coalesce(array_agg(row_id::uuid) filter (where tbl = 'stock_units'), '{}'),
         coalesce(array_agg(row_id::uuid) filter (where tbl = 'stock_locations'), '{}'),
         coalesce(array_agg(row_id::bigint) filter (where tbl = 'stock_movements'), '{}'),
         coalesce(array_agg(row_id::uuid) filter (where tbl = 'clients'), '{}'),
         coalesce(array_agg(row_id::uuid) filter (where tbl = 'suppliers'), '{}')
    into v_items, v_units, v_locs, v_moves, v_clients, v_suppliers
  from public.import_changes where batch_id = p_batch and action = 'created';
  select coalesce(array_agg(part_id), '{}') into v_parts from public.import_part_changes where batch_id = p_batch and action = 'created';

  -- Anything used since? (private.import_used: stock moved, a kit, an alternative, a gig, units
  -- added later, a case, a quote, an invoice, a subrental)
  select coalesce(array_agg(distinct u.tbl || ':' || u.row_id), '{}') into v_used from private.import_used(p_batch) u;
  n_in_use := cardinality(v_used);
  if n_in_use > 0 and not p_rest then
    raise exception 'Some of what this import added is already in use, so it can''t be undone' using errcode = '23503';
  end if;

  if not p_rest then
    -- As before: all of it, or nothing
    begin
      delete from public.item_parts where id = any(v_parts);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
      delete from public.stock_movements where id = any(v_moves);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
      delete from public.stock_units where id = any(v_units);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
      delete from public.price_items where id = any(v_items);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
      delete from public.stock_locations where id = any(v_locs);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
      delete from public.clients where id = any(v_clients);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
      delete from public.suppliers where id = any(v_suppliers);
      get diagnostics v_count = row_count; n_removed := n_removed + v_count;
    exception when foreign_key_violation then
      raise exception 'Some of what this import added is already in use, so it can''t be undone' using errcode = '23503';
    end;
  else
    -- The rest: what's in use stays; each other record goes with its own history, or stays when
    -- something the check doesn't know still points at it (and then what it needs stays too)
    delete from public.item_parts where id = any(v_parts);
    get diagnostics v_count = row_count; n_removed := n_removed + v_count;
    foreach v_id in array v_units loop
      if ('stock_units:' || v_id) = any(v_used) then continue; end if;
      begin
        delete from public.stock_movements where unit_id = v_id and id = any(v_moves);
        get diagnostics v_count = row_count;
        delete from public.stock_units where id = v_id;
        n_removed := n_removed + v_count + 1;
      exception when foreign_key_violation then
        v_used := v_used || ('stock_units:' || v_id);
      end;
    end loop;
    foreach v_id in array v_items loop
      if ('price_items:' || v_id) = any(v_used) then continue; end if;
      begin
        delete from public.stock_movements where item_id = v_id and unit_id is null and id = any(v_moves);
        get diagnostics v_count = row_count;
        delete from public.price_items where id = v_id;
        n_removed := n_removed + v_count + 1;
      exception when foreign_key_violation then
        v_used := v_used || ('price_items:' || v_id);
      end;
    end loop;
    foreach v_id in array v_locs loop
      if ('stock_locations:' || v_id) = any(v_used) then continue; end if;
      begin
        delete from public.stock_locations where id = v_id;
        n_removed := n_removed + 1;
      exception when foreign_key_violation then
        v_used := v_used || ('stock_locations:' || v_id);
      end;
    end loop;
    foreach v_id in array v_clients loop
      if ('clients:' || v_id) = any(v_used) then continue; end if;
      begin
        delete from public.clients where id = v_id;
        n_removed := n_removed + 1;
      exception when foreign_key_violation then
        v_used := v_used || ('clients:' || v_id);
      end;
    end loop;
    foreach v_id in array v_suppliers loop
      if ('suppliers:' || v_id) = any(v_used) then continue; end if;
      begin
        delete from public.suppliers where id = v_id;
        n_removed := n_removed + 1;
      exception when foreign_key_violation then
        v_used := v_used || ('suppliers:' || v_id);
      end;
    end loop;
    -- What stayed, with names (the first 100)
    select coalesce(jsonb_agg(jsonb_build_object('tbl', split_part(k, ':', 1), 'id', split_part(k, ':', 2), 'name', coalesce(
             (select i.name from public.price_items i where split_part(k, ':', 1) = 'price_items' and i.id::text = split_part(k, ':', 2)),
             (select coalesce(u.code, u.serial) from public.stock_units u where split_part(k, ':', 1) = 'stock_units' and u.id::text = split_part(k, ':', 2)),
             (select l.name from public.stock_locations l where split_part(k, ':', 1) = 'stock_locations' and l.id::text = split_part(k, ':', 2)),
             (select x.name from public.clients x where split_part(k, ':', 1) = 'clients' and x.id::text = split_part(k, ':', 2)),
             (select x.name from public.suppliers x where split_part(k, ':', 1) = 'suppliers' and x.id::text = split_part(k, ':', 2))))), '[]'::jsonb)
      into v_kept
    from (select distinct k from unnest(v_used) k limit 100) s;
    n_in_use := (select count(distinct k) from unnest(v_used) k);
  end if;

  -- Put back what was changed, unless it has been changed again since (or, undoing the rest, it
  -- can't go back because of what stayed)
  for c in select * from public.import_changes where batch_id = p_batch and action = 'updated' order by id desc loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', c.tbl) into v_cur using c.row_id::uuid;
    if v_cur is null then continue; end if;
    if (select bool_and((v_cur -> k) is not distinct from (c.after -> k)) from jsonb_object_keys(c.after) k) then
      select string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', k, c.tbl, k), ', ') into v_set
      from jsonb_object_keys(c.before) k;
      if p_rest then
        begin
          execute format('update public.%I set %s where id = $2', c.tbl, v_set) using c.before, c.row_id::uuid;
          n_restored := n_restored + 1;
        exception when others then
          n_kept := n_kept + 1;
        end;
      else
        execute format('update public.%I set %s where id = $2', c.tbl, v_set) using c.before, c.row_id::uuid;
        n_restored := n_restored + 1;
      end if;
    else
      n_kept := n_kept + 1;
    end if;
  end loop;

  for c in select * from public.import_part_changes where batch_id = p_batch and action = 'updated' order by id desc loop
    select quantity into v_qty from public.item_parts where id = c.part_id;
    if v_qty is null then continue; end if;
    if v_qty = (c.after ->> 'quantity')::integer then
      update public.item_parts set quantity = (c.before ->> 'quantity')::integer where id = c.part_id;
      n_restored := n_restored + 1;
    else
      n_kept := n_kept + 1;
    end if;
  end loop;

  -- Stock movements an import removed (an item switched to per unit) come back, with their ids
  for c in select * from public.import_changes where batch_id = p_batch and action = 'removed' and tbl = 'stock_movements' order by id loop
    if exists (select 1 from public.stock_movements where id = c.row_id::bigint) then continue; end if;
    begin
      insert into public.stock_movements overriding system value
      select (jsonb_populate_record(null::public.stock_movements, c.before)).*;
      n_restored := n_restored + 1;
    exception when others then
      if not p_rest then raise; end if;
      n_kept := n_kept + 1;
    end;
  end loop;

  update public.import_batches set undone_at = now(), undone_by = auth.uid(), kept = case when p_rest and n_in_use > 0 then v_kept end
   where id = p_batch;
  return jsonb_build_object('removed', n_removed, 'restored', n_restored, 'kept', n_kept, 'in_use', n_in_use);
end $$;
revoke execute on function public.undo_import(uuid, boolean) from public, anon;
grant execute on function public.undo_import(uuid, boolean) to authenticated;
