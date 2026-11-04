-- Step 7b (docs/BUSINESS.md): a fee on a crew call.
-- - crew_calls gets an optional fee (unit, rate, quantity): one fee for everyone called. The
--   people called read it on the call (the existing read rule) and in their invitation message.
-- - send_crew_call gets an eight-argument version that takes the fee; the five-argument version
--   keeps working and sends no fee (the crew search, job board and trust screens use it).
-- - Accepting a call that has a fee creates the person's gig_crew_fees row, so the labour panel
--   shows it as agreed. An existing fee is never overwritten.
-- Written without destructive statements.

alter table public.crew_calls add column if not exists fee_unit text;
alter table public.crew_calls add column if not exists fee_rate numeric(10,2);
alter table public.crew_calls add column if not exists fee_quantity numeric(7,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crew_calls_fee_check') then
    alter table public.crew_calls add constraint crew_calls_fee_check check (
      (fee_rate is null and fee_unit is null and fee_quantity is null)
      or (fee_rate between 0 and 1000000 and fee_unit in ('day', 'half_day', 'hour', 'fixed')
          and fee_quantity > 0 and fee_quantity <= 1000));
  end if;
end $$;

-- The fee as the invitation shows it (null without one); a fixed fee counts once
create or replace function private.crew_call_fee_json(p_unit text, p_rate numeric, p_quantity numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_rate is null then null else jsonb_build_object(
    'unit', p_unit, 'rate', p_rate, 'quantity', p_quantity,
    'total', round(p_rate * case when p_unit = 'fixed' then 1 else p_quantity end, 2)) end
$$;
revoke execute on function private.crew_call_fee_json(text, numeric, numeric) from public, anon;
grant execute on function private.crew_call_fee_json(text, numeric, numeric) to authenticated;

create or replace function private.send_crew_call_unchecked(p_gig uuid, p_title text, p_quantity integer, p_note text, p_people uuid[],
  p_fee_unit text, p_fee_rate numeric, p_fee_quantity numeric)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_call uuid; v_person uuid; v_conv uuid; v_gig record; v_n integer := 0;
  v_unit text; v_qty numeric; v_fee jsonb;
begin
  if not private.can_manage_gig(p_gig) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_fee_rate is not null then
    v_unit := coalesce(p_fee_unit, 'day');
    v_qty := case when v_unit = 'fixed' then 1 else coalesce(p_fee_quantity, 1) end;
  end if;
  v_fee := private.crew_call_fee_json(v_unit, p_fee_rate, v_qty);
  select g.name, g.org_id, g.start_date, g.end_date into v_gig from public.gigs g where g.id = p_gig;
  insert into public.crew_calls (gig_id, title, quantity, note, created_by, fee_unit, fee_rate, fee_quantity)
  values (p_gig, trim(p_title), coalesce(p_quantity, 1), nullif(trim(coalesce(p_note, '')), ''), v_me, v_unit, p_fee_rate, v_qty)
  returning id into v_call;
  foreach v_person in array coalesce(p_people, '{}') loop
    continue when v_person = v_me or not private.can_message(v_me, v_person)
      or exists (select 1 from public.gig_members g where g.gig_id = p_gig and g.user_id = v_person)
      or exists (select 1 from public.crew_call_answers a where a.call_id = v_call and a.user_id = v_person);
    insert into public.crew_call_answers (call_id, user_id) values (v_call, v_person);
    v_conv := private.ensure_direct(v_me, v_person);
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, v_me, 'system', jsonb_strip_nulls(jsonb_build_object('event', 'crew_call', 'call_id', v_call, 'gig_id', p_gig, 'gig_name', v_gig.name,
            'title', trim(p_title), 'start_date', v_gig.start_date, 'end_date', v_gig.end_date, 'fee', v_fee)));
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    values (v_person, null, v_gig.org_id, v_me, 'crew_call',
            jsonb_strip_nulls(jsonb_build_object('call_id', v_call, 'conversation_id', v_conv, 'gig_name', v_gig.name, 'title', trim(p_title),
                               'start_date', v_gig.start_date, 'end_date', v_gig.end_date, 'fee', v_fee)));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nobody to invite' using errcode = '22023'; end if;
  return v_n;
end $$;
revoke execute on function private.send_crew_call_unchecked(uuid, text, integer, text, uuid[], text, numeric, numeric) from public, anon, authenticated;

-- The five-argument version: no fee
create or replace function private.send_crew_call_unchecked(p_gig uuid, p_title text, p_quantity integer, p_note text, p_people uuid[])
returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.send_crew_call_unchecked(p_gig, p_title, p_quantity, p_note, p_people, null::text, null::numeric, null::numeric);
end $$;

create or replace function public.send_crew_call(p_gig uuid, p_title text, p_quantity integer, p_note text, p_people uuid[],
  p_fee_unit text, p_fee_rate numeric, p_fee_quantity numeric)
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.send_crew_call_unchecked(p_gig, p_title, p_quantity, p_note, p_people, p_fee_unit, p_fee_rate, p_fee_quantity);
end $$;
revoke execute on function public.send_crew_call(uuid, text, integer, text, uuid[], text, numeric, numeric) from public, anon;
grant execute on function public.send_crew_call(uuid, text, integer, text, uuid[], text, numeric, numeric) to authenticated;

-- Accept or decline (as in 20261104000001_messaging_m4.sql), and accepting a call with a fee
-- creates that person's fee on the gig unless they already have one
create or replace function private.answer_crew_call_unchecked(p_call uuid, p_accept boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_call public.crew_calls; v_mine text; v_taken integer; v_answer text; v_conv uuid;
begin
  select * into v_call from public.crew_calls where id = p_call for update;
  select a.answer into v_mine from public.crew_call_answers a where a.call_id = p_call and a.user_id = v_me;
  if v_call.id is null or v_mine is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_mine = 'accepted' then return 'accepted'; end if;
  select count(*) into v_taken from public.crew_call_answers a where a.call_id = p_call and a.answer = 'accepted';
  if not p_accept then
    v_answer := 'declined';
  elsif v_call.closed_at is not null or v_taken >= v_call.quantity then
    v_answer := 'full';
  else
    v_answer := 'accepted';
    insert into public.gig_members (gig_id, user_id, role, function_title) values (v_call.gig_id, v_me, 'crew', v_call.title)
    on conflict (gig_id, user_id) do nothing;
    if v_call.fee_rate is not null then
      insert into public.gig_crew_fees (gig_id, user_id, unit, rate, quantity)
      values (v_call.gig_id, v_me, v_call.fee_unit, v_call.fee_rate, v_call.fee_quantity)
      on conflict (gig_id, user_id) do update set unit = excluded.unit, rate = excluded.rate, quantity = excluded.quantity
        where public.gig_crew_fees.rate is null;
    end if;
    if v_taken + 1 >= v_call.quantity then update public.crew_calls set closed_at = now() where id = p_call; end if;
  end if;
  update public.crew_call_answers set answer = v_answer, answered_at = now() where call_id = p_call and user_id = v_me;
  v_conv := private.ensure_direct(v_call.created_by, v_me);
  if v_conv is not null then
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, v_me, 'system', jsonb_build_object('event', 'crew_call_answer', 'call_id', p_call, 'answer', v_answer, 'title', v_call.title));
  end if;
  if v_call.created_by is not null and v_answer <> 'full' then
    insert into public.notifications (user_id, gig_id, actor_id, kind, details)
    select v_call.created_by, v_call.gig_id, v_me, 'crew_call_answer',
           jsonb_build_object('call_id', p_call, 'answer', v_answer, 'title', v_call.title, 'gig_name', g.name)
      from public.gigs g where g.id = v_call.gig_id;
  end if;
  update public.notifications set read_at = now()
   where user_id = v_me and kind = 'crew_call' and read_at is null and details->>'call_id' = p_call::text;
  return v_answer;
end $$;
