-- Inventory phase I3: warehouse (docs/INVENTORY.md).
-- 1. Scanning equipment out to a gig and back in (gig_dispatch, a log that is only added to).
--    Serial-numbered units remember which gig they're out on; bulk items are counted.
-- 2. A gig's dispatch summary (planned / out / back) and the units still out.
-- 3. Units still out after a gig can be marked lost in one go.
-- 4. Lines on a gig carry the item's packing note, for packing lists crew can read.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Units out on a gig ───────────────────────────────────────────────────────
alter table public.stock_units add column if not exists out_on_gig uuid references public.gigs(id) on delete set null;
alter table public.stock_units add column if not exists out_since timestamptz;
create index if not exists stock_units_out_idx on public.stock_units (out_on_gig) where out_on_gig is not null;

-- Same rules as before, plus: only scanning (dispatch_scan) moves a unit out or in, and a
-- unit marked lost or retired is no longer out on a gig
create or replace function private.stock_units_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record;
begin
  if tg_op = 'INSERT' then
    select i.org_id, i.tracking into v_item from public.price_items i where i.id = new.item_id;
    if not found then raise exception 'Unknown item' using errcode = '23503'; end if;
    if v_item.tracking <> 'serial' then
      raise exception 'This item is counted in bulk, not per unit' using errcode = '23514';
    end if;
    new.org_id := v_item.org_id;
    new.code := coalesce(nullif(trim(new.code), ''), private.short_code('U'));
    new.created_at := now();
    new.out_on_gig := null; new.out_since := null;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    perform private.check_location(new.org_id, new.location_id, true);
  else
    new.id := old.id; new.org_id := old.org_id; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if coalesce(current_setting('avx.dispatch', true), '') <> 'on' then
      new.out_on_gig := old.out_on_gig; new.out_since := old.out_since;
    end if;
    if new.location_id is distinct from old.location_id then
      perform private.check_location(new.org_id, new.location_id, true);
    end if;
  end if;
  if new.status in ('lost', 'retired') then new.out_on_gig := null; new.out_since := null; end if;
  new.updated_at := now();
  return new;
end $$;

-- ── Packing notes travel with the line ───────────────────────────────────────
alter table public.gig_equipment add column if not exists packing_note text;
create or replace function private.gig_equipment_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record; v_org uuid;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.gig_id := old.gig_id; new.org_id := old.org_id; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
  else
    select g.org_id into v_org from public.gigs g where g.id = new.gig_id;
    select i.org_id, i.name, i.category, i.tracking, i.kind into v_item from public.price_items i where i.id = new.item_id;
    if v_org is null or v_item.org_id is distinct from v_org then
      raise exception 'Item not in this organisation''s inventory' using errcode = '23514';
    end if;
    if v_item.tracking = 'none' or v_item.kind not in ('rental', 'sale') then
      raise exception 'Only stock-tracked items can be planned' using errcode = '23514';
    end if;
    new.org_id := v_org;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  -- The name, category and packing note travel with the line, so crew see them without the catalogue
  select i.name, i.category, i.packing_note into new.item_name, new.category, new.packing_note
    from public.price_items i where i.id = new.item_id;
  new.updated_at := now();
  return new;
end $$;
update public.gig_equipment e set packing_note = i.packing_note from public.price_items i
 where i.id = e.item_id and i.packing_note is not null and e.packing_note is null;

-- ── Dispatch log ─────────────────────────────────────────────────────────────
create table if not exists public.gig_dispatch (
  id bigint generated always as identity primary key,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  unit_id uuid references public.stock_units(id),
  direction text not null check (direction in ('out', 'in')),
  quantity integer not null check (quantity between 1 and 100000),
  condition text not null default 'ok' check (condition in ('ok', 'damaged')),
  note text check (char_length(coalesce(note, '')) <= 500),
  scanned_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists gig_dispatch_gig_idx on public.gig_dispatch (gig_id, created_at desc);
alter table public.gig_dispatch enable row level security;
create policy gig_dispatch_select on public.gig_dispatch for select to authenticated
  using (private.can_access_gig(gig_id) or private.can_quote(org_id));
create policy mfa_required on public.gig_dispatch as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No insert, update or delete rules: rows are written by dispatch_scan only

-- Who may scan for a gig: its managers and the organisation's admins and members
create or replace function private.can_dispatch(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_gig(p_gig) or private.can_quote((select g.org_id from public.gigs g where g.id = p_gig))
$$;
revoke execute on function private.can_dispatch(uuid) from public, anon, authenticated;

-- Planned / out / back for one item on a gig
create or replace function private.dispatch_counts(p_gig uuid, p_item uuid, out planned integer, out out_qty integer, out back_qty integer)
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.quantity from public.gig_equipment e where e.gig_id = p_gig and e.item_id = p_item), 0),
         coalesce((select sum(d.quantity) from public.gig_dispatch d where d.gig_id = p_gig and d.item_id = p_item and d.direction = 'out'), 0)::integer,
         coalesce((select sum(d.quantity) from public.gig_dispatch d where d.gig_id = p_gig and d.item_id = p_item and d.direction = 'in'), 0)::integer
$$;
revoke execute on function private.dispatch_counts(uuid, uuid) from public, anon, authenticated;

-- One scan. The code is a unit's (serial-numbered) or an item's (counted in bulk, with a
-- quantity). Returns what happened; warnings never stop a scan that reflects reality,
-- but impossible ones (already out, not out) record nothing.
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
    insert into public.gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity, condition, note)
    values (p_gig, v_org, v_item.id, v_unit.id, p_direction, 1, coalesce(p_condition, 'ok'), v_note);
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
create or replace function public.dispatch_scan(p_gig uuid, p_code text, p_direction text, p_quantity integer default 1,
                                                p_condition text default 'ok', p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.dispatch_scan_unchecked(p_gig, p_code, p_direction, p_quantity, p_condition, p_note);
end $$;

-- Planned / out / back per item, for everyone on the gig (packing lists, the scan screen)
create or replace function private.gig_dispatch_summary_unchecked(p_gig uuid)
returns table(item_id uuid, item_name text, category text, tracking text, packing_note text, planned integer, out_qty integer, back_qty integer)
language sql stable security definer set search_path = '' as $$
  with ids as (
    select e.item_id from public.gig_equipment e where e.gig_id = p_gig
    union select d.item_id from public.gig_dispatch d where d.gig_id = p_gig
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
create or replace function public.gig_dispatch_summary(p_gig uuid)
returns table(item_id uuid, item_name text, category text, tracking text, packing_note text, planned integer, out_qty integer, back_qty integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_dispatch_summary_unchecked(p_gig);
end $$;

-- Units still out on a gig
create or replace function private.gig_units_out_unchecked(p_gig uuid)
returns table(unit_id uuid, item_id uuid, item_name text, code text, serial text, out_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.item_id, i.name, u.code, u.serial, u.out_since
  from public.stock_units u join public.price_items i on i.id = u.item_id
  where u.out_on_gig = p_gig and (private.can_access_gig(p_gig) or private.can_dispatch(p_gig))
  order by i.name, u.code
$$;
create or replace function public.gig_units_out(p_gig uuid)
returns table(unit_id uuid, item_id uuid, item_name text, code text, serial text, out_since timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_units_out_unchecked(p_gig);
end $$;

-- After a gig: units that never came back are marked lost (their history records it)
create or replace function private.mark_units_lost_unchecked(p_gig uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if not private.can_dispatch(p_gig) then
    raise exception 'Not allowed for this gig' using errcode = '42501';
  end if;
  update public.stock_units set status = 'lost' where out_on_gig = p_gig;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.mark_units_lost(p_gig uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.mark_units_lost_unchecked(p_gig);
end $$;

revoke execute on function private.dispatch_scan_unchecked(uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function private.gig_dispatch_summary_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.gig_units_out_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.mark_units_lost_unchecked(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_scan(uuid, text, text, integer, text, text) from public, anon;
revoke execute on function public.gig_dispatch_summary(uuid) from public, anon;
revoke execute on function public.gig_units_out(uuid) from public, anon;
revoke execute on function public.mark_units_lost(uuid) from public, anon;
grant execute on function public.dispatch_scan(uuid, text, text, integer, text, text) to authenticated;
grant execute on function public.gig_dispatch_summary(uuid) to authenticated;
grant execute on function public.gig_units_out(uuid) to authenticated;
grant execute on function public.mark_units_lost(uuid) to authenticated;
