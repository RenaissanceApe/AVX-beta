-- Inventory phase I1: catalogue and stock (docs/INVENTORY.md).
-- 1. The price list becomes the catalogue: rental and sale items can be stock-tracked,
--    in bulk (counted, e.g. cables) or by serial number (each unit on its own).
-- 2. Stock locations: warehouses, vans, sites.
-- 3. Serial-numbered units with purchase details, status and a QR code.
-- 4. A stock ledger that is only ever added to: purchases, sales, losses, finds,
--    corrections (counts) and transfers. Units write their own history.
-- 5. stock_levels: what is where, worked out from the ledger and the units.
-- Admins and members manage inventory (like quotes); viewers and crew don't see it yet.
-- Written without destructive statements so it applies without manual confirmation.

-- Short random codes for labels, e.g. U-7KQ2M9XA (no 0/O/1/I to avoid misreading)
create or replace function private.short_code(p_prefix text) returns text
language sql volatile set search_path = '' as $$
  select p_prefix || '-' || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(r.b, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) as i
$$;
revoke execute on function private.short_code(text) from public, anon, authenticated;

-- ── Catalogue (the price list, with stock fields) ────────────────────────────
alter table public.price_items add column if not exists tracking text not null default 'none';
alter table public.price_items add column if not exists code text;
alter table public.price_items add column if not exists brand text;
alter table public.price_items add column if not exists model text;
alter table public.price_items add column if not exists weight_kg numeric(10,3);
alter table public.price_items add column if not exists power_w integer;
alter table public.price_items add column if not exists dimensions text;
alter table public.price_items add column if not exists replacement_value numeric(12,2);
alter table public.price_items add column if not exists min_stock integer;
alter table public.price_items add column if not exists packing_note text;
alter table public.price_items add column if not exists archived_at timestamptz;
alter table public.price_items add constraint price_items_inventory_check check (
  tracking in ('none', 'bulk', 'serial')
  and (code is null or code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$')
  and char_length(coalesce(brand, '')) <= 80 and char_length(coalesce(model, '')) <= 80
  and char_length(coalesce(dimensions, '')) <= 80 and char_length(coalesce(packing_note, '')) <= 500
  and (weight_kg is null or weight_kg >= 0) and (power_w is null or power_w >= 0)
  and (replacement_value is null or replacement_value >= 0) and (min_stock is null or min_stock >= 0));
create unique index if not exists price_items_code_uniq on public.price_items (org_id, upper(code)) where code is not null;

-- ── Locations ────────────────────────────────────────────────────────────────
create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  kind text not null default 'warehouse' check (kind in ('warehouse', 'vehicle', 'site', 'other')),
  address text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint stock_locations_text_check check (char_length(trim(name)) between 1 and 100
    and char_length(coalesce(address, '')) <= 300 and char_length(coalesce(notes, '')) <= 500)
);
create unique index if not exists stock_locations_name_uniq on public.stock_locations (org_id, lower(name)) where archived_at is null;
alter table public.stock_locations enable row level security;
create policy stock_locations_select on public.stock_locations for select to authenticated using (private.can_quote(org_id));
create policy stock_locations_insert on public.stock_locations for insert to authenticated with check (private.can_quote(org_id));
create policy stock_locations_update on public.stock_locations for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.stock_locations as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete: locations are archived, so history keeps making sense

-- ── Serial-numbered units ────────────────────────────────────────────────────
create table if not exists public.stock_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  code text not null,
  serial text,
  location_id uuid references public.stock_locations(id),
  status text not null default 'available' check (status in ('available', 'repair', 'lost', 'retired')),
  purchase_date date,
  purchase_cost numeric(12,2) check (purchase_cost is null or purchase_cost >= 0),
  depreciation_months integer check (depreciation_months is null or depreciation_months between 1 and 600),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_units_text_check check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'
    and char_length(coalesce(serial, '')) <= 80 and char_length(coalesce(notes, '')) <= 500)
);
create unique index if not exists stock_units_code_uniq on public.stock_units (org_id, upper(code));
create unique index if not exists stock_units_serial_uniq on public.stock_units (item_id, upper(serial)) where serial is not null;
create index if not exists stock_units_item_idx on public.stock_units (item_id, status);
alter table public.stock_units enable row level security;
create policy stock_units_select on public.stock_units for select to authenticated using (private.can_quote(org_id));
create policy stock_units_insert on public.stock_units for insert to authenticated with check (private.can_quote(org_id));
create policy stock_units_update on public.stock_units for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.stock_units as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete: units are retired or marked lost, never removed

-- ── Stock ledger ─────────────────────────────────────────────────────────────
-- Bulk items: each row moves a quantity into (to_location) and/or out of (from_location)
-- a location. Units: rows are written by the database when a unit is added, moved or
-- changes status, as their history.
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  unit_id uuid references public.stock_units(id),
  kind text not null check (kind in ('purchase', 'sale', 'lost', 'found', 'correction', 'transfer', 'retire', 'repair', 'repaired')),
  quantity integer not null check (quantity between 1 and 100000),
  from_location_id uuid references public.stock_locations(id),
  to_location_id uuid references public.stock_locations(id),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_locations_check check (from_location_id is null or from_location_id is distinct from to_location_id)
);
create index if not exists stock_movements_item_idx on public.stock_movements (item_id, created_at desc);
create index if not exists stock_movements_org_idx on public.stock_movements (org_id, created_at desc);
alter table public.stock_movements enable row level security;
create policy stock_movements_select on public.stock_movements for select to authenticated using (private.can_quote(org_id));
-- People record bulk movements; unit history comes from the database only
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (private.can_quote(org_id) and unit_id is null);
create policy mfa_required on public.stock_movements as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No update or delete: mistakes are fixed with a correction, so the history stays true

-- Bulk stock of an item at a location, from the ledger
create or replace function private.bulk_level(p_item uuid, p_location uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (coalesce(sum(m.quantity) filter (where m.to_location_id = p_location), 0)
        - coalesce(sum(m.quantity) filter (where m.from_location_id = p_location), 0))::integer
  from public.stock_movements m where m.item_id = p_item and m.unit_id is null
$$;
revoke execute on function private.bulk_level(uuid, uuid) from public, anon, authenticated;

-- A location must belong to the same organisation (and new stock can't go to an archived one)
create or replace function private.check_location(p_org uuid, p_location uuid, p_incoming boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_location is null then return; end if;
  if not exists (select 1 from public.stock_locations l where l.id = p_location and l.org_id = p_org
                 and (not p_incoming or l.archived_at is null)) then
    raise exception 'Unknown or archived location' using errcode = '23514';
  end if;
end $$;
revoke execute on function private.check_location(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function private.stock_movements_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record; v_level integer;
begin
  select i.org_id, i.tracking into v_item from public.price_items i where i.id = new.item_id;
  if not found then raise exception 'Unknown item' using errcode = '23503'; end if;
  new.org_id := v_item.org_id;
  new.created_at := now();
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  if new.unit_id is not null then return new; end if; -- unit history, written by the units trigger

  if v_item.tracking <> 'bulk' then
    raise exception 'Stock for this item is kept per unit' using errcode = '23514';
  end if;
  if not (
    (new.kind in ('purchase', 'found') and new.to_location_id is not null and new.from_location_id is null)
    or (new.kind in ('sale', 'lost', 'retire') and new.from_location_id is not null and new.to_location_id is null)
    or (new.kind = 'transfer' and new.from_location_id is not null and new.to_location_id is not null)
    or (new.kind = 'correction' and (new.from_location_id is null) <> (new.to_location_id is null))
  ) then
    raise exception 'Invalid stock movement' using errcode = '23514';
  end if;
  perform private.check_location(new.org_id, new.to_location_id, true);
  perform private.check_location(new.org_id, new.from_location_id, false);
  if new.from_location_id is not null then
    v_level := private.bulk_level(new.item_id, new.from_location_id);
    if v_level < new.quantity then
      raise exception 'Not enough stock at that location (% available)', v_level using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create or replace trigger stock_movements_before before insert on public.stock_movements
  for each row execute function private.stock_movements_before();

-- Units: belong to their item's organisation, keep their item, and log their history
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
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    perform private.check_location(new.org_id, new.location_id, true);
  else
    new.id := old.id; new.org_id := old.org_id; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.location_id is distinct from old.location_id then
      perform private.check_location(new.org_id, new.location_id, true);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger stock_units_before before insert or update on public.stock_units
  for each row execute function private.stock_units_before();

create or replace function private.stock_units_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stock_movements (org_id, item_id, unit_id, kind, quantity, to_location_id)
    values (new.org_id, new.item_id, new.id, 'purchase', 1, new.location_id);
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.stock_movements (org_id, item_id, unit_id, kind, quantity, from_location_id, to_location_id)
    values (new.org_id, new.item_id, new.id,
            case
              when new.status = 'repair' then 'repair'
              when new.status = 'lost' then 'lost'
              when new.status = 'retired' then 'retire'
              when old.status = 'repair' then 'repaired'
              else 'found'
            end, 1,
            case when new.status in ('lost', 'retired') then old.location_id end,
            case when new.status = 'available' and old.status in ('lost', 'retired') then new.location_id end);
  end if;
  if new.location_id is distinct from old.location_id and new.status not in ('lost', 'retired')
     and old.status not in ('lost', 'retired') then -- a found unit's new place is on the 'found' row
    insert into public.stock_movements (org_id, item_id, unit_id, kind, quantity, from_location_id, to_location_id)
    values (new.org_id, new.item_id, new.id, 'transfer', 1, old.location_id, new.location_id);
  end if;
  return null;
end $$;
create or replace trigger stock_units_history after insert or update on public.stock_units
  for each row execute function private.stock_units_history();

-- Catalogue rules: stock only for rental/sale items; a label code once tracked;
-- the way stock is kept can't change once there is stock
create or replace function private.price_items_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tracking <> 'none' and new.kind not in ('rental', 'sale') then
    raise exception 'Only rental or sale items can have stock' using errcode = '23514';
  end if;
  new.code := nullif(trim(new.code), '');
  if new.tracking <> 'none' and new.code is null then new.code := private.short_code('I'); end if;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    if new.tracking is distinct from old.tracking
       and (exists (select 1 from public.stock_movements m where m.item_id = old.id)
            or exists (select 1 from public.stock_units u where u.item_id = old.id)) then
      raise exception 'Stock tracking can''t change once the item has stock' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create or replace trigger price_items_inventory before insert or update on public.price_items
  for each row execute function private.price_items_inventory();

revoke execute on function private.stock_movements_before() from public, anon, authenticated;
revoke execute on function private.stock_units_before() from public, anon, authenticated;
revoke execute on function private.stock_units_history() from public, anon, authenticated;
revoke execute on function private.price_items_inventory() from public, anon, authenticated;

-- ── What is where ────────────────────────────────────────────────────────────
-- quantity: owned and present (units available or in repair); in_repair: of those, in repair.
-- location_id null = units without a location. Runs with the reader's rights.
create or replace view public.stock_levels with (security_invoker = on) as
  select s.org_id, s.item_id, s.location_id, sum(s.qty)::integer as quantity, sum(s.in_repair)::integer as in_repair
  from (
    select m.org_id, m.item_id, m.to_location_id as location_id, m.quantity as qty, 0 as in_repair
      from public.stock_movements m where m.unit_id is null and m.to_location_id is not null
    union all
    select m.org_id, m.item_id, m.from_location_id, -m.quantity, 0
      from public.stock_movements m where m.unit_id is null and m.from_location_id is not null
    union all
    select u.org_id, u.item_id, u.location_id, 1, (u.status = 'repair')::integer
      from public.stock_units u where u.status in ('available', 'repair')
  ) s
  group by s.org_id, s.item_id, s.location_id
  having sum(s.qty) <> 0;
revoke all on public.stock_levels from anon;
grant select on public.stock_levels to authenticated;

-- Scanning a label: find the item or unit with that code in your organisations
create or replace function public.find_stock_code(p_code text)
returns table(org_id uuid, item_id uuid, unit_id uuid)
language sql stable security invoker set search_path = '' as $$
  select u.org_id, u.item_id, u.id from public.stock_units u where upper(u.code) = upper(trim(p_code))
  union all
  select i.org_id, i.id, null from public.price_items i where upper(i.code) = upper(trim(p_code))
  limit 10
$$;
revoke execute on function public.find_stock_code(text) from public, anon;
grant execute on function public.find_stock_code(text) to authenticated;
