-- ROADMAP step 8 (docs/BUSINESS.md, COMPETITOR_RESEARCH #2): time registration.
-- - crew_rate_factors gets the night window (default 22:00–07:00) and a km rate.
-- - org_holidays: the organisation's own holidays on top of Portugal's national ones (those are
--   built into the app, src/lib/timeRegistration.js). Removing only marks a day.
-- - time_entries: one row per person, gig and day: start, end (an end before the start runs past
--   midnight), break, travel time and km. Each person writes their own; the gig's managers write for
--   anyone on the gig. Crew never read anyone else's. Approved days are locked and keep the split
--   (normal, overtime, night, weekend, holiday, travel hours), the fee used and the cost as they were
--   at approval, so a later rate change never rewrites them (reports K2, K7, K8 read them).
-- - review_time_entry: the gig's managers approve (with the split and cost the app worked out) or
--   send back with a note. Notifications both ways.
-- - time_settings: the factors and holidays for a gig, for its managers (freelance PMs can't read
--   the organisation's factors directly).
-- - Organisation export: a time_entries file.
-- Written without destructive statements.

alter table public.crew_rate_factors add column if not exists night_from time not null default '22:00';
alter table public.crew_rate_factors add column if not exists night_until time not null default '07:00';
alter table public.crew_rate_factors add column if not exists km_rate numeric(6,2) not null default 0 check (km_rate between 0 and 100);
grant update (night_from, night_until, km_rate) on public.crew_rate_factors to authenticated;

create table if not exists public.org_holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  day date not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index if not exists org_holidays_live_key on public.org_holidays (org_id, day) where removed_at is null;

alter table public.org_holidays enable row level security;
create policy org_holidays_select on public.org_holidays for select to authenticated
  using (private.is_org_member(org_id));
create policy org_holidays_insert on public.org_holidays for insert to authenticated
  with check (private.is_org_admin(org_id) and removed_at is null);
create policy org_holidays_update on public.org_holidays for update to authenticated
  using (removed_at is null and private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.org_holidays as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.org_holidays from authenticated;
grant update (name, removed_at) on public.org_holidays to authenticated;

create or replace function private.org_holidays_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := trim(new.name);
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if (select count(*) from public.org_holidays h where h.org_id = new.org_id and h.removed_at is null) >= 200 then
      raise exception 'Holiday limit reached' using errcode = '54000';
    end if;
  else
    new.org_id := old.org_id; new.day := old.day; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function private.org_holidays_before() from public, anon, authenticated;
create or replace trigger org_holidays_before before insert or update on public.org_holidays
  for each row execute function private.org_holidays_before();

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(), -- the app may set it (hours typed offline are sent once)
  gig_id uuid not null references public.gigs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade, -- the gig's (none for a personal gig)
  work_date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 720),
  travel_minutes integer not null default 0 check (travel_minutes between 0 and 1440),
  km numeric(7,1) not null default 0 check (km between 0 and 10000),
  note text check (char_length(note) <= 500),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'returned')),
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  split jsonb,              -- hours at approval: normal, overtime, night, weekend, holiday, worked, travel, km
  fee_unit text check (fee_unit in ('day', 'half_day', 'hour', 'fixed')),
  fee_rate numeric(10,2),
  cost numeric(10,2) check (cost between 0 and 1000000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index if not exists time_entries_day_key on public.time_entries (gig_id, user_id, work_date) where removed_at is null;
create index if not exists time_entries_user_idx on public.time_entries (user_id, work_date);
create index if not exists time_entries_org_idx on public.time_entries (org_id, work_date);

alter table public.time_entries enable row level security;
create policy time_entries_select on public.time_entries for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_gig(gig_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) or private.can_manage_gig(gig_id));
create policy time_entries_update on public.time_entries for update to authenticated
  using (status <> 'approved' and removed_at is null and (user_id = (select auth.uid()) or private.can_manage_gig(gig_id)))
  with check (user_id = (select auth.uid()) or private.can_manage_gig(gig_id));
create policy mfa_required on public.time_entries as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke insert, update on public.time_entries from authenticated;
grant insert (id, gig_id, user_id, work_date, start_time, end_time, break_minutes, travel_minutes, km, note) on public.time_entries to authenticated;
grant update (start_time, end_time, break_minutes, travel_minutes, km, note, removed_at) on public.time_entries to authenticated;

-- The gig's organisation, and whether someone is on the gig, whoever asks
create or replace function private.gig_org(p_gig uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.org_id from public.gigs g where g.id = p_gig
$$;
create or replace function private.on_gig(p_gig uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gig_members m where m.gig_id = p_gig and m.user_id = p_user)
$$;
revoke execute on function private.gig_org(uuid), private.on_gig(uuid, uuid) from public, anon;
grant execute on function private.gig_org(uuid), private.on_gig(uuid, uuid) to authenticated;

-- Runs as the caller (so review_time_entry, which runs as the owner, passes straight through). Only
-- people on the gig log hours; an edit sends the day back for approval; the review columns are only
-- set by review_time_entry.
create or replace function private.time_entries_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.note := nullif(trim(new.note), '');
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.org_id := private.gig_org(new.gig_id);
    if not private.on_gig(new.gig_id, new.user_id) then
      raise exception 'Not on this gig' using errcode = '22023';
    end if;
    if (select count(*) from public.time_entries t where t.gig_id = new.gig_id and t.user_id = new.user_id and t.removed_at is null) >= 366 then
      raise exception 'Too many days' using errcode = '54000';
    end if;
    new.status := 'submitted'; new.review_note := null; new.reviewed_by := null; new.reviewed_at := null;
    new.split := null; new.fee_unit := null; new.fee_rate := null; new.cost := null;
    new.created_by := auth.uid(); new.created_at := now();
  else
    new.id := old.id; new.gig_id := old.gig_id; new.user_id := old.user_id; new.org_id := old.org_id;
    new.work_date := old.work_date; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then
      new.removed_at := now();
    else
      new.status := 'submitted'; new.review_note := null;
    end if;
  end if;
  if new.start_time = new.end_time then raise exception 'Start and end are the same' using errcode = '22023'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.time_entries_before() from public, anon, authenticated;
create or replace trigger time_entries_before before insert or update on public.time_entries
  for each row execute function private.time_entries_before();

-- The people who approve a gig's hours: its PMs and its creator, else the organisation's admins
create or replace function private.gig_approvers(p_gig uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with direct as (
    select m.user_id from public.gig_members m where m.gig_id = p_gig and m.role = 'pm'
    union select g.created_by from public.gigs g where g.id = p_gig and g.created_by is not null
  )
  select user_id from direct
  union
  select om.user_id from public.gigs g join public.org_members om on om.org_id = g.org_id and om.role = 'admin'
   where g.id = p_gig and not exists (select 1 from direct)
$$;
revoke execute on function private.gig_approvers(uuid) from public, anon, authenticated;

-- When someone logs or changes their own hours, the approvers hear about it (one unread
-- notification per approver, gig and person at a time)
create or replace function private.time_entries_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or v_me <> new.user_id or new.status <> 'submitted' or new.removed_at is not null then return null; end if;
  insert into public.notifications (user_id, gig_id, actor_id, kind, details)
  select a, new.gig_id, v_me, 'hours_submitted', jsonb_build_object('gig_name', g.name, 'work_date', new.work_date)
    from private.gig_approvers(new.gig_id) a, public.gigs g
   where g.id = new.gig_id and a <> v_me
     and not exists (select 1 from public.notifications n where n.user_id = a and n.gig_id = new.gig_id
                       and n.actor_id = v_me and n.kind = 'hours_submitted' and n.read_at is null);
  return null;
end $$;
revoke execute on function private.time_entries_notify() from public, anon, authenticated;
create or replace trigger time_entries_notify after insert or update on public.time_entries
  for each row execute function private.time_entries_notify();

-- Approve (with the split and cost the app worked out) or send back with a note
create or replace function public.review_time_entry(p_entry uuid, p_approve boolean, p_note text default null,
  p_split jsonb default null, p_fee_unit text default null, p_fee_rate numeric default null, p_cost numeric default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_e public.time_entries; v_me uuid := auth.uid(); v_note text := nullif(trim(p_note), '');
        v_worked numeric; v_sum numeric; v_gig text;
begin
  select * into v_e from public.time_entries where id = p_entry for update;
  if not found or v_e.removed_at is not null or not private.can_manage_gig(v_e.gig_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_e.status = 'approved' then return 'already'; end if;
  if char_length(v_note) > 500 then raise exception 'Note too long' using errcode = '22023'; end if;
  if p_approve then
    if p_split is null or jsonb_typeof(p_split) <> 'object' then raise exception 'Split missing' using errcode = '22023'; end if;
    v_worked := (extract(epoch from (v_e.end_time - v_e.start_time)) / 60 + case when v_e.end_time <= v_e.start_time then 1440 else 0 end
                 - v_e.break_minutes) / 60.0;
    v_sum := coalesce((p_split->>'normal')::numeric, 0) + coalesce((p_split->>'overtime')::numeric, 0) + coalesce((p_split->>'night')::numeric, 0)
           + coalesce((p_split->>'weekend')::numeric, 0) + coalesce((p_split->>'holiday')::numeric, 0);
    if abs(v_sum - v_worked) > 0.05 then raise exception 'Split does not match the hours' using errcode = '22023'; end if;
    if p_fee_unit is not null and p_fee_unit not in ('day', 'half_day', 'hour', 'fixed') then raise exception 'Bad unit' using errcode = '22023'; end if;
    if p_cost is not null and (p_cost < 0 or p_cost > 1000000) then raise exception 'Bad cost' using errcode = '22023'; end if;
    update public.time_entries set status = 'approved', review_note = v_note, reviewed_by = v_me, reviewed_at = now(),
           split = p_split || jsonb_build_object('worked', round(v_worked, 2), 'travel', round(v_e.travel_minutes / 60.0, 2), 'km', v_e.km),
           fee_unit = p_fee_unit, fee_rate = p_fee_rate, cost = round(p_cost, 2), updated_at = now()
     where id = p_entry;
  else
    if v_note is null then raise exception 'A note is needed' using errcode = '22023'; end if;
    update public.time_entries set status = 'returned', review_note = v_note, reviewed_by = v_me, reviewed_at = now(), updated_at = now()
     where id = p_entry;
  end if;
  if v_e.user_id <> v_me then
    select g.name into v_gig from public.gigs g where g.id = v_e.gig_id;
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    values (v_e.user_id, v_e.gig_id, v_me, case when p_approve then 'hours_approved' else 'hours_returned' end,
            jsonb_build_object('gig_name', v_gig, 'work_date', v_e.work_date, 'note', v_note));
  end if;
  return case when p_approve then 'approved' else 'returned' end;
end $$;
revoke execute on function public.review_time_entry(uuid, boolean, text, jsonb, text, numeric, numeric) from public, anon;
grant execute on function public.review_time_entry(uuid, boolean, text, jsonb, text, numeric, numeric) to authenticated;

-- What a gig's managers need to work out the split and cost: the factors (defaults when the
-- organisation has none, or for a personal gig) and the organisation's own holidays
create or replace function public.time_settings(p_gig uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_f jsonb; v_h jsonb;
begin
  if not private.can_manage_gig(p_gig) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  select jsonb_build_object('overtime', f.overtime, 'overtime_after_hours', f.overtime_after_hours, 'weekend', f.weekend,
         'night', f.night, 'holiday', f.holiday, 'night_from', to_char(f.night_from, 'HH24:MI'),
         'night_until', to_char(f.night_until, 'HH24:MI'), 'km_rate', f.km_rate)
    into v_f from public.crew_rate_factors f where f.org_id = v_org;
  select coalesce(jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name) order by h.day), '[]'::jsonb)
    into v_h from public.org_holidays h where h.org_id = v_org and h.removed_at is null;
  return jsonb_build_object('factors', v_f, 'holidays', v_h);
end $$;
revoke execute on function public.time_settings(uuid) from public, anon;
grant execute on function public.time_settings(uuid) to authenticated;

-- Organisation export: time_entries and org_holidays files; the factors file gets the new columns
alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step8;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  case p_part
  when 'time_entries' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, p.full_name as name, m.function_title,
             t.work_date, to_char(t.start_time, 'HH24:MI') as start_time, to_char(t.end_time, 'HH24:MI') as end_time,
             t.break_minutes, t.travel_minutes, t.km, t.status,
             t.split->>'normal' as normal, t.split->>'overtime' as overtime, t.split->>'night' as night,
             t.split->>'weekend' as weekend, t.split->>'holiday' as holiday,
             t.fee_unit, t.fee_rate, t.cost, t.note, t.review_note, t.reviewed_at
        from public.time_entries t
        join public.gigs g on g.id = t.gig_id
        left join public.gig_members m on m.gig_id = t.gig_id and m.user_id = t.user_id
        left join public.profiles p on p.id = t.user_id
       where g.org_id = p_org and t.removed_at is null
       order by t.work_date, g.name, p.full_name, t.id offset v_off limit v_lim) x;
  when 'crew_rate_factors' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select f.overtime, f.overtime_after_hours, f.weekend, f.night, f.holiday,
             to_char(f.night_from, 'HH24:MI') as night_from, to_char(f.night_until, 'HH24:MI') as night_until, f.km_rate, f.updated_at
        from public.crew_rate_factors f
       where f.org_id = p_org and v_off = 0) x;
  when 'org_holidays' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select h.day, h.name, h.created_at from public.org_holidays h
       where h.org_id = p_org and h.removed_at is null order by h.day, h.id offset v_off limit v_lim) x;
  else
    return private.export_org_part_pre_step8(p_org, p_part, p_offset);
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step8(uuid, text, integer) from public, anon, authenticated;
