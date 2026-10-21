-- Switching S1b (docs/SWITCHING.md): importing kit contents (what's in a set or a case, and the
-- accessories that come with an item).
-- 1. run_import accepts 'kits'. A kits import is kept as an equipment import ('items') with
--    subject 'kits', so the existing rules stay as they are; presets can be for kits too.
-- 2. import_part_changes logs the kit parts a batch created or changed (like import_changes).
-- 3. Each row names the kit (by code or name), the item that goes in it, how many, and whether
--    it's contents or an accessory. A kit given contents becomes a set (untracked item) or a
--    case (tracked item) unless the file says which. A part already there gets the new quantity.
-- Written without destructive statements so it applies without manual confirmation.

alter table public.import_batches add column if not exists subject text;
alter table public.import_presets add column if not exists subject text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'import_batches_subject_check') then
    alter table public.import_batches add constraint import_batches_subject_check check (subject is null or (subject = 'kits' and kind = 'items'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_presets_subject_check') then
    alter table public.import_presets add constraint import_presets_subject_check check (subject is null or (subject = 'kits' and kind = 'items'));
  end if;
end $$;

create table if not exists public.import_part_changes (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  part_id uuid not null,
  action text not null check (action in ('created', 'updated')),
  before jsonb,
  after jsonb
);
create index if not exists import_part_changes_batch_idx on public.import_part_changes (batch_id);
alter table public.import_part_changes enable row level security;
-- No policies: only the import functions use it

create or replace function private.import_kit_row(p_batch uuid, p_org uuid, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_kit public.price_items; v_item public.price_items; v_part public.item_parts;
  v_qty integer := coalesce(nullif(r ->> 'quantity', '')::integer, 1);
  v_kind text := private.import_text(r, 'part_kind'); v_type text := private.import_text(r, 'kit_type');
begin
  v_kit := private.import_item_find(p_org, private.import_text(r, 'kit_code'), private.import_text(r, 'kit'));
  if v_kit.id is null then raise exception 'Unknown kit: %', coalesce(private.import_text(r, 'kit_code'), private.import_text(r, 'kit'), '—') using errcode = '22023'; end if;
  v_item := private.import_item_find(p_org, private.import_text(r, 'item_code'), private.import_text(r, 'item'));
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

-- Same as before, plus 'kits'
create or replace function public.run_import(p_org uuid, p_kind text, p_rows jsonb, p_file text default null, p_preset text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid; r jsonb; v_n integer := 0; v_line integer; v_res text; v_note text;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; v_problems jsonb := '[]'::jsonb;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('locations', 'items', 'units', 'kits') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Up to 5000 rows per import' using errcode = '54000'; end if;
  insert into public.import_batches (org_id, kind, subject, file_name, preset)
  values (p_org, case when p_kind = 'kits' then 'items' else p_kind end, case when p_kind = 'kits' then 'kits' end, left(p_file, 200), left(p_preset, 80))
  returning id into v_batch;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_line := coalesce(nullif(r ->> '_row', '')::integer, v_n);
    v_note := null;
    begin
      if p_kind = 'locations' then v_res := private.import_location_row(v_batch, p_org, r);
      elsif p_kind = 'items' then select result, note into v_res, v_note from private.import_item_row(v_batch, p_org, r);
      elsif p_kind = 'kits' then v_res := private.import_kit_row(v_batch, p_org, r);
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
