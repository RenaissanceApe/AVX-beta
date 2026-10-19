-- Fix: a crew member on a gig could not delete their account.
-- Deleting the account removes their gig memberships, and the gig's activity log recorded that
-- removal with them as the actor. Their account was already gone at that point, so the log row
-- broke the link to auth.users and the whole deletion was rolled back. The log now records no
-- actor when the person acting no longer exists. Found by the signed-in browser tests.
-- Written without destructive statements so it applies without manual confirmation.

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
      return null;
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
  if not exists (select 1 from gigs where id = v_gig) then
    return null;
  end if;
  -- No actor when the person acting is being deleted (their account is already gone here)
  insert into gig_activity (gig_id, actor_id, action, details)
  values (v_gig, (select u.id from auth.users u where u.id = auth.uid()), v_action, v_details);
  return null;
end $$;
revoke execute on function private.log_gig_activity() from public, anon, authenticated;
