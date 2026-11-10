-- U1: the organisation's time zone is a real setting (docs/PENDING.md D10).
-- organisations.time_zone already exists (Phase 5a, default 'Europe/Lisbon', format check) and gig
-- days, equipment bookings and the reports already read it. This step:
-- 1. accepts only time zones the database knows (an unknown name would break every booking);
-- 2. reads organisation leave and unavailable dates in the organisation's time zone (they were
--    always Lisbon); personal dates (no organisation) stay in Lisbon time;
-- 3. "Leave can only be asked for from today" uses the organisation's today;
-- 4. changing the time zone moves the organisation's crew bookings and leave with it (equipment
--    already moved: organisations_equipment_days);
-- 5. maintenance reminders count "the next two weeks" from the organisation's today.
-- Only admins change it: the organisations_update policy already allows admins only.
-- Add-only: create or replace and new triggers; nothing is removed.

-- ── 1. Only real time zones ──────────────────────────────────────────────────
create or replace function private.is_time_zone(p_zone text) returns boolean
language sql stable set search_path = '' as $$
  select p_zone is not null and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_zone)
$$;

create or replace function private.organisations_time_zone_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone then
    if not private.is_time_zone(new.time_zone) then
      raise exception 'Unknown time zone' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create or replace trigger organisations_time_zone_check before insert or update of time_zone on public.organisations
  for each row execute function private.organisations_time_zone_check();

-- The time zone an organisation's dates are read in (Lisbon without one)
create or replace function private.org_zone(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.time_zone from public.organisations o where o.id = p_org), 'Europe/Lisbon')
$$;

-- ── 2. Leave and unavailable dates as a time range ───────────────────────────
-- A half day starts or ends at 13:00. Organisation leave in the organisation's time zone,
-- personal dates in Lisbon time (a person has no time zone of their own yet).
create or replace function private.unavailability_period(p_org uuid, p_start date, p_end date, p_start_half boolean, p_end_half boolean)
returns tstzrange
language sql stable security definer set search_path = '' as $$
  select tstzrange(((p_start + case when p_start_half then time '13:00' else time '00:00' end)::timestamp at time zone z.tz),
                   (case when p_end_half then p_end + time '13:00' else (p_end + 1)::timestamp end at time zone z.tz), '[)')
  from (select case when p_org is null then 'Europe/Lisbon' else private.org_zone(p_org) end as tz) z
$$;

create or replace function private.unavailability_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op not in ('INSERT', 'UPDATE') then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'unavailable' and source_id = old.id::text;
    return null;
  end if;
  insert into public.reservations (resource_type, resource_id, period, status, source_type, source_id, label)
  values ('person', new.user_id,
          private.unavailability_period(new.org_id, new.start_date, new.end_date, new.start_half, new.end_half),
          case when new.status = 'approved' and new.removed_at is null then 'confirmed' else 'cancelled' end,
          'unavailable', new.id::text, null)
  on conflict (source_type, source_id) do update
    set period = excluded.period, status = excluded.status, updated_at = now();
  return null;
end $$;

-- ── 3. "From today" in the organisation's time zone ──────────────────────────
-- Same as in 20261213000000_leave_requests.sql, except the today check.
create or replace function private.crew_unavailability_before() returns trigger
language plpgsql set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  new.note := nullif(trim(new.note), '');
  if new.start_date = new.end_date and new.start_half and new.end_half then
    raise exception 'A single day is either a morning or an afternoon' using errcode = '22023';
  end if;
  if current_user not in ('authenticated', 'anon') then
    new.days := private.leave_days(new.org_id, new.user_id, new.start_date, new.end_date, new.start_half, new.end_half);
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.org_id is not null and not private.is_staff(new.org_id, new.user_id) then
      raise exception 'Not staff of this organisation' using errcode = '22023';
    end if;
    new.created_by := v_me; new.created_at := now(); new.removed_at := null;
    new.decided_by := null; new.decided_at := null; new.decision_note := null;
    if new.org_id is null or new.type = 'sick' or new.user_id <> v_me then
      new.status := 'approved';
      if new.org_id is not null and new.user_id <> v_me then new.decided_by := v_me; new.decided_at := now(); end if;
    else
      new.status := 'requested';
      if new.start_date < (now() at time zone private.org_zone(new.org_id))::date then
        raise exception 'Leave can only be asked for from today' using errcode = '22023';
      end if;
    end if;
    if new.org_id is not null and (select count(*) from public.crew_unavailability u
         where u.user_id = new.user_id and u.org_id = new.org_id and u.created_at > now() - interval '1 day') >= 50 then
      raise exception 'Too many requests today' using errcode = '54000';
    end if;
  else
    new.id := old.id; new.user_id := old.user_id; new.org_id := old.org_id; new.status := old.status;
    new.created_by := old.created_by; new.created_at := old.created_at;
    new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.decision_note := old.decision_note;
    if old.org_id is not null and (new.start_date, new.end_date, new.type, new.start_half, new.end_half)
         is distinct from (old.start_date, old.end_date, old.type, old.start_half, old.end_half) then
      raise exception 'Remove this leave and ask again to change it' using errcode = '22023';
    end if;
    if new.removed_at is not null and old.removed_at is null then
      new.removed_at := now();
      if old.org_id is not null then new.status := 'cancelled'; end if;
    end if;
  end if;
  new.days := private.leave_days(new.org_id, new.user_id, new.start_date, new.end_date, new.start_half, new.end_half);
  new.updated_at := now();
  return new;
end $$;

-- ── 4. A new time zone moves the organisation's bookings ─────────────────────
-- Crew on gigs that haven't ended more than 30 days ago (booking times typed as real times stay
-- as they are), and the organisation's leave over the same window.
create or replace function private.organisations_time_zone_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record; v_since date;
begin
  if new.time_zone is not distinct from old.time_zone then return null; end if;
  v_since := (now() at time zone new.time_zone)::date - 30;
  for m in select gm.gig_id, gm.user_id from public.gig_members gm join public.gigs g on g.id = gm.gig_id
            where g.org_id = new.id and g.start_date is not null and coalesce(g.end_date, g.start_date) >= v_since loop
    perform private.sync_member_reservation(m.gig_id, m.user_id);
  end loop;
  update public.reservations r
     set period = private.unavailability_period(u.org_id, u.start_date, u.end_date, u.start_half, u.end_half), updated_at = now()
    from public.crew_unavailability u
   where r.source_type = 'unavailable' and r.source_id = u.id::text
     and u.org_id = new.id and u.end_date >= v_since;
  return null;
end $$;
create or replace trigger organisations_time_zone_sync after update of time_zone on public.organisations
  for each row execute function private.organisations_time_zone_sync();

-- ── 5. Maintenance reminders from the organisation's today ───────────────────
-- Same as in 20261029000000_maintenance.sql, except "today".
create or replace function private.maintenance_due_all(p_org uuid)
returns table(item_id uuid, item_name text, inspection_kind text, unit_id uuid, unit_code text,
              last_done date, last_result text, due_on date)
language sql stable security definer set search_path = '' as $$
  with targets as (
    select i.id as item_id, i.name, i.inspection_kind, i.inspection_months, u.id as unit_id, u.code
      from public.price_items i join public.stock_units u on u.item_id = i.id and u.status in ('available', 'repair')
     where i.org_id = p_org and i.inspection_months is not null and i.tracking = 'serial' and i.archived_at is null
    union all
    select i.id, i.name, i.inspection_kind, i.inspection_months, null, null
      from public.price_items i
     where i.org_id = p_org and i.inspection_months is not null and i.tracking = 'bulk' and i.archived_at is null
  )
  select t.item_id, t.name, t.inspection_kind, t.unit_id, t.code, lp.done_on, ll.result,
         coalesce((lp.done_on + make_interval(months => t.inspection_months))::date, private.org_today(p_org))
    from targets t
    left join lateral (select x.done_on from public.inspections x
                        where x.item_id = t.item_id and x.unit_id is not distinct from t.unit_id and x.result = 'pass'
                        order by x.done_on desc limit 1) lp on true
    left join lateral (select x.result from public.inspections x
                        where x.item_id = t.item_id and x.unit_id is not distinct from t.unit_id
                        order by x.done_on desc, x.created_at desc limit 1) ll on true
   order by 8, 2, 5
$$;

create or replace function private.send_maintenance_reminders() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare o record; n integer; total integer := 0;
begin
  for o in select id, name from public.organisations loop
    with fresh as (
      insert into public.maintenance_reminders (org_id, target, due_on)
      select o.id, coalesce(d.unit_id, d.item_id), d.due_on
        from private.maintenance_due_all(o.id) d
       where d.due_on <= private.org_today(o.id) + 14
      on conflict do nothing
      returning 1
    ) select count(*) into n from fresh;
    if n > 0 then
      insert into public.notifications (user_id, org_id, kind, details)
      select m.user_id, o.id, 'inspection_due', jsonb_build_object('count', n, 'org_name', o.name)
        from public.org_members m where m.org_id = o.id and m.role = 'admin';
      total := total + n;
    end if;
  end loop;
  return total;
end $$;

revoke execute on function private.is_time_zone(text) from public, anon;
grant execute on function private.is_time_zone(text) to authenticated;
revoke execute on function private.organisations_time_zone_check() from public, anon, authenticated;
-- crew_unavailability_before runs as the caller, so signed-in people may read a time zone
revoke execute on function private.org_zone(uuid) from public, anon;
grant execute on function private.org_zone(uuid) to authenticated;
revoke execute on function private.unavailability_period(uuid, date, date, boolean, boolean) from public, anon, authenticated;
revoke execute on function private.organisations_time_zone_sync() from public, anon, authenticated;
revoke execute on function private.maintenance_due_all(uuid) from public, anon, authenticated;
revoke execute on function private.send_maintenance_reminders() from public, anon, authenticated;
