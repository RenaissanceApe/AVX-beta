-- Phase 5a, part 2: what My work and the workspace switcher read.
-- 1. my_availability_requests(): requests sent to me, with the gig's name, place and
--    company. The person may not be on the gig yet, so they can't read it directly.
-- 2. my_unread_counts(): unread notifications per organisation (null = not tied to one).

create or replace function private.my_availability_requests_unchecked(p_include_answered boolean)
returns table(id uuid, gig_id uuid, org_id uuid, status text, message text, reply_note text,
              starts_at timestamptz, ends_at timestamptz, created_at timestamptz, replied_at timestamptz,
              gig_name text, venue text, company text, asked_by_name text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.gig_id, r.org_id, r.status, r.message, r.reply_note,
         lower(r.period), upper(r.period), r.created_at, r.replied_at,
         g.name, g.venue, o.name, p.full_name
  from public.availability_requests r
  join public.gigs g on g.id = r.gig_id
  join public.organisations o on o.id = r.org_id
  left join public.profiles p on p.id = r.asked_by
  where r.person_id = auth.uid()
    and (r.status = 'pending' or (p_include_answered and r.status in ('available', 'unavailable') and r.replied_at > now() - interval '30 days'))
  order by r.status <> 'pending', r.created_at desc
  limit 50
$$;
create or replace function public.my_availability_requests(p_include_answered boolean default false)
returns table(id uuid, gig_id uuid, org_id uuid, status text, message text, reply_note text,
              starts_at timestamptz, ends_at timestamptz, created_at timestamptz, replied_at timestamptz,
              gig_name text, venue text, company text, asked_by_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_availability_requests_unchecked(p_include_answered);
end $$;

create or replace function private.my_unread_counts_unchecked()
returns table(org_id uuid, unread bigint)
language sql stable security definer set search_path = '' as $$
  select n.org_id, count(*) from public.notifications n
  where n.user_id = auth.uid() and n.read_at is null
  group by n.org_id
$$;
create or replace function public.my_unread_counts()
returns table(org_id uuid, unread bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return query select * from private.my_unread_counts_unchecked();
end $$;

revoke execute on function private.my_availability_requests_unchecked(boolean) from public, anon, authenticated;
revoke execute on function private.my_unread_counts_unchecked() from public, anon, authenticated;
revoke execute on function public.my_availability_requests(boolean) from public, anon;
revoke execute on function public.my_unread_counts() from public, anon;
grant execute on function public.my_availability_requests(boolean) to authenticated;
grant execute on function public.my_unread_counts() to authenticated;

create index if not exists notifications_unread_idx on public.notifications (user_id, org_id) where read_at is null;
