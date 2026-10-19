-- Messaging M3 (docs/MESSAGING.md), part 2 of 2: organisation channels, department channels
-- on gigs, pinned messages, announcements that ask for a read-and-confirm, search, saved
-- messages. Needs part 1 (20261103000000_conversation_kinds.sql, run by hand) first.
-- Written without destructive statements so it applies without manual confirmation.

alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists audience text;            -- org: everyone | staff | admins
alter table public.conversations add column if not exists admins_post boolean not null default false; -- org: only admins write
alter table public.conversations add column if not exists archived_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_org_fields_check') then
    alter table public.conversations add constraint conversations_org_fields_check
      check ((kind = 'org') = (audience is not null)
         and (audience is null or audience in ('everyone', 'staff', 'admins'))
         and (kind <> 'org' or char_length(trim(coalesce(title, ''))) between 1 and 80)
         and char_length(coalesce(department, '')) <= 60);
  end if;
end $$;
create unique index if not exists conversations_department_uniq on public.conversations (gig_id, department) where kind = 'department';
create index if not exists conversations_org_idx on public.conversations (org_id) where kind = 'org';

alter table public.messages add column if not exists pinned_at timestamptz;
alter table public.messages add column if not exists pinned_by uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists needs_ack boolean not null default false;
create index if not exists messages_pinned_idx on public.messages (conversation_id) where pinned_at is not null;

-- "Read and confirmed" on announcements
create table if not exists public.message_acks (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acked_at timestamptz not null default clock_timestamp(),
  primary key (message_id, user_id)
);
-- Messages each person keeps for later; switched off rather than removed
create table if not exists public.saved_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  saved boolean not null default true,
  saved_at timestamptz not null default clock_timestamp(),
  primary key (user_id, message_id)
);
create index if not exists saved_messages_user_idx on public.saved_messages (user_id, saved_at desc) where saved;

-- ── Who is in a conversation ─────────────────────────────────────────────────
-- A department of a gig: everyone whose function on the gig is that one, or its PMs ("managers")
create or replace function private.department_members(p_gig uuid, p_department text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select g.user_id from public.gig_members g
   where g.gig_id = p_gig and g.role <> 'viewer'
     and ((p_department = 'managers' and g.role = 'pm')
          or (p_department <> 'managers' and lower(trim(g.function_title)) = p_department))
$$;

-- Whether a person is in an organisation channel's audience
create or replace function private.in_org_audience(p_org uuid, p_audience text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m
                  where m.org_id = p_org and m.user_id = p_user
                    and (p_audience = 'everyone' or (p_audience = 'staff' and m.role in ('admin', 'member'))
                         or (p_audience = 'admins' and m.role = 'admin')))
$$;

-- Everyone who reads a conversation (for announcements and mentions)
create or replace function private.conversation_audience(p_conv uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.conversations c join public.conversation_members m on m.conversation_id = c.id
   where c.id = p_conv and c.kind = 'direct'
  union
  select g.user_id from public.conversations c join public.gig_members g on g.gig_id = c.gig_id
   where c.id = p_conv and c.kind = 'gig'
  union
  select private.department_members(c.gig_id, c.department) from public.conversations c
   where c.id = p_conv and c.kind = 'department'
  union
  select o.user_id from public.conversations c join public.org_members o on o.org_id = c.org_id
   where c.id = p_conv and c.kind = 'org' and private.in_org_audience(c.org_id, c.audience, o.user_id)
$$;

-- Who runs a conversation: the gig's managers, the organisation's admins (pin, announce)
create or replace function private.can_manage_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and (
       (c.kind in ('gig', 'department') and private.can_manage_gig(c.gig_id))
       or (c.kind = 'org' and private.is_org_admin(c.org_id))))
$$;

create or replace function private.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and (
       (c.kind = 'direct' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
       or (c.kind = 'gig' and private.can_access_gig(c.gig_id))
       or (c.kind = 'department' and (private.can_manage_gig(c.gig_id)
             or exists (select 1 from private.department_members(c.gig_id, c.department) d where d = auth.uid())))
       or (c.kind = 'org' and (private.in_org_audience(c.org_id, c.audience, auth.uid()) or private.is_org_admin(c.org_id)))))
$$;
-- Viewers read; archived channels are read-only; "admins only" org channels take only admins
create or replace function private.can_post_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and c.archived_at is null and (
       (c.kind = 'direct' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
       or (c.kind = 'gig' and (private.can_manage_gig(c.gig_id)
             or exists (select 1 from public.gig_members g where g.gig_id = c.gig_id and g.user_id = auth.uid() and g.role in ('pm', 'crew'))))
       or (c.kind = 'department' and (private.can_manage_gig(c.gig_id)
             or exists (select 1 from private.department_members(c.gig_id, c.department) d where d = auth.uid())))
       or (c.kind = 'org' and (private.is_org_admin(c.org_id)
             or (not c.admins_post and exists (select 1 from public.org_members o
                   where o.org_id = c.org_id and o.user_id = auth.uid() and o.role <> 'viewer'
                     and private.in_org_audience(c.org_id, c.audience, o.user_id)))))))
$$;

alter table public.message_acks enable row level security;
alter table public.saved_messages enable row level security;
-- Your own confirmations; the conversation's managers and the announcement's author see all
create policy message_acks_select on public.message_acks for select to authenticated
  using (user_id = auth.uid() or private.can_manage_conversation(conversation_id)
         or exists (select 1 from public.messages m where m.id = message_id and m.author_id = auth.uid()));
create policy saved_messages_select on public.saved_messages for select to authenticated
  using (user_id = auth.uid() and private.can_access_conversation(conversation_id));
create policy mfa_required on public.message_acks as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.saved_messages as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- ── What a message carries (M2's checks, extended) ───────────────────────────
create or replace function private.messages_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv record; v_item jsonb; v_clean jsonb := '[]'; v_card jsonb; v_path text; v_manager boolean;
begin
  if new.kind <> 'text' then return new; end if;
  select c.kind, c.gig_id into v_conv from public.conversations c where c.id = new.conversation_id;

  -- Attachments: up to 10 files this person uploaded to this conversation
  if jsonb_typeof(new.attachments) <> 'array' or jsonb_array_length(new.attachments) > 10 then
    raise exception 'Up to 10 files per message' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(new.attachments) loop
    v_path := v_item->>'path';
    if v_path is null or private.path_uuid(v_path, 1) is distinct from new.conversation_id
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'message-files' and o.name = v_path and o.owner_id = new.author_id::text) then
      raise exception 'Attachment not found' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'path', v_path,
      'name', left(coalesce(nullif(trim(v_item->>'name'), ''), split_part(v_path, '/', 3)), 200),
      'type', left(coalesce(v_item->>'type', ''), 100),
      'size', coalesce((v_item->>'size')::bigint, 0)));
  end loop;
  new.attachments := v_clean;

  -- Card: one object the author can see
  if new.payload is not null then
    v_card := new.payload->'card';
    if v_card is null or (select count(*) from jsonb_object_keys(new.payload)) <> 1
       or not private.can_see_card(v_card->>'type', private.path_uuid(coalesce(v_card->>'id', ''), 1)) then
      raise exception 'Card not allowed' using errcode = '42501';
    end if;
    new.payload := jsonb_build_object('card', jsonb_build_object('type', v_card->>'type', 'id', v_card->>'id'));
  end if;

  -- Mentions: people who read this channel; groups only on a gig's channel, from its managers
  v_clean := '[]';
  if v_conv.kind <> 'direct' and jsonb_typeof(new.mentions) = 'array' then
    v_manager := v_conv.kind = 'gig' and private.can_manage_gig(v_conv.gig_id);
    for v_item in select * from jsonb_array_elements(new.mentions) limit 20 loop
      if v_item ? 'user' and exists (select 1 from private.conversation_audience(new.conversation_id) a
                                      where a = private.path_uuid(v_item->>'user', 1)) then
        v_clean := v_clean || jsonb_build_array(jsonb_build_object('user', v_item->>'user'));
      elsif v_item ? 'group' and v_manager
            and (v_item->>'group' in ('everyone', 'crew', 'managers') or v_item->>'group' like 'fn:%') then
        v_clean := v_clean || jsonb_build_array(jsonb_build_object('group', left(lower(v_item->>'group'), 60)));
      end if;
    end loop;
  end if;
  new.mentions := v_clean;

  -- Announcements: from whoever runs the channel, never in direct conversations
  if new.needs_ack and (v_conv.kind = 'direct' or not private.can_manage_conversation(new.conversation_id)) then
    raise exception 'Only the people running this channel can send announcements' using errcode = '42501';
  end if;
  new.pinned_at := null;
  new.pinned_by := null;
  new.edited_at := null;
  new.deleted_at := null;
  return new;
end $$;

-- ── Notifications ────────────────────────────────────────────────────────────
create or replace function private.messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv record; v_other uuid; v_reply_author uuid; v_user uuid; v_item jsonb; v_told uuid[] := '{}'; v_where text;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id
  returning kind, gig_id, org_id, title, department into v_conv;
  if new.author_id is not null then
    insert into public.conversation_state (conversation_id, user_id, last_read_at) values (new.conversation_id, new.author_id, new.created_at)
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;
  if new.kind <> 'text' then return null; end if;
  if v_conv.kind = 'direct' then
    select m.user_id into v_other from public.conversation_members m where m.conversation_id = new.conversation_id and m.user_id <> new.author_id limit 1;
    perform private.notify_conversation(v_other, new, null, 'direct');
    return null;
  end if;
  -- Announcements: one notification each, not grouped, even in muted channels
  if new.needs_ack then
    select coalesce(v_conv.title, g.name) into v_where from public.gigs g where g.id = v_conv.gig_id;
    v_where := coalesce(v_where, v_conv.title);
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    select a, v_conv.gig_id, v_conv.org_id, new.author_id, 'announcement',
           jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'excerpt', left(new.body, 120), 'where', v_where)
      from private.conversation_audience(new.conversation_id) a
     where a is distinct from new.author_id;
    return null;
  end if;
  -- Channels: mentioned people and groups, then whoever was replied to; each told once
  for v_item in select * from jsonb_array_elements(new.mentions) loop
    for v_user in
      select private.path_uuid(v_item->>'user', 1) where v_item ? 'user'
      union select private.mention_group_members(v_conv.gig_id, v_item->>'group') where v_item ? 'group'
    loop
      if v_user is not null and not v_user = any(v_told) then
        perform private.notify_conversation(v_user, new, v_conv.gig_id, 'mention');
        v_told := v_told || v_user;
      end if;
    end loop;
  end loop;
  if new.reply_to is not null then
    select m.author_id into v_reply_author from public.messages m where m.id = new.reply_to;
    if v_reply_author is not null and not v_reply_author = any(v_told) then
      perform private.notify_conversation(v_reply_author, new, v_conv.gig_id, 'reply');
    end if;
  end if;
  return null;
end $$;

-- ── Channels ─────────────────────────────────────────────────────────────────
create or replace function private.save_org_channel_unchecked(p_id uuid, p_org uuid, p_title text, p_audience text,
                                                              p_admins_post boolean, p_archived boolean) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid := p_org; v_id uuid := p_id;
begin
  if p_id is not null then select c.org_id into v_org from public.conversations c where c.id = p_id and c.kind = 'org'; end if;
  if v_org is null or not private.is_org_admin(v_org) then
    raise exception 'Only the organisation''s admins manage its channels' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.conversations (kind, org_id, title, audience, admins_post, created_by)
    values ('org', v_org, trim(p_title), coalesce(p_audience, 'everyone'), coalesce(p_admins_post, false), auth.uid())
    returning id into v_id;
  else
    update public.conversations
       set title = trim(coalesce(p_title, title)), audience = coalesce(p_audience, audience),
           admins_post = coalesce(p_admins_post, admins_post),
           archived_at = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) end
     where id = p_id;
  end if;
  return v_id;
end $$;
create or replace function public.save_org_channel(p_id uuid, p_org uuid, p_title text, p_audience text default null,
                                                   p_admins_post boolean default null, p_archived boolean default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.save_org_channel_unchecked(p_id, p_org, p_title, p_audience, p_admins_post, p_archived);
end $$;

-- A gig's departments you can open: one per function on the gig, plus "managers"
create or replace function private.gig_departments_unchecked(p_gig uuid)
returns table(department text, label text, people integer, conversation_id uuid)
language sql stable security definer set search_path = '' as $$
  with deps as (
    select lower(trim(g.function_title)) as department, min(trim(g.function_title)) as label, count(*)::integer as people
      from public.gig_members g
     where g.gig_id = p_gig and g.role <> 'viewer' and nullif(trim(g.function_title), '') is not null
     group by 1
    union all
    select 'managers', null, count(*)::integer from public.gig_members g where g.gig_id = p_gig and g.role = 'pm'
  )
  select d.department, d.label, d.people,
         (select c.id from public.conversations c where c.kind = 'department' and c.gig_id = p_gig and c.department = d.department)
    from deps d
   where private.can_access_gig(p_gig) and d.people > 0
     and (private.can_manage_gig(p_gig)
          or exists (select 1 from private.department_members(p_gig, d.department) m where m = auth.uid()))
   order by d.department = 'managers', d.label
$$;
create or replace function public.gig_departments(p_gig uuid)
returns table(department text, label text, people integer, conversation_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.gig_departments_unchecked(p_gig);
end $$;

create or replace function private.department_channel_unchecked(p_gig uuid, p_department text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_dep text := lower(trim(coalesce(p_department, ''))); v_id uuid;
begin
  if not exists (select 1 from private.gig_departments_unchecked(p_gig) d where d.department = v_dep) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.conversations (kind, gig_id, department, created_by) values ('department', p_gig, v_dep, auth.uid())
  on conflict (gig_id, department) where kind = 'department' do nothing returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.kind = 'department' and c.gig_id = p_gig and c.department = v_dep;
  end if;
  return v_id;
end $$;
create or replace function public.department_channel(p_gig uuid, p_department text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.department_channel_unchecked(p_gig, p_department);
end $$;

-- ── Your conversations, with channels ────────────────────────────────────────
create or replace function private.my_inbox_unchecked()
returns table(id uuid, kind text, gig_id uuid, gig_name text, org_id uuid, org_name text, title text, department text,
              other_user uuid, other_name text, last_message_at timestamptz, last_body text, last_kind text,
              last_author uuid, unread integer, muted boolean, archived boolean, pinned integer)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select c.* from public.conversations c
     where (c.kind = 'direct' and c.last_message_at is not null
            and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
        or (c.kind = 'gig' and c.last_message_at is not null and private.can_access_gig(c.gig_id) and (
              exists (select 1 from public.gig_members g where g.gig_id = c.gig_id and g.user_id = auth.uid())
              or exists (select 1 from public.conversation_state s where s.conversation_id = c.id and s.user_id = auth.uid())))
        or (c.kind = 'department' and c.last_message_at is not null and private.can_access_conversation(c.id))
        or (c.kind = 'org' and private.can_access_conversation(c.id))
  )
  select c.id, c.kind, c.gig_id, g.name, c.org_id, org.name, c.title, c.department,
         o.user_id, p.full_name, c.last_message_at, lm.body, lm.kind, lm.author_id,
         (select count(*)::integer from (select 1 from public.messages x
            where x.conversation_id = c.id and x.author_id is distinct from auth.uid()
              and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz) limit 99) u),
         coalesce(s.muted, false), c.archived_at is not null,
         (select count(*)::integer from public.messages x where x.conversation_id = c.id and x.pinned_at is not null and x.deleted_at is null)
    from mine c
    left join public.gigs g on g.id = c.gig_id
    left join public.organisations org on org.id = c.org_id
    left join public.conversation_members o on c.kind = 'direct' and o.conversation_id = c.id and o.user_id <> auth.uid()
    left join public.profiles p on p.id = o.user_id
    left join public.conversation_state s on s.conversation_id = c.id and s.user_id = auth.uid()
    left join lateral (select m.body, m.kind, m.author_id from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
   order by c.archived_at is not null, c.last_message_at desc nulls last
   limit 300
$$;
create or replace function public.my_inbox()
returns table(id uuid, kind text, gig_id uuid, gig_name text, org_id uuid, org_name text, title text, department text,
              other_user uuid, other_name text, last_message_at timestamptz, last_body text, last_kind text,
              last_author uuid, unread integer, muted boolean, archived boolean, pinned integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_inbox_unchecked();
end $$;

-- ── Pins, confirmations, saved, search ───────────────────────────────────────
-- Pinning: whoever runs the channel; either person in a direct conversation
create or replace function private.pin_message_unchecked(p_id uuid, p_on boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages; v_kind text;
begin
  select * into v_msg from public.messages where id = p_id;
  select c.kind into v_kind from public.conversations c where c.id = v_msg.conversation_id;
  if v_msg.id is null or v_msg.deleted_at is not null or v_msg.kind <> 'text'
     or not (private.can_manage_conversation(v_msg.conversation_id)
             or (v_kind = 'direct' and private.can_post_conversation(v_msg.conversation_id))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.messages
     set pinned_at = case when p_on then coalesce(pinned_at, clock_timestamp()) end,
         pinned_by = case when p_on then coalesce(pinned_by, auth.uid()) end
   where id = p_id;
end $$;
create or replace function public.pin_message(p_id uuid, p_on boolean default true) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.pin_message_unchecked(p_id, p_on);
end $$;

create or replace function private.ack_message_unchecked(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or not v_msg.needs_ack or v_msg.deleted_at is not null
     or not exists (select 1 from private.conversation_audience(v_msg.conversation_id) a where a = auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.message_acks (message_id, conversation_id, user_id) values (p_id, v_msg.conversation_id, auth.uid())
  on conflict (message_id, user_id) do nothing;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and kind = 'announcement' and read_at is null and details->>'message_id' = p_id::text;
end $$;
create or replace function public.ack_message(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.ack_message_unchecked(p_id);
end $$;

-- Who has confirmed an announcement: for its author and whoever runs the channel
create or replace function private.announcement_status_unchecked(p_id uuid)
returns table(user_id uuid, full_name text, acked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or not v_msg.needs_ack
     or not (v_msg.author_id = auth.uid() or private.can_manage_conversation(v_msg.conversation_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select a.a, p.full_name, k.acked_at
      from private.conversation_audience(v_msg.conversation_id) a
      left join public.profiles p on p.id = a.a
      left join public.message_acks k on k.message_id = p_id and k.user_id = a.a
     where a.a is distinct from v_msg.author_id
     order by k.acked_at nulls first, p.full_name;
end $$;
create or replace function public.announcement_status(p_id uuid)
returns table(user_id uuid, full_name text, acked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.announcement_status_unchecked(p_id);
end $$;

-- Saving a message for later; returns whether it's now saved
create or replace function private.toggle_saved_unchecked(p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages; v_on boolean;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or not private.can_access_conversation(v_msg.conversation_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.saved_messages (user_id, message_id, conversation_id) values (auth.uid(), p_id, v_msg.conversation_id)
  on conflict (user_id, message_id) do update set saved = not public.saved_messages.saved, saved_at = clock_timestamp()
  returning saved into v_on;
  return v_on;
end $$;
create or replace function public.toggle_saved(p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.toggle_saved_unchecked(p_id);
end $$;

-- Search the text of messages you can read (all conversations, or one); newest first
create or replace function public.search_messages(p_query text, p_conv uuid default null)
returns table(id uuid, conversation_id uuid, author_id uuid, body text, created_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
declare v_q text := trim(coalesce(p_query, ''));
begin
  perform private.require_mfa();
  if char_length(v_q) < 2 then return; end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select m.id, m.conversation_id, m.author_id, m.body, m.created_at
      from public.messages m
     where m.kind = 'text' and m.deleted_at is null and m.body ilike v_q
       and (p_conv is null or m.conversation_id = p_conv)
     order by m.created_at desc
     limit 50;
end $$;

-- Live confirmations
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_acks') then
    alter publication supabase_realtime add table public.message_acks;
  end if;
end $$;

grant execute on function private.department_members(uuid, text) to authenticated;
grant execute on function private.in_org_audience(uuid, text, uuid) to authenticated;
grant execute on function private.can_manage_conversation(uuid) to authenticated;
revoke execute on function private.department_members(uuid, text) from public, anon;
revoke execute on function private.in_org_audience(uuid, text, uuid) from public, anon;
revoke execute on function private.can_manage_conversation(uuid) from public, anon;
revoke execute on function private.conversation_audience(uuid) from public, anon, authenticated;
revoke execute on function private.save_org_channel_unchecked(uuid, uuid, text, text, boolean, boolean) from public, anon, authenticated;
revoke execute on function private.gig_departments_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.department_channel_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.my_inbox_unchecked() from public, anon, authenticated;
revoke execute on function private.pin_message_unchecked(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.ack_message_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.announcement_status_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.toggle_saved_unchecked(uuid) from public, anon, authenticated;
revoke execute on function public.save_org_channel(uuid, uuid, text, text, boolean, boolean) from public, anon;
revoke execute on function public.gig_departments(uuid) from public, anon;
revoke execute on function public.department_channel(uuid, text) from public, anon;
revoke execute on function public.my_inbox() from public, anon;
revoke execute on function public.pin_message(uuid, boolean) from public, anon;
revoke execute on function public.ack_message(uuid) from public, anon;
revoke execute on function public.announcement_status(uuid) from public, anon;
revoke execute on function public.toggle_saved(uuid) from public, anon;
revoke execute on function public.search_messages(text, uuid) from public, anon;
grant execute on function public.save_org_channel(uuid, uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.gig_departments(uuid) to authenticated;
grant execute on function public.department_channel(uuid, text) to authenticated;
grant execute on function public.my_inbox() to authenticated;
grant execute on function public.pin_message(uuid, boolean) to authenticated;
grant execute on function public.ack_message(uuid) to authenticated;
grant execute on function public.announcement_status(uuid) to authenticated;
grant execute on function public.toggle_saved(uuid) to authenticated;
grant execute on function public.search_messages(text, uuid) to authenticated;
