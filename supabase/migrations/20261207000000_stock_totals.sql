-- Stock totals stored, not added up each time (docs/PENDING.md D18).
-- stock_levels used to add up every stock movement ever recorded, each time Inventory opened, each
-- availability check (once per item) and each outgoing bulk movement (private.bulk_level). Now
-- the database keeps a running total per item and location in stock_totals, updated by triggers
-- on stock_movements and stock_units; stock_levels reads that table, with the same columns and
-- the same numbers, so nothing that reads it changes.
--
-- What counts, exactly as before: bulk movements (unit_id null) add their quantity at
-- to_location and take it from from_location; each unit that is available or in repair counts 1
-- at its location (in_repair 1 if in repair). Rows that reach 0 stay in the table and are left
-- out by the view, as the old view left out groups that added up to 0.
--
-- Movements are only ever added, and units are never removed by people, but the import undo
-- (hand-run) and removing an organisation do remove rows, so the triggers handle that too. Those
-- removals only lower existing totals (an update, never a new row), so removing an organisation
-- can't trip over its own totals being removed at the same time.

-- ── The totals ───────────────────────────────────────────────────────────────
create table if not exists public.stock_totals (
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id) on delete cascade,
  location_id uuid references public.stock_locations(id) on delete cascade, -- null = no location
  quantity integer not null default 0,
  in_repair integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint stock_totals_key unique nulls not distinct (org_id, item_id, location_id)
);
-- Availability checks look items up without the organisation
create index if not exists stock_totals_item_idx on public.stock_totals (item_id);

alter table public.stock_totals enable row level security;
create policy stock_totals_select on public.stock_totals for select to authenticated using (private.can_quote(org_id));
create policy mfa_required on public.stock_totals as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Read only for people; only the triggers below write it
revoke all on public.stock_totals from anon, authenticated;
grant select on public.stock_totals to authenticated;

-- Changes one total by a signed amount. p_create: a new row may be made (stock arriving);
-- false when stock is being taken back out of the totals (a row removed), which only lowers a
-- total that already exists.
create or replace function private.stock_totals_bump(p_org uuid, p_item uuid, p_location uuid,
  p_quantity integer, p_in_repair integer, p_create boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_create then
    insert into public.stock_totals as t (org_id, item_id, location_id, quantity, in_repair)
    values (p_org, p_item, p_location, p_quantity, p_in_repair)
    on conflict on constraint stock_totals_key do update
      set quantity = t.quantity + excluded.quantity, in_repair = t.in_repair + excluded.in_repair, updated_at = now();
  else
    update public.stock_totals t
       set quantity = t.quantity + p_quantity, in_repair = t.in_repair + p_in_repair, updated_at = now()
     where t.org_id = p_org and t.item_id = p_item and t.location_id is not distinct from p_location;
  end if;
end $$;
revoke execute on function private.stock_totals_bump(uuid, uuid, uuid, integer, integer, boolean) from public, anon, authenticated;

-- Bulk movements (unit history rows don't count: the unit itself does)
create or replace function private.stock_movements_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.unit_id is null then
    if old.to_location_id is not null then
      perform private.stock_totals_bump(old.org_id, old.item_id, old.to_location_id, -old.quantity, 0, false);
    end if;
    if old.from_location_id is not null then
      perform private.stock_totals_bump(old.org_id, old.item_id, old.from_location_id, old.quantity, 0, false);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.unit_id is null then
    if new.to_location_id is not null then
      perform private.stock_totals_bump(new.org_id, new.item_id, new.to_location_id, new.quantity, 0, true);
    end if;
    if new.from_location_id is not null then
      perform private.stock_totals_bump(new.org_id, new.item_id, new.from_location_id, -new.quantity, 0, true);
    end if;
  end if;
  return null;
end $$;
revoke execute on function private.stock_movements_totals() from public, anon, authenticated;

-- Units: available or in repair counts 1 at its location
create or replace function private.stock_units_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status in ('available', 'repair') then
    perform private.stock_totals_bump(old.org_id, old.item_id, old.location_id, -1, -(old.status = 'repair')::integer, false);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status in ('available', 'repair') then
    perform private.stock_totals_bump(new.org_id, new.item_id, new.location_id, 1, (new.status = 'repair')::integer, true);
  end if;
  return null;
end $$;
revoke execute on function private.stock_units_totals() from public, anon, authenticated;

-- ── Switch over (no stock can move while this runs) ─────────────────────────
lock table public.stock_movements, public.stock_units in share row exclusive mode;

-- Today's totals, from the full history, once (the same sums the old view made)
insert into public.stock_totals (org_id, item_id, location_id, quantity, in_repair)
select s.org_id, s.item_id, s.location_id, sum(s.qty)::integer, sum(s.in_repair)::integer
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
on conflict on constraint stock_totals_key do nothing;

create or replace trigger stock_movements_totals after insert or update or delete on public.stock_movements
  for each row execute function private.stock_movements_totals();
create or replace trigger stock_units_totals after insert or update of status, location_id or delete on public.stock_units
  for each row execute function private.stock_units_totals();

-- Same name, columns and numbers as before; runs with the reader's rights
create or replace view public.stock_levels with (security_invoker = on) as
  select t.org_id, t.item_id, t.location_id, t.quantity, t.in_repair
  from public.stock_totals t
  where t.quantity <> 0;

-- "Not enough stock at that location": read the stored total instead of the item's whole
-- history. Only called for bulk items, whose totals are their bulk stock (an item's tracking
-- can't change once it has stock).
create or replace function private.bulk_level(p_item uuid, p_location uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select t.quantity from public.stock_totals t
                   where t.item_id = p_item and t.location_id = p_location), 0)::integer
$$;
revoke execute on function private.bulk_level(uuid, uuid) from public, anon, authenticated;
