-- Messaging M2 (docs/MESSAGING.md): attachments, object cards, @mentions, reactions,
-- edit with history, removal, links to a message.
-- Written without destructive statements so it applies without manual confirmation. That is
-- why a message keeps needing a body: a message that is only files or a card gets a short
-- automatic one ("📎 rider.pdf"), and a removed message keeps its row with its content cleared.

alter table public.messages add column if not exists attachments jsonb not null default '[]';
alter table public.messages add column if not exists mentions jsonb not null default '[]';
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

-- Earlier bodies of edited messages, readable by whoever can read the conversation
create table if not exists public.message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body text not null,
  replaced_at timestamptz not null default clock_timestamp()
);
create index if not exists message_edits_message_idx on public.message_edits (message_id, replaced_at);

-- Reactions from a fixed set; switched off rather than removed
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '🙏', '✅', '👀')),
  active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_conversation_idx on public.message_reactions (conversation_id);

alter table public.message_edits enable row level security;
alter table public.message_reactions enable row level security;
create policy message_edits_select on public.message_edits for select to authenticated
  using (private.can_access_conversation(conversation_id));
create policy message_reactions_select on public.message_reactions for select to authenticated
  using (private.can_access_conversation(conversation_id));
create policy mfa_required on public.message_edits as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.message_reactions as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Both are written only by the functions below

-- Text messages may now carry a card in their payload; the trigger checks it
create policy messages_insert_m2 on public.messages for insert to authenticated
  with check (author_id = auth.uid() and kind = 'text' and payload is not null and private.can_post_conversation(conversation_id));

-- ── Files ────────────────────────────────────────────────────────────────────
-- Private bucket; paths are <conversation id>/<random id>/<file name>. Whoever can post uploads;
-- whoever can read the conversation downloads, but only files a message still shows.
insert into storage.buckets (id, name, public, file_size_limit)
values ('message-files', 'message-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create or replace function private.message_file_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_conversation(private.path_uuid(p_name, 1))
     and exists (select 1 from public.messages m
                  where m.conversation_id = private.path_uuid(p_name, 1) and m.deleted_at is null
                    and m.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
$$;
create policy message_files_select on storage.objects for select to authenticated
  using (bucket_id = 'message-files' and (owner_id = auth.uid()::text or private.message_file_visible(name)));
create policy message_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'message-files' and private.can_post_conversation(private.path_uuid(name, 1)));

-- ── Checking what a message carries ─────────────────────────────────────────
-- Whether the author may point at this object (they can only share what they can see)
create or replace function private.can_see_card(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'gig' then private.can_access_gig(p_id)
    when 'schedule' then exists (select 1 from public.gig_schedule s where s.id = p_id and private.can_access_gig(s.gig_id))
    when 'asset' then exists (select 1 from public.assets a where a.id = p_id and private.can_access_gig(a.gig_id))
    when 'quote' then exists (select 1 from public.quotes q where q.id = p_id and private.can_quote(q.org_id))
    when 'item' then exists (select 1 from public.price_items i where i.id = p_id and private.can_quote(i.org_id))
    else false end
$$;

-- Who a group mention reaches on a gig: everyone, crew, managers, or one function ("fn:sound")
create or replace function private.mention_group_members(p_gig uuid, p_group text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select g.user_id from public.gig_members g
   where g.gig_id = p_gig and (
     p_group = 'everyone'
     or (p_group = 'crew' and g.role = 'crew')
     or (p_group = 'managers' and g.role = 'pm')
     or (p_group like 'fn:%' and lower(trim(g.function_title)) = substr(p_group, 4)))
$$;

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

  -- Mentions: people on the gig; groups only from the gig's managers. Others are dropped.
  v_clean := '[]';
  if v_conv.kind = 'gig' and jsonb_typeof(new.mentions) = 'array' then
    v_manager := private.can_manage_gig(v_conv.gig_id);
    for v_item in select * from jsonb_array_elements(new.mentions) limit 20 loop
      if v_item ? 'user' and exists (select 1 from public.gig_members g
                                      where g.gig_id = v_conv.gig_id and g.user_id = private.path_uuid(v_item->>'user', 1)) then
        v_clean := v_clean || jsonb_build_array(jsonb_build_object('user', v_item->>'user'));
      elsif v_item ? 'group' and v_manager
            and (v_item->>'group' in ('everyone', 'crew', 'managers') or v_item->>'group' like 'fn:%') then
        v_clean := v_clean || jsonb_build_array(jsonb_build_object('group', left(lower(v_item->>'group'), 60)));
      end if;
    end loop;
  end if;
  new.mentions := v_clean;
  new.edited_at := null;
  new.deleted_at := null;
  return new;
end $$;
create or replace trigger messages_check before insert on public.messages
  for each row execute function private.messages_check();

-- ── Notifications ────────────────────────────────────────────────────────────
-- Like private.notify_message (M1), with why the person is told: direct, reply or mention
create or replace function private.notify_conversation(p_user uuid, p_msg public.messages, p_gig uuid, p_why text) returns void
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
           details = details || jsonb_build_object('count', coalesce((details->>'count')::integer, 1) + 1,
                                                   'excerpt', left(p_msg.body, 120), 'why', p_why)
     where id = v_existing;
  else
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    values (p_user, p_gig, p_msg.author_id, 'message',
            jsonb_build_object('conversation_id', p_msg.conversation_id, 'count', 1, 'excerpt', left(p_msg.body, 120),
                               'gig_name', v_gig, 'why', p_why));
  end if;
end $$;

create or replace function private.messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv record; v_other uuid; v_reply_author uuid; v_user uuid; v_item jsonb; v_told uuid[] := '{}';
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
    perform private.notify_conversation(v_other, new, null, 'direct');
    return null;
  end if;
  -- Gig channel: mentioned people and groups, then whoever was replied to; each told once
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

-- ── Editing, removing, reacting ─────────────────────────────────────────────
create or replace function private.edit_message_unchecked(p_id uuid, p_body text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages; v_body text := trim(coalesce(p_body, ''));
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or v_msg.author_id is distinct from auth.uid() or v_msg.kind <> 'text' or v_msg.deleted_at is not null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'Message length' using errcode = '22023'; end if;
  if v_body = v_msg.body then return; end if;
  insert into public.message_edits (message_id, conversation_id, body) values (p_id, v_msg.conversation_id, v_msg.body);
  update public.messages set body = v_body, edited_at = clock_timestamp() where id = p_id;
end $$;
create or replace function public.edit_message(p_id uuid, p_body text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.edit_message_unchecked(p_id, p_body);
end $$;

-- Removing clears the text, files, card, mentions, earlier versions and reactions; a
-- "message removed" marker stays so replies still make sense
create or replace function private.remove_message_unchecked(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or v_msg.author_id is distinct from auth.uid() or v_msg.kind <> 'text' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_msg.deleted_at is not null then return; end if;
  update public.messages
     set body = '—', attachments = '[]', payload = null, mentions = '[]', deleted_at = clock_timestamp()
   where id = p_id;
  update public.message_edits set body = '—' where message_id = p_id;
  update public.message_reactions set active = false, updated_at = clock_timestamp() where message_id = p_id;
  update public.notifications set details = details || jsonb_build_object('excerpt', '')
   where kind = 'message' and read_at is null and details->>'conversation_id' = v_msg.conversation_id::text
     and details->>'excerpt' = left(v_msg.body, 120);
end $$;
create or replace function public.remove_message(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.remove_message_unchecked(p_id);
end $$;

-- Turns a reaction on or off; returns whether it's now on
create or replace function private.react_unchecked(p_id uuid, p_emoji text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_msg public.messages; v_on boolean;
begin
  select * into v_msg from public.messages where id = p_id;
  if v_msg.id is null or v_msg.deleted_at is not null or not private.can_post_conversation(v_msg.conversation_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.message_reactions (message_id, conversation_id, user_id, emoji)
  values (p_id, v_msg.conversation_id, auth.uid(), p_emoji)
  on conflict (message_id, user_id, emoji) do update
    set active = not public.message_reactions.active, updated_at = clock_timestamp()
  returning active into v_on;
  return v_on;
end $$;
create or replace function public.react(p_id uuid, p_emoji text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.react_unchecked(p_id, p_emoji);
end $$;

-- Live updates for edits, removals and reactions
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

revoke execute on function private.message_file_visible(text) from public, anon;
grant execute on function private.message_file_visible(text) to authenticated;
revoke execute on function private.can_see_card(text, uuid) from public, anon, authenticated;
revoke execute on function private.mention_group_members(uuid, text) from public, anon, authenticated;
revoke execute on function private.messages_check() from public, anon, authenticated;
revoke execute on function private.notify_conversation(uuid, public.messages, uuid, text) from public, anon, authenticated;
revoke execute on function private.edit_message_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.remove_message_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.react_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function public.edit_message(uuid, text) from public, anon;
revoke execute on function public.remove_message(uuid) from public, anon;
revoke execute on function public.react(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.remove_message(uuid) to authenticated;
grant execute on function public.react(uuid, text) to authenticated;
