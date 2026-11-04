-- ROADMAP step 9 (docs/BUSINESS.md, COMPETITOR_RESEARCH #5): leave requests.
-- - crew_unavailability gets a type (holiday, sick, training, other), half days, an organisation
--   (empty for a freelancer's own dates) and a status. Rows already there stay approved "other"
--   dates, so nothing that blocked before stops blocking.
-- - Staff (an organisation's admins and members) request leave there: holiday, training and other
--   wait for an admin; sick days count at once (past days too) and the admins are told. Admins
--   approve or refuse with decide_leave, and may enter leave for a member of staff.
-- - Only approved, not removed entries block the person: clashes (reservations), Find crew "free",
--   the network picker, and time registration (no hours on a whole day of organisation leave).
-- - org_leave_settings (the yearly holiday days, default 22), staff_leave_years (a person's own
--   allowance and the days carried over, per year), staff_work_weeks (working days, default
--   Monday to Friday, and hours per day). leave_balances, org_leave_calendar and staff_utilisation
--   (reports K7) read them.
-- - Members of other companies only ever get "busy" (through the reservations), never the type.
-- - Organisation export: leave, leave_years, work_weeks and leave_settings files.
-- Written without destructive statements: policies are changed with ALTER POLICY. The one change
-- to the removal policy is in 20261213000001, which the owner applies by hand.

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table public.crew_unavailability add column if not exists type text not null default 'other'
  check (type in ('holiday', 'sick', 'training', 'other'));
alter table public.crew_unavailability add column if not exists org_id uuid references public.organisations(id) on delete cascade;
alter table public.crew_unavailability add column if not exists status text not null default 'approved'
  check (status in ('requested', 'approved', 'refused', 'cancelled'));
-- start_half: the first day is an afternoon only; end_half: the last day is a morning only
alter table public.crew_unavailability add column if not exists start_half boolean not null default false;
alter table public.crew_unavailability add column if not exists end_half boolean not null default false;
alter table public.crew_unavailability add column if not exists days numeric(5,1);
alter table public.crew_unavailability add column if not exists decided_by uuid references auth.users(id) on delete set null;
alter table public.crew_unavailability add column if not exists decided_at timestamptz;
alter table public.crew_unavailability add column if not exists decision_note text check (char_length(decision_note) <= 500);
alter table public.crew_unavailability add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.crew_unavailability add column if not exists updated_at timestamptz not null default now();
alter table public.crew_unavailability add column if not exists removed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crew_unavailability_one_half') then
    alter table public.crew_unavailability add constraint crew_unavailability_one_half
      check (not (start_date = end_date and start_half and end_half));
  end if;
end $$;
create index if not exists crew_unavailability_org_idx on public.crew_unavailability (org_id, start_date) where org_id is not null;

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- An organisation's staff: its admins and members (not viewers)
create or replace function private.is_staff(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user and m.role in ('admin', 'member'))
$$;
revoke execute on function private.is_staff(uuid, uuid) from public, anon;
grant execute on function private.is_staff(uuid, uuid) to authenticated;

-- Easter Sunday and Portugal's national holidays (same list as src/lib/timeRegistration.js)
create or replace function private.easter(p_year integer) returns date
language plpgsql immutable set search_path = '' as $$
declare a int := p_year % 19; b int := p_year / 100; c int := p_year % 100; d int := b / 4; e int := b % 4;
        f int := (b + 8) / 25; g int := (b - f + 1) / 3; h int; i int := c / 4; k int := c % 4; l int; m int;
begin
  h := (19 * a + b - d - g + 15) % 30;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

create or replace function private.pt_holiday(p_day date) returns boolean
language sql immutable set search_path = '' as $$
  select to_char(p_day, 'MM-DD') in ('01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25')
      or p_day in (private.easter(extract(year from p_day)::int) - 2, private.easter(extract(year from p_day)::int),
                   private.easter(extract(year from p_day)::int) + 60)
$$;

-- ── Working week ─────────────────────────────────────────────────────────────
create table if not exists public.staff_work_weeks (
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  days smallint[] not null default '{1,2,3,4,5}' check (days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(days) between 1 and 7), -- ISO weekdays, Monday = 1
  hours_per_day numeric(4,2) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.staff_work_weeks enable row level security;
create policy staff_work_weeks_select on public.staff_work_weeks for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_admin(org_id));
create policy staff_work_weeks_insert on public.staff_work_weeks for insert to authenticated
  with check (private.is_org_admin(org_id) and private.is_staff(org_id, user_id));
create policy staff_work_weeks_update on public.staff_work_weeks for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.staff_work_weeks as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.staff_work_weeks from authenticated;
grant insert (org_id, user_id, days, hours_per_day) on public.staff_work_weeks to authenticated;
grant update (days, hours_per_day) on public.staff_work_weeks to authenticated;

-- A person's working weekdays in an organisation (Monday to Friday when not set)
create or replace function private.work_days(p_org uuid, p_user uuid) returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select w.days from public.staff_work_weeks w where w.org_id = p_org and w.user_id = p_user), '{1,2,3,4,5}'::smallint[])
$$;
revoke execute on function private.work_days(uuid, uuid) from public, anon, authenticated;

-- Working days a stretch of leave uses: the person's working weekdays that aren't a national or an
-- organisation holiday; a half first or last day counts 0.5. Without an organisation: every day.
create or replace function private.leave_days(p_org uuid, p_user uuid, p_from date, p_to date,
  p_start_half boolean default false, p_end_half boolean default false) returns numeric
language sql stable security definer set search_path = '' as $$
  with wd as (select private.work_days(p_org, p_user) as days)
  select coalesce(sum(case when (d::date = p_from and p_start_half) or (d::date = p_to and p_end_half) then 0.5 else 1 end), 0)
    from generate_series(p_from, p_to, interval '1 day') d, wd
   where p_org is null
      or (extract(isodow from d)::smallint = any (wd.days)
          and not private.pt_holiday(d::date)
          and not exists (select 1 from public.org_holidays h where h.org_id = p_org and h.day = d::date and h.removed_at is null))
$$;
revoke execute on function private.leave_days(uuid, uuid, date, date, boolean, boolean) from public, anon;
-- The leave trigger runs as the caller and counts the days with it (the private schema isn't reachable through the API)
grant execute on function private.leave_days(uuid, uuid, date, date, boolean, boolean) to authenticated;

-- ── Holiday allowance ────────────────────────────────────────────────────────
create table if not exists public.org_leave_settings (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  holiday_days numeric(4,1) not null default 22 check (holiday_days between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.org_leave_settings enable row level security;
create policy org_leave_settings_select on public.org_leave_settings for select to authenticated
  using (private.is_org_member(org_id));
create policy org_leave_settings_insert on public.org_leave_settings for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy org_leave_settings_update on public.org_leave_settings for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.org_leave_settings as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.org_leave_settings from authenticated;
grant insert (org_id, holiday_days) on public.org_leave_settings to authenticated;
grant update (holiday_days) on public.org_leave_settings to authenticated;

-- A person's own allowance for a year (empty: the organisation's) and the days carried over,
-- both typed by an admin
create table if not exists public.staff_leave_years (
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  allowance numeric(4,1) check (allowance between 0 and 100),
  carried numeric(4,1) not null default 0 check (carried between 0 and 100),
  note text check (char_length(note) <= 200),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, year)
);
alter table public.staff_leave_years enable row level security;
create policy staff_leave_years_select on public.staff_leave_years for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_admin(org_id));
create policy staff_leave_years_insert on public.staff_leave_years for insert to authenticated
  with check (private.is_org_admin(org_id) and private.is_staff(org_id, user_id));
create policy staff_leave_years_update on public.staff_leave_years for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.staff_leave_years as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.staff_leave_years from authenticated;
grant insert (org_id, user_id, year, allowance, carried, note) on public.staff_leave_years to authenticated;
grant update (allowance, carried, note) on public.staff_leave_years to authenticated;

-- Who changed the settings, set by the database
create or replace function private.leave_settings_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.leave_settings_stamp() from public, anon, authenticated;
create or replace trigger leave_settings_stamp before insert or update on public.staff_work_weeks
  for each row execute function private.leave_settings_stamp();
create or replace trigger leave_settings_stamp before insert or update on public.org_leave_settings
  for each row execute function private.leave_settings_stamp();
create or replace trigger leave_settings_stamp before insert or update on public.staff_leave_years
  for each row execute function private.leave_settings_stamp();

-- ── Who sees and writes leave ────────────────────────────────────────────────
-- You see your own entries; an organisation's admins see its staff's leave. Members see the
-- calendar through org_leave_calendar (no notes, sick shown as "away").
alter policy crew_unavailability_select on public.crew_unavailability
  using (user_id = (select auth.uid()) or (org_id is not null and private.is_org_admin(org_id)));
-- Your own dates (as staff of the organisation when you pick one); an admin may enter leave for staff
alter policy crew_unavailability_insert on public.crew_unavailability
  with check ((user_id = (select auth.uid()) and (org_id is null or private.is_staff(org_id, user_id)))
              or (org_id is not null and private.is_org_admin(org_id)));
-- Your own entries (organisation leave: only the note, or removing it); status changes go through decide_leave
alter policy crew_unavailability_update on public.crew_unavailability
  using (removed_at is null and (user_id = (select auth.uid()) or (org_id is not null and private.is_org_admin(org_id))))
  with check (user_id = (select auth.uid()) or (org_id is not null and private.is_org_admin(org_id)));
-- Hard removal of organisation leave is closed off in 20261213000001 (applied by hand)
-- Staff leave is organisation data: two-step sign-in applies as for the rest of it
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crew_unavailability' and policyname = 'mfa_required') then
    create policy mfa_required on public.crew_unavailability as restrictive for all to authenticated
      using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
  end if;
end $$;
revoke insert, update on public.crew_unavailability from authenticated;
grant insert (user_id, org_id, start_date, end_date, note, type, start_half, end_half) on public.crew_unavailability to authenticated;
grant update (start_date, end_date, note, type, start_half, end_half, removed_at) on public.crew_unavailability to authenticated;

-- Runs as the caller (decide_leave, which runs as the owner, passes straight through). Sets the
-- status, the days and who entered it; organisation leave can't be moved, only removed and asked again.
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
      if new.start_date < (now() at time zone 'Europe/Lisbon')::date then
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
revoke execute on function private.crew_unavailability_before() from public, anon, authenticated;
create or replace trigger crew_unavailability_before before insert or update on public.crew_unavailability
  for each row execute function private.crew_unavailability_before();

-- The admins hear about a request, a sick day or cancelled approved leave; the person hears when an
-- admin enters leave for them
create or replace function private.crew_unavailability_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_kind text; v_details jsonb;
begin
  if new.org_id is null or v_me is null then return null; end if;
  v_details := jsonb_build_object('leave_id', new.id, 'type', new.type, 'start_date', new.start_date, 'end_date', new.end_date, 'days', new.days);
  if tg_op = 'INSERT' and new.user_id <> v_me then
    insert into public.notifications (user_id, org_id, actor_id, kind, details)
    values (new.user_id, new.org_id, v_me, 'leave_approved', v_details);
    return null;
  end if;
  v_kind := case
    when tg_op = 'INSERT' and new.status = 'requested' then 'leave_requested'
    when tg_op = 'INSERT' and new.type = 'sick' then 'leave_sick'
    when tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'cancelled' and new.user_id = v_me then 'leave_cancelled'
  end;
  if v_kind is null then return null; end if;
  insert into public.notifications (user_id, org_id, actor_id, kind, details)
  select m.user_id, new.org_id, v_me, v_kind, v_details
    from public.org_members m where m.org_id = new.org_id and m.role = 'admin' and m.user_id <> v_me;
  return null;
end $$;
revoke execute on function private.crew_unavailability_notify() from public, anon, authenticated;
create or replace trigger crew_unavailability_notify after insert or update on public.crew_unavailability
  for each row execute function private.crew_unavailability_notify();

-- An admin approves or refuses a request (a note is needed to refuse). Approved leave can still be
-- refused afterwards, e.g. a sick day entered by mistake.
create or replace function public.decide_leave(p_leave uuid, p_approve boolean, p_note text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_l public.crew_unavailability; v_me uuid := auth.uid(); v_note text := nullif(trim(p_note), '');
begin
  select * into v_l from public.crew_unavailability where id = p_leave for update;
  if not found or v_l.org_id is null or v_l.removed_at is not null or not private.is_org_admin(v_l.org_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if char_length(v_note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if p_approve then
    if v_l.status <> 'requested' then return v_l.status; end if;
  else
    if v_l.status not in ('requested', 'approved') then return v_l.status; end if;
    if v_note is null then raise exception 'A note is needed' using errcode = '22023'; end if;
  end if;
  update public.crew_unavailability
     set status = case when p_approve then 'approved' else 'refused' end,
         decided_by = v_me, decided_at = now(), decision_note = v_note, updated_at = now()
   where id = p_leave;
  if v_l.user_id <> v_me then
    insert into public.notifications (user_id, org_id, actor_id, kind, details)
    values (v_l.user_id, v_l.org_id, v_me, case when p_approve then 'leave_approved' else 'leave_refused' end,
            jsonb_build_object('leave_id', v_l.id, 'type', v_l.type, 'start_date', v_l.start_date, 'end_date', v_l.end_date,
                               'days', v_l.days, 'note', v_note));
  end if;
  return case when p_approve then 'approved' else 'refused' end;
end $$;
revoke execute on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;

-- ── Blocking: only approved entries that aren't removed ─────────────────────
-- Reservations (clashes, the network picker): a half day starts or ends at 13:00
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
          tstzrange(((new.start_date + case when new.start_half then time '13:00' else time '00:00' end)::timestamp at time zone 'Europe/Lisbon'),
                    (case when new.end_half then new.end_date + time '13:00' else (new.end_date + 1)::timestamp end at time zone 'Europe/Lisbon'), '[)'),
          case when new.status = 'approved' and new.removed_at is null then 'confirmed' else 'cancelled' end,
          'unavailable', new.id::text, null)
  on conflict (source_type, source_id) do update
    set period = excluded.period, status = excluded.status, updated_at = now();
  return null;
end $$;

-- Requests waiting for an admin don't hold a reservation yet
update public.reservations r set status = 'cancelled', updated_at = now()
  from public.crew_unavailability u
 where r.source_type = 'unavailable' and r.source_id = u.id::text and r.status <> 'cancelled'
   and (u.status <> 'approved' or u.removed_at is not null);

create or replace function private.person_conflicts(p_gig uuid, p_user uuid)
returns table (kind text, start_date date, end_date date, label text)
language sql stable security definer set search_path = public, private as $$
  with g as (select start_date, coalesce(end_date, start_date) as end_date from gigs where id = p_gig and start_date is not null)
  select 'unavailable', u.start_date, u.end_date, null::text
    from crew_unavailability u, g
   where u.user_id = p_user and u.status = 'approved' and u.removed_at is null
     and u.start_date <= g.end_date and u.end_date >= g.start_date
  union all
  select 'booked', o.start_date, coalesce(o.end_date, o.start_date),
         case when private.can_access_gig(o.id) then o.name end
    from gig_members m join gigs o on o.id = m.gig_id, g
   where m.user_id = p_user and o.id <> p_gig and o.status <> 'archived' and o.start_date is not null
     and o.start_date <= g.end_date and coalesce(o.end_date, o.start_date) >= g.start_date
$$;
revoke execute on function private.person_conflicts(uuid, uuid) from public, anon, authenticated;

-- Find crew "free"
create or replace function private.crew_busy(p_user uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.gig_members m join public.gigs g on g.id = m.gig_id
       where m.user_id = p_user and g.status <> 'archived' and g.start_date is not null
         and g.start_date <= p_to and coalesce(g.end_date, g.start_date) >= p_from)
    or exists (
      select 1 from public.crew_unavailability u
       where u.user_id = p_user and u.status = 'approved' and u.removed_at is null
         and u.start_date <= p_to and u.end_date >= p_from)
$$;

-- Time registration: no hours on a whole day of approved organisation leave (a half day still allows them)
create or replace function private.on_leave(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_unavailability u
     where u.user_id = p_user and u.org_id is not null and u.status = 'approved' and u.removed_at is null
       and p_day between u.start_date and u.end_date
       and not (p_day = u.start_date and u.start_half) and not (p_day = u.end_date and u.end_half))
$$;
revoke execute on function private.on_leave(uuid, date) from public, anon, authenticated;

create or replace function private.time_entries_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is null and private.on_leave(new.user_id, new.work_date) then
    raise exception 'On leave that day' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function private.time_entries_leave() from public, anon, authenticated;
create or replace trigger time_entries_leave before insert or update on public.time_entries
  for each row execute function private.time_entries_leave();

-- ── Reading leave ────────────────────────────────────────────────────────────
-- Who is away between two dates. Members of the organisation (admins and members) see approved
-- leave; admins also see requests. Notes stay with the person and the admins; a sick day shows as
-- "away" to anyone else.
create or replace function public.org_leave_calendar(p_org uuid, p_from date, p_to date)
returns table (id uuid, user_id uuid, full_name text, type text, status text, start_date date, end_date date,
               start_half boolean, end_half boolean, days numeric, note text, created_at timestamptz,
               decided_at timestamptz, decision_note text)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_admin boolean := private.is_org_admin(p_org);
begin
  if not private.is_staff(p_org, v_me) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Range too long' using errcode = '22023'; end if;
  return query
    select u.id, u.user_id, p.full_name,
           case when u.type = 'sick' and not v_admin and u.user_id <> v_me then 'away' else u.type end,
           u.status, u.start_date, u.end_date, u.start_half, u.end_half, u.days,
           case when v_admin or u.user_id = v_me then u.note end, u.created_at, u.decided_at,
           case when v_admin or u.user_id = v_me then u.decision_note end
      from public.crew_unavailability u
      left join public.profiles p on p.id = u.user_id
     where u.org_id = p_org and u.removed_at is null
       and u.start_date <= p_to and u.end_date >= p_from
       and (u.status = 'approved' or (u.status = 'requested' and (v_admin or u.user_id = v_me))
            or (u.status = 'refused' and u.user_id = v_me))
     order by u.start_date, p.full_name, u.id
     limit 2000;
end $$;
revoke execute on function public.org_leave_calendar(uuid, date, date) from public, anon;
grant execute on function public.org_leave_calendar(uuid, date, date) to authenticated;

-- Holiday days per member of staff for a year: allowance (their own, else the organisation's),
-- carried over, used (approved), asked (waiting) and left. Admins see everyone; others only themselves.
create or replace function public.leave_balances(p_org uuid, p_year integer)
returns table (user_id uuid, full_name text, role text, allowance numeric, own_allowance numeric, carried numeric,
               used numeric, asked numeric, left_days numeric, work_days smallint[], hours_per_day numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_admin boolean := private.is_org_admin(p_org);
        v_from date := make_date(p_year, 1, 1); v_to date := make_date(p_year, 12, 31); v_default numeric;
begin
  if not private.is_staff(p_org, v_me) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Bad year' using errcode = '22023'; end if;
  select s.holiday_days into v_default from public.org_leave_settings s where s.org_id = p_org;
  v_default := coalesce(v_default, 22);
  return query
    with staff as (
      select m.user_id, m.role from public.org_members m
       where m.org_id = p_org and m.role in ('admin', 'member') and (v_admin or m.user_id = v_me)
    ), spent as (
      select u.user_id,
             sum(case when u.status = 'approved' then private.leave_days(p_org, u.user_id, greatest(u.start_date, v_from), least(u.end_date, v_to),
                   u.start_half and u.start_date >= v_from, u.end_half and u.end_date <= v_to) else 0 end) as used,
             sum(case when u.status = 'requested' then private.leave_days(p_org, u.user_id, greatest(u.start_date, v_from), least(u.end_date, v_to),
                   u.start_half and u.start_date >= v_from, u.end_half and u.end_date <= v_to) else 0 end) as asked
        from public.crew_unavailability u
       where u.org_id = p_org and u.type = 'holiday' and u.removed_at is null and u.status in ('approved', 'requested')
         and u.start_date <= v_to and u.end_date >= v_from and u.user_id in (select s.user_id from staff s)
       group by u.user_id
    )
    select s.user_id, p.full_name, s.role, coalesce(y.allowance, v_default), y.allowance, coalesce(y.carried, 0),
           coalesce(sp.used, 0), coalesce(sp.asked, 0),
           coalesce(y.allowance, v_default) + coalesce(y.carried, 0) - coalesce(sp.used, 0),
           private.work_days(p_org, s.user_id),
           coalesce((select w.hours_per_day from public.staff_work_weeks w where w.org_id = p_org and w.user_id = s.user_id), 8)
      from staff s
      left join public.profiles p on p.id = s.user_id
      left join public.staff_leave_years y on y.org_id = p_org and y.user_id = s.user_id and y.year = p_year
      left join spent sp on sp.user_id = s.user_id
     order by p.full_name, s.user_id;
end $$;
revoke execute on function public.leave_balances(uuid, integer) from public, anon;
grant execute on function public.leave_balances(uuid, integer) to authenticated;

-- Reports (K7): per member of staff between two dates, the working days of their week (holidays
-- left out), the approved leave days per type, the days left to work, the hours that makes and
-- the approved hours they logged on the organisation's gigs. Admins only.
create or replace function public.staff_utilisation(p_org uuid, p_from date, p_to date)
returns table (user_id uuid, full_name text, working_days numeric, leave jsonb, available_days numeric,
               hours_per_day numeric, available_hours numeric, logged_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Range too long' using errcode = '22023'; end if;
  return query
    with staff as (
      select m.user_id, private.leave_days(p_org, m.user_id, p_from, p_to) as wdays,
             coalesce((select w.hours_per_day from public.staff_work_weeks w where w.org_id = p_org and w.user_id = m.user_id), 8) as hpd
        from public.org_members m where m.org_id = p_org and m.role in ('admin', 'member')
    ), lv as (
      select u.user_id, u.type,
             sum(private.leave_days(p_org, u.user_id, greatest(u.start_date, p_from), least(u.end_date, p_to),
                 u.start_half and u.start_date >= p_from, u.end_half and u.end_date <= p_to)) as d
        from public.crew_unavailability u
       where u.org_id = p_org and u.status = 'approved' and u.removed_at is null
         and u.start_date <= p_to and u.end_date >= p_from
       group by u.user_id, u.type
    ), lt as (
      select lv.user_id, jsonb_object_agg(lv.type, lv.d) as leave, sum(lv.d) as total from lv group by lv.user_id
    ), hrs as (
      select t.user_id, sum(coalesce((t.split->>'worked')::numeric, 0)) as h
        from public.time_entries t
       where t.org_id = p_org and t.status = 'approved' and t.removed_at is null and t.work_date between p_from and p_to
       group by t.user_id
    )
    select s.user_id, p.full_name, s.wdays, coalesce(lt.leave, '{}'::jsonb),
           greatest(s.wdays - coalesce(lt.total, 0), 0), s.hpd,
           round(greatest(s.wdays - coalesce(lt.total, 0), 0) * s.hpd, 2), coalesce(hrs.h, 0)
      from staff s
      left join public.profiles p on p.id = s.user_id
      left join lt on lt.user_id = s.user_id
      left join hrs on hrs.user_id = s.user_id
     order by p.full_name, s.user_id;
end $$;
revoke execute on function public.staff_utilisation(uuid, date, date) from public, anon;
grant execute on function public.staff_utilisation(uuid, date, date) to authenticated;

-- Existing rows get their day count
update public.crew_unavailability u set days = private.leave_days(u.org_id, u.user_id, u.start_date, u.end_date, u.start_half, u.end_half)
 where u.days is null;

-- ── Organisation export ──────────────────────────────────────────────────────
alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step9;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  case p_part
  when 'leave' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select p.full_name as name, u.type, u.status, u.start_date, u.end_date, u.start_half, u.end_half, u.days,
             u.note, u.decision_note, d.full_name as decided_by, u.decided_at, u.created_at
        from public.crew_unavailability u
        left join public.profiles p on p.id = u.user_id
        left join public.profiles d on d.id = u.decided_by
       where u.org_id = p_org and u.removed_at is null
       order by u.start_date, p.full_name, u.id offset v_off limit v_lim) x;
  when 'leave_years' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select p.full_name as name, y.year, y.allowance, y.carried, y.note, y.updated_at
        from public.staff_leave_years y left join public.profiles p on p.id = y.user_id
       where y.org_id = p_org order by y.year, p.full_name, y.user_id offset v_off limit v_lim) x;
  when 'work_weeks' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select p.full_name as name, array_to_string(w.days, ' ') as days, w.hours_per_day, w.updated_at
        from public.staff_work_weeks w left join public.profiles p on p.id = w.user_id
       where w.org_id = p_org order by p.full_name, w.user_id offset v_off limit v_lim) x;
  when 'leave_settings' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select s.holiday_days, s.updated_at from public.org_leave_settings s where s.org_id = p_org and v_off = 0) x;
  else
    return private.export_org_part_pre_step9(p_org, p_part, p_offset);
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step9(uuid, text, integer) from public, anon, authenticated;
