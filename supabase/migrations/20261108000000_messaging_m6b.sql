-- Messaging M6b (docs/MESSAGING.md): an organisation's care of its conversations.
-- 1. Retention: admins choose how long the organisation's conversations keep messages (its
--    channels, its gigs' channels and the conversations about its equipment, quotes and
--    subrentals; never direct conversations). Kept forever unless they choose 90 days, 6 months,
--    1 year or 2 years. Every night a job asks the message-retention function to delete older
--    messages and their files for good.
-- 2. Export: admins download the organisation's conversations.
-- 3. Usage counts: how much the organisation's conversations are used.
-- Written without destructive statements so it applies without manual confirmation; the step
-- that deletes messages is in 20261108000001_message_retention_delete.sql (run by hand).

alter table public.organisations add column if not exists message_retention_days integer;
alter table public.organisations add column if not exists message_retention_set_by uuid references auth.users(id) on delete set null;
alter table public.organisations add column if not exists message_retention_set_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_message_retention_days_check') then
    alter table public.organisations add constraint organisations_message_retention_days_check
      check (message_retention_days is null or message_retention_days in (90, 180, 365, 730));
  end if;
end $$;

-- ── Which conversations belong to an organisation ─────────────────────────────
create or replace function private.org_conversations(p_org uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.conversations c where c.org_id = p_org and c.kind in ('org', 'context')
  union all
  select c.id from public.conversations c join public.gigs g on g.id = c.gig_id
   where g.org_id = p_org and c.kind in ('gig', 'department')
$$;

-- ── Retention setting (admins) ────────────────────────────────────────────────
create or replace function private.set_message_retention_unchecked(p_org uuid, p_days integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_days is not null and p_days not in (90, 180, 365, 730) then raise exception 'Period' using errcode = '22023'; end if;
  update public.organisations
     set message_retention_days = p_days, message_retention_set_by = auth.uid(), message_retention_set_at = now()
   where id = p_org;
end $$;
create or replace function public.set_message_retention(p_org uuid, p_days integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.set_message_retention_unchecked(p_org, p_days);
end $$;

-- What a period would delete straight away (for the warning before choosing it)
create or replace function private.retention_preview_unchecked(p_org uuid, p_days integer)
returns table(messages bigint, files bigint)
language sql stable security definer set search_path = '' as $$
  select count(*), coalesce(sum(jsonb_array_length(m.attachments)), 0)
    from public.messages m
   where private.is_org_admin(p_org) and p_days is not null
     and m.conversation_id in (select private.org_conversations(p_org))
     and m.created_at < now() - make_interval(days => p_days)
$$;
create or replace function public.retention_preview(p_org uuid, p_days integer)
returns table(messages bigint, files bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.retention_preview_unchecked(p_org, p_days);
end $$;

-- ── Usage counts (admins) ─────────────────────────────────────────────────────
create or replace function private.org_message_stats_unchecked(p_org uuid)
returns table(conversations bigint, messages bigint, messages_30d bigint, writers_30d bigint, files bigint, file_bytes bigint, oldest timestamptz)
language sql stable security definer set search_path = '' as $$
  with convs as (select private.org_conversations(p_org) id),
       msgs as (select m.* from public.messages m where m.conversation_id in (select id from convs) and m.kind = 'text')
  select (select count(*) from convs),
         (select count(*) from msgs),
         (select count(*) from msgs where created_at > now() - interval '30 days'),
         (select count(distinct coalesce(author_id::text, guest_name)) from msgs where created_at > now() - interval '30 days'),
         (select coalesce(sum(jsonb_array_length(attachments)), 0) from msgs),
         (select coalesce(sum((a->>'size')::bigint), 0) from msgs, jsonb_array_elements(attachments) a),
         (select min(created_at) from msgs)
   where private.is_org_admin(p_org)
$$;
create or replace function public.org_message_stats(p_org uuid)
returns table(conversations bigint, messages bigint, messages_30d bigint, writers_30d bigint, files bigint, file_bytes bigint, oldest timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.org_message_stats_unchecked(p_org);
end $$;

-- ── Export (admins): the organisation's conversations, newest 50,000 messages ──
create or replace function private.export_org_messages_unchecked(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  with convs as (select private.org_conversations(p_org) id),
       msgs as (
         select m.* from public.messages m
          where m.conversation_id in (select id from convs)
          order by m.created_at desc limit 50000)
  select coalesce(jsonb_agg(conv order by conv->>'first_message'), '[]') into v_out
    from (
      select jsonb_build_object(
               'conversation', c.id,
               'kind', c.kind,
               'name', coalesce(private.conversation_label(c.id), ''),
               'about', c.context_type,
               'first_message', min(m.created_at),
               'messages', jsonb_agg(jsonb_build_object(
                  'at', m.created_at,
                  'from', coalesce(m.guest_name, p.full_name, case when m.author_id is null then null else 'Someone' end),
                  'kind', m.kind,
                  'text', case when m.deleted_at is not null then null else m.body end,
                  'event', m.payload->>'event',
                  'files', (select coalesce(jsonb_agg(a->>'name'), '[]') from jsonb_array_elements(m.attachments) a),
                  'reply_to', m.reply_to,
                  'id', m.id,
                  'edited', m.edited_at is not null,
                  'removed', m.deleted_at is not null,
                  'announcement', m.needs_ack) order by m.created_at)) conv
        from msgs m
        join public.conversations c on c.id = m.conversation_id
        left join public.profiles p on p.id = m.author_id
       group by c.id
    ) x;
  return v_out;
end $$;
create or replace function public.export_org_messages(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.export_org_messages_unchecked(p_org);
end $$;

-- ── The nightly job ───────────────────────────────────────────────────────────
-- Keys for jobs that call an edge function; nobody signed in or visiting can read them
create table if not exists public.job_keys (
  name text primary key,
  secret text not null,
  function_url text
);
alter table public.job_keys enable row level security;
revoke all on public.job_keys from anon, authenticated;
insert into public.job_keys (name, secret)
values ('message_retention', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- Messages past their organisation's period, with their files (for the function, which deletes
-- the files first and then the messages)
create or replace function public.retention_due(p_limit integer default 500)
returns table(id uuid, paths text[])
language sql stable security definer set search_path = '' as $$
  select m.id, array(select a->>'path' from jsonb_array_elements(m.attachments) a where a->>'path' is not null)
    from public.organisations o
    cross join lateral private.org_conversations(o.id) c(id)
    join public.messages m on m.conversation_id = c.id
   where o.message_retention_days is not null
     and m.created_at < now() - make_interval(days => o.message_retention_days)
   order by m.created_at
   limit least(greatest(coalesce(p_limit, 500), 1), 2000)
$$;

-- Called by pg_cron each night; does nothing until the function's address is set (SETUP.md)
create or replace function private.run_message_retention() returns void
language plpgsql security definer set search_path = '' as $$
declare v_key public.job_keys;
begin
  select * into v_key from public.job_keys where name = 'message_retention';
  if v_key.function_url is null then return; end if;
  perform net.http_post(url := v_key.function_url, body := '{}'::jsonb,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-job-key', v_key.secret),
                        timeout_milliseconds := 60000);
end $$;

create extension if not exists pg_cron;
do $$
begin
  perform cron.schedule('message-retention', '17 3 * * *', 'select private.run_message_retention()');
end $$;

revoke execute on function private.org_conversations(uuid) from public, anon, authenticated;
revoke execute on function private.set_message_retention_unchecked(uuid, integer) from public, anon, authenticated;
revoke execute on function private.retention_preview_unchecked(uuid, integer) from public, anon, authenticated;
revoke execute on function private.org_message_stats_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.export_org_messages_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.run_message_retention() from public, anon, authenticated;
revoke execute on function public.retention_due(integer) from public, anon, authenticated;
grant execute on function public.retention_due(integer) to service_role;
revoke execute on function public.set_message_retention(uuid, integer) from public, anon;
revoke execute on function public.retention_preview(uuid, integer) from public, anon;
revoke execute on function public.org_message_stats(uuid) from public, anon;
revoke execute on function public.export_org_messages(uuid) from public, anon;
grant execute on function public.set_message_retention(uuid, integer) to authenticated;
grant execute on function public.retention_preview(uuid, integer) to authenticated;
grant execute on function public.org_message_stats(uuid) to authenticated;
grant execute on function public.export_org_messages(uuid) to authenticated;
