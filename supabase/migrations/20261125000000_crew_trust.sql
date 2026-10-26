-- Crew network N4 (docs/CREW_NETWORK.md): trust.
-- - AVX admins (private.avx_admins, not readable by anyone through the API) review what needs a
--   person: manual company checks, certificate proofs and reports. Their functions need two-step
--   sign-in switched on.
-- - Verified companies: an organisation admin checks the company's VAT number against the EU's
--   VIES service (the vies-check Edge Function calls it and records the answer through
--   record_vies_result, which only the service role may run), or asks for a manual check. A valid
--   number verifies the organisation at once; the name VIES holds is shown next to the badge, so
--   a borrowed number is visible. AVX admins can revoke. organisations.verified_at,
--   verified_name, verified_method and posting_suspended_at can no longer be changed by the
--   organisation itself (they could in N3, where nothing set them yet).
-- - Certificates get an id. A company that has had the person on one of its gigs can confirm a
--   certificate; the person can upload a proof (private bucket certificate-proofs) for an AVX
--   admin to check. Both are tied to the certificate's name and expiry as they were: editing
--   either drops the mark. The profile's certificates carry confirmed_by and verified, worked
--   out by the database on every save, so search and applicant lists show them as they are.
-- - Reports on crew profiles and job posts: reporting hides the profile or post from the reporter
--   at once and queues it for AVX admins. Three people reporting a profile hide it from everyone
--   until reviewed; three people reporting an organisation's posts suspend its posting.
-- - Contact settings: a freelancer can take contact only from companies they've worked with.
-- - A stranger's first direct messages can't carry files until the other person has written.
-- Written without destructive statements so it applies without manual confirmation.

-- ── AVX admins ───────────────────────────────────────────────────────────────
create table if not exists private.avx_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
revoke all on private.avx_admins from public, anon, authenticated;

create or replace function private.is_avx_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.avx_admins a where a.user_id = auth.uid())
$$;
-- AVX admin actions: an AVX admin with two-step sign-in switched on and used for this session
create or replace function private.require_avx_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.is_avx_admin() or not private.has_two_step()
     or coalesce(current_setting('request.jwt.claims', true)::jsonb->>'aal', '') <> 'aal2' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;
create or replace function public.am_avx_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_avx_admin()
$$;

-- ── Organisations: verification and posting suspension ─────────────────────
alter table public.organisations add column if not exists verified_name text;
alter table public.organisations add column if not exists verified_method text;
alter table public.organisations add column if not exists posting_suspended_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_verified_method_check') then
    alter table public.organisations add constraint organisations_verified_method_check
      check (verified_method is null or verified_method in ('vies', 'manual'));
  end if;
end $$;

-- Only the database's own functions set these (they run as the owner, not as the signed-in role)
create or replace function private.organisations_trust_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verified_name := null; new.verified_method := null; new.posting_suspended_at := null;
    else
      new.verified_at := old.verified_at; new.verified_name := old.verified_name;
      new.verified_method := old.verified_method; new.posting_suspended_at := old.posting_suspended_at;
    end if;
  end if;
  return new;
end $$;
create or replace trigger organisations_trust_guard before insert or update on public.organisations
  for each row execute function private.organisations_trust_guard();

create table if not exists public.org_verifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  method text not null check (method in ('vies', 'manual')),
  status text not null check (status in ('checking', 'pending', 'verified', 'rejected', 'error', 'revoked')),
  country text check (country ~ '^[A-Z]{2}$'),
  vat_number text check (char_length(vat_number) <= 20),
  found_name text check (char_length(found_name) <= 300),
  found_address text check (char_length(found_address) <= 500),
  note text check (char_length(note) <= 1000),
  answer text check (char_length(answer) <= 1000),
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists org_verifications_org_idx on public.org_verifications (org_id, created_at);
create index if not exists org_verifications_status_idx on public.org_verifications (status, created_at);
alter table public.org_verifications enable row level security;
create policy org_verifications_select on public.org_verifications for select to authenticated
  using (private.is_org_admin(org_id));
create policy mfa_required on public.org_verifications as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- VIES country codes (the EU members, Greece as EL, and Northern Ireland as XI)
create or replace function private.vies_country(p_country text) returns boolean
language sql immutable set search_path = '' as $$
  select upper(coalesce(p_country, '')) = any (array['AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE',
                                                      'IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI'])
$$;

-- Step 1 (as the admin, called by the vies-check function): checks and records the request
create or replace function private.start_vies_check_unchecked(p_org uuid, p_country text, p_number text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_country text := upper(trim(coalesce(p_country, ''))); v_number text; v_id uuid;
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_country = 'GR' then v_country := 'EL'; end if;
  if not private.vies_country(v_country) then raise exception 'Not an EU VAT country' using errcode = '22023'; end if;
  v_number := upper(regexp_replace(coalesce(p_number, ''), '[^A-Za-z0-9]', '', 'g'));
  if left(v_number, 2) = v_country then v_number := substr(v_number, 3); end if;
  if v_number !~ '^[A-Z0-9]{2,14}$' then raise exception 'Invalid VAT number' using errcode = '22023'; end if;
  if (select count(*) from public.org_verifications v where v.org_id = p_org and v.method = 'vies'
        and v.created_at > now() - interval '1 day') >= 5 then
    raise exception 'Check limit reached for today' using errcode = '54000';
  end if;
  insert into public.org_verifications (org_id, method, status, country, vat_number, requested_by)
  values (p_org, 'vies', 'checking', v_country, v_number, auth.uid()) returning id into v_id;
  return v_id;
end $$;
create or replace function public.start_vies_check(p_org uuid, p_country text, p_number text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_mfa();
  v_id := private.start_vies_check_unchecked(p_org, p_country, p_number);
  return (select jsonb_build_object('id', v.id, 'country', v.country, 'vat_number', v.vat_number) from public.org_verifications v where v.id = v_id);
end $$;

-- Step 2 (the service role only): VIES's answer
create or replace function public.record_vies_result(p_id uuid, p_valid boolean, p_name text default null, p_address text default null, p_error text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v public.org_verifications; v_status text;
begin
  select * into v from public.org_verifications where id = p_id;
  if v.id is null or v.status <> 'checking' then raise exception 'Unknown check' using errcode = '22023'; end if;
  v_status := case when p_error is not null then 'error' when p_valid then 'verified' else 'rejected' end;
  update public.org_verifications
     set status = v_status, decided_at = now(),
         found_name = nullif(left(trim(coalesce(p_name, '')), 300), ''),
         found_address = nullif(left(trim(coalesce(p_address, '')), 500), ''),
         answer = left(p_error, 200)
   where id = p_id;
  if v_status = 'verified' then
    update public.organisations
       set verified_at = now(), verified_method = 'vies',
           verified_name = coalesce(nullif(left(trim(coalesce(p_name, '')), 300), ''), v.country || v.vat_number)
     where id = v.org_id;
  end if;
  return v_status;
end $$;

-- A manual check by AVX (for companies outside the EU, or when VIES can't confirm)
create or replace function private.request_manual_verification_unchecked(p_org uuid, p_note text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Say how we can check the company' using errcode = '22023'; end if;
  if exists (select 1 from public.org_verifications v where v.org_id = p_org and v.method = 'manual' and v.status = 'pending') then
    raise exception 'Already asked' using errcode = '23505';
  end if;
  insert into public.org_verifications (org_id, method, status, note, requested_by)
  values (p_org, 'manual', 'pending', left(trim(p_note), 1000), auth.uid()) returning id into v_id;
  return v_id;
end $$;
create or replace function public.request_manual_verification(p_org uuid, p_note text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.request_manual_verification_unchecked(p_org, p_note);
end $$;

-- AVX admins: decide a manual request; revoke a verification
create or replace function public.decide_verification(p_id uuid, p_approve boolean, p_name text default null, p_answer text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v public.org_verifications;
begin
  perform private.require_avx_admin();
  select * into v from public.org_verifications where id = p_id;
  if v.id is null or v.status <> 'pending' then raise exception 'Nothing to decide' using errcode = '22023'; end if;
  update public.org_verifications
     set status = case when p_approve then 'verified' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         found_name = nullif(left(trim(coalesce(p_name, '')), 300), ''), answer = nullif(left(trim(coalesce(p_answer, '')), 1000), '')
   where id = p_id;
  if p_approve then
    update public.organisations o
       set verified_at = now(), verified_method = 'manual', verified_name = coalesce(nullif(left(trim(coalesce(p_name, '')), 300), ''), o.legal_name, o.name)
     where o.id = v.org_id;
  end if;
end $$;
create or replace function public.revoke_verification(p_org uuid, p_answer text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_avx_admin();
  update public.organisations set verified_at = null, verified_name = null, verified_method = null where id = p_org;
  insert into public.org_verifications (org_id, method, status, answer, decided_by, decided_at)
  values (p_org, 'manual', 'revoked', nullif(left(trim(coalesce(p_answer, '')), 1000), ''), auth.uid(), now());
end $$;

-- ── Certificates: ids, confirmations by companies, proofs checked by AVX ────
create table if not exists public.certificate_confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  cert_id uuid not null,
  org_id uuid not null references public.organisations(id) on delete cascade,
  cert_name text not null,
  expires_on date,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, cert_id, org_id)
);
alter table public.certificate_confirmations enable row level security;
create policy certificate_confirmations_select on public.certificate_confirmations for select to authenticated
  using (user_id = auth.uid() or private.can_quote(org_id));
create policy mfa_required on public.certificate_confirmations as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create table if not exists public.certificate_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cert_id uuid not null,
  cert_name text not null,
  expires_on date,
  path text not null check (char_length(path) <= 400),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  answer text check (char_length(answer) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists certificate_proofs_status_idx on public.certificate_proofs (status, created_at);
create index if not exists certificate_proofs_user_idx on public.certificate_proofs (user_id, cert_id);
alter table public.certificate_proofs enable row level security;
create policy certificate_proofs_select on public.certificate_proofs for select to authenticated using (user_id = auth.uid());
create policy mfa_required on public.certificate_proofs as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Private bucket; paths are <user id>/<certificate id>/<file>. The person uploads and reads their
-- own; AVX admins read them to check. Companies never see a proof, only that it was checked.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificate-proofs', 'certificate-proofs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
create policy certificate_proofs_files_select on storage.objects for select to authenticated
  using (bucket_id = 'certificate-proofs' and (private.path_uuid(name, 1) = auth.uid() or private.is_avx_admin()));
create policy certificate_proofs_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificate-proofs' and private.path_uuid(name, 1) = auth.uid());

-- What a certificate carries besides what the person typed: who confirmed it and whether AVX
-- checked a proof, both only while its name and expiry are as they were then
create or replace function private.certificate_marks(p_user uuid, p_cert jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'confirmed_by', (select jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name) order by c.created_at)
                       from public.certificate_confirmations c join public.organisations o on o.id = c.org_id
                      where c.user_id = p_user and c.cert_id = (p_cert->>'id')::uuid and c.cert_name = p_cert->>'name'
                        and c.expires_on is not distinct from (p_cert->>'expires_on')::date),
    'verified', case when exists (select 1 from public.certificate_proofs p
                                   where p.user_id = p_user and p.cert_id = (p_cert->>'id')::uuid and p.status = 'verified'
                                     and p.cert_name = p_cert->>'name' and p.expires_on is not distinct from (p_cert->>'expires_on')::date)
                     then true end,
    'proof_pending', case when exists (select 1 from public.certificate_proofs p
                                        where p.user_id = p_user and p.cert_id = (p_cert->>'id')::uuid and p.status = 'pending'
                                          and p.cert_name = p_cert->>'name' and p.expires_on is not distinct from (p_cert->>'expires_on')::date)
                          then true end))
$$;

-- crew_profiles: certificates keep (or get) an id; the marks are worked out here, never taken
-- from the person; a suspension and the contact setting are guarded the same way
alter table public.crew_profiles add column if not exists contact_from text not null default 'any';
alter table public.crew_profiles add column if not exists suspended_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_profiles_contact_from_check') then
    alter table public.crew_profiles add constraint crew_profiles_contact_from_check check (contact_from in ('any', 'known'));
  end if;
end $$;

create or replace function private.crew_profiles_before() returns trigger
language plpgsql set search_path = '' as $$
declare c jsonb; v_out jsonb := '[]'; v_id uuid; v_ids uuid[] := '{}';
begin
  for c in select * from jsonb_array_elements(new.certificates) loop
    if jsonb_typeof(c) <> 'object' or coalesce(trim(c->>'name'), '') = '' or char_length(c->>'name') > 100
       or char_length(coalesce(c->>'issuer', '')) > 100
       or (c->>'expires_on' is not null and c->>'expires_on' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'Invalid certificate' using errcode = '22023';
    end if;
    v_id := case when coalesce(c->>'id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (c->>'id')::uuid end;
    if v_id is null or v_id = any (v_ids) then v_id := gen_random_uuid(); end if;
    v_ids := v_ids || v_id;
    c := jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'name', trim(c->>'name'), 'issuer', nullif(trim(coalesce(c->>'issuer', '')), ''), 'expires_on', c->>'expires_on'));
    v_out := v_out || jsonb_build_array(c || private.certificate_marks(new.user_id, c));
  end loop;
  new.certificates := v_out;
  new.headline := nullif(trim(coalesce(new.headline, '')), '');
  new.other_functions := nullif(trim(coalesce(new.other_functions, '')), '');
  new.bio := nullif(trim(coalesce(new.bio, '')), '');
  new.base_place := nullif(trim(coalesce(new.base_place, '')), '');
  new.functions := array(select distinct f from unnest(new.functions) f order by f);
  new.languages := array(select distinct l from unnest(new.languages) l order by l);
  if new.travel_scope <> 'km' then new.travel_km := null; end if;
  if current_user in ('authenticated', 'anon') then
    new.suspended_at := case when tg_op = 'UPDATE' then old.suspended_at end;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Work the marks out again for one person (after a confirmation or a proof decision)
create or replace function private.refresh_certificates(p_user uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.crew_profiles set certificates = certificates where user_id = p_user
$$;

-- Ids for certificates saved before N4
update public.crew_profiles set certificates = certificates where jsonb_array_length(certificates) > 0;

-- Whether an organisation has had the person on one of its gigs, or as a member
create or replace function private.worked_with_org(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gig_members m join public.gigs g on g.id = m.gig_id where g.org_id = p_org and m.user_id = p_user)
      or exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user)
$$;

create or replace function private.confirm_certificate_unchecked(p_org uuid, p_user uuid, p_cert uuid, p_confirm boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_cert jsonb;
begin
  if not private.can_quote(p_org) or p_user = auth.uid() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not private.worked_with_org(p_org, p_user) then
    raise exception 'Only a company they have worked with can confirm' using errcode = '42501';
  end if;
  select e into v_cert from public.crew_profiles c, jsonb_array_elements(c.certificates) e
   where c.user_id = p_user and c.enabled and e->>'id' = p_cert::text;
  if v_cert is null then raise exception 'Unknown certificate' using errcode = '22023'; end if;
  if p_confirm then
    insert into public.certificate_confirmations (user_id, cert_id, org_id, cert_name, expires_on, confirmed_by)
    values (p_user, p_cert, p_org, v_cert->>'name', (v_cert->>'expires_on')::date, auth.uid())
    on conflict (user_id, cert_id, org_id) do update
      set cert_name = excluded.cert_name, expires_on = excluded.expires_on, confirmed_by = excluded.confirmed_by, created_at = now();
  else
    -- Withdrawing a confirmation: it no longer matches anything
    update public.certificate_confirmations set cert_name = '', expires_on = null
     where user_id = p_user and cert_id = p_cert and org_id = p_org;
  end if;
  perform private.refresh_certificates(p_user);
  return (select e from public.crew_profiles c, jsonb_array_elements(c.certificates) e where c.user_id = p_user and e->>'id' = p_cert::text);
end $$;
create or replace function public.confirm_certificate(p_org uuid, p_user uuid, p_cert uuid, p_confirm boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.confirm_certificate_unchecked(p_org, p_user, p_cert, p_confirm);
end $$;

create or replace function private.submit_certificate_proof_unchecked(p_cert uuid, p_path text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_cert jsonb; v_id uuid;
begin
  select e into v_cert from public.crew_profiles c, jsonb_array_elements(c.certificates) e
   where c.user_id = v_me and e->>'id' = p_cert::text;
  if v_cert is null then raise exception 'Unknown certificate' using errcode = '22023'; end if;
  if private.path_uuid(p_path, 1) is distinct from v_me or private.path_uuid(p_path, 2) is distinct from p_cert
     or not exists (select 1 from storage.objects o where o.bucket_id = 'certificate-proofs' and o.name = p_path) then
    raise exception 'Upload the file first' using errcode = '22023';
  end if;
  if (select count(*) from public.certificate_proofs p where p.user_id = v_me and p.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Proof limit reached for today' using errcode = '54000';
  end if;
  -- A newer proof replaces one still waiting
  update public.certificate_proofs set status = 'rejected', answer = 'Replaced by a newer file', reviewed_at = now()
   where user_id = v_me and cert_id = p_cert and status = 'pending';
  insert into public.certificate_proofs (user_id, cert_id, cert_name, expires_on, path)
  values (v_me, p_cert, v_cert->>'name', (v_cert->>'expires_on')::date, p_path) returning id into v_id;
  perform private.refresh_certificates(v_me);
  return v_id;
end $$;
create or replace function public.submit_certificate_proof(p_cert uuid, p_path text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.submit_certificate_proof_unchecked(p_cert, p_path);
end $$;

create or replace function public.review_certificate_proof(p_id uuid, p_approve boolean, p_answer text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform private.require_avx_admin();
  update public.certificate_proofs
     set status = case when p_approve then 'verified' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now(),
         answer = nullif(left(trim(coalesce(p_answer, '')), 1000), '')
   where id = p_id and status = 'pending'
  returning user_id into v_user;
  if v_user is null then raise exception 'Nothing to decide' using errcode = '22023'; end if;
  perform private.refresh_certificates(v_user);
end $$;

-- ── Reports on profiles and job posts ───────────────────────────────────────
create table if not exists public.network_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('profile', 'job')),
  target_user uuid references auth.users(id) on delete cascade,
  target_post uuid references public.job_posts(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade,
  reason text not null check (reason in ('spam', 'fake', 'discrimination', 'abuse', 'other')),
  note text check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'kept', 'removed')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((target_kind = 'profile' and target_user is not null) or (target_kind = 'job' and target_post is not null))
);
create unique index if not exists network_reports_once on public.network_reports (reporter_id, target_kind, coalesce(target_post, target_user));
create index if not exists network_reports_open_idx on public.network_reports (status, created_at);
alter table public.network_reports enable row level security;
create policy network_reports_select on public.network_reports for select to authenticated using (reporter_id = auth.uid());
create policy mfa_required on public.network_reports as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create or replace function private.report_network_unchecked(p_kind text, p_target uuid, p_reason text, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_user uuid; v_post uuid; v_org uuid;
begin
  if p_reason not in ('spam', 'fake', 'discrimination', 'abuse', 'other') then raise exception 'Unknown reason' using errcode = '22023'; end if;
  if p_kind = 'profile' then
    if p_target = v_me or not exists (select 1 from public.crew_profiles c where c.user_id = p_target) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    v_user := p_target;
  elsif p_kind = 'job' then
    select j.id, j.org_id, j.created_by into v_post, v_org, v_user from public.job_posts j where j.id = p_target;
    if v_post is null or private.can_quote(v_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  else
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  if (select count(*) from public.network_reports r where r.reporter_id = v_me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Report limit reached for today' using errcode = '54000';
  end if;
  begin
    insert into public.network_reports (reporter_id, target_kind, target_user, target_post, org_id, reason, note)
    values (v_me, p_kind, v_user, v_post, v_org, p_reason, nullif(left(trim(coalesce(p_note, '')), 1000), ''));
  exception when unique_violation then
    raise exception 'Already reported' using errcode = '23505';
  end;
  -- Three people: the profile is hidden, or the organisation's posting suspended, until reviewed
  if p_kind = 'profile' and (select count(distinct r.reporter_id) from public.network_reports r
                              where r.target_kind = 'profile' and r.target_user = v_user and r.status = 'open') >= 3 then
    update public.crew_profiles set suspended_at = coalesce(suspended_at, now()) where user_id = v_user;
  elsif p_kind = 'job' and (select count(distinct r.reporter_id) from public.network_reports r
                             where r.target_kind = 'job' and r.org_id = v_org and r.status = 'open') >= 3 then
    update public.organisations set posting_suspended_at = coalesce(posting_suspended_at, now()) where id = v_org;
  end if;
end $$;
create or replace function public.report_network(p_kind text, p_target uuid, p_reason text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  perform private.report_network_unchecked(p_kind, p_target, p_reason, p_note);
end $$;

-- AVX admins: keep (the reports were wrong: the suspension is lifted) or remove (the post is
-- closed; the profile stays hidden) everything reported about one profile or post
create or replace function public.decide_network_report(p_id uuid, p_remove boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.network_reports; v_status text := case when p_remove then 'removed' else 'kept' end;
begin
  perform private.require_avx_admin();
  select * into r from public.network_reports where id = p_id;
  if r.id is null or r.status <> 'open' then raise exception 'Nothing to decide' using errcode = '22023'; end if;
  if r.target_kind = 'profile' then
    update public.network_reports set status = v_status, decided_by = auth.uid(), decided_at = now()
     where target_kind = 'profile' and target_user = r.target_user and status = 'open';
    update public.crew_profiles set suspended_at = case when p_remove then coalesce(suspended_at, now()) end where user_id = r.target_user;
  else
    update public.network_reports set status = v_status, decided_by = auth.uid(), decided_at = now()
     where target_kind = 'job' and target_post = r.target_post and status = 'open';
    if p_remove then
      update public.job_posts set status = 'closed', closed_at = coalesce(closed_at, now()) where id = r.target_post;
    end if;
    if (select count(distinct x.reporter_id) from public.network_reports x
         where x.target_kind = 'job' and x.org_id = r.org_id and x.status = 'open') < 3 and not p_remove then
      update public.organisations set posting_suspended_at = null where id = r.org_id;
    end if;
  end if;
end $$;
-- AVX admins: lift an organisation's posting suspension or show a hidden profile again
create or replace function public.lift_suspension(p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_avx_admin();
  if p_kind = 'org' then update public.organisations set posting_suspended_at = null where id = p_id;
  elsif p_kind = 'profile' then update public.crew_profiles set suspended_at = null where user_id = p_id;
  else raise exception 'Unknown kind' using errcode = '22023'; end if;
end $$;

-- ── The AVX admin queue ─────────────────────────────────────────────────────
create or replace function public.trust_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_avx_admin();
  return jsonb_build_object(
    'verifications', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'org_id', v.org_id, 'org_name', o.name, 'legal_name', o.legal_name, 'tax_id', o.tax_id, 'website', o.website,
        'note', v.note, 'requested_by', p.full_name, 'created_at', v.created_at) order by v.created_at)
      from public.org_verifications v join public.organisations o on o.id = v.org_id left join public.profiles p on p.id = v.requested_by
     where v.status = 'pending'), '[]'),
    'verified', coalesce((select jsonb_agg(jsonb_build_object(
        'org_id', o.id, 'org_name', o.name, 'verified_name', o.verified_name, 'verified_method', o.verified_method, 'verified_at', o.verified_at)
        order by o.verified_at desc)
      from public.organisations o where o.verified_at is not null), '[]'),
    'proofs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'user_id', x.user_id, 'name', p.full_name, 'cert_name', x.cert_name, 'expires_on', x.expires_on,
        'path', x.path, 'created_at', x.created_at) order by x.created_at)
      from public.certificate_proofs x left join public.profiles p on p.id = x.user_id where x.status = 'pending'), '[]'),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'target_kind', r.target_kind, 'target_user', r.target_user, 'target_name', tp.full_name,
        'target_post', r.target_post, 'post_title', j.title, 'post_description', j.description, 'org_id', r.org_id, 'org_name', o.name,
        'reason', r.reason, 'note', r.note, 'reporter', rp.full_name, 'created_at', r.created_at,
        'profile', case when r.target_kind = 'profile' then (select jsonb_build_object('headline', c.headline, 'bio', c.bio,
                         'other_functions', c.other_functions, 'links', c.links, 'suspended', c.suspended_at is not null)
                       from public.crew_profiles c where c.user_id = r.target_user) end,
        'org_suspended', o.posting_suspended_at is not null) order by r.created_at)
      from public.network_reports r
      left join public.profiles tp on tp.id = r.target_user
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.job_posts j on j.id = r.target_post
      left join public.organisations o on o.id = r.org_id
     where r.status = 'open'), '[]'),
    'suspended_orgs', coalesce((select jsonb_agg(jsonb_build_object('org_id', o.id, 'org_name', o.name, 'since', o.posting_suspended_at))
      from public.organisations o where o.posting_suspended_at is not null), '[]'),
    'suspended_profiles', coalesce((select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'name', p.full_name, 'since', c.suspended_at))
      from public.crew_profiles c left join public.profiles p on p.id = c.user_id where c.suspended_at is not null), '[]'));
end $$;
-- How many things wait for an AVX admin (for the menu); null for everyone else
create or replace function public.trust_queue_count() returns integer
language sql stable security definer set search_path = '' as $$
  select case when private.is_avx_admin() then (
      (select count(*) from public.org_verifications v where v.status = 'pending')
    + (select count(*) from public.certificate_proofs x where x.status = 'pending')
    + (select count(*) from public.network_reports r where r.status = 'open'))::integer end
$$;

-- ── Seeing profiles and posts ───────────────────────────────────────────────
-- Also hidden: a suspended profile, and one the viewer reported
create or replace function private.can_see_crew_profile(p_viewer uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_viewer = p_user or exists (
    select 1 from public.crew_profiles c
     where c.user_id = p_user and c.enabled and c.suspended_at is null
       and (c.visibility = 'crew' or private.is_company_side(p_viewer))
       and not exists (select 1 from public.user_blocks b where b.active
                        and ((b.user_id = p_user and b.blocked_id = p_viewer) or (b.user_id = p_viewer and b.blocked_id = p_user)))
       and not exists (select 1 from public.network_reports r
                        where r.reporter_id = p_viewer and r.target_kind = 'profile' and r.target_user = p_user))
$$;
-- ── Messages: no files to a stranger before they reply ─────────────────────
create or replace function private.messages_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_other uuid;
begin
  new.removed_by := null;
  if new.kind <> 'text' or new.author_id is null or new.guest_name is not null then return new; end if;
  -- Only what a person writes themselves (not the call sheet, crew calls and other work messages)
  if new.author_id = auth.uid() then
    if (select count(*) from public.messages m
         where m.author_id = new.author_id and m.kind = 'text' and m.created_at > now() - interval '1 minute') >= 20
       or (select count(*) from public.messages m
         where m.author_id = new.author_id and m.kind = 'text' and m.created_at > now() - interval '1 hour') >= 300 then
      raise exception 'Too many messages, try again in a minute' using errcode = '54000';
    end if;
  end if;
  select c.kind into v_kind from public.conversations c where c.id = new.conversation_id;
  if v_kind = 'direct' then
    select m.user_id into v_other from public.conversation_members m
     where m.conversation_id = new.conversation_id and m.user_id <> new.author_id limit 1;
    if v_other is not null and exists (
         select 1 from public.user_blocks b
          where b.active and ((b.user_id = v_other and b.blocked_id = new.author_id) or (b.user_id = new.author_id and b.blocked_id = v_other))) then
      raise exception 'Blocked' using errcode = '42501';
    end if;
    -- Someone writing to a stranger (no shared gig or organisation) can't send files until the
    -- other person has written in the conversation
    if v_other is not null and jsonb_array_length(coalesce(new.attachments, '[]')) > 0
       and not exists (select 1 from public.gig_members a join public.gig_members b on b.gig_id = a.gig_id
                        where a.user_id = new.author_id and b.user_id = v_other)
       and not exists (select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id
                        where a.user_id = new.author_id and b.user_id = v_other)
       and not exists (select 1 from public.messages m where m.conversation_id = new.conversation_id and m.author_id = v_other) then
      raise exception 'No files before they reply' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ── Contact settings ───────────────────────────────────────────────────────
create or replace function private.contact_crew_unchecked(p_gig uuid, p_user uuid, p_kind text, p_title text default null, p_message text default null)
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
    perform private.send_crew_call_unchecked(p_gig, left(trim(p_title), 120), 1, nullif(left(trim(coalesce(p_message, '')), 500), ''), array[p_user]);
  end if;
  return p_kind;
end $$;

-- Search results say whether the person takes contact from strangers
create or replace function private.search_crew_unchecked(
  p_org uuid, p_functions text[] default '{}', p_text text default null, p_languages text[] default '{}',
  p_certificate text default null, p_lat numeric default null, p_lng numeric default null, p_km integer default null,
  p_country text default null, p_from date default null, p_to date default null, p_only_free boolean default false,
  p_offset integer default 0)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid(); v_out jsonb; v_total integer; v_to date := coalesce(p_to, p_from);
  v_text text := nullif(trim(coalesce(p_text, '')), ''); v_cert text := nullif(trim(coalesce(p_certificate, '')), '');
  v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if (select count(*) from public.crew_search_log l where l.org_id = p_org and l.created_at > now() - interval '1 day') >= 200 then
    raise exception 'Search limit reached for today' using errcode = '54000';
  end if;
  if v_to is not null and p_from is not null and v_to < p_from then v_to := p_from; end if;

  with found as (
    select c.*, p.full_name, p.avatar_url,
           case when p_lat is not null and p_lng is not null and c.base_lat is not null
                then round(private.km_between(p_lat, p_lng, c.base_lat, c.base_lng))::integer end as km,
           (select count(distinct g.id) from public.gig_members m join public.gigs g on g.id = m.gig_id
             where m.user_id = c.user_id and g.org_id = p_org)::integer as worked_with,
           case when p_from is not null then not private.crew_busy(c.user_id, p_from, v_to) end as free
      from public.crew_profiles c
      join public.profiles p on p.id = c.user_id
     where c.enabled and c.user_id <> v_me
       and private.can_see_crew_profile(v_me, c.user_id)
       and (cardinality(coalesce(p_functions, '{}')) = 0 or c.functions && p_functions)
       and (cardinality(coalesce(p_languages, '{}')) = 0 or c.languages @> p_languages)
       and (v_text is null or concat_ws(' ', p.full_name, c.headline, c.other_functions, c.bio) ilike '%' || v_text || '%')
       and (v_cert is null or exists (
             select 1 from jsonb_array_elements(c.certificates) e
              where e->>'name' ilike '%' || v_cert || '%'
                and (e->>'expires_on' is null or (e->>'expires_on')::date >= coalesce(v_to, current_date))))
  ), placed as (
    select f.* from found f
     where p_lat is null or p_lng is null
        or (f.km is not null and (
              (p_km is not null and f.km <= p_km)
              or (f.travel_scope = 'world')
              or (f.travel_scope = 'europe' and private.in_europe(p_country) and private.in_europe(f.base_country))
              or (f.travel_scope = 'country' and f.base_country = upper(coalesce(p_country, '')))
              or (f.travel_scope = 'km' and f.km <= coalesce(f.travel_km, 0))))
  ), kept as (
    select * from placed where not coalesce(p_only_free, false) or free is distinct from false
  )
  select (select count(*) from kept),
         coalesce((select jsonb_agg(x.r order by x.ord) from (
           select row_number() over (order by k.free is distinct from true, k.km nulls last, k.worked_with desc, k.updated_at desc) as ord,
                  jsonb_build_object(
                    'user_id', k.user_id, 'name', k.full_name, 'avatar_url', k.avatar_url, 'headline', k.headline,
                    'functions', k.functions, 'other_functions', k.other_functions, 'bio', k.bio,
                    'base_place', k.base_place, 'base_country', k.base_country, 'travel_scope', k.travel_scope, 'travel_km', k.travel_km,
                    'languages', k.languages, 'experience_years', k.experience_years, 'links', k.links, 'certificates', k.certificates,
                    'km', k.km, 'worked_with', k.worked_with, 'free', k.free,
                    'contact_from', k.contact_from) as r
             from kept k
            order by k.free is distinct from true, k.km nulls last, k.worked_with desc, k.updated_at desc
            offset v_off limit 20) x), '[]')
    into v_total, v_out;

  insert into public.crew_search_log (org_id, searched_by, results) values (p_org, v_me, v_total);
  return jsonb_build_object('results', v_out, 'total', v_total, 'more', v_total > v_off + 20);
end $$;

-- ── Job posts: suspended organisations can't post; reported posts hidden ──
create or replace function private.publish_job_unchecked(p_gig uuid, p_job jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_gig public.gigs; v_id uuid; v_from date; v_to date; v_pos uuid;
begin
  select * into v_gig from public.gigs where id = p_gig;
  if v_gig.id is null or not private.can_manage_gig(p_gig) or not private.can_quote(v_gig.org_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.has_two_step() then raise exception 'Two-step sign-in needed to post' using errcode = '42501'; end if;
  if (select o.posting_suspended_at from public.organisations o where o.id = v_gig.org_id) is not null then
    raise exception 'Posting suspended' using errcode = '42501';
  end if;
  if (select o.verified_at from public.organisations o where o.id = v_gig.org_id) is null
     and (select count(*) from public.job_posts p where p.org_id = v_gig.org_id and p.status = 'open' and p.ends_on >= current_date) >= 3 then
    raise exception 'Open post limit reached' using errcode = '54000';
  end if;
  v_from := coalesce(nullif(p_job->>'starts_on', '')::date, v_gig.start_date);
  v_to := coalesce(nullif(p_job->>'ends_on', '')::date, v_gig.end_date, v_from);
  if v_from is null then raise exception 'The gig needs dates' using errcode = '22023'; end if;
  if v_to < current_date then raise exception 'The dates have passed' using errcode = '22023'; end if;
  v_pos := nullif(p_job->>'position_id', '')::uuid;
  if v_pos is not null and not exists (select 1 from public.gig_positions g where g.id = v_pos and g.gig_id = p_gig) then v_pos := null; end if;
  insert into public.job_posts (org_id, gig_id, position_id, title, function_key, quantity, starts_on, ends_on, place, country, lat, lng,
                                languages, certificate, description, pay_mode, pay_amount, pay_max, pay_per, currency, created_by)
  values (v_gig.org_id, p_gig, v_pos, trim(p_job->>'title'), nullif(p_job->>'function_key', ''),
          coalesce(nullif(p_job->>'quantity', '')::integer, 1), v_from, v_to,
          nullif(trim(coalesce(p_job->>'place', '')), ''), nullif(p_job->>'country', ''),
          round(nullif(p_job->>'lat', '')::numeric, 2), round(nullif(p_job->>'lng', '')::numeric, 2),
          coalesce(array(select jsonb_array_elements_text(coalesce(p_job->'languages', '[]'))), '{}'),
          nullif(trim(coalesce(p_job->>'certificate', '')), ''), nullif(trim(coalesce(p_job->>'description', '')), ''),
          coalesce(nullif(p_job->>'pay_mode', ''), 'ask_rate'), nullif(p_job->>'pay_amount', '')::numeric, nullif(p_job->>'pay_max', '')::numeric,
          coalesce(nullif(p_job->>'pay_per', ''), 'day'), coalesce(nullif(p_job->>'currency', ''), 'EUR'), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.list_jobs_unchecked(p_all boolean default false, p_function text default null, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_p public.crew_profiles; v_out jsonb; v_total integer; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  select * into v_p from public.crew_profiles where user_id = v_me;
  if v_p.user_id is null or not v_p.enabled then
    return jsonb_build_object('needs_profile', true, 'results', '[]'::jsonb, 'total', 0, 'more', false);
  end if;
  with posts as (
    select j.*, o.name as org_name, o.verified_at is not null as verified, o.verified_name,
           case when j.lat is not null and v_p.base_lat is not null then round(private.km_between(v_p.base_lat, v_p.base_lng, j.lat, j.lng))::integer end as km,
           (select a.status from public.job_applications a where a.post_id = j.id and a.user_id = v_me) as my_status
      from public.job_posts j join public.organisations o on o.id = j.org_id
     where j.status = 'open' and j.ends_on >= current_date and o.posting_suspended_at is null
       and not exists (select 1 from public.network_reports r where r.reporter_id = v_me and r.target_kind = 'job' and r.target_post = j.id)
       and not exists (select 1 from public.user_blocks b where b.active
                        and ((b.user_id = v_me and b.blocked_id = j.created_by) or (b.user_id = j.created_by and b.blocked_id = v_me)))
       and (p_function is null or j.function_key = p_function)
  ), matching as (
    select * from posts p
     where coalesce(p_all, false)
        or ((p.function_key is null or p.function_key = any (v_p.functions))
            and (p.km is null
                 or v_p.travel_scope = 'world'
                 or (v_p.travel_scope = 'europe' and private.in_europe(p.country))
                 or (v_p.travel_scope = 'country' and p.country = v_p.base_country)
                 or (v_p.travel_scope = 'km' and p.km <= coalesce(v_p.travel_km, 50))))
  )
  select (select count(*) from matching),
         coalesce((select jsonb_agg(x.r order by x.ord) from (
           select row_number() over (order by m.starts_on, m.km nulls last, m.created_at desc) as ord,
                  jsonb_build_object('id', m.id, 'org_name', m.org_name, 'verified', m.verified, 'verified_name', m.verified_name, 'title', m.title, 'function_key', m.function_key,
                    'quantity', m.quantity, 'starts_on', m.starts_on, 'ends_on', m.ends_on, 'place', m.place, 'country', m.country, 'km', m.km,
                    'languages', m.languages, 'certificate', m.certificate, 'description', m.description, 'pay_mode', m.pay_mode,
                    'pay_amount', m.pay_amount, 'pay_max', m.pay_max, 'pay_per', m.pay_per, 'currency', m.currency,
                    'my_status', m.my_status, 'created_at', m.created_at) as r
             from matching m order by m.starts_on, m.km nulls last, m.created_at desc offset v_off limit 20) x), '[]')
    into v_total, v_out;
  return jsonb_build_object('needs_profile', false, 'results', v_out, 'total', v_total, 'more', v_total > v_off + 20);
end $$;

-- Applicants say whether the organisation has worked with them (it may confirm certificates)
create or replace function private.job_applicants_unchecked(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select j.org_id into v_org from public.job_posts j where j.id = p_post;
  if v_org is null or not private.can_quote(v_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'user_id', a.user_id, 'status', a.status, 'message', a.message, 'day_rate', a.day_rate, 'currency', a.currency,
           'created_at', a.created_at, 'name', p.full_name, 'worked_with', private.worked_with_org(v_org, a.user_id),
           'profile', case when c.enabled then jsonb_build_object(
             'headline', c.headline, 'functions', c.functions, 'other_functions', c.other_functions, 'bio', c.bio,
             'base_place', c.base_place, 'base_country', c.base_country, 'travel_scope', c.travel_scope, 'travel_km', c.travel_km,
             'languages', c.languages, 'experience_years', c.experience_years, 'links', c.links, 'certificates', c.certificates) end)
           order by a.created_at), '[]')
    from public.job_applications a
    join public.profiles p on p.id = a.user_id
    left join public.crew_profiles c on c.user_id = a.user_id
   where a.post_id = p_post and a.status <> 'withdrawn');
end $$;

-- ── Who may run what ────────────────────────────────────────────────────────
revoke execute on function private.is_avx_admin() from public, anon;
-- The proofs bucket's rule asks it for the signed-in person
grant execute on function private.is_avx_admin() to authenticated;
revoke execute on function private.require_avx_admin() from public, anon, authenticated;
revoke execute on function private.vies_country(text) from public, anon;
revoke execute on function private.start_vies_check_unchecked(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.request_manual_verification_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.refresh_certificates(uuid) from public, anon, authenticated;
revoke execute on function private.worked_with_org(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.confirm_certificate_unchecked(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function private.submit_certificate_proof_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function private.report_network_unchecked(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.record_vies_result(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.record_vies_result(uuid, boolean, text, text, text) to service_role;
revoke execute on function public.am_avx_admin() from public, anon;
revoke execute on function public.start_vies_check(uuid, text, text) from public, anon;
revoke execute on function public.request_manual_verification(uuid, text) from public, anon;
revoke execute on function public.decide_verification(uuid, boolean, text, text) from public, anon;
revoke execute on function public.revoke_verification(uuid, text) from public, anon;
revoke execute on function public.confirm_certificate(uuid, uuid, uuid, boolean) from public, anon;
revoke execute on function public.submit_certificate_proof(uuid, text) from public, anon;
revoke execute on function public.review_certificate_proof(uuid, boolean, text) from public, anon;
revoke execute on function public.report_network(text, uuid, text, text) from public, anon;
revoke execute on function public.decide_network_report(uuid, boolean) from public, anon;
revoke execute on function public.lift_suspension(text, uuid) from public, anon;
revoke execute on function public.trust_queue() from public, anon;
revoke execute on function public.trust_queue_count() from public, anon;
grant execute on function public.am_avx_admin() to authenticated;
grant execute on function public.start_vies_check(uuid, text, text) to authenticated;
grant execute on function public.request_manual_verification(uuid, text) to authenticated;
grant execute on function public.decide_verification(uuid, boolean, text, text) to authenticated;
grant execute on function public.revoke_verification(uuid, text) to authenticated;
grant execute on function public.confirm_certificate(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.submit_certificate_proof(uuid, text) to authenticated;
grant execute on function public.review_certificate_proof(uuid, boolean, text) to authenticated;
grant execute on function public.report_network(text, uuid, text, text) to authenticated;
grant execute on function public.decide_network_report(uuid, boolean) to authenticated;
grant execute on function public.lift_suspension(text, uuid) to authenticated;
grant execute on function public.trust_queue() to authenticated;
grant execute on function public.trust_queue_count() to authenticated;
