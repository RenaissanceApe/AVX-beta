-- K7, part 1 (apply BY HAND in the SQL editor, before 20261229000001_reports_k7.sql): a sixth built-in
-- gig status, "cancelled", so cancellations can be counted (docs/ANALYTICS.md, "How K7 works").
-- A cancelled gig behaves like an archived one: it holds no crew or equipment reservations, is left out
-- of availability and clashes, and drops out of the upcoming lists. Organisations' own statuses may
-- stand for it too.
-- Changing a check means replacing it, which the connector may not run; hence this small file.
alter table public.gigs drop constraint if exists gigs_status_check;
alter table public.gigs add constraint gigs_status_check
  check (status in ('draft', 'confirmed', 'active', 'completed', 'archived', 'cancelled'));

alter table public.gig_statuses drop constraint if exists gig_statuses_base_status_check;
alter table public.gig_statuses add constraint gig_statuses_base_status_check
  check (base_status in ('draft', 'confirmed', 'active', 'completed', 'archived', 'cancelled'));
