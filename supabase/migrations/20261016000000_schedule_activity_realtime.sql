-- Phase 2a: gig schedule (call sheet), activity log, phone numbers, realtime.
-- Written without DROP/DELETE statements so it applies without manual confirmation.

-- ── Phone number for call sheets (optional, visible to people you share a gig or organisation with)
alter table public.profiles add column if not exists phone text;
alter table public.profiles add constraint profiles_phone_length check (char_length(phone) <= 40) not valid;
alter table public.profiles validate constraint profiles_phone_length;

-- ── Schedule ────────────────────────────────────────────────────────────────
create table if not exists public.gig_schedule (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time,
  title text not null check (char_length(trim(title)) between 1 and 200),
  location text check (char_length(coalesce(location, '')) <= 200),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  check (end_time is null or end_time >= start_time)
);
create index if not exists gig_schedule_gig_idx on public.gig_schedule (gig_id, day, start_time);
alter table public.gig_schedule enable row level security;
create policy gig_schedule_select on public.gig_schedule for select to authenticated
  using (private.can_access_gig(gig_id));
create policy gig_schedule_insert on public.gig_schedule for insert to authenticated
  with check (private.can_manage_gig(gig_id) and created_by = auth.uid());
create policy gig_schedule_update on public.gig_schedule for update to authenticated
  using (private.can_manage_gig(gig_id)) with check (private.can_manage_gig(gig_id));
create policy gig_schedule_delete on public.gig_schedule for delete to authenticated
  using (private.can_manage_gig(gig_id));

-- ── Activity log (written only by triggers) ────────────────────────────────
create table if not exists public.gig_activity (
  id bigint generated always as identity primary key,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists gig_activity_gig_idx on public.gig_activity (gig_id, created_at desc);
alter table public.gig_activity enable row level security;
create policy gig_activity_select on public.gig_activity for select to authenticated
  using (private.can_access_gig(gig_id));

create or replace function private.log_gig_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gig uuid;
  v_action text;
  v_details jsonb := '{}';
  v_changed text[];
begin
  if tg_table_name = 'assets' then
    v_gig := coalesce(new.gig_id, old.gig_id);
    if tg_op = 'INSERT' then
      v_action := case when new.version > 1 then 'asset_new_version' else 'asset_uploaded' end;
      v_details := jsonb_build_object('name', new.name, 'type', new.type, 'version', new.version);
    elsif tg_op = 'DELETE' then
      v_action := 'asset_deleted';
      v_details := jsonb_build_object('name', old.name, 'type', old.type, 'version', old.version);
    else
      return null; -- superseded_by updates are part of uploads
    end if;
  elsif tg_table_name = 'gig_members' then
    v_gig := coalesce(new.gig_id, old.gig_id);
    if tg_op = 'INSERT' then
      v_action := 'member_added';
      v_details := jsonb_build_object('user_id', new.user_id, 'role', new.role, 'function_title', new.function_title);
    elsif tg_op = 'DELETE' then
      v_action := 'member_removed';
      v_details := jsonb_build_object('user_id', old.user_id);
    else
      if new.role is not distinct from old.role and new.function_title is not distinct from old.function_title
         and new.call_time is not distinct from old.call_time then
        return null;
      end if;
      v_action := 'member_updated';
      v_details := jsonb_build_object('user_id', new.user_id, 'role', new.role,
                                      'function_title', new.function_title, 'call_time', new.call_time);
    end if;
  elsif tg_table_name = 'gig_schedule' then
    v_gig := coalesce(new.gig_id, old.gig_id);
    v_action := 'schedule_' || lower(tg_op);
    v_details := jsonb_build_object('title', coalesce(new.title, old.title), 'day', coalesce(new.day, old.day),
                                    'start_time', coalesce(new.start_time, old.start_time));
  elsif tg_table_name = 'gigs' then
    v_gig := new.id;
    v_changed := array_remove(array[
      case when new.name is distinct from old.name then 'name' end,
      case when new.venue is distinct from old.venue then 'venue' end,
      case when new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then 'dates' end,
      case when new.description is distinct from old.description then 'description' end
    ], null);
    if new.status is distinct from old.status then
      v_action := 'gig_status';
      v_details := jsonb_build_object('from', old.status, 'to', new.status, 'changed', to_jsonb(v_changed));
    elsif cardinality(v_changed) > 0 then
      v_action := 'gig_updated';
      v_details := jsonb_build_object('changed', to_jsonb(v_changed));
    else
      return null;
    end if;
  end if;

  -- Skip rows removed because the whole gig is being deleted
  if not exists (select 1 from gigs where id = v_gig) then
    return null;
  end if;

  insert into gig_activity (gig_id, actor_id, action, details) values (v_gig, auth.uid(), v_action, v_details);
  return null;
end $$;
revoke execute on function private.log_gig_activity() from public, anon, authenticated;

create or replace trigger log_activity after insert or update or delete on public.assets
  for each row execute function private.log_gig_activity();
create or replace trigger log_activity after insert or update or delete on public.gig_members
  for each row execute function private.log_gig_activity();
create or replace trigger log_activity after insert or update or delete on public.gig_schedule
  for each row execute function private.log_gig_activity();
create or replace trigger log_activity after update on public.gigs
  for each row execute function private.log_gig_activity();

-- ── Realtime: clients subscribe to new feed posts and activity for one gig ─
-- (RLS still applies: users only receive rows they're allowed to read.)
alter publication supabase_realtime add table public.feed_posts, public.gig_activity;
