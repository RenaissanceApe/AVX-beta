-- Switching S4 (docs/SWITCHING.md): each person's gigs in their phone's own calendar.
-- calendar_feeds: one private feed link per person (a long random key). The calendar-feed Edge
-- Function reads the gigs of whoever owns the key; anyone with the link sees those gigs' names,
-- dates, venues and call times, nothing else. calendar_feed(new) shows the link, making it the
-- first time; calendar_feed(true) replaces it, so the old link stops working.
-- Written without destructive statements so it applies without manual confirmation.

create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_select on public.calendar_feeds for select to authenticated using (user_id = auth.uid());
-- Written only by calendar_feed() and the Edge Function (service role)

create or replace function public.calendar_feed(p_new boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select token into v_token from public.calendar_feeds where user_id = auth.uid();
  if v_token is null or p_new then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.calendar_feeds (user_id, token) values (auth.uid(), v_token)
    on conflict (user_id) do update set token = excluded.token, created_at = now(), last_used_at = null;
  end if;
  return v_token;
end $$;
revoke execute on function public.calendar_feed(boolean) from public, anon;
grant execute on function public.calendar_feed(boolean) to authenticated;
