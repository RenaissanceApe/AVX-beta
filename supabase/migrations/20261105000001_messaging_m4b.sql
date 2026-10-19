-- Messaging M4b (docs/MESSAGING.md), part 2 of 2: conversations with clients and suppliers who
-- have no AVX account, through the link they already have (a quote's /q/ link) or one made for
-- them (a subrental's /s/ link).
--   · 'quote' conversation: the organisation's staff and the client, on the quote's public page
--   · 'supplier' conversation: the organisation's staff and a subrental's supplier
-- Guests read and write only through guest_thread / guest_post with the link's secret token (looked
-- up by its SHA-256 hash). They type a name; messages are text only and rate-limited.
-- Needs part 1 (20261105000000_guest_conversations.sql, run by hand) first.
-- Written without destructive statements so it applies without manual confirmation.

-- A message from a guest has no author, and the name they typed
alter table public.messages add column if not exists guest_name text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_guest_name_check' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_guest_name_check
      check (guest_name is null or (author_id is null and char_length(trim(guest_name)) between 1 and 80));
  end if;
end $$;

-- ── Supplier links ───────────────────────────────────────────────────────────
-- One working link per subrental; making a new one turns the old one off
create table if not exists public.supplier_links (
  id uuid primary key default gen_random_uuid(),
  subrental_id uuid not null references public.subrentals(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists supplier_links_subrental_idx on public.supplier_links (subrental_id, created_at desc);
alter table public.supplier_links enable row level security;
create policy supplier_links_select on public.supplier_links for select to authenticated
  using (private.can_quote(org_id));
create policy mfa_required on public.supplier_links as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- ── Conversations about one thing, now also a quote (with its client) and a subrental's supplier
create or replace function private.context_conversation_unchecked(p_type text, p_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_title text; v_id uuid;
begin
  if p_type = 'item' then
    select i.org_id, i.name into v_org, v_title from public.price_items i where i.id = p_id;
  elsif p_type = 'repair' then
    select r.org_id, coalesce(i.name, '') into v_org, v_title from public.repairs r left join public.price_items i on i.id = r.item_id where r.id = p_id;
  elsif p_type in ('subrental', 'supplier') then
    select s.org_id, coalesce(sp.name, '') into v_org, v_title from public.subrentals s left join public.suppliers sp on sp.id = s.supplier_id where s.id = p_id;
  elsif p_type = 'quote' then
    select q.org_id, q.title into v_org, v_title from public.quotes q where q.id = p_id;
  end if;
  if v_org is null or not private.can_quote(v_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return private.ensure_context(p_type, p_id, v_org, v_title, auth.uid());
end $$;

-- Find or make the conversation (no permission check: callers check)
create or replace function private.ensure_context(p_type text, p_id uuid, p_org uuid, p_title text, p_by uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.conversations (kind, org_id, context_type, context_id, title, created_by)
  values ('context', p_org, p_type, p_id, left(nullif(trim(p_title), ''), 80), p_by)
  on conflict (context_type, context_id) where kind = 'context' do nothing returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c where c.kind = 'context' and c.context_type = p_type and c.context_id = p_id;
  end if;
  return v_id;
end $$;

-- ── The link a supplier gets ─────────────────────────────────────────────────
create or replace function private.create_supplier_link_unchecked(p_subrental uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_sub record; v_token text;
begin
  select s.id, s.org_id into v_sub from public.subrentals s where s.id = p_subrental;
  if v_sub.id is null or not private.can_quote(v_sub.org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.supplier_links set revoked_at = now() where subrental_id = p_subrental and revoked_at is null;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  insert into public.supplier_links (subrental_id, org_id, token_hash, created_by)
  values (p_subrental, v_sub.org_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());
  perform private.context_conversation_unchecked('supplier', p_subrental);
  return v_token;
end $$;
create or replace function public.create_supplier_link(p_subrental uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.create_supplier_link_unchecked(p_subrental);
end $$;

create or replace function private.revoke_supplier_link_unchecked(p_subrental uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.subrentals s where s.id = p_subrental and private.can_quote(s.org_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.supplier_links set revoked_at = now() where subrental_id = p_subrental and revoked_at is null;
end $$;
create or replace function public.revoke_supplier_link(p_subrental uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.revoke_supplier_link_unchecked(p_subrental);
end $$;

-- ── What a link opens ────────────────────────────────────────────────────────
-- A quote's /q/ link (any share that isn't revoked) or a subrental's /s/ link (the working one).
-- Returns the conversation, made on first use, or nothing.
create or replace function private.guest_resolve(p_token text)
returns table(conversation_id uuid, org_id uuid, context_type text, context_id uuid, link_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare v_hash text; v_share record; v_link record; v_title text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then return; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select s.id, s.quote_id, s.org_id, s.created_by, q.title into v_share
    from public.quote_shares s join public.quotes q on q.id = s.quote_id
   where s.token_hash = v_hash and s.status <> 'revoked';
  if v_share.id is not null then
    return query select private.ensure_context('quote', v_share.quote_id, v_share.org_id, v_share.title, v_share.created_by),
                        v_share.org_id, 'quote'::text, v_share.quote_id, v_share.id;
    return;
  end if;
  select l.id, l.subrental_id, l.org_id, l.created_by into v_link
    from public.supplier_links l where l.token_hash = v_hash and l.revoked_at is null;
  if v_link.id is not null then
    select coalesce(sp.name, '') into v_title from public.subrentals s left join public.suppliers sp on sp.id = s.supplier_id where s.id = v_link.subrental_id;
    update public.supplier_links set last_seen_at = now() where id = v_link.id;
    return query select private.ensure_context('supplier', v_link.subrental_id, v_link.org_id, v_title, v_link.created_by),
                        v_link.org_id, 'supplier'::text, v_link.subrental_id, v_link.id;
  end if;
end $$;

-- The conversation as the guest sees it, and (for a supplier) what the subrental is about
create or replace function public.guest_thread(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_g record; v_about jsonb; v_org jsonb; v_messages jsonb;
begin
  select * into v_g from private.guest_resolve(p_token);
  if v_g.conversation_id is null then return null; end if;
  select jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone) into v_org from public.organisations o where o.id = v_g.org_id;
  if v_g.context_type = 'quote' then
    select jsonb_build_object('kind', 'quote', 'title', q.title, 'number', q.number) into v_about from public.quotes q where q.id = v_g.context_id;
  else
    select jsonb_build_object('kind', 'supplier', 'reference', s.reference, 'status', s.status, 'starts_at', s.starts_at,
             'ends_at', s.ends_at, 'supplier', sp.name,
             'lines', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(i.name, l.description, ''), 'quantity', l.quantity) order by l.position, l.id)
                                  from public.subrental_lines l left join public.price_items i on i.id = l.item_id
                                 where l.subrental_id = s.id), '[]'::jsonb))
      into v_about
      from public.subrentals s left join public.suppliers sp on sp.id = s.supplier_id where s.id = v_g.context_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at,
           'guest', m.guest_name is not null, 'name', coalesce(m.guest_name, nullif(p.full_name, ''), v_org->>'name')) order by m.created_at), '[]'::jsonb)
    into v_messages
    from (select * from public.messages x
           where x.conversation_id = v_g.conversation_id and x.kind = 'text' and x.deleted_at is null
           order by x.created_at desc limit 200) m
    left join public.profiles p on p.id = m.author_id;
  return jsonb_build_object('about', v_about, 'org', v_org, 'messages', v_messages);
end $$;

-- A guest writes. Their name and the text; at most 20 guest messages an hour per conversation.
-- The people who look after the quote or subrental are notified (its author and whoever made the
-- link; the organisation's admins if neither is there any more).
create or replace function public.guest_post(p_token text, p_name text, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_g record; v_name text := left(trim(coalesce(p_name, '')), 80); v_body text := left(trim(coalesce(p_body, '')), 2000);
        v_id uuid; v_about text; v_people uuid[]; v_user uuid; v_existing bigint;
begin
  select * into v_g from private.guest_resolve(p_token);
  if v_g.conversation_id is null then raise exception 'Link not found' using errcode = '42501'; end if;
  if v_name = '' or v_body = '' then raise exception 'Name and message are required' using errcode = '22023'; end if;
  if (select count(*) from public.messages m where m.conversation_id = v_g.conversation_id and m.guest_name is not null
        and m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages, try again later' using errcode = '54000';
  end if;
  insert into public.messages (conversation_id, author_id, kind, body, guest_name)
  values (v_g.conversation_id, null, 'text', v_body, v_name) returning id into v_id;

  if v_g.context_type = 'quote' then
    select q.title, array_remove(array[q.created_by, s.created_by], null) into v_about, v_people
      from public.quotes q left join public.quote_shares s on s.id = v_g.link_id where q.id = v_g.context_id;
  else
    select coalesce(nullif(s.reference, ''), sp.name, ''), array_remove(array[s.created_by, l.created_by], null) into v_about, v_people
      from public.subrentals s left join public.suppliers sp on sp.id = s.supplier_id
      left join public.supplier_links l on l.id = v_g.link_id where s.id = v_g.context_id;
  end if;
  v_people := array(select distinct u from unnest(v_people) u
                     where exists (select 1 from public.org_members o where o.org_id = v_g.org_id and o.user_id = u and o.role in ('admin', 'member')));
  if cardinality(v_people) = 0 then
    v_people := array(select o.user_id from public.org_members o where o.org_id = v_g.org_id and o.role = 'admin');
  end if;
  foreach v_user in array v_people loop
    continue when exists (select 1 from public.conversation_state s where s.conversation_id = v_g.conversation_id and s.user_id = v_user and s.muted);
    select n.id into v_existing from public.notifications n
     where n.user_id = v_user and n.kind = 'guest_message' and n.read_at is null and n.details->>'conversation_id' = v_g.conversation_id::text
     limit 1;
    if v_existing is not null then
      update public.notifications
         set created_at = now(), emailed_at = null,
             details = details || jsonb_build_object('count', coalesce((details->>'count')::integer, 1) + 1,
                                                     'excerpt', left(v_body, 120), 'guest_name', v_name)
       where id = v_existing;
    else
      insert into public.notifications (user_id, org_id, kind, details)
      values (v_user, v_g.org_id, 'guest_message',
              jsonb_build_object('conversation_id', v_g.conversation_id, 'count', 1, 'excerpt', left(v_body, 120),
                                 'guest_name', v_name, 'about', v_about, 'about_kind', v_g.context_type));
    end if;
  end loop;
  return v_id;
end $$;

-- Reading the conversation in the app also clears these notifications
create or replace function private.clear_guest_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.last_read_at is distinct from old.last_read_at or tg_op = 'INSERT' then
    update public.notifications set read_at = now()
     where user_id = new.user_id and kind = 'guest_message' and read_at is null
       and details->>'conversation_id' = new.conversation_id::text;
  end if;
  return null;
end $$;
create or replace trigger clear_guest_notifications after insert or update on public.conversation_state
  for each row execute function private.clear_guest_notifications();

revoke execute on function private.ensure_context(text, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.create_supplier_link_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.revoke_supplier_link_unchecked(uuid) from public, anon, authenticated;
revoke execute on function private.guest_resolve(text) from public, anon, authenticated;
revoke execute on function private.clear_guest_notifications() from public, anon, authenticated;
revoke execute on function public.create_supplier_link(uuid) from public, anon;
revoke execute on function public.revoke_supplier_link(uuid) from public, anon;
revoke execute on function public.guest_thread(text) from public;
revoke execute on function public.guest_post(text, text, text) from public;
grant execute on function public.create_supplier_link(uuid) to authenticated;
grant execute on function public.revoke_supplier_link(uuid) to authenticated;
grant execute on function public.guest_thread(text) to anon, authenticated;
grant execute on function public.guest_post(text, text, text) to anon, authenticated;
