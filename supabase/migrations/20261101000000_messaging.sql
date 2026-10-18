-- Phase 6, stage M1: messaging (docs/MESSAGING.md).
-- 1. Conversations: direct (two people) and one channel per gig, whose members are simply
--    the people who can see the gig (nothing copied, so it can't drift).
-- 2. Messages with replies; system messages for gig changes (status, dates, venue).
-- 3. Per-person read position and mute; unread counts; no read receipts.
-- 4. Notifications: direct messages and replies to you, collapsed to one per conversation
--    until read; nothing for muted conversations.
-- Written without destructive statements so it applies without manual confirmation.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'gig')),
  gig_id uuid references public.gigs(id) on delete cascade,
  direct_key text unique,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'gig') = (gig_id is not null)),
  check ((kind = 'direct') = (direct_key is not null))
);
create unique index if not exists conversations_gig_uniq on public.conversations (gig_id) where kind = 'gig';

-- Members of direct conversations (gig channels derive theirs from the gig)
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

-- Each person's read position and mute, for any conversation
create table if not exists public.conversation_state (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_state_user_idx on public.conversation_state (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text check (char_length(coalesce(body, '')) <= 4000),
  payload jsonb,
  reply_to uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'system' or char_length(trim(coalesce(body, ''))) >= 1)
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- ── Access ───────────────────────────────────────────────────────────────────
create or replace function private.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and (
       (c.kind = 'direct' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
       or (c.kind = 'gig' and private.can_access_gig(c.gig_id))))
$$;
-- Viewers read gig channels; crew, PMs and the organisation's managers write
create or replace function private.can_post_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and (
       (c.kind = 'direct' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
       or (c.kind = 'gig' and (private.can_manage_gig(c.gig_id)
             or exists (select 1 from public.gig_members g where g.gig_id = c.gig_id and g.user_id = auth.uid() and g.role in ('pm', 'crew'))))))
$$;
grant execute on function private.can_access_conversation(uuid) to authenticated;
grant execute on function private.can_post_conversation(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_state enable row level security;
alter table public.messages enable row level security;
create policy conversations_select on public.conversations for select to authenticated using (private.can_access_conversation(id));
create policy conversation_members_select on public.conversation_members for select to authenticated using (private.can_access_conversation(conversation_id));
create policy conversation_state_select on public.conversation_state for select to authenticated using (user_id = auth.uid());
create policy messages_select on public.messages for select to authenticated using (private.can_access_conversation(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and kind = 'text' and payload is null and private.can_post_conversation(conversation_id));
create policy mfa_required on public.conversations as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.conversation_members as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.conversation_state as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.messages as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Conversations, members and read state are written by the functions below; messages are
-- added, never edited or removed in M1

-- ── Messages ─────────────────────────────────────────────────────────────────
create or replace function private.messages_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := clock_timestamp();
  if new.kind = 'text' then new.body := trim(new.body); end if;
  if new.reply_to is not null and not exists (select 1 from public.messages m where m.id = new.reply_to and m.conversation_id = new.conversation_id) then
    new.reply_to := null;
  end if;
  return new;
end $$;
create or replace trigger messages_before before insert on public.messages
  for each row execute function private.messages_before();

-- One unread "message" notification per conversation and person, refreshed until read
create or replace function private.notify_message(p_user uuid, p_msg public.messages, p_gig uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_existing bigint; v_gig text;
begin
  if p_user is null or p_user = p_msg.author_id then return; end if;
  if exists (select 1 from public.conversation_state s where s.conversation_id = p_msg.conversation_id and s.user_id = p_user and s.muted) then return; end if;
  select g.name into v_gig from public.gigs g where g.id = p_gig;
  select n.id into v_existing from public.notifications n
   where n.user_id = p_user and n.kind = 'message' and n.read_at is null and n.details->>'conversation_id' = p_msg.conversation_id::text
   limit 1;
  if v_existing is not null then
    update public.notifications
       set actor_id = p_msg.author_id, created_at = now(), emailed_at = null,
           details = details || jsonb_build_object('count', coalesce((details->>'count')::integer, 1) + 1, 'excerpt', left(p_msg.body, 120))
     where id = v_existing;
  else
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    values (p_user, p_gig, p_msg.author_id, 'message',
            jsonb_build_object('conversation_id', p_msg.conversation_id, 'count', 1, 'excerpt', left(p_msg.body, 120), 'gig_name', v_gig));
  end if;
end $$;

create or replace function private.messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv record; v_other uuid; v_reply_author uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id
  returning kind, gig_id into v_conv;
  if new.author_id is not null then
    insert into public.conversation_state (conversation_id, user_id, last_read_at) values (new.conversation_id, new.author_id, new.created_at)
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;
  if new.kind <> 'text' then return null; end if;
  if v_conv.kind = 'direct' then
    select m.user_id into v_other from public.conversation_members m where m.conversation_id = new.conversation_id and m.user_id <> new.author_id limit 1;
    perform private.notify_message(v_other, new, null);
  elsif new.reply_to is not null then
    select m.author_id into v_reply_author from public.messages m where m.id = new.reply_to;
    perform private.notify_message(v_reply_author, new, v_conv.gig_id);
  end if;
  return null;
end $$;
create or replace trigger messages_after after insert on public.messages
  for each row execute function private.messages_after();

-- ── Opening conversations ────────────────────────────────────────────────────
-- Who you can message directly: people you share a gig or organisation with, and your
-- network as each person allows (docs/MESSAGING.md, decisions)
create or replace function private.can_message(p_me uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_me is not null and p_user is not null and p_me <> p_user and (
    exists (select 1 from public.gig_members a join public.gig_members b on b.gig_id = a.gig_id where a.user_id = p_me and b.user_id = p_user)
    or exists (select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id where a.user_id = p_me and b.user_id = p_user)
    or private.can_find(p_me, p_user))
$$;

create or replace function private.start_direct_unchecked(p_user uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_key text; v_id uuid;
begin
  if not private.can_message(v_me, p_user) then
    raise exception 'You can''t message this person' using errcode = '42501';
  end if;
  v_key := least(v_me::text, p_user::text) || ':' || greatest(v_me::text, p_user::text);
  insert into public.conversations (kind, direct_key, created_by) values ('direct', v_key, v_me)
  on conflict (direct_key) do nothing returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.direct_key = v_key;
  else
    insert into public.conversation_members (conversation_id, user_id) values (v_id, v_me), (v_id, p_user);
  end if;
  return v_id;
end $$;
create or replace function public.start_direct(p_user uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.start_direct_unchecked(p_user);
end $$;

-- The gig's channel (made on first use) for anyone who can see the gig
create or replace function private.ensure_gig_channel(p_gig uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.conversations (kind, gig_id) values ('gig', p_gig)
  on conflict (gig_id) where kind = 'gig' do nothing returning id into v_id;
  if v_id is null then select c.id into v_id from public.conversations c where c.kind = 'gig' and c.gig_id = p_gig; end if;
  return v_id;
end $$;
create or replace function public.gig_conversation(p_gig uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.can_access_gig(p_gig) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return private.ensure_gig_channel(p_gig);
end $$;

-- People joining a gig start reading its channel from now, not from the beginning
create or replace function private.gig_members_channel_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversation_state (conversation_id, user_id, last_read_at)
  select c.id, new.user_id, clock_timestamp() from public.conversations c where c.kind = 'gig' and c.gig_id = new.gig_id
  on conflict (conversation_id, user_id) do nothing;
  return null;
end $$;
create or replace trigger gig_members_channel_state after insert on public.gig_members
  for each row execute function private.gig_members_channel_state();

-- System messages in the gig's channel (if it has one) when the gig itself changes
create or replace function private.gigs_channel_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid;
begin
  select c.id into v_conv from public.conversations c where c.kind = 'gig' and c.gig_id = new.id;
  if v_conv is null then return null; end if;
  if new.status is distinct from old.status then
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, auth.uid(), 'system', jsonb_build_object('event', 'status', 'status', new.status));
  end if;
  if (new.start_date, new.end_date) is distinct from (old.start_date, old.end_date) then
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, auth.uid(), 'system', jsonb_build_object('event', 'dates', 'start_date', new.start_date, 'end_date', new.end_date));
  end if;
  if new.venue is distinct from old.venue then
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, auth.uid(), 'system', jsonb_build_object('event', 'venue', 'venue', new.venue));
  end if;
  return null;
end $$;
create or replace trigger gigs_channel_events after update on public.gigs
  for each row execute function private.gigs_channel_events();

-- ── Your conversations ───────────────────────────────────────────────────────
-- Direct conversations you're in, and channels of gigs you're on (or have read), with the
-- latest message and how many you haven't read (up to 99)
create or replace function private.my_conversations_unchecked()
returns table(id uuid, kind text, gig_id uuid, gig_name text, other_user uuid, other_name text,
              last_message_at timestamptz, last_body text, last_kind text, last_author uuid, unread integer, muted boolean)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select c.* from public.conversations c
     where c.last_message_at is not null and (
       (c.kind = 'direct' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
       or (c.kind = 'gig' and private.can_access_gig(c.gig_id) and (
             exists (select 1 from public.gig_members g where g.gig_id = c.gig_id and g.user_id = auth.uid())
             or exists (select 1 from public.conversation_state s where s.conversation_id = c.id and s.user_id = auth.uid()))))
  )
  select c.id, c.kind, c.gig_id, g.name, o.user_id, p.full_name, c.last_message_at,
         lm.body, lm.kind, lm.author_id,
         (select count(*)::integer from (select 1 from public.messages x
            where x.conversation_id = c.id and x.author_id is distinct from auth.uid()
              and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz) limit 99) u),
         coalesce(s.muted, false)
    from mine c
    left join public.gigs g on g.id = c.gig_id
    left join public.conversation_members o on c.kind = 'direct' and o.conversation_id = c.id and o.user_id <> auth.uid()
    left join public.profiles p on p.id = o.user_id
    left join public.conversation_state s on s.conversation_id = c.id and s.user_id = auth.uid()
    left join lateral (select m.body, m.kind, m.author_id from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
   order by c.last_message_at desc
   limit 200
$$;
create or replace function public.my_conversations()
returns table(id uuid, kind text, gig_id uuid, gig_name text, other_user uuid, other_name text,
              last_message_at timestamptz, last_body text, last_kind text, last_author uuid, unread integer, muted boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_conversations_unchecked();
end $$;

-- Mark a conversation read (and its message notifications); mute or unmute it
create or replace function private.read_conversation_unchecked(p_conv uuid, p_muted boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.can_access_conversation(p_conv) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.conversation_state (conversation_id, user_id, last_read_at, muted)
  values (p_conv, auth.uid(), clock_timestamp(), coalesce(p_muted, false))
  on conflict (conversation_id, user_id) do update
    set last_read_at = clock_timestamp(), muted = coalesce(p_muted, public.conversation_state.muted);
  update public.notifications set read_at = now()
   where user_id = auth.uid() and kind = 'message' and read_at is null and details->>'conversation_id' = p_conv::text;
end $$;
create or replace function public.read_conversation(p_conv uuid, p_muted boolean default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.read_conversation_unchecked(p_conv, p_muted);
end $$;

-- Live delivery
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

revoke execute on function private.messages_before() from public, anon, authenticated;
revoke execute on function private.messages_after() from public, anon, authenticated;
revoke execute on function private.notify_message(uuid, public.messages, uuid) from public, anon, authenticated;
revoke execute on function private.can_message(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.start_direct_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.ensure_gig_channel(uuid) from public, anon, authenticated;
revoke execute on function private.gig_members_channel_state() from public, anon, authenticated;
revoke execute on function private.gigs_channel_events() from public, anon, authenticated;
revoke execute on function private.my_conversations_unchecked() from public, anon, authenticated;
revoke execute on function private.read_conversation_unchecked(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.start_direct(uuid) from public, anon;
revoke execute on function public.gig_conversation(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.read_conversation(uuid, boolean) from public, anon;
grant execute on function public.start_direct(uuid) to authenticated;
grant execute on function public.gig_conversation(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.read_conversation(uuid, boolean) to authenticated;
