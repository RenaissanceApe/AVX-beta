-- Step 23, part V3: fix for 20270122000000_vehicle_loads.sql. Its select policy called
-- private.can_dispatch, which signed-in users may not run, so reading vehicle_loads failed.
-- One helper that may be run, used by the policy instead. Only adds or alters.
create or replace function private.can_see_vehicle_loads(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_gig(p_gig) or private.can_dispatch(p_gig)
$$;
revoke execute on function private.can_see_vehicle_loads(uuid) from public, anon;
grant execute on function private.can_see_vehicle_loads(uuid) to authenticated;

alter policy vehicle_loads_select on public.vehicle_loads using (private.can_see_vehicle_loads(gig_id));
