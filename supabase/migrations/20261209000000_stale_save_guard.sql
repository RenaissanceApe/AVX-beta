-- Stale-save guard: two people editing the same record no longer overwrite each other.
-- The edit forms save with "where updated_at = <what I opened>"; if someone else saved in
-- between, nothing is written and the app says "someone else changed this".
-- tasks and clients already stamp updated_at on every update. This adds the column to gigs
-- and gig_schedule, and makes gigs, gig_schedule and price_items stamp it on every update.

alter table public.gigs add column if not exists updated_at timestamptz not null default now();
alter table public.gig_schedule add column if not exists updated_at timestamptz not null default now();

-- clock_timestamp(), not now(): two saves in one transaction still get different stamps
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke execute on function private.touch_updated_at() from public, anon, authenticated;

create or replace trigger touch_updated_at before update on public.gigs
  for each row execute function private.touch_updated_at();
create or replace trigger touch_updated_at before update on public.gig_schedule
  for each row execute function private.touch_updated_at();
create or replace trigger touch_updated_at before update on public.price_items
  for each row execute function private.touch_updated_at();
