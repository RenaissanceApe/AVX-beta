-- Step 23, part V2: the same "who sees an appointment" rule as 20270119000000_appointments.sql
-- (planners, whoever made it, the people invited), written so a planner can read back the row they
-- have just added (insert … returning, which the app uses). The planner and creator parts now look
-- at the row's own columns; only "invited" asks another table. Add-only: a new helper and
-- alter policy.

-- Invited to this appointment and still on it
create or replace function private.is_invited_to_appointment(p_appointment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointment_people p
                  where p.appointment_id = p_appointment and p.user_id = auth.uid() and p.removed_at is null)
$$;
revoke execute on function private.is_invited_to_appointment(uuid) from public, anon;
grant execute on function private.is_invited_to_appointment(uuid) to authenticated;

alter policy appointments_select on public.appointments
  using (private.can_quote(org_id) or created_by = auth.uid() or private.is_invited_to_appointment(id));
