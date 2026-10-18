-- Inventory phase I2: availability (docs/INVENTORY.md).
-- 1. Equipment planned on gigs (gig_equipment), one line per item per gig.
-- 2. Each line is a reservation of the item (resource_type 'equipment') in the engine from
--    Phase 5a, for the gig's days plus the organisation's prep/return days, or for its own
--    dates. Draft gigs hold, archived gigs cancel, like crew.
-- 3. Availability: what you own minus the busiest moment of what is already booked.
-- Written without destructive statements so it applies without manual confirmation.

-- Days equipment leaves before a gig and comes back after it (organisation default)
alter table public.organisations add column if not exists equipment_prep_days integer not null default 0;
alter table public.organisations add column if not exists equipment_return_days integer not null default 0;
alter table public.organisations add constraint organisations_equipment_days_check
  check (equipment_prep_days between 0 and 14 and equipment_return_days between 0 and 14);

create table if not exists public.gig_equipment (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  item_name text not null,
  category text,
  quantity integer not null check (quantity between 1 and 100000),
  planned_from timestamptz,
  planned_until timestamptz,
  notes text check (char_length(coalesce(notes, '')) <= 500),
  source_quote_id uuid references public.quotes(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gig_id, item_id),
  constraint gig_equipment_dates_check check ((planned_from is null) = (planned_until is null)
    and (planned_from is null or planned_until > planned_from))
);
create index if not exists gig_equipment_item_idx on public.gig_equipment (item_id);
alter table public.gig_equipment enable row level security;
-- Everyone on the gig sees what's going. The gig's managers plan it, and so do the
-- organisation's admins and members (the people who run the inventory)
create policy gig_equipment_select on public.gig_equipment for select to authenticated
  using (private.can_access_gig(gig_id) or private.can_quote(org_id));
create policy gig_equipment_insert on public.gig_equipment for insert to authenticated
  with check (private.can_manage_gig(gig_id) or private.can_quote(org_id));
create policy gig_equipment_update on public.gig_equipment for update to authenticated
  using (private.can_manage_gig(gig_id) or private.can_quote(org_id)) with check (private.can_manage_gig(gig_id) or private.can_quote(org_id));
create policy gig_equipment_delete on public.gig_equipment for delete to authenticated
  using (private.can_manage_gig(gig_id) or private.can_quote(org_id));
create policy mfa_required on public.gig_equipment as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Lines belong to the gig's organisation and to one of its stock-tracked items
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
  -- The name and category travel with the line, so crew see them without the catalogue
  select i.name, i.category into new.item_name, new.category from public.price_items i where i.id = new.item_id;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger gig_equipment_before before insert or update on public.gig_equipment
  for each row execute function private.gig_equipment_before();

-- A gig's equipment period: its days, widened by the organisation's prep/return days
create or replace function private.equipment_period(p_gig uuid) returns tstzrange
language sql stable security definer set search_path = '' as $$
  select tstzrange(lower(p.r) - make_interval(days => o.equipment_prep_days),
                   upper(p.r) + make_interval(days => o.equipment_return_days), '[)')
  from (select private.gig_period(p_gig) as r) p
  join public.gigs g on g.id = p_gig
  join public.organisations o on o.id = g.org_id
  where p.r is not null
$$;

create or replace function private.sync_equipment_reservation(p_line uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_line record; v_status text; v_period tstzrange;
begin
  select e.*, g.status as gig_status into v_line
    from public.gig_equipment e join public.gigs g on g.id = e.gig_id where e.id = p_line;
  if not found then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'gig_equipment' and source_id = p_line::text and status <> 'cancelled';
    return;
  end if;
  v_period := case when v_line.planned_from is not null then tstzrange(v_line.planned_from, v_line.planned_until, '[)')
                   else private.equipment_period(v_line.gig_id) end;
  v_status := private.gig_reservation_status(v_line.gig_status);
  if v_period is null then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'gig_equipment' and source_id = p_line::text and status <> 'cancelled';
    return;
  end if;
  insert into public.reservations (resource_type, resource_id, quantity, period, status, org_id, gig_id, source_type, source_id, label)
  values ('equipment', v_line.item_id, v_line.quantity, v_period, v_status, v_line.org_id, v_line.gig_id, 'gig_equipment', p_line::text, v_line.item_name)
  on conflict (source_type, source_id) do update
    set quantity = excluded.quantity, period = excluded.period, status = excluded.status, label = excluded.label, updated_at = now();
end $$;

create or replace function private.gig_equipment_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_equipment_reservation(coalesce(new.id, old.id));
  return null;
end $$;
create or replace trigger reservations_sync after insert or update or delete on public.gig_equipment
  for each row execute function private.gig_equipment_reservations();

-- The gig trigger from Phase 5a now keeps equipment in step too
create or replace function private.gigs_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if (new.start_date, new.end_date, new.status, new.org_id) is distinct from (old.start_date, old.end_date, old.status, old.org_id) then
    for m in select user_id from public.gig_members where gig_id = new.id loop
      perform private.sync_member_reservation(new.id, m.user_id);
    end loop;
    for m in select id from public.gig_equipment where gig_id = new.id loop
      perform private.sync_equipment_reservation(m.id);
    end loop;
  end if;
  return null;
end $$;

-- Changing the prep/return days moves the organisation's upcoming equipment bookings
create or replace function private.organisations_equipment_days() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if (new.equipment_prep_days, new.equipment_return_days, new.time_zone)
     is distinct from (old.equipment_prep_days, old.equipment_return_days, old.time_zone) then
    for m in select e.id from public.gig_equipment e join public.gigs g on g.id = e.gig_id
             where e.org_id = new.id and e.planned_from is null and coalesce(g.end_date, g.start_date) >= current_date - 30 loop
      perform private.sync_equipment_reservation(m.id);
    end loop;
  end if;
  return null;
end $$;
create or replace trigger equipment_days_sync after update on public.organisations
  for each row execute function private.organisations_equipment_days();

revoke execute on function private.gig_equipment_before() from public, anon, authenticated;
revoke execute on function private.equipment_period(uuid) from public, anon, authenticated;
revoke execute on function private.sync_equipment_reservation(uuid) from public, anon, authenticated;
revoke execute on function private.gig_equipment_reservations() from public, anon, authenticated;
revoke execute on function private.organisations_equipment_days() from public, anon, authenticated;

-- ── Availability ─────────────────────────────────────────────────────────────
-- What can go out: bulk stock plus units that are available (not in repair)
create or replace function private.item_owned(p_item uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.quantity - s.in_repair), 0)::integer from public.stock_levels s where s.item_id = p_item
$$;

-- The most of an item booked at any one moment in a period (bookings overlap in time,
-- so the busiest moment, not the sum, is what matters)
create or replace function private.equipment_peak(p_item uuid, p_period tstzrange, p_exclude_gig uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with r as (
    select x.period, x.quantity from public.reservations x
    where x.resource_type = 'equipment' and x.resource_id = p_item and x.status <> 'cancelled'
      and x.period && p_period and (p_exclude_gig is null or x.gig_id is distinct from p_exclude_gig)
  ), points as (
    select greatest(lower(r.period), lower(p_period)) as at from r
  )
  select coalesce(max((select sum(r.quantity) from r where r.period @> points.at)), 0)::integer from points
$$;
revoke execute on function private.item_owned(uuid) from public, anon, authenticated;
revoke execute on function private.equipment_peak(uuid, tstzrange, uuid) from public, anon, authenticated;

-- Items of an organisation over a period (quote checks, the add-equipment picker)
create or replace function private.equipment_availability_unchecked(p_org uuid, p_items uuid[], p_from timestamptz, p_until timestamptz, p_exclude_gig uuid)
returns table(item_id uuid, owned integer, booked integer, available integer)
language sql stable security definer set search_path = '' as $$
  select i.id, o.owned, b.booked, o.owned - b.booked
  from public.price_items i
  cross join lateral (select private.item_owned(i.id) as owned) o
  cross join lateral (select private.equipment_peak(i.id, tstzrange(p_from, p_until, '[)'), p_exclude_gig) as booked) b
  where i.org_id = p_org and private.can_quote(p_org) and i.tracking <> 'none'
    and (p_items is null or i.id = any(p_items)) and p_until > p_from
$$;
create or replace function public.equipment_availability(p_org uuid, p_items uuid[], p_from timestamptz, p_until timestamptz, p_exclude_gig uuid default null)
returns table(item_id uuid, owned integer, booked integer, available integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.equipment_availability_unchecked(p_org, p_items, p_from, p_until, p_exclude_gig);
end $$;

-- A gig's equipment with what's free for it (the gig's managers and the organisation's
-- admins and members)
create or replace function private.gig_equipment_status_unchecked(p_gig uuid)
returns table(line_id uuid, item_id uuid, quantity integer, owned integer, booked_elsewhere integer, available integer,
              starts_at timestamptz, ends_at timestamptz, weight_kg numeric, power_w integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.can_manage_gig(p_gig) or private.can_quote((select g.org_id from public.gigs g where g.id = p_gig))) then return; end if;
  return query
    select e.id, e.item_id, e.quantity, private.item_owned(e.item_id), coalesce(private.equipment_peak(e.item_id, r.period, p_gig), 0),
           private.item_owned(e.item_id) - coalesce(private.equipment_peak(e.item_id, r.period, p_gig), 0),
           lower(r.period), upper(r.period), i.weight_kg, i.power_w
    from public.gig_equipment e
    join public.price_items i on i.id = e.item_id
    left join public.reservations r on r.source_type = 'gig_equipment' and r.source_id = e.id::text and r.status <> 'cancelled'
    where e.gig_id = p_gig;
end $$;
create or replace function public.gig_equipment_status(p_gig uuid)
returns table(line_id uuid, item_id uuid, quantity integer, owned integer, booked_elsewhere integer, available integer,
              starts_at timestamptz, ends_at timestamptz, weight_kg numeric, power_w integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_equipment_status_unchecked(p_gig);
end $$;

-- An item's bookings in a period, for its timeline (people who manage inventory)
create or replace function private.item_bookings_unchecked(p_item uuid, p_from timestamptz, p_until timestamptz)
returns table(gig_id uuid, gig_name text, status text, quantity integer, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.gig_id, g.name, r.status, r.quantity, lower(r.period), upper(r.period)
  from public.reservations r
  join public.price_items i on i.id = r.resource_id
  left join public.gigs g on g.id = r.gig_id
  where r.resource_type = 'equipment' and r.resource_id = p_item and r.status <> 'cancelled'
    and r.period && tstzrange(p_from, p_until, '[)') and private.can_quote(i.org_id)
  order by lower(r.period)
  limit 500
$$;
create or replace function public.item_bookings(p_item uuid, p_from timestamptz, p_until timestamptz)
returns table(gig_id uuid, gig_name text, status text, quantity integer, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.item_bookings_unchecked(p_item, p_from, p_until);
end $$;

revoke execute on function private.equipment_availability_unchecked(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function private.gig_equipment_status_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.item_bookings_unchecked(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.equipment_availability(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function public.gig_equipment_status(uuid) from public, anon;
revoke execute on function public.item_bookings(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.equipment_availability(uuid, uuid[], timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.gig_equipment_status(uuid) to authenticated;
grant execute on function public.item_bookings(uuid, timestamptz, timestamptz) to authenticated;
