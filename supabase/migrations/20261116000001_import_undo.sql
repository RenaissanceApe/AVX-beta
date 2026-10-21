-- Switching S1a (docs/SWITCHING.md): undoing an import. RUN BY HAND in the SQL editor (test
-- project first, then production): it removes records, so it needs a person to confirm it.
-- undo_import(batch) removes what the batch created and puts back what it changed, but only
-- while nothing has used the new records (stock moved, a gig, a scan, a repair, a kit, a case, a
-- plot or a patch); fields changed again since the import are left as they are. Kit parts a
-- kits import added (20261116000000_import_kits.sql) are removed, and changed quantities put back.
-- Checks: supabase/tests/import_undo.sql (after this file has run).

create or replace function public.undo_import(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.import_batches; c record; v_cur jsonb; v_set text;
  v_items uuid[]; v_units uuid[]; v_locs uuid[]; v_moves bigint[]; v_parts uuid[]; v_qty integer;
  n_removed integer := 0; n_restored integer := 0; n_kept integer := 0; v_count integer;
begin
  perform private.require_mfa();
  select * into b from public.import_batches where id = p_batch for update;
  if not found or not private.can_quote(b.org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if b.undone_at is not null then raise exception 'This import was already undone' using errcode = '22023'; end if;

  select coalesce(array_agg(row_id::uuid) filter (where tbl = 'price_items'), '{}'),
         coalesce(array_agg(row_id::uuid) filter (where tbl = 'stock_units'), '{}'),
         coalesce(array_agg(row_id::uuid) filter (where tbl = 'stock_locations'), '{}'),
         coalesce(array_agg(row_id::bigint) filter (where tbl = 'stock_movements'), '{}')
    into v_items, v_units, v_locs, v_moves
  from public.import_changes where batch_id = p_batch and action = 'created';
  select coalesce(array_agg(part_id), '{}') into v_parts from public.import_part_changes where batch_id = p_batch and action = 'created';

  -- Anything used since? Stock moved, put in a kit or a case, drawn on a plot or a patch…
  if exists (select 1 from public.stock_movements m
             where (m.item_id = any(v_items) or m.unit_id = any(v_units) or m.to_location_id = any(v_locs) or m.from_location_id = any(v_locs))
               and not (m.id = any(v_moves)))
     or exists (select 1 from public.item_parts p where (p.parent_id = any(v_items) or p.child_id = any(v_items)) and not (p.id = any(v_parts)))
     or exists (select 1 from public.item_alternatives a where a.item_a = any(v_items) or a.item_b = any(v_items))
     or exists (select 1 from public.gig_inputs x where x.item_id = any(v_items))
     or exists (select 1 from public.gig_plot_items x where x.item_id = any(v_items))
     or exists (select 1 from public.gig_fixtures x where x.item_id = any(v_items))
     or exists (select 1 from public.stock_units u where u.case_unit_id = any(v_units)) then
    raise exception 'Some of what this import added is already in use, so it can''t be undone' using errcode = '23503';
  end if;

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
  exception when foreign_key_violation then
    raise exception 'Some of what this import added is already in use, so it can''t be undone' using errcode = '23503';
  end;

  -- Put back what was changed, unless it has been changed again since
  for c in select * from public.import_changes where batch_id = p_batch and action = 'updated' order by id desc loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', c.tbl) into v_cur using c.row_id::uuid;
    if v_cur is null then continue; end if;
    if (select bool_and((v_cur -> k) is not distinct from (c.after -> k)) from jsonb_object_keys(c.after) k) then
      select string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', k, c.tbl, k), ', ') into v_set
      from jsonb_object_keys(c.before) k;
      execute format('update public.%I set %s where id = $2', c.tbl, v_set) using c.before, c.row_id::uuid;
      n_restored := n_restored + 1;
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

  update public.import_batches set undone_at = now(), undone_by = auth.uid() where id = p_batch;
  return jsonb_build_object('removed', n_removed, 'restored', n_restored, 'kept', n_kept);
end $$;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.undo_import(uuid) to authenticated;
