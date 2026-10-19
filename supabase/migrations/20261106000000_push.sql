-- Messaging M5a (docs/MESSAGING.md): push notifications on phones and computers (web push from the
-- installed app or the browser). Each device that turns them on stores a subscription; when a
-- notification is created (or a grouped one counts up), a trigger asks the send-push function to
-- deliver it. The push keys are made by send-push itself on first use and kept in push_keys,
-- which no signed-in user or visitor can read.
-- Written without destructive statements so it applies without manual confirmation.

-- The trigger below calls send-push through pg_net (Database → Extensions)
create extension if not exists pg_net;

-- ── Devices ──────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device text check (char_length(coalesce(device, '')) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id) where revoked_at is null;
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy mfa_required on public.push_subscriptions as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- This device turns notifications on (a device moves to whoever signs in on it last)
create or replace function private.save_push_subscription_unchecked(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(nullif(trim(coalesce(p_device, '')), ''), 120))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device,
        revoked_at = null, created_at = now();
end $$;
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.save_push_subscription_unchecked(p_endpoint, p_p256dh, p_auth, p_device);
end $$;

-- This device turns them off
create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.push_subscriptions set revoked_at = now()
   where endpoint = p_endpoint and user_id = auth.uid() and revoked_at is null
$$;

-- ── Keys (only the send-push function, with the service role, reads or writes these) ──
create table if not exists public.push_keys (
  id integer primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  function_url text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;

-- ── Sending ──────────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists pushed_at timestamptz;

-- A new notification, or a grouped one counting up (its time moves on), for someone with a
-- device: ask send-push to deliver it. send-push decides (mutes, how often); a failure here never
-- stops the notification itself.
create or replace function private.notifications_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  if new.read_at is not null then return null; end if;
  if tg_op = 'UPDATE' and new.created_at <= old.created_at then return null; end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = new.user_id and s.revoked_at is null) then return null; end if;
  select k.function_url into v_url from public.push_keys k where k.id = 1;
  if v_url is null then return null; end if;
  begin
    perform net.http_post(url := v_url, body := jsonb_build_object('id', new.id),
                          headers := jsonb_build_object('Content-Type', 'application/json'));
  exception when others then
    raise warning 'push request failed: %', sqlerrm;
  end;
  return null;
end $$;
create or replace trigger notifications_push after insert or update of created_at on public.notifications
  for each row execute function private.notifications_push();

revoke execute on function private.save_push_subscription_unchecked(text, text, text, text) from public, anon, authenticated;
revoke execute on function private.notifications_push() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
