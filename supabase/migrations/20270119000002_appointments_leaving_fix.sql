-- Step 23, part V2: people who made or sent appointments can close their account.
-- When an account is removed, Postgres sets appointments.created_by and appointment_people.added_by
-- to null (on delete set null). The "keep rows honest" triggers of 20270119000000_appointments.sql
-- put the old value back on every update, so the account's removal failed on the foreign key.
-- Now those two columns can become empty (the person left), but never change to someone else.
-- Same as before otherwise. Add-only: create or replace of the two trigger functions.

create or replace function private.appointments_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_at := old.created_at;
    -- The maker can only be cleared (their account was closed), never changed
    if new.created_by is not null then new.created_by := old.created_by; end if;
  else
    new.created_at := now();
    new.removed_at := null;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  new.updated_at := now();
  new.title := trim(new.title);
  new.place := nullif(trim(coalesce(new.place, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  -- Keep only the pair of fields that matches all_day
  if new.all_day then new.starts_at := null; new.ends_at := null;
  else new.start_date := null; new.end_date := null; end if;
  -- A linked gig or client must belong to the same organisation
  if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = new.org_id) then
    raise exception 'That gig belongs to another organisation' using errcode = '42501';
  end if;
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.org_id = new.org_id) then
    raise exception 'That client belongs to another organisation' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function private.appointment_people_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if tg_op = 'UPDATE' then
    new.appointment_id := old.appointment_id; new.user_id := old.user_id; new.created_at := old.created_at;
    -- Asked again after being taken off: counts as a new invitation
    if old.removed_at is not null and new.removed_at is null then new.added_by := auth.uid();
    -- Who sent it can only be cleared (their account was closed), never changed
    elsif new.added_by is not null then new.added_by := old.added_by;
    end if;
    return new;
  end if;
  select a.org_id into v_org from public.appointments a where a.id = new.appointment_id;
  if not private.can_invite_to_org(v_org, new.user_id) then
    raise exception 'Only the organisation''s members and crew can be invited' using errcode = '42501';
  end if;
  new.added_by := auth.uid();
  new.created_at := now();
  new.removed_at := null;
  return new;
end $$;

revoke execute on function private.appointments_before() from public, anon, authenticated;
revoke execute on function private.appointment_people_before() from public, anon, authenticated;
