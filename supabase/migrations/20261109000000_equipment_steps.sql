-- Help H5b: equipment steps and undoing a scan (docs/HELP.md).
-- 1. Every scan is one batch (a case and what's packed in it share it). The log remembers each
--    unit's state before the scan, so whoever scanned can undo it for 15 minutes. Undone rows
--    stay in the log, marked, and no longer count.
-- 2. Steps between out and in, per gig: prepped → loaded (scan out) → on site → loaded back →
--    returned (scan in) → checked in. Each organisation chooses which of them it uses; loaded
--    and returned are always on, because they are scanning out and in.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Batches and undo on the dispatch log ─────────────────────────────────────
alter table public.gig_dispatch add column if not exists batch uuid;
alter table public.gig_dispatch add column if not exists undone_at timestamptz;
alter table public.gig_dispatch add column if not exists prev_out_on_gig uuid;
alter table public.gig_dispatch add column if not exists prev_out_since timestamptz;
alter table public.gig_dispatch add column if not exists prev_status text;
create index if not exists gig_dispatch_batch_idx on public.gig_dispatch (batch) where batch is not null;
create index if not exists gig_dispatch_unit_idx on public.gig_dispatch (unit_id, created_at desc) where unit_id is not null;

-- Rows written during one scan share the batch the scan function set for the transaction
create or replace function private.scan_batch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.batch := coalesce(nullif(current_setting('avx.batch', true), '')::uuid, gen_random_uuid());
  new.undone_at := null;
  new.created_at := now();
  return new;
end $$;
revoke execute on function private.scan_batch() from public, anon, authenticated;
create or replace trigger gig_dispatch_batch before insert on public.gig_dispatch
  for each row execute function private.scan_batch();

-- Undone scans no longer count
create or replace function private.dispatch_counts(p_gig uuid, p_item uuid, out planned integer, out out_qty integer, out back_qty integer)
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.quantity from public.gig_equipment e where e.gig_id = p_gig and e.item_id = p_item), 0),
         coalesce((select sum(d.quantity) from public.gig_dispatch d where d.gig_id = p_gig and d.item_id = p_item and d.direction = 'out' and d.undone_at is null), 0)::integer,
         coalesce((select sum(d.quantity) from public.gig_dispatch d where d.gig_id = p_gig and d.item_id = p_item and d.direction = 'in' and d.undone_at is null), 0)::integer
$$;
revoke execute on function private.dispatch_counts(uuid, uuid) from public, anon, authenticated;

create or replace function private.gig_dispatch_summary_unchecked(p_gig uuid)
returns table(item_id uuid, item_name text, category text, tracking text, packing_note text, planned integer, out_qty integer, back_qty integer)
language sql stable security definer set search_path = '' as $$
  with ids as (
    select e.item_id from public.gig_equipment e where e.gig_id = p_gig
    union select d.item_id from public.gig_dispatch d where d.gig_id = p_gig and d.undone_at is null
  )
  select ids.item_id, coalesce(e.item_name, i.name), coalesce(e.category, i.category), i.tracking, coalesce(e.packing_note, i.packing_note),
         c.planned, c.out_qty, c.back_qty
  from ids
  join public.price_items i on i.id = ids.item_id
  left join public.gig_equipment e on e.gig_id = p_gig and e.item_id = ids.item_id
  cross join lateral private.dispatch_counts(p_gig, ids.item_id) c
  where private.can_access_gig(p_gig) or private.can_dispatch(p_gig)
  order by 3 nulls last, 2
$$;
revoke execute on function private.gig_dispatch_summary_unchecked(uuid) from public, anon, authenticated;

-- One scan, as before (20261027000000_warehouse.sql), now also logging the unit's state before it
create or replace function private.dispatch_scan_unchecked(p_gig uuid, p_code text, p_direction text, p_quantity integer, p_condition text, p_note text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org uuid; v_unit record; v_item record; v_counts record; v_warning text;
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 100000));
  v_note text := left(nullif(trim(coalesce(p_note, '')), ''), 500);
  v_other text;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  if v_org is null or not private.can_dispatch(p_gig) then
    raise exception 'Not allowed to scan for this gig' using errcode = '42501';
  end if;
  if p_direction not in ('out', 'in') or coalesce(p_condition, 'ok') not in ('ok', 'damaged') then
    raise exception 'Invalid scan' using errcode = '22023';
  end if;

  select u.* into v_unit from public.stock_units u where u.org_id = v_org and upper(u.code) = upper(trim(p_code));
  if found then
    select i.id, i.name into v_item from public.price_items i where i.id = v_unit.item_id;
    if v_unit.status = 'retired' then
      return jsonb_build_object('ok', false, 'error', 'retired', 'item_name', v_item.name, 'unit_code', v_unit.code);
    end if;
    perform set_config('avx.dispatch', 'on', true);
    if p_direction = 'out' then
      if v_unit.out_on_gig = p_gig then
        perform set_config('avx.dispatch', '', true);
        return jsonb_build_object('ok', false, 'error', 'already_out', 'item_name', v_item.name, 'unit_code', v_unit.code, 'serial', v_unit.serial);
      end if;
      if v_unit.out_on_gig is not null then
        select g.name into v_other from public.gigs g where g.id = v_unit.out_on_gig;
        v_warning := 'out_elsewhere';
      elsif v_unit.status = 'repair' then v_warning := 'in_repair';
      elsif v_unit.status = 'lost' then v_warning := 'was_lost';
      end if;
      update public.stock_units set out_on_gig = p_gig, out_since = now(),
        status = case when status = 'lost' then 'available' else status end where id = v_unit.id;
    else
      if v_unit.out_on_gig is distinct from p_gig then
        if v_unit.status = 'lost' then
          -- A lost unit turned up: it's back in stock
          update public.stock_units set status = case when p_condition = 'damaged' then 'repair' else 'available' end where id = v_unit.id;
          perform set_config('avx.dispatch', '', true);
          return jsonb_build_object('ok', true, 'warning', 'was_lost', 'item_name', v_item.name, 'unit_code', v_unit.code, 'serial', v_unit.serial);
        end if;
        perform set_config('avx.dispatch', '', true);
        if v_unit.out_on_gig is not null then
          select g.name into v_other from public.gigs g where g.id = v_unit.out_on_gig;
          return jsonb_build_object('ok', false, 'error', 'out_on_other_gig', 'other_gig', v_other, 'item_name', v_item.name, 'unit_code', v_unit.code);
        end if;
        return jsonb_build_object('ok', false, 'error', 'not_out', 'item_name', v_item.name, 'unit_code', v_unit.code, 'serial', v_unit.serial);
      end if;
      update public.stock_units set out_on_gig = null, out_since = null,
        status = case when p_condition = 'damaged' then 'repair' else status end where id = v_unit.id;
    end if;
    perform set_config('avx.dispatch', '', true);
    insert into public.gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity, condition, note, prev_out_on_gig, prev_out_since, prev_status)
    values (p_gig, v_org, v_item.id, v_unit.id, p_direction, 1, coalesce(p_condition, 'ok'), v_note, v_unit.out_on_gig, v_unit.out_since, v_unit.status);
    select * into v_counts from private.dispatch_counts(p_gig, v_item.id);
    if v_warning is null and v_counts.planned = 0 then v_warning := 'not_planned'; end if;
    if v_warning is null and p_direction = 'out' and v_counts.out_qty > v_counts.planned then v_warning := 'over_planned'; end if;
    return jsonb_build_object('ok', true, 'kind', 'unit', 'warning', v_warning, 'other_gig', v_other, 'item_id', v_item.id,
      'item_name', v_item.name, 'unit_code', v_unit.code, 'serial', v_unit.serial,
      'planned', v_counts.planned, 'out', v_counts.out_qty, 'back', v_counts.back_qty);
  end if;

  select i.id, i.name, i.tracking into v_item from public.price_items i where i.org_id = v_org and upper(i.code) = upper(trim(p_code));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_item.tracking = 'serial' then
    return jsonb_build_object('ok', false, 'error', 'scan_units', 'item_name', v_item.name);
  end if;
  if v_item.tracking <> 'bulk' then
    return jsonb_build_object('ok', false, 'error', 'not_tracked', 'item_name', v_item.name);
  end if;
  insert into public.gig_dispatch (gig_id, org_id, item_id, direction, quantity, condition, note)
  values (p_gig, v_org, v_item.id, p_direction, v_qty, coalesce(p_condition, 'ok'), v_note);
  select * into v_counts from private.dispatch_counts(p_gig, v_item.id);
  if v_counts.planned = 0 then v_warning := 'not_planned';
  elsif p_direction = 'out' and v_counts.out_qty > v_counts.planned then v_warning := 'over_planned';
  elsif p_direction = 'in' and v_counts.back_qty > v_counts.out_qty then v_warning := 'more_back_than_out';
  end if;
  return jsonb_build_object('ok', true, 'kind', 'bulk', 'warning', v_warning, 'item_id', v_item.id, 'item_name', v_item.name,
    'quantity', v_qty, 'planned', v_counts.planned, 'out', v_counts.out_qty, 'back', v_counts.back_qty);
end $$;
revoke execute on function private.dispatch_scan_unchecked(uuid, text, text, integer, text, text) from public, anon, authenticated;

-- A case's contents, as before (20261028000000_kits.sql), now also logging each unit's state before
create or replace function private.dispatch_case_contents(p_gig uuid, p_case uuid, p_direction text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_item uuid; v_moved integer := 0; v_skipped integer := 0; n integer;
begin
  select u.org_id, u.item_id into v_org, v_item from public.stock_units u where u.id = p_case;
  perform set_config('avx.dispatch', 'on', true);
  if p_direction = 'out' then
    with b as (
      select u.id, u.out_on_gig, u.out_since, u.status from public.stock_units u
       where u.case_unit_id = p_case and u.status = 'available' and u.out_on_gig is null
    ), moved as (
      update public.stock_units u set out_on_gig = p_gig, out_since = now() from b where u.id = b.id
      returning u.id, u.item_id, b.out_on_gig as was_gig, b.out_since as was_since, b.status as was_status
    ), logged as (
      insert into public.gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity, prev_out_on_gig, prev_out_since, prev_status)
      select p_gig, v_org, m.item_id, m.id, 'out', 1, m.was_gig, m.was_since, m.was_status from moved m returning 1
    ) select count(*) into v_moved from logged;
    select count(*) into v_skipped from public.stock_units
     where case_unit_id = p_case and status <> 'retired' and out_on_gig is distinct from p_gig;
  else
    with b as (
      select u.id, u.out_on_gig, u.out_since, u.status from public.stock_units u
       where u.case_unit_id = p_case and u.out_on_gig = p_gig
    ), moved as (
      update public.stock_units u set out_on_gig = null, out_since = null from b where u.id = b.id
      returning u.id, u.item_id, b.out_on_gig as was_gig, b.out_since as was_since, b.status as was_status
    ), logged as (
      insert into public.gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity, prev_out_on_gig, prev_out_since, prev_status)
      select p_gig, v_org, m.item_id, m.id, 'in', 1, m.was_gig, m.was_since, m.was_status from moved m returning 1
    ) select count(*) into v_moved from logged;
  end if;
  perform set_config('avx.dispatch', '', true);
  insert into public.gig_dispatch (gig_id, org_id, item_id, direction, quantity)
  select p_gig, v_org, p.child_id, p_direction, p.quantity
    from public.item_parts p join public.price_items i on i.id = p.child_id
   where p.parent_id = v_item and p.kind = 'content' and i.tracking = 'bulk';
  get diagnostics n = row_count;
  return jsonb_build_object('moved', v_moved + n, 'skipped', v_skipped);
end $$;
revoke execute on function private.dispatch_case_contents(uuid, uuid, text) from public, anon, authenticated;

-- The scan as the app calls it (as in 20261029000000_maintenance.sql), now one batch, returned
-- so the scan can be undone. A damaged return opens a repair and can't be undone here.
create or replace function public.dispatch_scan(p_gig uuid, p_code text, p_direction text, p_quantity integer default 1,
                                                p_condition text default 'ok', p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb; v_case uuid; c jsonb; v_unit uuid; v_batch uuid := gen_random_uuid();
begin
  perform private.require_mfa();
  perform set_config('avx.batch', v_batch::text, true);
  r := private.dispatch_scan_unchecked(p_gig, p_code, p_direction, p_quantity, p_condition, p_note);
  if (r->>'ok')::boolean and r->>'kind' = 'unit' then
    select u.id into v_case
      from public.stock_units u join public.price_items i on i.id = u.item_id join public.gigs g on g.org_id = u.org_id
     where g.id = p_gig and upper(u.code) = upper(r->>'unit_code') and i.kit_type = 'case';
    if v_case is not null then
      c := private.dispatch_case_contents(p_gig, v_case, p_direction);
      r := r || jsonb_build_object('contents', (c->>'moved')::integer, 'contents_skipped', (c->>'skipped')::integer);
    end if;
  end if;
  if (r->>'ok')::boolean and p_direction = 'in' and p_condition = 'damaged' and r->>'item_id' is not null then
    select u.id into v_unit from public.stock_units u join public.gigs g on g.org_id = u.org_id
     where g.id = p_gig and upper(u.code) = upper(r->>'unit_code');
    insert into public.repairs (item_id, unit_id, quantity, gig_id, problem)
    values ((r->>'item_id')::uuid, v_unit, coalesce((r->>'quantity')::integer, 1), p_gig,
            coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 1000), 'Damaged on return'))
    on conflict (unit_id) where unit_id is not null and status in ('open', 'in_repair') do nothing;
    r := r || jsonb_build_object('repair', true);
  end if;
  perform set_config('avx.batch', '', true);
  if exists (select 1 from public.gig_dispatch d where d.batch = v_batch) then
    r := r || jsonb_build_object('batch', v_batch);
  end if;
  return r;
end $$;
revoke execute on function public.dispatch_scan(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.dispatch_scan(uuid, text, text, integer, text, text) to authenticated;

-- ── Steps ────────────────────────────────────────────────────────────────────
alter table public.organisations add column if not exists equipment_steps text[] not null
  default array['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in'];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_equipment_steps_check') then
    alter table public.organisations add constraint organisations_equipment_steps_check check (
      equipment_steps <@ array['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in']
      and 'loaded' = any(equipment_steps) and 'returned' = any(equipment_steps));
  end if;
end $$;

-- The steps that aren't scanning out or in. Like the dispatch log: only added to, by step_scan.
create table if not exists public.gig_steps (
  id bigint generated always as identity primary key,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  unit_id uuid references public.stock_units(id),
  step text not null check (step in ('prepped', 'on_site', 'loaded_back', 'checked_in')),
  quantity integer not null check (quantity between 1 and 100000),
  batch uuid,
  scanned_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists gig_steps_gig_idx on public.gig_steps (gig_id, item_id);
create index if not exists gig_steps_batch_idx on public.gig_steps (batch) where batch is not null;
alter table public.gig_steps enable row level security;
create policy gig_steps_select on public.gig_steps for select to authenticated
  using (private.can_access_gig(gig_id) or private.can_quote(org_id));
create policy mfa_required on public.gig_steps as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No insert, update or delete rules: rows are written by step_scan and undo_scan only
create or replace trigger gig_steps_batch before insert on public.gig_steps
  for each row execute function private.scan_batch();

-- How many of an item have this step on a gig: units once each, bulk quantities added up
create or replace function private.step_done(p_gig uuid, p_item uuid, p_step text) returns integer
language sql stable security definer set search_path = '' as $$
  select (count(distinct s.unit_id) + coalesce(sum(s.quantity) filter (where s.unit_id is null), 0))::integer
    from public.gig_steps s where s.gig_id = p_gig and s.item_id = p_item and s.step = p_step and s.undone_at is null
$$;
revoke execute on function private.step_done(uuid, uuid, text) from public, anon, authenticated;

-- One step scan: a unit's code (a case brings what's packed in it) or a bulk item's code with a
-- quantity. Warnings never stop it; a unit that already has the step records nothing.
create or replace function private.step_scan_unchecked(p_gig uuid, p_code text, p_step text, p_quantity integer)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org uuid; v_steps text[]; v_unit record; v_item record; v_warning text; v_other text;
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 100000));
  v_contents integer := 0; n integer; v_planned integer; v_done integer;
begin
  select g.org_id, o.equipment_steps into v_org, v_steps
    from public.gigs g join public.organisations o on o.id = g.org_id where g.id = p_gig;
  if v_org is null or not private.can_dispatch(p_gig) then
    raise exception 'Not allowed to scan for this gig' using errcode = '42501';
  end if;
  if p_step is null or p_step not in ('prepped', 'on_site', 'loaded_back', 'checked_in') then
    raise exception 'Invalid step' using errcode = '22023';
  end if;
  if not (p_step = any(v_steps)) then
    return jsonb_build_object('ok', false, 'error', 'step_off', 'step', p_step);
  end if;

  select u.* into v_unit from public.stock_units u where u.org_id = v_org and upper(u.code) = upper(trim(p_code));
  if found then
    select i.id, i.name, i.kit_type into v_item from public.price_items i where i.id = v_unit.item_id;
    if v_unit.status = 'retired' then
      return jsonb_build_object('ok', false, 'error', 'retired', 'item_name', v_item.name, 'unit_code', v_unit.code);
    end if;
    if exists (select 1 from public.gig_steps s where s.gig_id = p_gig and s.unit_id = v_unit.id and s.step = p_step and s.undone_at is null) then
      return jsonb_build_object('ok', false, 'error', 'already_step', 'step', p_step, 'item_name', v_item.name, 'unit_code', v_unit.code, 'serial', v_unit.serial);
    end if;
    if p_step in ('on_site', 'loaded_back') and v_unit.out_on_gig is distinct from p_gig then v_warning := 'not_out';
    elsif p_step = 'checked_in' and v_unit.out_on_gig = p_gig then v_warning := 'still_out';
    elsif p_step = 'prepped' and v_unit.out_on_gig is not null and v_unit.out_on_gig <> p_gig then
      select g.name into v_other from public.gigs g where g.id = v_unit.out_on_gig;
      v_warning := 'out_elsewhere';
    elsif p_step = 'prepped' and v_unit.status = 'repair' then v_warning := 'in_repair';
    end if;
    insert into public.gig_steps (gig_id, org_id, item_id, unit_id, step, quantity)
    values (p_gig, v_org, v_item.id, v_unit.id, p_step, 1);
    if v_item.kit_type = 'case' then
      insert into public.gig_steps (gig_id, org_id, item_id, unit_id, step, quantity)
      select p_gig, v_org, u.item_id, u.id, p_step, 1 from public.stock_units u
       where u.case_unit_id = v_unit.id and u.status <> 'retired'
         and not exists (select 1 from public.gig_steps s where s.gig_id = p_gig and s.unit_id = u.id and s.step = p_step and s.undone_at is null);
      get diagnostics n = row_count; v_contents := n;
      insert into public.gig_steps (gig_id, org_id, item_id, step, quantity)
      select p_gig, v_org, p.child_id, p_step, p.quantity
        from public.item_parts p join public.price_items i on i.id = p.child_id
       where p.parent_id = v_item.id and p.kind = 'content' and i.tracking = 'bulk';
      get diagnostics n = row_count; v_contents := v_contents + n;
    end if;
  else
    select i.id, i.name, i.tracking, i.kit_type into v_item from public.price_items i where i.org_id = v_org and upper(i.code) = upper(trim(p_code));
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_item.tracking = 'serial' then
      return jsonb_build_object('ok', false, 'error', 'scan_units', 'item_name', v_item.name);
    end if;
    if v_item.tracking <> 'bulk' then
      return jsonb_build_object('ok', false, 'error', 'not_tracked', 'item_name', v_item.name);
    end if;
    insert into public.gig_steps (gig_id, org_id, item_id, step, quantity) values (p_gig, v_org, v_item.id, p_step, v_qty);
  end if;

  v_planned := coalesce((select e.quantity from public.gig_equipment e where e.gig_id = p_gig and e.item_id = v_item.id), 0);
  v_done := private.step_done(p_gig, v_item.id, p_step);
  if v_warning is null and v_planned = 0 then v_warning := 'not_planned';
  elsif v_warning is null and v_done > v_planned then v_warning := 'over_planned';
  end if;
  return jsonb_build_object('ok', true, 'kind', case when v_unit.id is null then 'bulk' else 'unit' end, 'step', p_step,
    'warning', v_warning, 'other_gig', v_other, 'item_id', v_item.id, 'item_name', v_item.name,
    'unit_code', v_unit.code, 'serial', v_unit.serial, 'quantity', case when v_unit.id is null then v_qty end,
    'done', v_done, 'planned', v_planned, 'contents', case when v_item.kit_type = 'case' and v_unit.id is not null then v_contents end);
end $$;
create or replace function public.step_scan(p_gig uuid, p_code text, p_step text, p_quantity integer default 1)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb; v_batch uuid := gen_random_uuid();
begin
  perform private.require_mfa();
  perform set_config('avx.batch', v_batch::text, true);
  r := private.step_scan_unchecked(p_gig, p_code, p_step, p_quantity);
  perform set_config('avx.batch', '', true);
  if (r->>'ok')::boolean then r := r || jsonb_build_object('batch', v_batch); end if;
  return r;
end $$;

-- Undo a scan: only the person who made it, within 15 minutes, and only while nothing has
-- happened to its units since. Units go back to how they were before the scan.
create or replace function private.undo_scan_unchecked(p_gig uuid, p_batch uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_rows integer; v_steps integer;
begin
  if not private.can_dispatch(p_gig) then
    raise exception 'Not allowed to scan for this gig' using errcode = '42501';
  end if;
  select count(*) into v_rows from public.gig_dispatch d where d.gig_id = p_gig and d.batch = p_batch and d.undone_at is null;
  select count(*) into v_steps from public.gig_steps s where s.gig_id = p_gig and s.batch = p_batch and s.undone_at is null;
  if v_rows + v_steps = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;
  if exists (select 1 from public.gig_dispatch d where d.gig_id = p_gig and d.batch = p_batch and d.scanned_by is distinct from auth.uid())
     or exists (select 1 from public.gig_steps s where s.gig_id = p_gig and s.batch = p_batch and s.scanned_by is distinct from auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  if exists (select 1 from public.gig_dispatch d where d.gig_id = p_gig and d.batch = p_batch and d.created_at < now() - interval '15 minutes')
     or exists (select 1 from public.gig_steps s where s.gig_id = p_gig and s.batch = p_batch and s.created_at < now() - interval '15 minutes') then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;
  if exists (select 1 from public.gig_dispatch d where d.gig_id = p_gig and d.batch = p_batch and d.condition = 'damaged') then
    return jsonb_build_object('ok', false, 'error', 'damaged');
  end if;
  if exists (select 1 from public.gig_dispatch d join public.gig_dispatch later on later.unit_id = d.unit_id
              where d.gig_id = p_gig and d.batch = p_batch and d.unit_id is not null
                and later.batch is distinct from p_batch and later.undone_at is null and later.id > d.id) then
    return jsonb_build_object('ok', false, 'error', 'moved_since');
  end if;

  perform set_config('avx.dispatch', 'on', true);
  update public.stock_units u
     set out_on_gig = d.prev_out_on_gig, out_since = d.prev_out_since,
         status = case when d.prev_status = 'lost' then 'lost' else u.status end
    from public.gig_dispatch d
   where d.gig_id = p_gig and d.batch = p_batch and d.unit_id = u.id and d.undone_at is null;
  perform set_config('avx.dispatch', '', true);
  update public.gig_dispatch set undone_at = now() where gig_id = p_gig and batch = p_batch and undone_at is null;
  update public.gig_steps set undone_at = now() where gig_id = p_gig and batch = p_batch and undone_at is null;
  return jsonb_build_object('ok', true, 'rows', v_rows + v_steps);
end $$;
create or replace function public.undo_scan(p_gig uuid, p_batch uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.undo_scan_unchecked(p_gig, p_batch);
end $$;

-- How far each item on a gig has got: for every step, how many have reached it or a later one
-- (a unit scanned back in has been loaded, even if nobody ticked "loaded"). Bulk items count
-- the largest quantity at that step or after it.
create or replace function private.gig_step_summary_unchecked(p_gig uuid)
returns table(item_id uuid, step text, done integer)
language sql stable security definer set search_path = '' as $$
  with steps(step, idx) as (
    select * from unnest(array['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in']) with ordinality
  ), marks as (
    select s.item_id, s.unit_id, s.step, s.quantity from public.gig_steps s where s.gig_id = p_gig and s.undone_at is null
    union all
    select d.item_id, d.unit_id, case d.direction when 'out' then 'loaded' else 'returned' end, d.quantity
      from public.gig_dispatch d where d.gig_id = p_gig and d.undone_at is null
  ), ranked as (
    select m.item_id, m.unit_id, m.quantity, st.idx from marks m join steps st on st.step = m.step
  ), unit_top as (
    select r.item_id, r.unit_id, max(r.idx) as top from ranked r where r.unit_id is not null group by 1, 2
  ), bulk as (
    select r.item_id, r.idx, sum(r.quantity) as q from ranked r where r.unit_id is null group by 1, 2
  ), items as (
    select distinct r.item_id from ranked r
  )
  select i.item_id, st.step,
         ((select count(*) from unit_top u where u.item_id = i.item_id and u.top >= st.idx)
          + coalesce((select max(b.q) from bulk b where b.item_id = i.item_id and b.idx >= st.idx), 0))::integer
    from items i cross join steps st
   where private.can_access_gig(p_gig) or private.can_dispatch(p_gig)
$$;
create or replace function public.gig_step_summary(p_gig uuid)
returns table(item_id uuid, step text, done integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_step_summary_unchecked(p_gig);
end $$;

revoke execute on function private.step_scan_unchecked(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function private.undo_scan_unchecked(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.gig_step_summary_unchecked(uuid) from public, anon, authenticated;
revoke execute on function public.step_scan(uuid, text, text, integer) from public, anon;
revoke execute on function public.undo_scan(uuid, uuid) from public, anon;
revoke execute on function public.gig_step_summary(uuid) from public, anon;
grant execute on function public.step_scan(uuid, text, text, integer) to authenticated;
grant execute on function public.undo_scan(uuid, uuid) to authenticated;
grant execute on function public.gig_step_summary(uuid) to authenticated;
