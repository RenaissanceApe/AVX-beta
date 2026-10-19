-- Messaging M4, part 1 of 2: conversations about one thing (an equipment item, a repair, a
-- subrental, a quote).
-- RUN BY HAND in the Supabase SQL editor (AVX test first, then the live project): it replaces
-- two rules on public.conversations, which needs DROP CONSTRAINT. No data is read or changed.
-- Safe to run twice. Part 2 (20261104000001_messaging_m4.sql) is applied after this one.

alter table public.conversations add column if not exists context_type text;
alter table public.conversations add column if not exists context_id uuid;

alter table public.conversations drop constraint if exists conversations_kinds_check;
alter table public.conversations drop constraint if exists conversations_kind_fields_check;

-- direct · gig · department · org (M3) · context: one thing, e.g. a repair (M4)
alter table public.conversations add constraint conversations_kinds_check
  check (kind in ('direct', 'gig', 'department', 'org', 'context'));
alter table public.conversations add constraint conversations_kind_fields_check
  check ((kind in ('gig', 'department')) = (gig_id is not null)
     and (kind = 'department') = (department is not null)
     and (kind = 'org' or kind = 'context') = (org_id is not null)
     and (kind = 'context') = (context_type is not null and context_id is not null)
     and (context_type is null or context_type in ('item', 'repair', 'subrental', 'quote')));

select 'Conversation kinds updated (context)' as result;
