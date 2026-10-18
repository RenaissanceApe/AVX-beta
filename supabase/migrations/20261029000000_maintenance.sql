-- Inventory phase I5: maintenance (docs/INVENTORY.md).
-- 1. Repairs: damage reported from site (with a photo) or in the warehouse, who repairs it,
--    cost and whether the client is charged. A unit under repair isn't available; bulk items
--    under repair count against what can go out.
-- 2. Damage reports from anyone on the gig; returns scanned in as damaged open a repair.
-- 3. Periodic inspections (electrical/PAT, rigging certificates…) per item, with what's due
--    and a daily reminder to the organisation's admins.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Inspections on the catalogue ─────────────────────────────────────────────
alter table public.price_items add column if not exists inspection_kind text;
alter table public.price_items add column if not exists inspection_months integer;
alter table public.price_items add constraint price_items_inspection_check check (
  char_length(coalesce(inspection_kind, '')) <= 80
  and (inspection_months is null or inspection_months between 1 and 120));

-- ── Repairs ──────────────────────────────────────────────────────────────────
create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  unit_id uuid references public.stock_units(id),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  gig_id uuid references public.gigs(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_repair', 'done', 'written_off')),
  problem text not null check (char_length(problem) between 1 and 1000),
  photo_path text check (char_length(coalesce(photo_path, '')) <= 300),
  repairer text check (char_length(coalesce(repairer, '')) <= 120),
  cost numeric(12,2) check (cost is null or cost >= 0),
  charge_client boolean not null default false,
  expected_back date,
  outcome text check (char_length(coalesce(outcome, '')) <= 1000),
  reported_by uuid default auth.uid() references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists repairs_org_idx on public.repairs (org_id, status);
create index if not exists repairs_item_idx on public.repairs (item_id);
create unique index if not exists repairs_one_open_per_unit on public.repairs (unit_id)
  where unit_id is not null and status in ('open', 'in_repair');
alter table public.repairs enable row level security;
create policy repairs_select on public.repairs for select to authenticated using (private.can_quote(org_id));
create policy repairs_insert on public.repairs for insert to authenticated with check (private.can_quote(org_id));
create policy repairs_update on public.repairs for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.repairs as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete rule: repairs are part of an item's history

create or replace function private.repairs_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record; v_unit record;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.item_id := old.item_id; new.unit_id := old.unit_id;
    new.gig_id := old.gig_id; new.reported_by := old.reported_by; new.created_at := old.created_at;
    if new.unit_id is not null then new.quantity := 1; end if;
  else
    select i.org_id, i.tracking into v_item from public.price_items i where i.id = new.item_id;
    if v_item.org_id is null or v_item.tracking = 'none' then
      raise exception 'Only stock-tracked items can be repaired' using errcode = '23514';
    end if;
    if new.unit_id is not null then
      select u.item_id into v_unit from public.stock_units u where u.id = new.unit_id;
      if v_unit.item_id is distinct from new.item_id then
        raise exception 'That unit isn''t this item' using errcode = '23514';
      end if;
      new.quantity := 1;
    elsif v_item.tracking = 'serial' then
      raise exception 'Choose the unit to repair' using errcode = '23514';
    end if;
    if new.gig_id is not null and not exists (select 1 from public.gigs g where g.id = new.gig_id and g.org_id = v_item.org_id) then
      new.gig_id := null;
    end if;
    new.org_id := v_item.org_id;
    new.created_at := now();
    if auth.uid() is not null then new.reported_by := auth.uid(); end if;
  end if;
  new.problem := trim(new.problem);
  if new.status in ('done', 'written_off') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger repairs_before before insert or update on public.repairs
  for each row execute function private.repairs_before();

-- A unit follows its repair: in repair while it's open, available when done, retired when
-- written off. Admins hear about new damage reports.
create or replace function private.repairs_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item text; v_gig text; v_code text;
begin
  if new.unit_id is not null and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    if new.status in ('open', 'in_repair') then
      update public.stock_units set status = 'repair' where id = new.unit_id and status = 'available';
    elsif new.status = 'done' then
      update public.stock_units set status = 'available' where id = new.unit_id and status = 'repair';
    else
      update public.stock_units set status = 'retired' where id = new.unit_id and status <> 'retired';
    end if;
  end if;
  if tg_op = 'INSERT' then
    select i.name into v_item from public.price_items i where i.id = new.item_id;
    select g.name into v_gig from public.gigs g where g.id = new.gig_id;
    select u.code into v_code from public.stock_units u where u.id = new.unit_id;
    insert into public.notifications (user_id, org_id, gig_id, actor_id, kind, details)
    select m.user_id, new.org_id, new.gig_id, new.reported_by, 'damage_reported',
           jsonb_build_object('repair_id', new.id, 'item_name', v_item, 'unit_code', v_code, 'quantity', new.quantity,
                              'gig_name', v_gig, 'excerpt', left(new.problem, 120))
      from public.org_members m
     where m.org_id = new.org_id and m.role = 'admin' and m.user_id is distinct from new.reported_by;
  end if;
  return null;
end $$;
create or replace trigger repairs_after after insert or update on public.repairs
  for each row execute function private.repairs_after();

-- What can go out: bulk stock and available units, minus bulk quantities under repair
create or replace function private.item_owned(p_item uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select (coalesce((select sum(s.quantity - s.in_repair) from public.stock_levels s where s.item_id = p_item), 0)
        - coalesce((select sum(r.quantity) from public.repairs r
                     where r.item_id = p_item and r.unit_id is null and r.status in ('open', 'in_repair')), 0))::integer
$$;

-- ── Photos of damage ─────────────────────────────────────────────────────────
-- Private bucket; paths are <org id>/<gig id or "stock">/<file>. The organisation's admins
-- and members see them; anyone on the gig can add one when reporting from site.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repair-photos', 'repair-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

create or replace function private.path_uuid(p_name text, p_part integer) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', p_part)::uuid;
exception when others then
  return null;
end $$;
create or replace function private.can_add_repair_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_quote(private.path_uuid(p_name, 1))
      or exists (select 1 from public.gigs g
                  where g.id = private.path_uuid(p_name, 2) and g.org_id = private.path_uuid(p_name, 1)
                    and private.can_access_gig(g.id))
$$;
create policy repair_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'repair-photos' and (private.can_quote(private.path_uuid(name, 1)) or owner_id = auth.uid()::text));
create policy repair_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'repair-photos' and private.can_add_repair_photo(name));

-- ── Damage reported from site ────────────────────────────────────────────────
-- Anyone on the gig can report damage to equipment on that gig: an item counted in bulk
-- (with how many), or a unit by its code. A unit already under repair adds nothing new.
create or replace function private.report_damage_unchecked(p_gig uuid, p_item uuid, p_unit_code text, p_quantity integer,
                                                            p_problem text, p_photo_path text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid; v_unit uuid; v_id uuid;
begin
  select g.org_id into v_org from public.gigs g where g.id = p_gig;
  if v_org is null or not (private.can_access_gig(p_gig) or private.can_quote(v_org)) then
    raise exception 'Not allowed for this gig' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_unit_code, '')), '') is not null then
    select u.id, u.item_id into v_unit, p_item from public.stock_units u
     where u.org_id = v_org and upper(u.code) = upper(trim(p_unit_code));
    if v_unit is null then raise exception 'Unknown unit code' using errcode = '22023'; end if;
  end if;
  if not exists (select 1 from public.gig_equipment e where e.gig_id = p_gig and e.item_id = p_item)
     and not exists (select 1 from public.stock_units u where u.id = v_unit and u.out_on_gig = p_gig) then
    raise exception 'That equipment isn''t on this gig' using errcode = '22023';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> v_org::text then
    raise exception 'Invalid photo' using errcode = '22023';
  end if;
  insert into public.repairs (item_id, unit_id, quantity, gig_id, problem, photo_path)
  values (p_item, v_unit, greatest(1, least(coalesce(p_quantity, 1), 100000)), p_gig, left(trim(p_problem), 1000), p_photo_path)
  on conflict (unit_id) where unit_id is not null and status in ('open', 'in_repair') do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.repairs r where r.unit_id = v_unit and r.status in ('open', 'in_repair');
  end if;
  return v_id;
end $$;
create or replace function public.report_damage(p_gig uuid, p_item uuid, p_unit_code text, p_quantity integer,
                                                p_problem text, p_photo_path text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  return private.report_damage_unchecked(p_gig, p_item, p_unit_code, p_quantity, p_problem, p_photo_path);
end $$;

-- Returns scanned in as damaged open a repair too
create or replace function public.dispatch_scan(p_gig uuid, p_code text, p_direction text, p_quantity integer default 1,
                                                p_condition text default 'ok', p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb; v_case uuid; c jsonb; v_unit uuid;
begin
  perform private.require_mfa();
  r := private.dispatch_scan_unchecked(p_gig, p_code, p_direction, p_quantity, p_condition, p_note);
  if (r->>'ok')::boolean and r->>'kind' = 'unit' then
    select u.id into v_case
      from public.stock_units u join public.price_items i on i.id = u.item_id join public.gigs g on g.org_id = u.org_id
     where g.id = p_gig and upper(u.code) = upper(r->>'unit_code') and i.kit_type = 'case';
    if v_case is not null then
      c := private.dispatch_case_contents(p_gig, v_case, p_direction);
      r := r || jsonb_build_object('contents', (c->>'moved')::integer, 'contents_skipped', (c->>'skipped')::integer);
    end if;
  end if;
  if (r->>'ok')::boolean and p_direction = 'in' and p_condition = 'damaged' and r->>'item_id' is not null then
    select u.id into v_unit from public.stock_units u join public.gigs g on g.org_id = u.org_id
     where g.id = p_gig and upper(u.code) = upper(r->>'unit_code');
    insert into public.repairs (item_id, unit_id, quantity, gig_id, problem)
    values ((r->>'item_id')::uuid, v_unit, coalesce((r->>'quantity')::integer, 1), p_gig,
            coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 1000), 'Damaged on return'))
    on conflict (unit_id) where unit_id is not null and status in ('open', 'in_repair') do nothing;
    r := r || jsonb_build_object('repair', true);
  end if;
  return r;
end $$;

-- ── Inspections ──────────────────────────────────────────────────────────────
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  item_id uuid not null references public.price_items(id),
  unit_id uuid references public.stock_units(id),
  done_on date not null default current_date,
  result text not null check (result in ('pass', 'fail')),
  inspector text check (char_length(coalesce(inspector, '')) <= 120),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inspections_target_idx on public.inspections (item_id, unit_id, done_on desc);
alter table public.inspections enable row level security;
create policy inspections_select on public.inspections for select to authenticated using (private.can_quote(org_id));
create policy inspections_insert on public.inspections for insert to authenticated with check (private.can_quote(org_id));
create policy mfa_required on public.inspections as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Inspections are a record: added, never changed or removed

create or replace function private.inspections_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item record; v_unit uuid;
begin
  select i.org_id, i.tracking into v_item from public.price_items i where i.id = new.item_id;
  if v_item.org_id is null or v_item.tracking = 'none' then
    raise exception 'Only stock-tracked items are inspected' using errcode = '23514';
  end if;
  if new.unit_id is not null then
    select u.item_id into v_unit from public.stock_units u where u.id = new.unit_id;
    if v_unit is distinct from new.item_id then raise exception 'That unit isn''t this item' using errcode = '23514'; end if;
  elsif v_item.tracking = 'serial' then
    raise exception 'Choose the unit inspected' using errcode = '23514';
  end if;
  if new.done_on > current_date + 1 then raise exception 'Inspection date is in the future' using errcode = '23514'; end if;
  new.org_id := v_item.org_id;
  new.created_at := now();
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
create or replace trigger inspections_before before insert on public.inspections
  for each row execute function private.inspections_before();

-- A failed inspection opens a repair
create or replace function private.inspections_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_kind text;
begin
  if new.result = 'fail' then
    select i.inspection_kind into v_kind from public.price_items i where i.id = new.item_id;
    insert into public.repairs (item_id, unit_id, quantity, problem)
    values (new.item_id, new.unit_id, 1,
            left(concat_ws(': ', 'Failed inspection' || coalesce(' (' || v_kind || ')', ''), nullif(trim(coalesce(new.notes, '')), '')), 1000))
    on conflict (unit_id) where unit_id is not null and status in ('open', 'in_repair') do nothing;
  end if;
  return null;
end $$;
create or replace trigger inspections_after after insert on public.inspections
  for each row execute function private.inspections_after();

-- What needs inspecting: every unit (or bulk item) of items with an interval, with its last
-- pass and when the next is due (never inspected: due now)
create or replace function private.maintenance_due_all(p_org uuid)
returns table(item_id uuid, item_name text, inspection_kind text, unit_id uuid, unit_code text,
              last_done date, last_result text, due_on date)
language sql stable security definer set search_path = '' as $$
  with targets as (
    select i.id as item_id, i.name, i.inspection_kind, i.inspection_months, u.id as unit_id, u.code
      from public.price_items i join public.stock_units u on u.item_id = i.id and u.status in ('available', 'repair')
     where i.org_id = p_org and i.inspection_months is not null and i.tracking = 'serial' and i.archived_at is null
    union all
    select i.id, i.name, i.inspection_kind, i.inspection_months, null, null
      from public.price_items i
     where i.org_id = p_org and i.inspection_months is not null and i.tracking = 'bulk' and i.archived_at is null
  )
  select t.item_id, t.name, t.inspection_kind, t.unit_id, t.code, lp.done_on, ll.result,
         coalesce((lp.done_on + make_interval(months => t.inspection_months))::date, current_date)
    from targets t
    left join lateral (select x.done_on from public.inspections x
                        where x.item_id = t.item_id and x.unit_id is not distinct from t.unit_id and x.result = 'pass'
                        order by x.done_on desc limit 1) lp on true
    left join lateral (select x.result from public.inspections x
                        where x.item_id = t.item_id and x.unit_id is not distinct from t.unit_id
                        order by x.done_on desc, x.created_at desc limit 1) ll on true
   order by 8, 2, 5
$$;
create or replace function public.maintenance_due(p_org uuid)
returns table(item_id uuid, item_name text, inspection_kind text, unit_id uuid, unit_code text,
              last_done date, last_result text, due_on date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then return; end if;
  return query select * from private.maintenance_due_all(p_org);
end $$;

-- ── Reminders ────────────────────────────────────────────────────────────────
-- Once a day: what falls due in the next two weeks (or is overdue) and hasn't been
-- mentioned yet for that due date → one notification per organisation to its admins
create table if not exists public.maintenance_reminders (
  org_id uuid not null references public.organisations(id) on delete cascade,
  target uuid not null,
  due_on date not null,
  created_at timestamptz not null default now(),
  primary key (org_id, target, due_on)
);
alter table public.maintenance_reminders enable row level security;
-- No rules: only the reminder job uses it

create or replace function private.send_maintenance_reminders() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare o record; n integer; total integer := 0;
begin
  for o in select id, name from public.organisations loop
    with fresh as (
      insert into public.maintenance_reminders (org_id, target, due_on)
      select o.id, coalesce(d.unit_id, d.item_id), d.due_on
        from private.maintenance_due_all(o.id) d
       where d.due_on <= current_date + 14
      on conflict do nothing
      returning 1
    ) select count(*) into n from fresh;
    if n > 0 then
      insert into public.notifications (user_id, org_id, kind, details)
      select m.user_id, o.id, 'inspection_due', jsonb_build_object('count', n, 'org_name', o.name)
        from public.org_members m where m.org_id = o.id and m.role = 'admin';
      total := total + n;
    end if;
  end loop;
  return total;
end $$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('avx-maintenance-reminders', '17 6 * * *', 'select private.send_maintenance_reminders()');

revoke execute on function private.repairs_before() from public, anon, authenticated;
revoke execute on function private.repairs_after() from public, anon, authenticated;
revoke execute on function private.inspections_before() from public, anon, authenticated;
revoke execute on function private.inspections_after() from public, anon, authenticated;
revoke execute on function private.report_damage_unchecked(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
revoke execute on function private.maintenance_due_all(uuid) from public, anon, authenticated;
revoke execute on function private.send_maintenance_reminders() from public, anon, authenticated;
revoke execute on function private.path_uuid(text, integer) from public, anon;
grant execute on function private.path_uuid(text, integer) to authenticated;
revoke execute on function private.can_add_repair_photo(text) from public, anon;
grant execute on function private.can_add_repair_photo(text) to authenticated;
revoke execute on function public.report_damage(uuid, uuid, text, integer, text, text) from public, anon;
revoke execute on function public.maintenance_due(uuid) from public, anon;
revoke execute on function public.dispatch_scan(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.report_damage(uuid, uuid, text, integer, text, text) to authenticated;
grant execute on function public.maintenance_due(uuid) to authenticated;
grant execute on function public.dispatch_scan(uuid, text, text, integer, text, text) to authenticated;
