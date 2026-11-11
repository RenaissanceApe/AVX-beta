-- Step 23, part V3: the packing list per vehicle (docs/BUSINESS.md, "How the packing list per
-- vehicle works").
-- - price_items.volume_m3: an item's volume next to its weight (empty = unknown, never zero).
-- - vehicle_loads: how many of each item on a gig's list ride in which outward trip's vehicle.
--   A case counts whole (its contents ride with it). Seen by everyone on the gig and whoever may
--   scan gear out; changed only through set_vehicle_loads by the people who plan transport.
--   Taking something off a vehicle sets its quantity to 0: rows are never removed.
-- - gig_load_plan: what the page and the scan-out filter need, in one read (weights and volumes
--   come from the catalogue, which crew can't read directly).
-- Only adds: add column / create table / create index if not exists, create or replace.
-- No trigger on the new table, so nothing here can stand in the way of account closing:
-- updated_by just goes empty when an account closes (the foreign key sets it to null).

-- ── Volume per item ──────────────────────────────────────────────────────────
alter table public.price_items add column if not exists volume_m3 numeric(8,3)
  check (volume_m3 is null or volume_m3 between 0 and 1000);

-- ── Loads ────────────────────────────────────────────────────────────────────
create table if not exists public.vehicle_loads (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade,   -- the gig's
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_id uuid not null references public.price_items(id) on delete cascade,
  quantity integer not null default 0 check (quantity between 0 and 100000),  -- 0 = taken off
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (trip_id, item_id)
);
create index if not exists vehicle_loads_gig_idx on public.vehicle_loads (gig_id);
create index if not exists vehicle_loads_item_idx on public.vehicle_loads (item_id);
alter table public.vehicle_loads enable row level security;
create policy vehicle_loads_select on public.vehicle_loads for select to authenticated
  using (private.can_access_gig(gig_id) or private.can_dispatch(gig_id));
create policy mfa_required on public.vehicle_loads as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.vehicle_loads from authenticated, anon;  -- no write policy either: only set_vehicle_loads writes
grant select on public.vehicle_loads to authenticated;

-- ── Read: trips, lines, case contents and loads ──────────────────────────────
create or replace function public.gig_load_plan(p_gig uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_trips jsonb; v_lines jsonb; v_parts jsonb; v_loads jsonb;
begin
  perform private.require_mfa();
  if not (private.can_access_gig(p_gig) or private.can_dispatch(p_gig)) then return null; end if;
  -- Outward trips with a vehicle; capacity only (no costs), as gig_trips shows it
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'direction', t.direction, 'departs_at', t.departs_at, 'arrives_at', t.arrives_at,
           'from_place', t.from_place, 'to_place', t.to_place, 'vehicle_id', t.vehicle_id,
           'vehicle_name', v.name, 'vehicle_plate', v.plate, 'max_load_kg', v.max_load_kg, 'volume_m3', v.volume_m3)
           order by t.departs_at, t.created_at), '[]'::jsonb)
    into v_trips
    from public.trips t join public.vehicles v on v.id = t.vehicle_id
   where t.gig_id = p_gig and t.removed_at is null and t.direction in ('out', 'one_way');
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', e.item_id, 'item_name', e.item_name, 'category', e.category, 'quantity', e.quantity,
           'kit_type', i.kit_type, 'weight_kg', i.weight_kg, 'volume_m3', i.volume_m3, 'dimensions', i.dimensions)
           order by e.category nulls last, e.item_name), '[]'::jsonb)
    into v_lines
    from public.gig_equipment e join public.price_items i on i.id = e.item_id
   where e.gig_id = p_gig;
  select coalesce(jsonb_agg(jsonb_build_object(
           'case_id', p.parent_id, 'child_id', p.child_id, 'quantity', p.quantity,
           'item_name', c.name, 'weight_kg', c.weight_kg, 'volume_m3', c.volume_m3, 'dimensions', c.dimensions)), '[]'::jsonb)
    into v_parts
    from public.gig_equipment e
    join public.price_items i on i.id = e.item_id and i.kit_type = 'case'
    join public.item_parts p on p.parent_id = e.item_id and p.kind = 'content'
    join public.price_items c on c.id = p.child_id
   where e.gig_id = p_gig;
  select coalesce(jsonb_agg(jsonb_build_object('trip_id', l.trip_id, 'item_id', l.item_id, 'quantity', l.quantity)), '[]'::jsonb)
    into v_loads
    from public.vehicle_loads l join public.trips t on t.id = l.trip_id
   where l.gig_id = p_gig and l.quantity > 0 and t.removed_at is null and t.direction in ('out', 'one_way');
  return jsonb_build_object('trips', v_trips, 'lines', v_lines, 'parts', v_parts, 'loads', v_loads,
                            'can_plan', private.can_plan_transport(p_gig));
end $$;
revoke execute on function public.gig_load_plan(uuid) from public, anon;
grant execute on function public.gig_load_plan(uuid) to authenticated;

-- ── Write: the whole plan at once ────────────────────────────────────────────
-- p_loads: [{ trip_id, item_id, quantity }]. Rows of this gig not in it go to 0.
create or replace function public.set_vehicle_loads(p_gig uuid, p_loads jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; r record; n integer := 0;
begin
  perform private.require_mfa();
  if not private.can_plan_transport(p_gig) then
    raise exception 'Not allowed to plan transport for this gig' using errcode = '42501';
  end if;
  if p_loads is null or jsonb_typeof(p_loads) <> 'array' or jsonb_array_length(p_loads) > 2000 then
    raise exception 'Invalid loads' using errcode = '22023';
  end if;
  select g.org_id into v_org from public.gigs g where g.id = p_gig;

  if exists (select 1 from jsonb_array_elements(p_loads) x where jsonb_typeof(x) <> 'object') then
    raise exception 'Invalid loads' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer)
              where trip_id is null or item_id is null or quantity is null or quantity not between 0 and 100000) then
    raise exception 'Invalid loads' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer)
              group by trip_id, item_id having count(*) > 1) then
    raise exception 'Each item once per trip' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer)
              where l.quantity > 0 and not exists (
               select 1 from public.trips t where t.id = l.trip_id and t.gig_id = p_gig and t.removed_at is null
                  and t.vehicle_id is not null and t.direction in ('out', 'one_way'))) then
    raise exception 'Not an outward trip with a vehicle on this gig' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer)
              where l.quantity > 0 and not exists (
               select 1 from public.gig_equipment e where e.gig_id = p_gig and e.item_id = l.item_id)) then
    raise exception 'Item not on this gig''s list' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer)
              join public.gig_equipment e on e.gig_id = p_gig and e.item_id = l.item_id
              group by l.item_id, e.quantity having sum(l.quantity) > e.quantity) then
    raise exception 'More loaded than planned' using errcode = '22023';
  end if;

  -- Everything of this gig not in the plan is taken off (marked 0, never removed)
  update public.vehicle_loads v set quantity = 0, updated_by = auth.uid(), updated_at = now()
   where v.gig_id = p_gig and v.quantity > 0
     and not exists (select 1 from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer)
                      where l.trip_id = v.trip_id and l.item_id = v.item_id and l.quantity > 0);
  for r in select * from jsonb_to_recordset(p_loads) l(trip_id uuid, item_id uuid, quantity integer) where l.quantity > 0 loop
    insert into public.vehicle_loads (gig_id, org_id, trip_id, item_id, quantity, updated_by, updated_at)
    values (p_gig, v_org, r.trip_id, r.item_id, r.quantity, auth.uid(), now())
    on conflict (trip_id, item_id) do update
      set quantity = excluded.quantity, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      where public.vehicle_loads.quantity is distinct from excluded.quantity;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.set_vehicle_loads(uuid, jsonb) from public, anon;
grant execute on function public.set_vehicle_loads(uuid, jsonb) to authenticated;
