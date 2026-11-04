-- Step 7b, second part: a fee on the other two ways of offering a place, Find crew's "Offer a
-- place" (contact_crew) and the job board's "Offer" on an application (answer_application). Both
-- already send a crew call; each gets a version that takes the fee (unit, rate, quantity) and
-- passes it on, so the offer shows it and accepting makes it the person's agreed fee. The
-- existing versions keep working and send no fee. No new tables or columns.
-- Written without destructive statements.

-- ── Find crew: offer a place (as in 20261125000000_crew_trust.sql, plus the fee) ─────────────
create or replace function private.contact_crew_unchecked(p_gig uuid, p_user uuid, p_kind text, p_title text, p_message text,
  p_fee_unit text, p_fee_rate numeric, p_fee_quantity numeric)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_org uuid; v_known boolean;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  if v_org is null or not private.can_manage_gig(p_gig) or not private.can_quote(v_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('availability', 'offer') then raise exception 'Unknown kind' using errcode = '22023'; end if;
  if p_kind = 'offer' and coalesce(trim(p_title), '') = '' then raise exception 'A function is needed' using errcode = '22023'; end if;
  -- Someone the caller can already reach (shared gig or organisation, earlier contact) or whose
  -- profile they may see; never someone who blocked them or whom they blocked
  v_known := private.can_message(v_me, p_user);
  if not v_known and not private.can_see_crew_profile(v_me, p_user) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- A person who takes contact only from companies they've worked with
  if not v_known and not private.worked_with_org(v_org, p_user)
     and (select c.contact_from from public.crew_profiles c where c.user_id = p_user) = 'known' then
    raise exception 'Only takes contact from companies they have worked with' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_blocks b where b.active
              and ((b.user_id = p_user and b.blocked_id = v_me) or (b.user_id = v_me and b.blocked_id = p_user))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.gig_members m where m.gig_id = p_gig and m.user_id = p_user) then
    raise exception 'Already on this gig' using errcode = '23505';
  end if;
  -- New contacts per organisation per day
  if not v_known and not exists (select 1 from public.crew_contacts c where c.org_id = v_org and c.user_id = p_user)
     and (select count(distinct c.user_id) from public.crew_contacts c
           where c.org_id = v_org and c.created_at > now() - interval '1 day'
             and not exists (select 1 from public.crew_contacts e where e.org_id = v_org and e.user_id = c.user_id
                              and e.created_at <= now() - interval '1 day')) >= 25 then
    raise exception 'Contact limit reached for today' using errcode = '54000';
  end if;

  insert into public.crew_contacts (org_id, user_id, contacted_by, gig_id, kind) values (v_org, p_user, v_me, p_gig, p_kind);
  if p_kind = 'availability' then
    begin
      insert into public.availability_requests (gig_id, person_id, message)
      values (p_gig, p_user, nullif(left(trim(coalesce(p_message, '')), 500), ''));
    exception when unique_violation then
      raise exception 'Already asked' using errcode = '23505';
    end;
  else
    perform private.send_crew_call_unchecked(p_gig, left(trim(p_title), 120), 1, nullif(left(trim(coalesce(p_message, '')), 500), ''), array[p_user],
                                             p_fee_unit, p_fee_rate, p_fee_quantity);
  end if;
  return p_kind;
end $$;
revoke execute on function private.contact_crew_unchecked(uuid, uuid, text, text, text, text, numeric, numeric) from public, anon, authenticated;

create or replace function private.contact_crew_unchecked(p_gig uuid, p_user uuid, p_kind text, p_title text default null, p_message text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.contact_crew_unchecked(p_gig, p_user, p_kind, p_title, p_message, null::text, null::numeric, null::numeric);
end $$;

create or replace function public.contact_crew(p_gig uuid, p_user uuid, p_kind text, p_title text, p_message text,
  p_fee_unit text, p_fee_rate numeric, p_fee_quantity numeric)
returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.contact_crew_unchecked(p_gig, p_user, p_kind, p_title, p_message, p_fee_unit, p_fee_rate, p_fee_quantity);
end $$;
revoke execute on function public.contact_crew(uuid, uuid, text, text, text, text, numeric, numeric) from public, anon;
grant execute on function public.contact_crew(uuid, uuid, text, text, text, text, numeric, numeric) to authenticated;

-- ── Job board: answer an application (as in 20261124000000_job_board.sql, plus the fee) ─────
create or replace function private.answer_application_unchecked(p_application uuid, p_action text, p_message text,
  p_fee_unit text, p_fee_rate numeric, p_fee_quantity numeric) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_a public.job_applications; v_post public.job_posts; v_conv uuid; v_gig_name text; v_status text;
begin
  select * into v_a from public.job_applications where id = p_application;
  select * into v_post from public.job_posts where id = v_a.post_id;
  if v_a.id is null or not private.can_quote(v_post.org_id) or not private.can_manage_gig(v_post.gig_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_a.status in ('withdrawn', 'accepted') then raise exception 'This application is closed' using errcode = '22023'; end if;
  select g.name into v_gig_name from public.gigs g where g.id = v_post.gig_id;
  case p_action
  when 'shortlist' then v_status := 'shortlisted';
  when 'decline' then
    v_status := 'declined';
    v_conv := private.ensure_direct(auth.uid(), v_a.user_id);
    insert into public.messages (conversation_id, author_id, kind, payload)
    values (v_conv, auth.uid(), 'system', jsonb_build_object('event', 'job_declined', 'post_id', v_post.id, 'title', v_post.title,
            'note', nullif(left(trim(coalesce(p_message, '')), 500), '')));
    insert into public.notifications (user_id, gig_id, org_id, actor_id, kind, details)
    values (v_a.user_id, null, v_post.org_id, auth.uid(), 'job_declined',
            jsonb_build_object('post_id', v_post.id, 'title', v_post.title, 'conversation_id', v_conv));
  when 'offer' then
    v_status := 'offered';
    perform private.send_crew_call_unchecked(v_post.gig_id, v_post.title, 1, nullif(left(trim(coalesce(p_message, '')), 500), ''), array[v_a.user_id],
                                             p_fee_unit, p_fee_rate, p_fee_quantity);
  else
    raise exception 'Unknown action' using errcode = '22023';
  end case;
  update public.job_applications set status = v_status, updated_at = now() where id = p_application;
  return v_status;
end $$;
revoke execute on function private.answer_application_unchecked(uuid, text, text, text, numeric, numeric) from public, anon, authenticated;

create or replace function private.answer_application_unchecked(p_application uuid, p_action text, p_message text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  return private.answer_application_unchecked(p_application, p_action, p_message, null::text, null::numeric, null::numeric);
end $$;

create or replace function public.answer_application(p_application uuid, p_action text, p_message text,
  p_fee_unit text, p_fee_rate numeric, p_fee_quantity numeric) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.answer_application_unchecked(p_application, p_action, p_message, p_fee_unit, p_fee_rate, p_fee_quantity);
end $$;
revoke execute on function public.answer_application(uuid, text, text, text, numeric, numeric) from public, anon;
grant execute on function public.answer_application(uuid, text, text, text, numeric, numeric) to authenticated;
