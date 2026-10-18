-- Inventory phase I4: kits (docs/INVENTORY.md).
-- 1. Sets (a planning shortcut, not stock) and cases (fixed contents that travel together):
--    price_items.kit_type, with their contents in item_parts.
-- 2. Accessories: items that come along with another item when it is planned (item_parts).
-- 3. Alternatives: items that can stand in for each other when one is short.
-- 4. Units packed in a case unit (stock_units.case_unit_id); scanning the case scans them too.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Sets and cases ───────────────────────────────────────────────────────────
alter table public.price_items add column if not exists kit_type text;
alter table public.price_items add constraint price_items_kit_check check (
  kit_type is null
  or (kit_type = 'set' and tracking = 'none')
  or (kit_type = 'case' and tracking <> 'none'));

create table if not exists public.item_parts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  parent_id uuid not null references public.price_items(id) on delete cascade,
  child_id uuid not null references public.price_items(id) on delete cascade,
  kind text not null check (kind in ('content', 'accessory')),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (parent_id, child_id, kind),
  check (parent_id <> child_id)
);
create index if not exists item_parts_org_idx on public.item_parts (org_id);
create index if not exists item_parts_child_idx on public.item_parts (child_id);
alter table public.item_parts enable row level security;
create policy item_parts_select on public.item_parts for select to authenticated using (private.can_quote(org_id));
create policy item_parts_insert on public.item_parts for insert to authenticated with check (private.can_quote(org_id));
create policy item_parts_update on public.item_parts for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy item_parts_delete on public.item_parts for delete to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.item_parts as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Whether p_to can be reached from p_from through contents and accessories
create or replace function private.part_reaches(p_from uuid, p_to uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive walk(id, depth) as (
    select p_from, 0
    union
    select p.child_id, w.depth + 1 from walk w join public.item_parts p on p.parent_id = w.id where w.depth < 20
  )
  select exists (select 1 from walk where id = p_to)
$$;
revoke execute on function private.part_reaches(uuid, uuid) from public, anon, authenticated;

-- Contents belong to sets and cases; accessories to stock-tracked items. What goes in is
-- stock-tracked, or a set inside a set. Nothing may contain itself, however indirectly.
create or replace function private.item_parts_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_parent record; v_child record;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.parent_id := old.parent_id;
    new.child_id := old.child_id; new.kind := old.kind; new.created_at := old.created_at;
    return new;
  end if;
  select i.org_id, i.tracking, i.kit_type, i.archived_at into v_parent from public.price_items i where i.id = new.parent_id;
  select i.org_id, i.tracking, i.kit_type, i.archived_at into v_child from public.price_items i where i.id = new.child_id;
  if v_parent.org_id is null or v_child.org_id is distinct from v_parent.org_id then
    raise exception 'Both items must be in the same inventory' using errcode = '23514';
  end if;
  if new.kind = 'content' and v_parent.kit_type is null then
    raise exception 'Only sets and cases have contents' using errcode = '23514';
  end if;
  if new.kind = 'accessory' and (v_parent.tracking = 'none' or v_parent.kit_type is not null) then
    raise exception 'Accessories belong to stock-tracked items' using errcode = '23514';
  end if;
  if not (v_child.tracking <> 'none' or (new.kind = 'content' and coalesce(v_child.kit_type, '') = 'set' and coalesce(v_parent.kit_type, '') = 'set')) then
    raise exception 'Only stock-tracked items can be part of a kit' using errcode = '23514';
  end if;
  if private.part_reaches(new.child_id, new.parent_id) then
    raise exception 'An item can''t contain itself' using errcode = '23514';
  end if;
  new.org_id := v_parent.org_id;
  new.created_at := now();
  return new;
end $$;
create or replace trigger item_parts_before before insert or update on public.item_parts
  for each row execute function private.item_parts_before();

-- ── Alternatives (both ways round: one row per pair) ─────────────────────────
create table if not exists public.item_alternatives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_a uuid not null references public.price_items(id) on delete cascade,
  item_b uuid not null references public.price_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_a, item_b),
  check (item_a < item_b)
);
create index if not exists item_alternatives_b_idx on public.item_alternatives (item_b);
create index if not exists item_alternatives_org_idx on public.item_alternatives (org_id);
alter table public.item_alternatives enable row level security;
create policy item_alternatives_select on public.item_alternatives for select to authenticated using (private.can_quote(org_id));
create policy item_alternatives_insert on public.item_alternatives for insert to authenticated with check (private.can_quote(org_id));
create policy item_alternatives_delete on public.item_alternatives for delete to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.item_alternatives as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create or replace function private.item_alternatives_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_a record; v_b record; v_swap uuid;
begin
  if new.item_a > new.item_b then v_swap := new.item_a; new.item_a := new.item_b; new.item_b := v_swap; end if;
  select i.org_id, i.tracking into v_a from public.price_items i where i.id = new.item_a;
  select i.org_id, i.tracking into v_b from public.price_items i where i.id = new.item_b;
  if v_a.org_id is null or v_b.org_id is distinct from v_a.org_id then
    raise exception 'Both items must be in the same inventory' using errcode = '23514';
  end if;
  if v_a.tracking = 'none' or v_b.tracking = 'none' then
    raise exception 'Only stock-tracked items can be alternatives' using errcode = '23514';
  end if;
  new.org_id := v_a.org_id;
  new.created_at := now();
  return new;
end $$;
create or replace trigger item_alternatives_before before insert on public.item_alternatives
  for each row execute function private.item_alternatives_before();

-- An item stays a set or case while it has contents or packed units
create or replace function private.price_items_kits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kit_type is distinct from old.kit_type then
    if exists (select 1 from public.item_parts p where p.parent_id = old.id and p.kind = 'content') then
      raise exception 'Remove its contents first' using errcode = '23514';
    end if;
    if exists (select 1 from public.stock_units c join public.stock_units u on u.case_unit_id = c.id where c.item_id = old.id) then
      raise exception 'Unpack its cases first' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create or replace trigger price_items_kits before update of kit_type on public.price_items
  for each row execute function private.price_items_kits();

-- ── Units packed in a case ───────────────────────────────────────────────────
alter table public.stock_units add column if not exists case_unit_id uuid references public.stock_units(id) on delete set null;
create index if not exists stock_units_case_idx on public.stock_units (case_unit_id) where case_unit_id is not null;

create or replace function private.stock_units_case() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_case record; v_kit text;
begin
  if new.case_unit_id is null then return new; end if;
  select u.org_id, u.case_unit_id, u.status, i.kit_type into v_case
    from public.stock_units u join public.price_items i on i.id = u.item_id where u.id = new.case_unit_id;
  select i.kit_type into v_kit from public.price_items i where i.id = new.item_id;
  if v_case.org_id is distinct from new.org_id or v_case.kit_type is distinct from 'case' then
    raise exception 'Units can only be packed in a case' using errcode = '23514';
  end if;
  if new.case_unit_id = new.id or coalesce(v_kit, '') = 'case' then
    raise exception 'A case can''t be packed in a case' using errcode = '23514';
  end if;
  return new;
end $$;
create or replace trigger stock_units_case before insert or update of case_unit_id on public.stock_units
  for each row execute function private.stock_units_case();

-- ── Scanning a case scans what's packed in it ────────────────────────────────
-- Units packed in the case unit move with it (those available and not out elsewhere; the
-- rest are counted as skipped), and so do the case item's bulk contents.
create or replace function private.dispatch_case_contents(p_gig uuid, p_case uuid, p_direction text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_item uuid; v_moved integer := 0; v_skipped integer := 0; n integer;
begin
  select u.org_id, u.item_id into v_org, v_item from public.stock_units u where u.id = p_case;
  perform set_config('avx.dispatch', 'on', true);
  if p_direction = 'out' then
    with moved as (
      update public.stock_units set out_on_gig = p_gig, out_since = now()
       where case_unit_id = p_case and status = 'available' and out_on_gig is null
      returning id, item_id
    ), logged as (
      insert into public.gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity)
      select p_gig, v_org, m.item_id, m.id, 'out', 1 from moved m returning 1
    ) select count(*) into v_moved from logged;
    select count(*) into v_skipped from public.stock_units
     where case_unit_id = p_case and status <> 'retired' and out_on_gig is distinct from p_gig;
  else
    with moved as (
      update public.stock_units set out_on_gig = null, out_since = null
       where case_unit_id = p_case and out_on_gig = p_gig
      returning id, item_id
    ), logged as (
      insert into public.gig_dispatch (gig_id, org_id, item_id, unit_id, direction, quantity)
      select p_gig, v_org, m.item_id, m.id, 'in', 1 from moved m returning 1
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

create or replace function public.dispatch_scan(p_gig uuid, p_code text, p_direction text, p_quantity integer default 1,
                                                p_condition text default 'ok', p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb; v_case uuid; c jsonb;
begin
  perform private.require_mfa();
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
  return r;
end $$;

revoke execute on function private.item_parts_before() from public, anon, authenticated;
revoke execute on function private.item_alternatives_before() from public, anon, authenticated;
revoke execute on function private.price_items_kits() from public, anon, authenticated;
revoke execute on function private.stock_units_case() from public, anon, authenticated;
revoke execute on function public.dispatch_scan(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.dispatch_scan(uuid, text, text, integer, text, text) to authenticated;
