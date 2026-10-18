-- "My work" lists every gig you're on, across companies. Crew on a gig of a company
-- they don't belong to can't read that company's row, so this returns just the names
-- of the companies whose gigs you're on (nothing else about them).

create or replace function private.my_gig_companies_unchecked() returns table(org_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select distinct o.id, o.name
  from public.gig_members gm
  join public.gigs g on g.id = gm.gig_id
  join public.organisations o on o.id = g.org_id
  where gm.user_id = auth.uid()
$$;
revoke execute on function private.my_gig_companies_unchecked() from public, anon, authenticated;

-- Same two-step sign-in rule as the other functions the app calls (see 20261022000000)
create or replace function public.my_gig_companies() returns table(org_id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_gig_companies_unchecked();
end $$;
revoke execute on function public.my_gig_companies() from public, anon;
grant execute on function public.my_gig_companies() to authenticated;
