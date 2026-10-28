-- Build order step 7 (docs/TOOLS_PLAN.md; COMPETITOR_RESEARCH #3): crew rates and labour cost.
-- - crew_rates: what the organisation pays, per function ("FOH engineer"), per person, or per person
--   for one function; day, half-day and hour rates. Admins manage them; admins and members read
--   them (they build quotes). Crew never see them. Removing only marks a rate.
-- - crew_rate_factors: one row per organisation with the overtime, weekend, night and holiday
--   multipliers (weekend is used for planned cost now; the rest by time registration, step 8).
-- - gig_crew_fees: the fee agreed with each person on a gig (a rate per day, half day or hour times a
--   quantity, or a fixed amount). The gig's managers set it; each person reads only their own.
--   Clearing a fee sets its rate to null, so the planned cost falls back to the rate card.
-- Written without destructive statements.

create table if not exists public.crew_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  function_title text check (function_title is null or char_length(trim(function_title)) between 1 and 120),
  user_id uuid references auth.users(id) on delete cascade,
  day_rate numeric(10,2) check (day_rate between 0 and 100000),
  half_day_rate numeric(10,2) check (half_day_rate between 0 and 100000),
  hour_rate numeric(10,2) check (hour_rate between 0 and 10000),
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  check (function_title is not null or user_id is not null),
  check (day_rate is not null or half_day_rate is not null or hour_rate is not null)
);
create unique index if not exists crew_rates_live_key on public.crew_rates
  (org_id, lower(coalesce(function_title, '')), coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where removed_at is null;

alter table public.crew_rates enable row level security;
create policy crew_rates_select on public.crew_rates for select to authenticated
  using (private.can_quote(org_id));
create policy crew_rates_insert on public.crew_rates for insert to authenticated
  with check (private.is_org_admin(org_id) and removed_at is null);
create policy crew_rates_update on public.crew_rates for update to authenticated
  using (removed_at is null and private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.crew_rates as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.crew_rates from authenticated;
grant update (day_rate, half_day_rate, hour_rate, note, removed_at) on public.crew_rates to authenticated;

-- Runs as the caller: tidy, stamp, keep the limit, keep who and what a rate is for
create or replace function private.crew_rates_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.function_title := nullif(trim(new.function_title), '');
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if (select count(*) from public.crew_rates r where r.org_id = new.org_id and r.removed_at is null) >= 500 then
      raise exception 'Rate limit reached' using errcode = '54000';
    end if;
  else
    new.org_id := old.org_id; new.function_title := old.function_title; new.user_id := old.user_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if new.removed_at is not null and old.removed_at is null then new.removed_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.crew_rates_before() from public, anon, authenticated;
create or replace trigger crew_rates_before before insert or update on public.crew_rates
  for each row execute function private.crew_rates_before();

create table if not exists public.crew_rate_factors (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  overtime numeric(4,2) not null default 1.5 check (overtime between 1 and 5),
  overtime_after_hours numeric(4,1) not null default 10 check (overtime_after_hours between 1 and 24),
  weekend numeric(4,2) not null default 1 check (weekend between 1 and 5),
  night numeric(4,2) not null default 1 check (night between 1 and 5),
  holiday numeric(4,2) not null default 1 check (holiday between 1 and 5),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.crew_rate_factors enable row level security;
create policy crew_rate_factors_select on public.crew_rate_factors for select to authenticated
  using (private.can_quote(org_id));
create policy crew_rate_factors_insert on public.crew_rate_factors for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy crew_rate_factors_update on public.crew_rate_factors for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy mfa_required on public.crew_rate_factors as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.crew_rate_factors from authenticated;
grant update (overtime, overtime_after_hours, weekend, night, holiday) on public.crew_rate_factors to authenticated;

create or replace function private.crew_rate_factors_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'UPDATE' then new.org_id := old.org_id; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.crew_rate_factors_before() from public, anon, authenticated;
create or replace trigger crew_rate_factors_before before insert or update on public.crew_rate_factors
  for each row execute function private.crew_rate_factors_before();

create table if not exists public.gig_crew_fees (
  gig_id uuid not null references public.gigs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade, -- the gig's (none for a personal gig)
  unit text not null default 'day' check (unit in ('day', 'half_day', 'hour', 'fixed')),
  rate numeric(10,2) check (rate between 0 and 1000000),
  quantity numeric(7,2) not null default 1 check (quantity > 0 and quantity <= 1000),
  note text check (char_length(note) <= 300),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (gig_id, user_id)
);
create index if not exists gig_crew_fees_org_idx on public.gig_crew_fees (org_id);
create index if not exists gig_crew_fees_user_idx on public.gig_crew_fees (user_id);

alter table public.gig_crew_fees enable row level security;
create policy gig_crew_fees_select on public.gig_crew_fees for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_gig(gig_id));
create policy gig_crew_fees_insert on public.gig_crew_fees for insert to authenticated
  with check (private.can_manage_gig(gig_id));
create policy gig_crew_fees_update on public.gig_crew_fees for update to authenticated
  using (private.can_manage_gig(gig_id)) with check (private.can_manage_gig(gig_id));
create policy mfa_required on public.gig_crew_fees as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke update on public.gig_crew_fees from authenticated;
grant update (unit, rate, quantity, note) on public.gig_crew_fees to authenticated;

-- Security definer: reads the gig and its crew whoever saves. Only people on the gig get a fee;
-- a fixed fee counts once.
create or replace function private.gig_crew_fees_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select g.org_id into new.org_id from public.gigs g where g.id = new.gig_id;
    if not exists (select 1 from public.gig_members m where m.gig_id = new.gig_id and m.user_id = new.user_id) then
      raise exception 'Not on this gig' using errcode = '22023';
    end if;
  else
    new.gig_id := old.gig_id; new.user_id := old.user_id; new.org_id := old.org_id;
  end if;
  if new.unit = 'fixed' then new.quantity := 1; end if;
  new.note := nullif(trim(new.note), '');
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function private.gig_crew_fees_before() from public, anon, authenticated;
create or replace trigger gig_crew_fees_before before insert or update on public.gig_crew_fees
  for each row execute function private.gig_crew_fees_before();
