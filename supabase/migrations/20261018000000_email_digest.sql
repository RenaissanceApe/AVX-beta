-- Phase 3: daily email digest of unread notifications (sent by the send-digest Edge Function via Brevo).
-- Also re-states the sign-up trigger so a fresh project built from these files always has it.

alter table public.notifications add column if not exists emailed_at timestamptz;
create index if not exists notifications_digest_idx on public.notifications (user_id)
  where emailed_at is null and read_at is null;

alter table public.profiles add column if not exists email_digest boolean not null default true;

create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
