-- Messaging M6a (docs/MESSAGING.md): keeping conversations safe.
-- 1. Report a message: the people running that conversation (a gig's managers, an organisation's
--    admins) are told, without who reported it, and remove the message or keep it. Reports from
--    direct conversations, which nobody runs, are kept for the AVX team.
-- 2. Moderators remove any message in the conversations they run ("Removed by a moderator"); the
--    author is told.
-- 3. Block a person: they can't write to you in your direct conversation, and their mentions and
--    replies don't notify you. Work questions (availability, crew calls) still arrive.
-- 4. Rate limits: at most 20 messages a minute and 300 an hour per person.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Tables ───────────────────────────────────────────────────────────────────
alter table public.messages add column if not exists removed_by uuid references auth.users(id) on delete set null;
create index if not exists messages_author_recent_idx on public.messages (author_id, created_at desc) where kind = 'text';

create table if not exists public.user_blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id) where active;
alter table public.user_blocks enable row level security;
create policy user_blocks_select on public.user_blocks for select to authenticated using (user_id = auth.uid());
create policy mfa_required on public.user_blocks as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam', 'abuse', 'other')),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  outcome text check (outcome in ('removed', 'kept')),
  unique (message_id, reporter_id)
);
create index if not exists message_reports_open_idx on public.message_reports (conversation_id) where resolved_at is null;
create index if not exists message_reports_reporter_idx on public.message_reports (reporter_id, created_at desc);
alter table public.message_reports enable row level security;
-- Reporters see their own reports; moderators read them through open_reports (without who reported)
create policy message_reports_select on public.message_reports for select to authenticated using (reporter_id = auth.uid());
create policy mfa_required on public.message_reports as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- The people who run a conversation: a gig's managers (its PMs, whoever created it and its
-- organisation's admins) or an organisation's admins. Nobody for direct conversations.
create or replace function private.conversation_moderators(p_conv uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct u from (
    select gm.user_id u from public.conversations c join public.gig_members gm on gm.gig_id = c.gig_id
     where c.id = p_conv and c.kind in ('gig', 'department') and gm.role = 'pm'
    union all
    select g.created_by from public.conversations c join public.gigs g on g.id = c.gig_id
     where c.id = p_conv and c.kind in ('gig', 'department')
    union all
    select om.user_id from public.conversations c join public.gigs g on g.id = c.gig_id
      join public.org_members om on om.org_id = g.org_id
     where c.id = p_conv and c.kind in ('gig', 'department') and om.role = 'admin'
    union all
    select om.user_id from public.conversations c join public.org_members om on om.org_id = c.org_id
     where c.id = p_conv and c.kind in ('org', 'context') and om.role = 'admin'
  ) x where u is not null
$$;

-- "Gala dinner", "Gala dinner · Sound", the channel's title, or the conversation's subject
create or replace function private.conversation_label(p_conv uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case c.kind
           when 'gig' then g.name
           when 'department' then g.name || ' · ' || c.department
           else coalesce(c.title, '')
         end
    from public.conversations c left join public.gigs g on g.id = c.gig_id
   where c.id = p_conv
$$;

-- Clears a message for everyone: text, files, card, mentions, earlier versions and reactions;
-- a "message removed" marker stays so replies still make sense
create or replace function private.clear_message(p_id uuid, p_by uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or v_msg.deleted_at is not null then return; end if;
  update public.messages
     set body = '—', attachments = '[]', payload = null, mentions = '[]', deleted_at = clock_timestamp(),
         removed_by = case when p_by is distinct from v_msg.author_id then p_by end
   where id = p_id;
  update public.message_edits set body = '—' where message_id = p_id;
  update public.message_reactions set active = false, updated_at = clock_timestamp() where message_id = p_id;
  update public.notifications set details = details || jsonb_build_object('excerpt', '')
   where kind in ('message', 'guest_message', 'announcement') and read_at is null
     and details->>'conversation_id' = v_msg.conversation_id::text
     and details->>'excerpt' = left(v_msg.body, 120);
end $$;

-- The author removing their own message (M2), now through clear_message
create or replace function private.remove_message_unchecked(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or v_msg.author_id is distinct from auth.uid() or v_msg.kind <> 'text' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.clear_message(p_id, auth.uid());
end $$;

-- ── Guard on new messages: rate limits and blocks ───────────────────────────
create or replace function private.messages_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_other uuid;
begin
  new.removed_by := null;
  if new.kind <> 'text' or new.author_id is null or new.guest_name is not null then return new; end if;
  -- Only what a person writes themselves (not the call sheet, crew calls and other work messages)
  if new.author_id = auth.uid() then
    if (select count(*) from public.messages m
         where m.author_id = new.author_id and m.kind = 'text' and m.created_at > now() - interval '1 minute') >= 20
       or (select count(*) from public.messages m
         where m.author_id = new.author_id and m.kind = 'text' and m.created_at > now() - interval '1 hour') >= 300 then
      raise exception 'Too many messages, try again in a minute' using errcode = '54000';
    end if;
  end if;
  select c.kind into v_kind from public.conversations c where c.id = new.conversation_id;
  if v_kind = 'direct' then
    select m.user_id into v_other from public.conversation_members m
     where m.conversation_id = new.conversation_id and m.user_id <> new.author_id limit 1;
    if v_other is not null and exists (
         select 1 from public.user_blocks b
          where b.active and ((b.user_id = v_other and b.blocked_id = new.author_id) or (b.user_id = new.author_id and b.blocked_id = v_other))) then
      raise exception 'Blocked' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create or replace trigger messages_guard before insert on public.messages
  for each row execute function private.messages_guard();

-- Mentions and replies from someone you blocked don't notify you
create or replace function private.notifications_block_filter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'message' and new.actor_id is not null and exists (
       select 1 from public.user_blocks b where b.user_id = new.user_id and b.blocked_id = new.actor_id and b.active) then
    return null;
  end if;
  return new;
end $$;
create or replace trigger notifications_block_filter before insert on public.notifications
  for each row execute function private.notifications_block_filter();

-- ── Blocking ─────────────────────────────────────────────────────────────────
create or replace function private.block_user_unchecked(p_user uuid, p_block boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'Not allowed' using errcode = '22023'; end if;
  insert into public.user_blocks (user_id, blocked_id, active) values (auth.uid(), p_user, p_block)
  on conflict (user_id, blocked_id) do update set active = excluded.active, created_at = now();
end $$;
create or replace function public.block_user(p_user uuid, p_block boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.block_user_unchecked(p_user, p_block);
end $$;

-- People you blocked, with their names (for Account)
create or replace function private.my_blocks_unchecked() returns table(user_id uuid, full_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, p.full_name, b.created_at
    from public.user_blocks b left join public.profiles p on p.id = b.blocked_id
   where b.user_id = auth.uid() and b.active
   order by b.created_at desc
$$;
create or replace function public.my_blocks() returns table(user_id uuid, full_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_blocks_unchecked();
end $$;

-- ── Reporting ────────────────────────────────────────────────────────────────
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
    continue when v_user = v_msg.author_id;
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
create or replace function public.report_message(p_id uuid, p_reason text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.report_message_unchecked(p_id, p_reason, p_note);
end $$;

-- Open reports in a conversation, for the people running it (never who reported)
create or replace function private.open_reports_unchecked(p_conv uuid)
returns table(message_id uuid, reports integer, reasons text[], notes text[], first_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.message_id, count(*)::integer, array_agg(distinct r.reason), array_remove(array_agg(r.note order by r.created_at), null), min(r.created_at)
    from public.message_reports r
   where r.conversation_id = p_conv and r.resolved_at is null
     and private.can_manage_conversation(p_conv)
   group by r.message_id
$$;
create or replace function public.open_reports(p_conv uuid)
returns table(message_id uuid, reports integer, reasons text[], notes text[], first_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.open_reports_unchecked(p_conv);
end $$;

-- A moderator removes a message (reported or not) or keeps a reported one
create or replace function private.moderate_message_unchecked(p_id uuid, p_remove boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages; v_conv public.conversations;
begin
  select * into v_msg from public.messages where id = p_id;
  select * into v_conv from public.conversations where id = v_msg.conversation_id;
  if v_msg.id is null or v_conv.kind = 'direct' or v_msg.kind <> 'text'
     or not private.can_manage_conversation(v_msg.conversation_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_remove and v_msg.deleted_at is null then
    perform private.clear_message(p_id, auth.uid());
    if v_msg.author_id is not null and v_msg.author_id <> auth.uid() then
      insert into public.notifications (user_id, gig_id, org_id, kind, details)
      values (v_msg.author_id, v_conv.gig_id, coalesce(v_conv.org_id, (select g.org_id from public.gigs g where g.id = v_conv.gig_id)),
              'message_removed', jsonb_build_object('conversation_id', v_conv.id, 'where', private.conversation_label(v_conv.id),
                                                    'excerpt', left(v_msg.body, 120)));
    end if;
  end if;
  update public.message_reports
     set resolved_at = now(), resolved_by = auth.uid(), outcome = case when p_remove then 'removed' else 'kept' end
   where message_id = p_id and resolved_at is null;
  update public.notifications set read_at = now()
   where kind = 'message_report' and read_at is null and details->>'message_id' = p_id::text;
end $$;
create or replace function public.moderate_message(p_id uuid, p_remove boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.moderate_message_unchecked(p_id, p_remove);
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke execute on function private.conversation_moderators(uuid) from public, anon, authenticated;
revoke execute on function private.conversation_label(uuid) from public, anon, authenticated;
revoke execute on function private.clear_message(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.remove_message_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.messages_guard() from public, anon, authenticated;
revoke execute on function private.notifications_block_filter() from public, anon, authenticated;
revoke execute on function private.block_user_unchecked(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.my_blocks_unchecked() from public, anon, authenticated;
revoke execute on function private.report_message_unchecked(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.open_reports_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.moderate_message_unchecked(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.block_user(uuid, boolean) from public, anon;
revoke execute on function public.my_blocks() from public, anon;
revoke execute on function public.report_message(uuid, text, text) from public, anon;
revoke execute on function public.open_reports(uuid) from public, anon;
revoke execute on function public.moderate_message(uuid, boolean) from public, anon;
grant execute on function public.block_user(uuid, boolean) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.report_message(uuid, text, text) to authenticated;
grant execute on function public.open_reports(uuid) to authenticated;
grant execute on function public.moderate_message(uuid, boolean) to authenticated;
