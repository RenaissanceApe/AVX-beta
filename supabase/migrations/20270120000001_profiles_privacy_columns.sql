-- Profiles privacy, part 2 (issue #188, hotfix 0.82.3).
-- Closes the private columns phone, email_digest and weekly_numbers. Apply ONLY after the 0.82.3 app
-- is live: earlier versions read these columns straight from the table and would stop loading your
-- profile. You read your own through public.my_profile(); gig crew phones come from
-- public.gig_crew_phones(gig) (both in 20270120000000_profiles_privacy.sql).
--
-- A table-wide SELECT grant overrides a column revoke, so the table-wide grant is taken back and
-- SELECT is granted again on the other columns only. A column added to profiles later is not
-- readable until it's added to this list on purpose.
-- UPDATE grants stay, so you can still save your own settings (profiles_update limits that to your row).
revoke select on public.profiles from authenticated, anon;
grant select (id, full_name, avatar_url, specialisms, language, findable_by, created_at) on public.profiles to authenticated;
