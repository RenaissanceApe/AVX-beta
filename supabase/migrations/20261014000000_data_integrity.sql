-- Data integrity
-- * Deleting the newest version of an asset makes the previous version current again.
-- * References to a user become NULL when that user is deleted, so accounts can be
--   removed later (account deletion is on the roadmap) without breaking shared gigs.
-- * Length limits so a single request can't store unbounded text.

alter table public.assets drop constraint if exists assets_superseded_by_fkey;
alter table public.assets add constraint assets_superseded_by_fkey
  foreign key (superseded_by) references public.assets(id) on delete set null;

alter table public.organisations drop constraint if exists organisations_created_by_fkey;
alter table public.organisations add constraint organisations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.gigs drop constraint if exists gigs_created_by_fkey;
alter table public.gigs add constraint gigs_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.assets drop constraint if exists assets_created_by_fkey;
alter table public.assets add constraint assets_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.feed_posts drop constraint if exists feed_posts_user_id_fkey;
alter table public.feed_posts add constraint feed_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_full_name_length;
alter table public.profiles add constraint profiles_full_name_length check (char_length(full_name) <= 120);
alter table public.organisations drop constraint if exists organisations_name_length;
alter table public.organisations add constraint organisations_name_length check (char_length(trim(name)) between 1 and 120);
alter table public.gigs drop constraint if exists gigs_text_length;
alter table public.gigs add constraint gigs_text_length check (
  char_length(trim(name)) between 1 and 200
  and char_length(coalesce(venue, '')) <= 300
  and char_length(coalesce(description, '')) <= 5000
);
alter table public.gigs drop constraint if exists gigs_dates_order;
alter table public.gigs add constraint gigs_dates_order check (end_date is null or start_date is null or end_date >= start_date);
alter table public.gig_members drop constraint if exists gig_members_function_title_length;
alter table public.gig_members add constraint gig_members_function_title_length check (char_length(coalesce(function_title, '')) <= 120);
alter table public.assets drop constraint if exists assets_name_length;
alter table public.assets add constraint assets_name_length check (char_length(trim(name)) between 1 and 200);
alter table public.feed_posts drop constraint if exists feed_posts_content_length;
alter table public.feed_posts add constraint feed_posts_content_length check (char_length(trim(content)) between 1 and 5000);

create index if not exists assets_superseded_by_idx on public.assets (superseded_by);
