-- "Not enough stock" holds when two people move the same bulk item at the same moment.
-- Before, two sales from one location could both read the same level (say 10), both pass the
-- check (8 ≤ 10 each) and leave the location at -6. Now the check locks the item's stored totals
-- for the locations involved (stock_totals, 20261207000000) before reading the level, so a second
-- movement waits until the first is saved and then sees the lower number. The locks are taken in
-- one fixed order (by location), so two opposite transfers (A→B and B→A) can't block each other.
--
-- Same function as in 20261025000000_inventory_catalogue.sql; only the level check changed.
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
    -- Hold the totals this movement will change, in location order, then read the level fresh
    perform 1 from public.stock_totals t
      where t.org_id = new.org_id and t.item_id = new.item_id
        and t.location_id in (new.from_location_id, new.to_location_id)
      order by t.location_id
      for update;
    select coalesce((select t.quantity from public.stock_totals t
                     where t.org_id = new.org_id and t.item_id = new.item_id and t.location_id = new.from_location_id), 0)
      into v_level;
    if v_level < new.quantity then
      raise exception 'Not enough stock at that location (% available)', v_level using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.stock_movements_before() from public, anon, authenticated;
