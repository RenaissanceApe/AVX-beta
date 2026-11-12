-- Bug fixes from the automated tests (BF3), issue 221: a report on a message is told to every
-- manager of the conversation, including a manager whose own message was reported (the owner's
-- decision, 2026-11-12). Same function and signature as 20261107000000_messaging_m6a.sql; the only
-- change is that the author is no longer skipped when the manager list is walked. The reporter is
-- still never named, and there is still one unread notification per message per manager.
create or replace function private.report_message_unchecked(p_id uuid, p_reason text, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages; v_label text; v_user uuid;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or v_msg.deleted_at is not null or v_msg.kind <> 'text'
     or not private.can_access_conversation(v_msg.conversation_id) or v_msg.author_id = auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_reason not in ('spam', 'abuse', 'other') then raise exception 'Reason' using errcode = '22023'; end if;
  if (select count(*) from public.message_reports r
       where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports, try again tomorrow' using errcode = '54000';
  end if;
  insert into public.message_reports (message_id, conversation_id, reporter_id, reason, note)
  values (p_id, v_msg.conversation_id, auth.uid(), p_reason, left(nullif(trim(coalesce(p_note, '')), ''), 500))
  on conflict (message_id, reporter_id) do nothing;
  if not found then return; end if;

  -- Tell the people running the conversation (one notification per message, until it's handled)
  v_label := private.conversation_label(v_msg.conversation_id);
  for v_user in select * from private.conversation_moderators(v_msg.conversation_id) loop
    continue when exists (select 1 from public.notifications n
                           where n.user_id = v_user and n.kind = 'message_report' and n.read_at is null
                             and n.details->>'message_id' = p_id::text);
    insert into public.notifications (user_id, gig_id, org_id, kind, details)
    select v_user, c.gig_id, coalesce(c.org_id, g.org_id), 'message_report',
           jsonb_build_object('conversation_id', c.id, 'message_id', p_id, 'reason', p_reason, 'where', v_label)
      from public.conversations c left join public.gigs g on g.id = c.gig_id
     where c.id = v_msg.conversation_id;
  end loop;
end $$;

revoke execute on function private.report_message_unchecked(uuid, text, text) from public, anon, authenticated;
