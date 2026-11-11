-- Profiles privacy, part 2 (issue #188, hotfix 0.82.3).
-- Closes the private columns. Apply ONLY after the 0.82.3 app is live: earlier versions read these
-- columns straight from the table and would stop loading your profile.
-- You read your own through public.my_profile(); gig crew phones come from public.gig_crew_phones(gig)
-- (both in 20270120000000_profiles_privacy.sql).
-- UPDATE grants stay, so you can still save your own settings (profiles_update limits that to your row).
revoke select (phone, email_digest, weekly_numbers) on public.profiles from authenticated, anon;
