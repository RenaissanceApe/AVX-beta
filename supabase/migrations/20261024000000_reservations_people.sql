-- Phase 5a: people.
-- 1. A general reservations engine: "this resource is booked for this time range". People
--    use it now (gig crew and unavailable dates); equipment, units, vehicles and rooms
--    will use the same table and the same clash check later.
-- 2. Booking times per crew member (a shift), so two short jobs on one day don't clash.
-- 3. Availability requests ("are you free?") with replies, notified both ways.
-- 4. Unread notifications per organisation, and muting an organisation.
-- 5. Adding a gig's crew member to the organisation.
-- 6. Only admins and members create gigs (viewers no longer can).
-- Written without destructive statements so it applies without manual confirmation.

create extension if not exists btree_gist with schema extensions;

-- Dates on gigs are local to the organisation; this turns them into real time ranges
alter table public.organisations add column if not exists time_zone text not null default 'Europe/Lisbon';
alter table public.organisations add constraint organisations_time_zone_check
  check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$');

-- ── Booking times (shifts) ───────────────────────────────────────────────────
-- Optional. Without them a person is booked for the gig's whole days.
alter table public.gig_members add column if not exists booked_from timestamptz;
alter table public.gig_members add column if not exists booked_until timestamptz;
alter table public.gig_members add constraint gig_members_booking_check
  check (booked_from is null or booked_until is null or booked_until > booked_from);
grant update (booked_from, booked_until) on public.gig_members to authenticated;

-- ── Reservations ─────────────────────────────────────────────────────────────
-- Written only by the database (triggers below, and later the equipment planner).
-- source_type/source_id say what created a row, so it can be kept in step with it;
-- rows are cancelled rather than removed, and go with their gig or organisation.
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type ~ '^[a-z_]{1,30}$'), -- person | equipment | unit | vehicle | space …
  resource_id uuid not null,
  quantity integer not null default 1 check (quantity > 0),            -- for bulk equipment later
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  status text not null default 'confirmed' check (status in ('hold', 'confirmed', 'cancelled')),
  org_id uuid references public.organisations(id) on delete cascade,  -- owner; null for personal entries
  gig_id uuid references public.gigs(id) on delete cascade,
  source_type text not null check (source_type ~ '^[a-z_]{1,30}$'),
  source_id text not null check (char_length(source_id) <= 120),
  label text check (char_length(coalesce(label, '')) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index if not exists reservations_clash_idx on public.reservations
  using gist (resource_type, resource_id, period) where status <> 'cancelled';
create index if not exists reservations_gig_idx on public.reservations (gig_id);
alter table public.reservations enable row level security;

-- Your own bookings; the bookings on gigs you manage; your organisation's non-person resources
create policy reservations_select on public.reservations for select to authenticated
  using ((resource_type = 'person' and resource_id = auth.uid())
      or (gig_id is not null and private.can_manage_gig(gig_id))
      or (resource_type <> 'person' and org_id is not null and private.is_org_member(org_id)));
create policy mfa_required on public.reservations as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- A gig's days as a time range in its organisation's time zone (null without dates)
create or replace function private.gig_period(p_gig uuid) returns tstzrange
language sql stable security definer set search_path = '' as $$
  select tstzrange((g.start_date::timestamp at time zone o.time_zone),
                   ((coalesce(g.end_date, g.start_date) + 1)::timestamp at time zone o.time_zone), '[)')
  from public.gigs g join public.organisations o on o.id = g.org_id
  where g.id = p_gig and g.start_date is not null
$$;

create or replace function private.gig_reservation_status(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case p_status when 'draft' then 'hold' when 'archived' then 'cancelled' else 'confirmed' end
$$;

-- Keep one person's reservation for one gig in step with gig_members and the gig
create or replace function private.sync_member_reservation(p_gig uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := p_gig::text || ':' || p_user::text;
  v_member record;
  v_gig record;
  v_period tstzrange;
begin
  select m.booked_from, m.booked_until, m.function_title into v_member
    from public.gig_members m where m.gig_id = p_gig and m.user_id = p_user;
  if not found then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'gig_member' and source_id = v_key and status <> 'cancelled';
    return;
  end if;
  select g.org_id, g.status into v_gig from public.gigs g where g.id = p_gig;
  if not found then return; end if;
  if v_member.booked_from is not null and v_member.booked_until is not null then
    v_period := tstzrange(v_member.booked_from, v_member.booked_until, '[)');
  else
    v_period := private.gig_period(p_gig);
  end if;
  if v_period is null then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'gig_member' and source_id = v_key and status <> 'cancelled';
    return;
  end if;
  insert into public.reservations (resource_type, resource_id, period, status, org_id, gig_id, source_type, source_id, label)
  values ('person', p_user, v_period, private.gig_reservation_status(v_gig.status), v_gig.org_id, p_gig, 'gig_member', v_key, v_member.function_title)
  on conflict (source_type, source_id) do update
    set period = excluded.period, status = excluded.status, label = excluded.label, updated_at = now();
end $$;

create or replace function private.gig_members_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (old.gig_id, old.user_id) is distinct from (new.gig_id, new.user_id) then
    perform private.sync_member_reservation(old.gig_id, old.user_id);
  end if;
  perform private.sync_member_reservation(coalesce(new.gig_id, old.gig_id), coalesce(new.user_id, old.user_id));
  -- Tell the person when someone else changes their booking times
  if tg_op = 'UPDATE' and (new.booked_from, new.booked_until) is distinct from (old.booked_from, old.booked_until)
     and new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    select new.user_id, new.gig_id, auth.uid(), 'booking_changed',
           jsonb_build_object('gig_name', g.name, 'booked_from', new.booked_from, 'booked_until', new.booked_until)
      from public.gigs g where g.id = new.gig_id;
  end if;
  return null;
end $$;
create or replace trigger reservations_sync after insert or update or delete on public.gig_members
  for each row execute function private.gig_members_reservations();

create or replace function private.gigs_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if (new.start_date, new.end_date, new.status, new.org_id) is distinct from (old.start_date, old.end_date, old.status, old.org_id) then
    for m in select user_id from public.gig_members where gig_id = new.id loop
      perform private.sync_member_reservation(new.id, m.user_id);
    end loop;
  end if;
  return null;
end $$;
create or replace trigger reservations_sync after update on public.gigs
  for each row execute function private.gigs_reservations();

-- Dates someone marked as unavailable are personal reservations (no organisation)
create or replace function private.unavailability_reservations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.reservations set status = 'cancelled', updated_at = now()
     where source_type = 'unavailable' and source_id = old.id::text;
    return null;
  end if;
  insert into public.reservations (resource_type, resource_id, period, status, source_type, source_id, label)
  values ('person', new.user_id,
          tstzrange((new.start_date::timestamp at time zone 'Europe/Lisbon'), ((new.end_date + 1)::timestamp at time zone 'Europe/Lisbon'), '[)'),
          'confirmed', 'unavailable', new.id::text, null)
  on conflict (source_type, source_id) do update set period = excluded.period, status = 'confirmed', updated_at = now();
  return null;
end $$;
create or replace trigger reservations_sync after insert or update or delete on public.crew_unavailability
  for each row execute function private.unavailability_reservations();

revoke execute on function private.gig_period(uuid) from public, anon, authenticated;
revoke execute on function private.sync_member_reservation(uuid, uuid) from public, anon, authenticated;

-- Existing crew and unavailable dates
do $$
declare m record; u record;
begin
  for m in select gig_id, user_id from public.gig_members loop
    perform private.sync_member_reservation(m.gig_id, m.user_id);
  end loop;
  for u in select * from public.crew_unavailability loop
    insert into public.reservations (resource_type, resource_id, period, status, source_type, source_id)
    values ('person', u.user_id,
            tstzrange((u.start_date::timestamp at time zone 'Europe/Lisbon'), ((u.end_date + 1)::timestamp at time zone 'Europe/Lisbon'), '[)'),
            'confirmed', 'unavailable', u.id::text)
    on conflict (source_type, source_id) do nothing;
  end loop;
end $$;

-- ── The clash check ──────────────────────────────────────────────────────────
-- Everything else booked for a resource in a time range. Details (gig, company) are
-- only filled in where the caller may see that gig; otherwise it's just "busy".
create or replace function private.clashes(p_type text, p_resource uuid, p_period tstzrange, p_exclude_gig uuid default null)
returns table(reservation_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz,
              gig_id uuid, label text, company text, role_label text)
language sql stable security definer set search_path = '' as $$
  select r.id,
         case when r.source_type = 'unavailable' then 'unavailable' else 'booked' end,
         r.status, lower(r.period), upper(r.period),
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then r.gig_id end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then g.name end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then o.name end,
         case when r.gig_id is not null and private.can_access_gig(r.gig_id) then r.label end
  from public.reservations r
  left join public.gigs g on g.id = r.gig_id
  left join public.organisations o on o.id = r.org_id
  where r.resource_type = p_type and r.resource_id = p_resource and r.status <> 'cancelled'
    and r.period && p_period
    and (p_exclude_gig is null or r.gig_id is distinct from p_exclude_gig)
  order by lower(r.period)
$$;
revoke execute on function private.clashes(text, uuid, tstzrange, uuid) from public, anon, authenticated;

-- Crew of a gig I manage: each person's other bookings during their time on this gig
create or replace function private.gig_clashes_unchecked(p_gig uuid)
returns table(user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_manage_gig(p_gig) then return; end if;
  return query
    select r.resource_id, c.kind, c.status, c.starts_at, c.ends_at, c.gig_id, c.label, c.company, c.role_label
      from public.reservations r, lateral private.clashes('person', r.resource_id, r.period, p_gig) c
     where r.gig_id = p_gig and r.source_type = 'gig_member' and r.status <> 'cancelled';
end $$;
create or replace function public.gig_clashes(p_gig uuid)
returns table(user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_clashes_unchecked(p_gig);
end $$;

-- Before inviting someone by email: their bookings during the gig's days
create or replace function private.email_clashes_unchecked(p_gig uuid, p_email text)
returns table(user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid; v_period tstzrange;
begin
  if not private.can_manage_gig(p_gig) then return; end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  v_period := private.gig_period(p_gig);
  if v_user is null or v_period is null then return; end if;
  return query select v_user, c.kind, c.status, c.starts_at, c.ends_at, c.gig_id, c.label, c.company, c.role_label
    from private.clashes('person', v_user, v_period, p_gig) c;
end $$;
create or replace function public.email_clashes(p_gig uuid, p_email text)
returns table(user_id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.email_clashes_unchecked(p_gig, p_email);
end $$;

-- My own bookings in a time range (warning while I set a gig's dates)
create or replace function private.my_clashes_unchecked(p_from timestamptz, p_until timestamptz, p_exclude_gig uuid)
returns table(kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language sql stable security definer set search_path = '' as $$
  select c.kind, c.status, c.starts_at, c.ends_at, c.gig_id, c.label, c.company, c.role_label
  from private.clashes('person', auth.uid(), tstzrange(p_from, p_until, '[)'), p_exclude_gig) c
  where auth.uid() is not null and p_until > p_from
$$;
create or replace function public.my_clashes(p_from timestamptz, p_until timestamptz, p_exclude_gig uuid default null)
returns table(kind text, status text, starts_at timestamptz, ends_at timestamptz, gig_id uuid, label text, company text, role_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_clashes_unchecked(p_from, p_until, p_exclude_gig);
end $$;

revoke execute on function private.gig_clashes_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.email_clashes_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.my_clashes_unchecked(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.gig_clashes(uuid) from public, anon;
revoke execute on function public.email_clashes(uuid, text) from public, anon;
revoke execute on function public.my_clashes(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.gig_clashes(uuid) to authenticated;
grant execute on function public.email_clashes(uuid, text) to authenticated;
grant execute on function public.my_clashes(timestamptz, timestamptz, uuid) to authenticated;

-- ── Availability requests ────────────────────────────────────────────────────
-- "Are you available for this gig?" from a gig manager to a person, answered with
-- available / not available and an optional note. Both sides are notified.
create table if not exists public.availability_requests (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  person_id uuid not null references auth.users(id) on delete cascade,
  asked_by uuid references auth.users(id) on delete set null,
  period tstzrange,
  message text check (char_length(coalesce(message, '')) <= 500),
  status text not null default 'pending' check (status in ('pending', 'available', 'unavailable', 'withdrawn')),
  reply_note text check (char_length(coalesce(reply_note, '')) <= 500),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists availability_requests_one_open on public.availability_requests (gig_id, person_id) where status = 'pending';
create index if not exists availability_requests_person_idx on public.availability_requests (person_id, status);
alter table public.availability_requests enable row level security;

create policy availability_requests_select on public.availability_requests for select to authenticated
  using (person_id = auth.uid() or asked_by = auth.uid() or private.can_manage_gig(gig_id));
create policy availability_requests_insert on public.availability_requests for insert to authenticated
  with check (private.can_manage_gig(gig_id) and person_id <> auth.uid());
-- The person answers; the gig's managers can withdraw while it's open
create policy availability_requests_answer on public.availability_requests for update to authenticated
  using (person_id = auth.uid() and status = 'pending')
  with check (person_id = auth.uid() and status in ('available', 'unavailable'));
create policy availability_requests_withdraw on public.availability_requests for update to authenticated
  using (private.can_manage_gig(gig_id) and status = 'pending')
  with check (private.can_manage_gig(gig_id) and status = 'withdrawn');
create policy mfa_required on public.availability_requests as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.availability_requests from authenticated;
grant update (status, reply_note) on public.availability_requests to authenticated;

create or replace function private.availability_requests_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select g.org_id into new.org_id from public.gigs g where g.id = new.gig_id;
    new.asked_by := auth.uid();
    new.status := 'pending';
    new.reply_note := null;
    new.replied_at := null;
    new.created_at := now();
    if new.period is null then new.period := private.gig_period(new.gig_id); end if;
  else
    new.gig_id := old.gig_id; new.org_id := old.org_id; new.person_id := old.person_id;
    new.asked_by := old.asked_by; new.period := old.period; new.message := old.message; new.created_at := old.created_at;
    if auth.uid() is distinct from old.person_id then new.reply_note := old.reply_note; end if;
    if new.status in ('available', 'unavailable') then new.replied_at := now(); end if;
  end if;
  return new;
end $$;
create or replace trigger availability_requests_before before insert or update on public.availability_requests
  for each row execute function private.availability_requests_before();

create or replace function private.availability_requests_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    select new.person_id, new.gig_id, new.org_id, new.asked_by, 'availability_request',
           jsonb_build_object('gig_name', g.name, 'request_id', new.id, 'from', lower(new.period), 'until', upper(new.period),
                              'message', left(coalesce(new.message, ''), 200))
      from public.gigs g where g.id = new.gig_id;
  elsif new.status is distinct from old.status and new.status in ('available', 'unavailable') and new.asked_by is not null then
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    select new.asked_by, new.gig_id, new.org_id, new.person_id, 'availability_reply',
           jsonb_build_object('gig_name', g.name, 'request_id', new.id, 'answer', new.status, 'note', left(coalesce(new.reply_note, ''), 200))
      from public.gigs g where g.id = new.gig_id;
  end if;
  return null;
end $$;
create or replace trigger availability_requests_notify after insert or update on public.availability_requests
  for each row execute function private.availability_requests_notify();

-- ── Unread per organisation, and muting ──────────────────────────────────────
-- Notifications about a gig now always carry its organisation, so they can be grouped
create or replace function private.notifications_fill_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id is null and new.gig_id is not null then
    select g.org_id into new.org_id from public.gigs g where g.id = new.gig_id;
  end if;
  return new;
end $$;
create or replace trigger notifications_fill_org before insert on public.notifications
  for each row execute function private.notifications_fill_org();
update public.notifications n set org_id = g.org_id from public.gigs g
 where n.org_id is null and n.gig_id = g.id;

create table if not exists public.org_mutes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
alter table public.org_mutes enable row level security;
create policy org_mutes_select on public.org_mutes for select to authenticated using (user_id = auth.uid());
create policy org_mutes_insert on public.org_mutes for insert to authenticated with check (user_id = auth.uid());
create policy org_mutes_remove on public.org_mutes for delete to authenticated using (user_id = auth.uid());
create policy mfa_required on public.org_mutes as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- ── Crew member → organisation ───────────────────────────────────────────────
-- An organisation admin adds someone already on one of its gigs to the organisation
create or replace function private.add_gig_member_to_org_unchecked(p_gig uuid, p_user uuid, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  if v_org is null or not private.is_org_admin(v_org) then
    raise exception 'Only organisation admins can add members' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member', 'viewer') then raise exception 'Invalid role'; end if;
  if not exists (select 1 from public.gig_members m where m.gig_id = p_gig and m.user_id = p_user) then
    raise exception 'That person is not on this gig';
  end if;
  if exists (select 1 from public.org_members om where om.org_id = v_org and om.user_id = p_user) then
    return 'already_member';
  end if;
  insert into public.org_members (org_id, user_id, role) values (v_org, p_user, p_role);
  return 'added';
end $$;
create or replace function public.add_gig_member_to_org(p_gig uuid, p_user uuid, p_role text default 'member')
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.add_gig_member_to_org_unchecked(p_gig, p_user, p_role);
end $$;
revoke execute on function private.add_gig_member_to_org_unchecked(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.add_gig_member_to_org(uuid, uuid, text) from public, anon;
grant execute on function public.add_gig_member_to_org(uuid, uuid, text) to authenticated;

-- ── Viewers no longer create gigs ────────────────────────────────────────────
alter policy gigs_insert on public.gigs
  with check (created_by = auth.uid() and private.can_quote(org_id)); -- can_quote = admin or member
