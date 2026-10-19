-- Messaging M6b: the step that deletes messages past their organisation's retention period.
-- RUN BY HAND in the Supabase SQL editor (test project, then production), after
-- 20261108000000_messaging_m6b.sql. It only defines the function; nothing is deleted until an
-- organisation's admins choose a period and the nightly job runs.
--
-- Called only by the message-retention edge function (service role), after it has deleted the
-- messages' files. It deletes only messages that are still past their period, so a list that
-- went stale (a period changed meanwhile) can't delete anything else. Earlier versions,
-- reactions, confirmations, saved marks and reports go with each message; replies to it keep a
-- "earlier message" placeholder. The start of the deleted text is also taken out of unread or
-- read notifications that quoted it.

create or replace function public.retention_delete(p_ids uuid[]) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_deleted integer;
begin
  with due as (
    select m.id, m.conversation_id, left(m.body, 120) excerpt
      from public.organisations o
      cross join lateral private.org_conversations(o.id) c(id)
      join public.messages m on m.conversation_id = c.id
     where m.id = any(p_ids)
       and o.message_retention_days is not null
       and m.created_at < now() - make_interval(days => o.message_retention_days)
  ), quoted as (
    update public.notifications n set details = n.details - 'excerpt'
      from due
     where n.details->>'conversation_id' = due.conversation_id::text
       and (n.details->>'message_id' = due.id::text or n.details->>'excerpt' = due.excerpt)
    returning n.id
  ), gone as (
    delete from public.messages m using due where m.id = due.id returning m.id
  )
  select count(*) into v_deleted from gone;
  return v_deleted;
end $$;

revoke execute on function public.retention_delete(uuid[]) from public, anon, authenticated;
grant execute on function public.retention_delete(uuid[]) to service_role;
