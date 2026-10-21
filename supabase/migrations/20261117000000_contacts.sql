-- Switching S2 (docs/SWITCHING.md): the contacts directory.
-- 1. clients: the companies and people an organisation quotes for (suppliers already exist,
--    20261030000000_subrentals.sql). Archived, never deleted.
-- 2. suppliers get an address and a tax number, like clients.
-- 3. quotes.client_id: the client a quote was made for. The quote keeps its own copy of the
--    client's details (what was sent stays as it was sent); picking a client fills them in.
-- 4. clients_from_quotes(org): fills the directory from the clients typed on existing quotes
--    and links those quotes.
-- 5. run_import accepts 'clients' and 'suppliers', matched by tax number, then by name (an
--    e-mail address tells apart two with the same name). Importing contacts is switched on by
--    the hand-run file 20261117000001_import_undo.sql, which widens the import tables' checks
--    (it replaces constraints); until then run_import says so.
-- Written without destructive statements so it applies without manual confirmation.

-- ── Clients ──────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  contact_name text check (char_length(coalesce(contact_name, '')) <= 120),
  email text check (char_length(coalesce(email, '')) <= 200),
  phone text check (char_length(coalesce(phone, '')) <= 60),
  address text check (char_length(coalesce(address, '')) <= 500),
  tax_id text check (char_length(coalesce(tax_id, '')) <= 40),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_org_idx on public.clients (org_id, lower(name));
alter table public.clients enable row level security;
create policy clients_select on public.clients for select to authenticated using (private.can_quote(org_id));
create policy clients_insert on public.clients for insert to authenticated with check (private.can_quote(org_id));
create policy clients_update on public.clients for update to authenticated
  using (private.can_quote(org_id)) with check (private.can_quote(org_id));
create policy mfa_required on public.clients as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- No delete rule: clients are archived

create or replace function private.clients_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.org_id := old.org_id; new.created_by := old.created_by; new.created_at := old.created_at;
  else
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  end if;
  new.updated_at := now();
  new.name := trim(new.name);
  return new;
end $$;
revoke execute on function private.clients_before() from public, anon, authenticated;
create or replace trigger clients_before before insert or update on public.clients
  for each row execute function private.clients_before();

-- ── Suppliers: address and tax number ────────────────────────────────────────
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists tax_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_address_check') then
    alter table public.suppliers add constraint suppliers_address_check check (char_length(coalesce(address, '')) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'suppliers_tax_id_check') then
    alter table public.suppliers add constraint suppliers_tax_id_check check (char_length(coalesce(tax_id, '')) <= 40);
  end if;
end $$;

-- ── Quotes: which client ─────────────────────────────────────────────────────
alter table public.quotes add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists quotes_client_idx on public.quotes (client_id) where client_id is not null;

create or replace function private.quotes_client_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.org_id = new.org_id) then
    raise exception 'That client belongs to another organisation' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.quotes_client_check() from public, anon, authenticated;
create or replace trigger quotes_client_check before insert or update of client_id, org_id on public.quotes
  for each row execute function private.quotes_client_check();

-- ── Filling the directory from existing quotes ───────────────────────────────
-- Each client typed on a quote (by company, or by name when there's no company) becomes a
-- client, with the details of its latest quote; one already in the directory under that name
-- is used as it is. Those quotes are linked to it. Returns { created, linked }.
create or replace function public.clients_from_quotes(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_id uuid; n_created integer := 0; n_linked integer := 0; v_count integer;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  for r in
    select distinct on (lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))))
      lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))) as key,
      trim(coalesce(nullif(trim(q.client_company), ''), q.client_name)) as name,
      case when nullif(trim(q.client_company), '') is not null then nullif(trim(q.client_name), '') end as contact_name,
      nullif(trim(q.client_email), '') as email, nullif(trim(q.client_address), '') as address, nullif(trim(q.client_tax_id), '') as tax_id
    from public.quotes q
    where q.org_id = p_org and q.client_id is null and nullif(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name)), '') is not null
    order by lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))), q.updated_at desc
  loop
    select c.id into v_id from public.clients c where c.org_id = p_org and lower(c.name) = r.key order by c.archived_at nulls first, c.created_at limit 1;
    if v_id is null then
      insert into public.clients (org_id, name, contact_name, email, address, tax_id)
      values (p_org, left(r.name, 200), left(r.contact_name, 120), r.email, r.address, r.tax_id) returning id into v_id;
      n_created := n_created + 1;
    end if;
    update public.quotes q set client_id = v_id
     where q.org_id = p_org and q.client_id is null and lower(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name))) = r.key;
    get diagnostics v_count = row_count;
    n_linked := n_linked + v_count;
  end loop;
  return jsonb_build_object('created', n_created, 'linked', n_linked);
end $$;
revoke execute on function public.clients_from_quotes(uuid) from public, anon;
grant execute on function public.clients_from_quotes(uuid) to authenticated;

-- ── Importing contacts ───────────────────────────────────────────────────────
-- A tax number compared without spaces, dots, dashes or capitals ("PT 123.456.789" = "pt123456789")
create or replace function private.import_tax_key(p text) returns text
language sql immutable set search_path = '' as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;
revoke execute on function private.import_tax_key(text) from public, anon, authenticated;

-- One client or supplier row (p_tbl 'clients' or 'suppliers'): matched by tax number, then by
-- name (with the e-mail address to tell apart several of the same name), then updated or created
create or replace function private.import_contact_row(p_batch uuid, p_org uuid, p_tbl text, r jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.import_text(r, 'name'); v_tax text := private.import_text(r, 'tax_id'); v_email text := private.import_text(r, 'email');
  v_id uuid; v_cur jsonb; v_new jsonb; d jsonb; n integer;
begin
  if p_tbl not in ('clients', 'suppliers') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'Not an e-mail address: %', v_email using errcode = '22023'; end if;
  if private.import_tax_key(v_tax) is not null then
    execute format('select id from public.%I where org_id = $1 and private.import_tax_key(tax_id) = $2 order by archived_at nulls first, created_at limit 1', p_tbl)
      into v_id using p_org, private.import_tax_key(v_tax);
  end if;
  if v_id is null and v_name is not null then
    execute format('select count(*) from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null', p_tbl) into n using p_org, v_name;
    if n > 1 and v_email is not null then
      execute format('select count(*) from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null and lower(email) = lower($3)', p_tbl)
        into n using p_org, v_name, v_email;
      if n = 1 then
        execute format('select id from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null and lower(email) = lower($3)', p_tbl)
          into v_id using p_org, v_name, v_email;
      end if;
    elsif n = 1 then
      execute format('select id from public.%I where org_id = $1 and lower(name) = lower($2) and archived_at is null', p_tbl) into v_id using p_org, v_name;
    end if;
    if v_id is null and n > 1 then raise exception 'Several contacts are called %: add their tax numbers to the file', v_name using errcode = '22023'; end if;
  end if;
  -- Only what the file gives; empty cells keep what's there
  v_new := jsonb_strip_nulls(jsonb_build_object(
    'name', v_name, 'contact_name', private.import_text(r, 'contact_name'), 'email', v_email, 'phone', private.import_text(r, 'phone'),
    'address', private.import_text(r, 'address'), 'tax_id', v_tax, 'notes', private.import_text(r, 'notes')));
  if v_id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    execute format('insert into public.%I (org_id, name, contact_name, email, phone, address, tax_id, notes)
      select $1, x.name, x.contact_name, x.email, x.phone, x.address, x.tax_id, x.notes
      from jsonb_populate_record(null::public.%I, $2) x returning id', p_tbl, p_tbl) into v_id using p_org, v_new;
    perform private.import_log(p_batch, p_tbl, v_id::text, 'created', null, null);
    return 'created';
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tbl) into v_cur using v_id;
  -- A name or e-mail address that only differs in capitals, or a tax number written
  -- differently, isn't a change
  if lower(v_cur ->> 'name') = lower(v_name) then v_new := v_new - 'name'; end if;
  if lower(v_cur ->> 'email') = lower(v_email) then v_new := v_new - 'email'; end if;
  if private.import_tax_key(v_cur ->> 'tax_id') = private.import_tax_key(v_tax) then v_new := v_new - 'tax_id'; end if;
  d := private.import_diff(v_cur - 'updated_at', v_new);
  if d is null then return 'unchanged'; end if;
  execute format('update public.%I t set name = coalesce(x.name, t.name), contact_name = coalesce(x.contact_name, t.contact_name),
      email = coalesce(x.email, t.email), phone = coalesce(x.phone, t.phone), address = coalesce(x.address, t.address),
      tax_id = coalesce(x.tax_id, t.tax_id), notes = coalesce(x.notes, t.notes)
    from jsonb_populate_record(null::public.%I, $2) x where t.id = $1', p_tbl, p_tbl) using v_id, v_new;
  perform private.import_log(p_batch, p_tbl, v_id::text, 'updated', d -> 'before', d -> 'after');
  return 'updated';
end $$;
revoke execute on function private.import_contact_row(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- Same as before (20261116000000_import_kits.sql), plus 'clients' and 'suppliers'
create or replace function public.run_import(p_org uuid, p_kind text, p_rows jsonb, p_file text default null, p_preset text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid; r jsonb; v_n integer := 0; v_line integer; v_res text; v_note text;
  c_created integer := 0; c_updated integer := 0; c_same integer := 0; c_skipped integer := 0; v_problems jsonb := '[]'::jsonb;
begin
  perform private.require_mfa();
  if not private.can_quote(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('locations', 'items', 'units', 'kits', 'clients', 'suppliers') then raise exception 'Unknown import' using errcode = '22023'; end if;
  if p_kind in ('clients', 'suppliers') and not exists (
    select 1 from pg_constraint where conname = 'import_batches_kind_check' and pg_get_constraintdef(oid) like '%clients%') then
    raise exception 'Importing contacts isn''t switched on yet' using errcode = '0A000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Up to 5000 rows per import' using errcode = '54000'; end if;
  insert into public.import_batches (org_id, kind, subject, file_name, preset)
  values (p_org, case when p_kind = 'kits' then 'items' else p_kind end, case when p_kind = 'kits' then 'kits' end, left(p_file, 200), left(p_preset, 80))
  returning id into v_batch;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_line := coalesce(nullif(r ->> '_row', '')::integer, v_n);
    v_note := null;
    begin
      if p_kind = 'locations' then v_res := private.import_location_row(v_batch, p_org, r);
      elsif p_kind = 'items' then select result, note into v_res, v_note from private.import_item_row(v_batch, p_org, r);
      elsif p_kind = 'kits' then v_res := private.import_kit_row(v_batch, p_org, r);
      elsif p_kind in ('clients', 'suppliers') then v_res := private.import_contact_row(v_batch, p_org, p_kind, r);
      else v_res := private.import_unit_row(v_batch, p_org, r);
      end if;
      if v_res = 'created' then c_created := c_created + 1; elsif v_res = 'updated' then c_updated := c_updated + 1; else c_same := c_same + 1; end if;
      if v_note is not null and jsonb_array_length(v_problems) < 1000 then
        v_problems := v_problems || jsonb_build_object('row', v_line, 'message', v_note, 'level', 'note');
      end if;
    exception when others then
      c_skipped := c_skipped + 1;
      if jsonb_array_length(v_problems) < 1000 then
        v_problems := v_problems || jsonb_build_object('row', v_line, 'message', left(sqlerrm, 300), 'level', 'skip');
      end if;
    end;
  end loop;
  update public.import_batches set created = c_created, updated = c_updated, unchanged = c_same, skipped = c_skipped, problems = v_problems
   where id = v_batch;
  return jsonb_build_object('batch', v_batch, 'created', c_created, 'updated', c_updated, 'unchanged', c_same, 'skipped', c_skipped, 'problems', v_problems);
end $$;
revoke execute on function public.run_import(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.run_import(uuid, text, jsonb, text, text) to authenticated;
