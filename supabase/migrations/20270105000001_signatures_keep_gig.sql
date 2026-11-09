-- Step 16 · E-signature (S11), part 2 — RUN BY HAND (test, then production), after
-- 20270105000000_signatures.sql. It is in its own file because it adds a trigger on gig
-- deletions, which the project's rules keep out of the Supabase connector.
--
-- signatures.gig_id cascades, so erasing a gig for good would silently erase its signed delivery
-- notes (and leave their files in storage). This refuses a gig's erase while it has signatures,
-- hidden ones included. Erasing the whole organisation still works: by the time its gigs go, the
-- organisation row is already gone, and its signatures go with it (as the privacy notice says).
-- The app checks first and explains (EditGigModal); this is the guard behind it.
-- Accepted quotes can't reach the quote bin, so quote acceptances don't need the same guard.
-- Check by hand: supabase/tests/signatures_keep_gig.sql

create or replace function private.gigs_keep_signatures() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.signatures s where s.gig_id = old.id)
     and exists (select 1 from public.organisations o where o.id = old.org_id) then
    raise exception 'A gig with signatures can''t be erased' using errcode = '42501';
  end if;
  return old;
end $$;

create or replace trigger gigs_keep_signatures before delete on public.gigs
  for each row execute function private.gigs_keep_signatures();
