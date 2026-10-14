-- Phase 2b: in-app notifications and a saved language preference.
-- Written without DROP/DELETE statements so it applies without manual confirmation.

alter table public.profiles add column if not exists language text;
alter table public.profiles add constraint profiles_language_check check (language in ('en', 'pt')) not valid;
alter table public.profiles validate constraint profiles_language_check;

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gig_id uuid references public.gigs(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null,
  details jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
-- Only read_at may be changed by the recipient
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Notify every member of a gig except the person who made the change.
create or replace function private.notify_gig_members(p_gig uuid, p_kind text, p_details jsonb, p_collapse boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from gigs where id = p_gig) then
    return;
  end if;
  insert into notifications (user_id, gig_id, actor_id, kind, details)
  select gm.user_id, p_gig, auth.uid(), p_kind,
         p_details || jsonb_build_object('gig_name', (select name from gigs where id = p_gig))
  from gig_members gm
  where gm.gig_id = p_gig
    and gm.user_id is distinct from auth.uid()
    -- Collapse bursts (e.g. building a schedule): one unread notice per gig per hour
    and not (p_collapse and exists (
      select 1 from notifications n
      where n.user_id = gm.user_id and n.gig_id = p_gig and n.kind = p_kind
        and n.read_at is null and n.created_at > now() - interval '1 hour'));
end $$;
revoke execute on function private.notify_gig_members(uuid, text, jsonb, boolean) from public, anon, authenticated;

create or replace function private.notify_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'gig_members' then
    if tg_op = 'INSERT' and new.user_id is distinct from auth.uid() then
      insert into notifications (user_id, gig_id, actor_id, kind, details)
      select new.user_id, new.gig_id, auth.uid(), 'added_to_gig',
             jsonb_build_object('gig_name', g.name, 'function_title', new.function_title, 'role', new.role)
      from gigs g where g.id = new.gig_id;
    elsif tg_op = 'UPDATE' and new.call_time is distinct from old.call_time and new.user_id is distinct from auth.uid() then
      insert into notifications (user_id, gig_id, actor_id, kind, details)
      select new.user_id, new.gig_id, auth.uid(), 'call_time_changed',
             jsonb_build_object('gig_name', g.name, 'call_time', new.call_time)
      from gigs g where g.id = new.gig_id;
    end if;

  elsif tg_table_name = 'org_members' then
    if new.user_id is distinct from auth.uid() then
      insert into notifications (user_id, org_id, actor_id, kind, details)
      select new.user_id, new.org_id, auth.uid(), 'added_to_org', jsonb_build_object('org_name', o.name, 'role', new.role)
      from organisations o where o.id = new.org_id;
    end if;

  elsif tg_table_name = 'assets' then
    perform private.notify_gig_members(new.gig_id,
      case when new.version > 1 then 'asset_new_version' else 'asset_uploaded' end,
      jsonb_build_object('name', new.name, 'version', new.version, 'type', new.type));

  elsif tg_table_name = 'feed_posts' then
    if new.is_important then
      perform private.notify_gig_members(new.gig_id, 'important_post',
        jsonb_build_object('excerpt', left(new.content, 140)));
    end if;

  elsif tg_table_name = 'gig_schedule' then
    perform private.notify_gig_members(coalesce(new.gig_id, old.gig_id), 'schedule_changed', '{}'::jsonb, true);

  elsif tg_table_name = 'gigs' then
    if new.status is distinct from old.status then
      perform private.notify_gig_members(new.id, 'gig_status', jsonb_build_object('status', new.status));
    elsif new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
       or new.venue is distinct from old.venue then
      perform private.notify_gig_members(new.id, 'gig_details', jsonb_build_object(
        'start_date', new.start_date, 'end_date', new.end_date, 'venue', new.venue));
    end if;
  end if;
  return null;
end $$;
revoke execute on function private.notify_on_change() from public, anon, authenticated;

create or replace trigger notify_change after insert or update on public.gig_members
  for each row execute function private.notify_on_change();
create or replace trigger notify_change after insert on public.org_members
  for each row execute function private.notify_on_change();
create or replace trigger notify_change after insert on public.assets
  for each row execute function private.notify_on_change();
create or replace trigger notify_change after insert on public.feed_posts
  for each row execute function private.notify_on_change();
create or replace trigger notify_change after insert or update or delete on public.gig_schedule
  for each row execute function private.notify_on_change();
create or replace trigger notify_change after update on public.gigs
  for each row execute function private.notify_on_change();

alter publication supabase_realtime add table public.notifications;

-- ── Fix: inviting someone already on the gig updates their role / function / call time.
-- The duplicate-insert guard (skip_duplicate) made the previous ON CONFLICT update a no-op.
create or replace function public.invite_to_gig(
  p_gig uuid, p_email text, p_role text default 'crew',
  p_function_title text default null, p_call_time time default null
) returns text
language plpgsql security definer set search_path = public, private as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not private.can_manage_gig(p_gig) then
    raise exception 'Only the gig PM or an organisation admin can add crew';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address';
  end if;
  if p_role not in ('pm','crew','viewer') then
    raise exception 'Invalid role';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null then
    update gig_members set role = p_role, function_title = nullif(trim(p_function_title), ''), call_time = p_call_time
      where gig_id = p_gig and user_id = v_user;
    if not found then
      insert into gig_members (gig_id, user_id, role, function_title, call_time)
      values (p_gig, v_user, p_role, nullif(trim(p_function_title), ''), p_call_time);
    end if;
    return 'added';
  end if;

  insert into gig_invites (gig_id, email, role, function_title, call_time, invited_by)
  values (p_gig, v_email, p_role, nullif(trim(p_function_title), ''), p_call_time, auth.uid())
  on conflict (gig_id, email) do update
    set role = excluded.role, function_title = excluded.function_title,
        call_time = excluded.call_time, invited_by = excluded.invited_by;
  return 'invited';
end $$;
