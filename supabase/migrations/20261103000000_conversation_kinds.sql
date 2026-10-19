-- Messaging M3, part 1 of 2: allow organisation and department channels.
-- RUN BY HAND in the Supabase SQL editor (AVX test first, then the live project): it replaces
-- two rules on public.conversations, which needs DROP CONSTRAINT. No data is read or changed.
-- Safe to run twice. Part 2 (20261103000001_messaging_m3.sql) is applied after this one.

alter table public.conversations add column if not exists org_id uuid references public.organisations(id) on delete cascade;
alter table public.conversations add column if not exists department text;

alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations drop constraint if exists conversations_check;
alter table public.conversations drop constraint if exists conversations_kinds_check;
alter table public.conversations drop constraint if exists conversations_kind_fields_check;

-- direct: two people · gig: everyone on a gig · department: part of a gig's crew · org: an organisation channel
alter table public.conversations add constraint conversations_kinds_check
  check (kind in ('direct', 'gig', 'department', 'org'));
alter table public.conversations add constraint conversations_kind_fields_check
  check ((kind in ('gig', 'department')) = (gig_id is not null)
     and (kind = 'department') = (department is not null)
     and (kind = 'org') = (org_id is not null));

select 'Conversation kinds updated' as result;
