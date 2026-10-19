-- Messaging M4 (docs/MESSAGING.md), part 2 of 2: messages joined to the rest of AVX.
--   · availability questions and their answers appear in the direct conversation
--   · crew calls: a position offered to several people at once; the first to accept are added
--   · the call sheet published to the gig's channel as an announcement to confirm
--   · schedule changes posted to the gig's channel
--   · conversations about one thing: an equipment item, a repair, a subrental (quotes in M4b)
-- Needs part 1 (20261104000000_context_kind.sql, run by hand) first.
-- Written without destructive statements so it applies without manual confirmation.

create unique index if not exists conversations_context_uniq on public.conversations (context_type, context_id) where kind = 'context';

-- ── Access, now with conversations about one thing (organisation staff) ──────
create or replace function private.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and (
       (c.kind = 'direct' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid()))
       or (c.kind = 'gig' and private.can_access_gig(c.gig_id))
       or (c.kind = 'department' and (private.can_manage_gig(c.gig_id)
             or exists (select 1 from private.department_members(c.gig_id, c.department) d where d = auth.uid())))
       or (c.kind = 'org' and (private.in_org_audience(c.org_id, c.audience, auth.uid()) or private.is_org_admin(c.org_id)))
       or (c.kind = 'context' and private.can_quote(c.org_id))))
$$;
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
                     and private.in_org_audience(c.org_id, c.audience, o.user_id)))))
       or (c.kind = 'context' and private.can_quote(c.org_id))))
$$;
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
  union
  select o.user_id from public.conversations c join public.org_members o on o.org_id = c.org_id
   where c.id = p_conv and c.kind = 'context' and o.role in ('admin', 'member')
$$;
create or replace function private.can_manage_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conv and (
       (c.kind in ('gig', 'department') and private.can_manage_gig(c.gig_id))
       or (c.kind in ('org', 'context') and private.is_org_admin(c.org_id))))
$$;

-- Your conversations: as M3, plus conversations about one thing once they have messages
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
        or (c.kind in ('department', 'context') and c.last_message_at is not null and private.can_access_conversation(c.id))
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

-- ── Conversations about one thing ────────────────────────────────────────────
-- The organisation's admins and members discuss an item, a repair or a subrental; made on first use
create or replace function private.context_conversation_unchecked(p_type text, p_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_title text; v_id uuid;
begin
  if p_type = 'item' then
    select i.org_id, i.name into v_org, v_title from public.price_items i where i.id = p_id;
  elsif p_type = 'repair' then
    select r.org_id, coalesce(i.name, '') into v_org, v_title from public.repairs r left join public.price_items i on i.id = r.item_id where r.id = p_id;
  elsif p_type = 'subrental' then
    select s.org_id, coalesce(sp.name, '') into v_org, v_title from public.subrentals s left join public.suppliers sp on sp.id = s.supplier_id where s.id = p_id;
  end if;
  if v_org is null or not private.can_quote(v_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.conversations (kind, org_id, context_type, context_id, title, created_by)
  values ('context', v_org, p_type, p_id, left(nullif(trim(v_title), ''), 80), auth.uid())
  on conflict (context_type, context_id) where kind = 'context' do nothing returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.kind = 'context' and c.context_type = p_type and c.context_id = p_id;
  end if;
  return v_id;
end $$;
create or replace function public.context_conversation(p_type text, p_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.context_conversation_unchecked(p_type, p_id);
end $$;

-- ── Direct conversations opened by AVX itself ────────────────────────────────
create or replace function private.ensure_direct(p_a uuid, p_b uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_key text := least(p_a::text, p_b::text) || ':' || greatest(p_a::text, p_b::text); v_id uuid;
begin
  if p_a is null or p_b is null or p_a = p_b then return null; end if;
  insert into public.conversations (kind, direct_key, created_by) values ('direct', v_key, p_a)
  on conflict (direct_key) do nothing returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.direct_key = v_key;
  else
    insert into public.conversation_members (conversation_id, user_id) values (v_id, p_a), (v_id, p_b);
  end if;
  return v_id;
end $$;

-- ── Availability questions in the direct conversation ───────────────────────
create or replace function private.availability_requests_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid; v_gig text;
begin
  if new.asked_by is null or new.asked_by = new.person_id then return null; end if;
  if tg_op = 'INSERT' then
    v_conv := private.ensure_direct(new.asked_by, new.person_id);
    select g.name into v_gig from public.gigs g where g.id = new.gig_id;
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, new.asked_by, 'system', jsonb_build_object(
      'event', 'availability', 'request_id', new.id, 'gig_id', new.gig_id, 'gig_name', v_gig,
      'from', lower(new.period), 'until', upper(new.period), 'message', new.message));
  elsif new.status is distinct from old.status and new.status in ('available', 'unavailable', 'withdrawn') then
    v_conv := private.ensure_direct(new.asked_by, new.person_id);
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, case when new.status = 'withdrawn' then new.asked_by else new.person_id end, 'system',
            jsonb_build_object('event', 'availability_answer', 'request_id', new.id, 'status', new.status, 'note', new.reply_note));
  end if;
  return null;
end $$;
create or replace trigger availability_requests_chat after insert or update on public.availability_requests
  for each row execute function private.availability_requests_chat();

-- ── Crew calls ───────────────────────────────────────────────────────────────
create table if not exists public.crew_calls (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  quantity integer not null default 1 check (quantity between 1 and 20),
  note text check (char_length(coalesce(note, '')) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists crew_calls_gig_idx on public.crew_calls (gig_id, created_at desc);
create table if not exists public.crew_call_answers (
  call_id uuid not null references public.crew_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null default 'invited' check (answer in ('invited', 'accepted', 'declined', 'full')),
  answered_at timestamptz,
  primary key (call_id, user_id)
);
create index if not exists crew_call_answers_user_idx on public.crew_call_answers (user_id);
alter table public.crew_calls enable row level security;
alter table public.crew_call_answers enable row level security;
-- Helpers so the two read rules don't look each other up
create or replace function private.invited_to_crew_call(p_call uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crew_call_answers a where a.call_id = p_call and a.user_id = auth.uid())
$$;
create or replace function private.manages_crew_call(p_call uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crew_calls c where c.id = p_call and private.can_manage_gig(c.gig_id))
$$;
grant execute on function private.invited_to_crew_call(uuid) to authenticated;
grant execute on function private.manages_crew_call(uuid) to authenticated;
revoke execute on function private.invited_to_crew_call(uuid) from public, anon;
revoke execute on function private.manages_crew_call(uuid) from public, anon;
create policy crew_calls_select on public.crew_calls for select to authenticated
  using (private.can_manage_gig(gig_id) or private.invited_to_crew_call(id));
create policy crew_call_answers_select on public.crew_call_answers for select to authenticated
  using (user_id = auth.uid() or private.manages_crew_call(call_id));
create policy mfa_required on public.crew_calls as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.crew_call_answers as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- A gig's manager offers a position to people they can message; each gets it in their direct
-- conversation with a notification. Returns how many were invited.
create or replace function private.send_crew_call_unchecked(p_gig uuid, p_title text, p_quantity integer, p_note text, p_people uuid[])
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_call uuid; v_person uuid; v_conv uuid; v_gig record; v_n integer := 0;
begin
  if not private.can_manage_gig(p_gig) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select g.name, g.org_id, g.start_date, g.end_date into v_gig from public.gigs g where g.id = p_gig;
  insert into public.crew_calls (gig_id, title, quantity, note, created_by)
  values (p_gig, trim(p_title), coalesce(p_quantity, 1), nullif(trim(coalesce(p_note, '')), ''), v_me) returning id into v_call;
  foreach v_person in array coalesce(p_people, '{}') loop
    continue when v_person = v_me or not private.can_message(v_me, v_person)
      or exists (select 1 from public.gig_members g where g.gig_id = p_gig and g.user_id = v_person)
      or exists (select 1 from public.crew_call_answers a where a.call_id = v_call and a.user_id = v_person);
    insert into public.crew_call_answers (call_id, user_id) values (v_call, v_person);
    v_conv := private.ensure_direct(v_me, v_person);
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, v_me, 'system', jsonb_build_object('event', 'crew_call', 'call_id', v_call, 'gig_id', p_gig, 'gig_name', v_gig.name,
            'title', trim(p_title), 'start_date', v_gig.start_date, 'end_date', v_gig.end_date));
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    values (v_person, null, v_gig.org_id, v_me, 'crew_call',
            jsonb_build_object('call_id', v_call, 'conversation_id', v_conv, 'gig_name', v_gig.name, 'title', trim(p_title),
                               'start_date', v_gig.start_date, 'end_date', v_gig.end_date));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nobody to invite' using errcode = '22023'; end if;
  return v_n;
end $$;
create or replace function public.send_crew_call(p_gig uuid, p_title text, p_quantity integer, p_note text, p_people uuid[])
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.send_crew_call_unchecked(p_gig, p_title, p_quantity, p_note, p_people);
end $$;

-- Accept or decline. Accepting while places are left adds you to the gig with that function;
-- the last place closes the call. Returns your answer ('accepted', 'declined' or 'full').
create or replace function private.answer_crew_call_unchecked(p_call uuid, p_accept boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_call public.crew_calls; v_mine text; v_taken integer; v_answer text; v_conv uuid;
begin
  select * into v_call from public.crew_calls where id = p_call for update;
  select a.answer into v_mine from public.crew_call_answers a where a.call_id = p_call and a.user_id = v_me;
  if v_call.id is null or v_mine is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_mine = 'accepted' then return 'accepted'; end if;
  select count(*) into v_taken from public.crew_call_answers a where a.call_id = p_call and a.answer = 'accepted';
  if not p_accept then
    v_answer := 'declined';
  elsif v_call.closed_at is not null or v_taken >= v_call.quantity then
    v_answer := 'full';
  else
    v_answer := 'accepted';
    insert into public.gig_members (gig_id, user_id, role, function_title) values (v_call.gig_id, v_me, 'crew', v_call.title)
    on conflict (gig_id, user_id) do nothing;
    if v_taken + 1 >= v_call.quantity then update public.crew_calls set closed_at = now() where id = p_call; end if;
  end if;
  update public.crew_call_answers set answer = v_answer, answered_at = now() where call_id = p_call and user_id = v_me;
  v_conv := private.ensure_direct(v_call.created_by, v_me);
  if v_conv is not null then
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, v_me, 'system', jsonb_build_object('event', 'crew_call_answer', 'call_id', p_call, 'answer', v_answer, 'title', v_call.title));
  end if;
  if v_call.created_by is not null and v_answer <> 'full' then
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    select v_call.created_by, v_call.gig_id, v_me, 'crew_call_answer',
           jsonb_build_object('call_id', p_call, 'answer', v_answer, 'title', v_call.title, 'gig_name', g.name)
      from public.gigs g where g.id = v_call.gig_id;
  end if;
  update public.notifications set read_at = now()
   where user_id = v_me and kind = 'crew_call' and read_at is null and details->>'call_id' = p_call::text;
  return v_answer;
end $$;
create or replace function public.answer_crew_call(p_call uuid, p_accept boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.answer_crew_call_unchecked(p_call, p_accept);
end $$;

create or replace function private.close_crew_call_unchecked(p_call uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.crew_calls c where c.id = p_call and private.can_manage_gig(c.gig_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.crew_calls set closed_at = coalesce(closed_at, now()) where id = p_call;
end $$;
create or replace function public.close_crew_call(p_call uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.close_crew_call_unchecked(p_call);
end $$;

-- ── The call sheet, published to the gig's channel ───────────────────────────
create or replace function private.can_see_card(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'gig' then private.can_access_gig(p_id)
    when 'callsheet' then private.can_access_gig(p_id)
    when 'schedule' then exists (select 1 from public.gig_schedule s where s.id = p_id and private.can_access_gig(s.gig_id))
    when 'asset' then exists (select 1 from public.assets a where a.id = p_id and private.can_access_gig(a.gig_id))
    when 'quote' then exists (select 1 from public.quotes q where q.id = p_id and private.can_quote(q.org_id))
    when 'item' then exists (select 1 from public.price_items i where i.id = p_id and private.can_quote(i.org_id))
    else false end
$$;

-- An announcement everyone on the gig confirms, with the call sheet as its card
create or replace function private.publish_call_sheet_unchecked(p_gig uuid, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_conv uuid; v_id uuid;
begin
  if not private.can_manage_gig(p_gig) then raise exception 'Not allowed' using errcode = '42501'; end if;
  v_conv := private.ensure_gig_channel(p_gig);
  insert into public.messages (conversation_id, author_id, kind, body, payload, needs_ack)
  values (v_conv, auth.uid(), 'text', left(coalesce(nullif(trim(p_body), ''), '📋'), 4000),
          jsonb_build_object('card', jsonb_build_object('type', 'callsheet', 'id', p_gig)), true)
  returning id into v_id;
  return v_id;
end $$;
create or replace function public.publish_call_sheet(p_gig uuid, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.publish_call_sheet_unchecked(p_gig, p_body);
end $$;

-- ── Schedule changes in the gig's channel ───────────────────────────────────
-- Added or changed items are posted (not for draft gigs); several changes by the same person
-- within 15 minutes are gathered into one line
create or replace function private.gig_schedule_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid; v_last public.messages;
begin
  if tg_op = 'UPDATE' and (new.day, new.start_time, new.end_time, new.title, new.location)
                          is not distinct from (old.day, old.start_time, old.end_time, old.title, old.location) then
    return null;
  end if;
  if not exists (select 1 from public.gigs g where g.id = new.gig_id and g.status <> 'draft') then return null; end if;
  select c.id into v_conv from public.conversations c where c.kind = 'gig' and c.gig_id = new.gig_id;
  if v_conv is null then return null; end if;
  select * into v_last from public.messages m where m.conversation_id = v_conv order by m.created_at desc limit 1;
  if v_last.kind = 'system' and v_last.payload->>'event' = 'schedule' and v_last.author_id is not distinct from auth.uid()
     and v_last.created_at > clock_timestamp() - interval '15 minutes' then
    update public.messages
       set payload = jsonb_set(jsonb_set(payload, '{count}', to_jsonb(coalesce((payload->>'count')::integer, 1) + 1)),
                               '{items}', (coalesce(payload->'items', '[]'::jsonb) || to_jsonb(new.title)))
     where id = v_last.id;
  else
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, auth.uid(), 'system', jsonb_build_object('event', 'schedule', 'count', 1, 'items', jsonb_build_array(new.title),
            'day', new.day, 'start_time', new.start_time));
  end if;
  return null;
end $$;
create or replace trigger gig_schedule_chat after insert or update on public.gig_schedule
  for each row execute function private.gig_schedule_chat();

revoke execute on function private.context_conversation_unchecked(text, uuid) from public, anon, authenticated;
revoke execute on function private.ensure_direct(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.availability_requests_chat() from public, anon, authenticated;
revoke execute on function private.send_crew_call_unchecked(uuid, text, integer, text, uuid[]) from public, anon, authenticated;
revoke execute on function private.answer_crew_call_unchecked(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.close_crew_call_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.publish_call_sheet_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.gig_schedule_chat() from public, anon, authenticated;
revoke execute on function public.context_conversation(text, uuid) from public, anon;
revoke execute on function public.send_crew_call(uuid, text, integer, text, uuid[]) from public, anon;
revoke execute on function public.answer_crew_call(uuid, boolean) from public, anon;
revoke execute on function public.close_crew_call(uuid) from public, anon;
revoke execute on function public.publish_call_sheet(uuid, text) from public, anon;
grant execute on function public.context_conversation(text, uuid) to authenticated;
grant execute on function public.send_crew_call(uuid, text, integer, text, uuid[]) to authenticated;
grant execute on function public.answer_crew_call(uuid, boolean) to authenticated;
grant execute on function public.close_crew_call(uuid) to authenticated;
grant execute on function public.publish_call_sheet(uuid, text) to authenticated;
