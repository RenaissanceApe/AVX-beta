-- Privacy-friendly usage analytics for the pilot: one counter per day per screen or
-- action ("view:gig", "quote:sent"), summed over everyone. No user id, IP, device or
-- cookie is stored, so a count can't be traced back to a person. Kept in the private
-- schema (not reachable through the API); read it in the SQL editor, see docs/USAGE.md.

create table if not exists private.usage_daily (
  day date not null default current_date,
  event text not null check (event ~ '^[a-z0-9_.:/-]{1,60}$'),
  n integer not null default 0,
  primary key (day, event)
);

-- Signed-in app sessions send a small batch of event names now and then
create or replace function public.track_usage(p_events text[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare e text;
begin
  if auth.uid() is null or p_events is null then return; end if;
  foreach e in array p_events[1:25] loop
    if e ~ '^[a-z0-9_.:/-]{1,60}$' then
      insert into private.usage_daily (day, event, n) values (current_date, e, 1)
        on conflict (day, event) do update set n = private.usage_daily.n + 1;
    end if;
  end loop;
end $$;
revoke execute on function public.track_usage(text[]) from public, anon;
grant execute on function public.track_usage(text[]) to authenticated;

-- Last 30 days at a glance (SQL editor: select * from private.usage_summary)
create or replace view private.usage_summary as
  select event, sum(n) filter (where day > current_date - 7) as last_7_days, sum(n) as last_30_days
  from private.usage_daily
  where day > current_date - 30
  group by event
  order by last_30_days desc;
