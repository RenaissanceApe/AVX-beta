-- K0 · Capture for reports, part 2: the jobs import (docs/SWITCHING.md S3b) fills the gig's client
-- from its client column when the name matches a client in Contacts. The name still goes into the
-- description too, as before. The function is as in 20261119000000 otherwise.
-- Written without destructive statements.

create or replace function private.import_gig_row(p_org uuid, r jsonb, out result text, out note text)
language plpgsql security definer set search_path = '' as $$
declare
  v public.gigs; v_ref text := left(private.import_text(r, 'ref'), 80); v_name text := left(private.import_text(r, 'name'), 200);
  v_start date := nullif(r ->> 'start_date', '')::date; v_end date := nullif(r ->> 'end_date', '')::date;
  v_status text := private.import_gig_status(private.import_text(r, 'status'));
  v_desc text; v_new jsonb; d jsonb; v_client uuid;
begin
  if v_status = 'unknown' then raise exception 'Unknown status: %', private.import_text(r, 'status') using errcode = '22023'; end if;
  if v_status = 'cancelled' then result := 'unchanged'; note := 'Cancelled job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if coalesce(v_end, v_start) < current_date then result := 'unchanged'; note := 'Past job left out: ' || coalesce(v_name, v_ref, '—'); return; end if;
  if v_end is not null and v_start is not null and v_end < v_start then raise exception 'The job ends before it starts' using errcode = '22023'; end if;
  -- The client from the directory when the name matches one (as the quotes import does)
  if private.import_text(r, 'client') is not null then
    select c.id into v_client from public.clients c
     where c.org_id = p_org and lower(c.name) = lower(private.import_text(r, 'client')) and c.archived_at is null
     order by c.created_at limit 1;
  end if;
  v_desc := nullif(concat_ws(E'\n',
    case when private.import_text(r, 'client') is not null then 'Client: ' || private.import_text(r, 'client') end,
    private.import_text(r, 'notes')), '');
  v := private.import_gig_find(p_org, v_ref, v_name, v_start);
  if v.id is null then
    if v_name is null then raise exception 'The name is missing' using errcode = '22023'; end if;
    if v_start is null then raise exception 'The start date is missing' using errcode = '22023'; end if;
    insert into public.gigs (org_id, name, venue, start_date, end_date, description, status, created_by, import_ref, client_id)
    values (p_org, v_name, left(private.import_text(r, 'venue'), 300), v_start, coalesce(v_end, v_start), left(v_desc, 5000),
      coalesce(v_status, 'draft'), auth.uid(), v_ref, v_client);
    result := 'created';
    return;
  end if;
  -- Only what the file gives; a gig already under way or done keeps its status
  v_new := jsonb_strip_nulls(jsonb_build_object('name', v_name, 'venue', left(private.import_text(r, 'venue'), 300),
    'start_date', v_start, 'end_date', v_end, 'description', left(v_desc, 5000), 'import_ref', v_ref, 'client_id', v_client,
    'status', case when v.status in ('draft', 'confirmed') then v_status end));
  if lower(v.name) = lower(v_name) then v_new := v_new - 'name'; end if;
  d := private.import_diff(to_jsonb(v), v_new);
  if d is null then result := 'unchanged'; return; end if;
  update public.gigs g set name = coalesce(v_new ->> 'name', g.name), venue = coalesce(v_new ->> 'venue', g.venue),
    start_date = coalesce((v_new ->> 'start_date')::date, g.start_date), end_date = coalesce((v_new ->> 'end_date')::date, g.end_date),
    description = coalesce(v_new ->> 'description', g.description), status = coalesce(v_new ->> 'status', g.status),
    import_ref = coalesce(v_new ->> 'import_ref', g.import_ref), client_id = coalesce((v_new ->> 'client_id')::uuid, g.client_id)
   where g.id = v.id;
  result := 'updated';
end $$;
revoke execute on function private.import_gig_row(uuid, jsonb) from public, anon, authenticated;
