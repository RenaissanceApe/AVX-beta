-- ROADMAP step 9, part 2 (apply by hand in the SQL editor, after 20261213000000): a person may
-- still erase their own freelance dates outright, but organisation leave is only ever removed by
-- marking it (removed_at), so the record of a request and its decision stays.
alter policy crew_unavailability_delete on public.crew_unavailability
  using (user_id = (select auth.uid()) and org_id is null);
