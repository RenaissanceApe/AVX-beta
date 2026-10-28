-- Organisation export (docs/SWITCHING.md, S5) with step 6 S1: the gigs file also gives each gig's
-- status as the organisation names it and its gig type. The rest of the function is unchanged.
-- Written without destructive statements.

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0); v_prefix text;
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  -- Quote numbers as the app shows them (Q0042, or 42 without a prefix)
  select coalesce(o.quote_number_prefix, 'Q') into v_prefix from public.organisations o where o.id = p_org;
  case p_part
  when 'organisation' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select o.name, o.legal_name, o.tax_id, o.address, o.email, o.phone, o.website, o.default_vat_rate,
             o.quote_validity_days, o.quote_number_prefix, o.quote_next_number, o.quote_terms, o.time_zone,
             o.equipment_prep_days, o.equipment_return_days, o.created_at
        from public.organisations o where o.id = p_org and v_off = 0) x;
  when 'members' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select m.full_name as name, m.email, m.role, m.joined_at
        from private.org_member_list_unchecked(p_org) m
       order by m.joined_at, m.email offset v_off limit v_lim) x;
  when 'held_invites' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select h.full_name, h.email, h.phone, h.functions, h.role, h.notes, h.status, h.created_at, h.sent_at
        from public.held_invites h where h.org_id = p_org
       order by h.created_at, h.id offset v_off limit v_lim) x;
  when 'locations' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select l.name, l.kind, l.address, l.notes, l.archived_at
        from public.stock_locations l where l.org_id = p_org
       order by l.name, l.id offset v_off limit v_lim) x;
  when 'items' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.name, i.code, i.category, i.brand, i.model, i.kind, i.unit as charged_per, i.unit_price, i.tracking,
             i.kit_type, i.weight_kg, i.power_w, i.dimensions, i.replacement_value, i.min_stock,
             i.packing_note, i.details, i.inspection_kind, i.inspection_months, i.archived_at, i.created_at
        from public.price_items i where i.org_id = p_org
       order by i.category nulls last, i.name, i.id offset v_off limit v_lim) x;
  when 'stock' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.name as item, i.code as item_code, l.name as location, s.quantity, s.in_repair
        from (select sl.item_id, sl.location_id, sum(sl.quantity)::integer quantity, sum(sl.in_repair)::integer in_repair
                from public.stock_levels sl where sl.org_id = p_org group by sl.item_id, sl.location_id) s
        join public.price_items i on i.id = s.item_id
        left join public.stock_locations l on l.id = s.location_id
       order by i.name, l.name nulls first offset v_off limit v_lim) x;
  when 'units' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select i.name as item, i.code as item_code, u.code, u.serial, l.name as location, u.status,
             u.purchase_date, u.purchase_cost, u.depreciation_months, c.code as in_case, u.notes, u.created_at
        from public.stock_units u
        join public.price_items i on i.id = u.item_id
        left join public.stock_locations l on l.id = u.location_id
        left join public.stock_units c on c.id = u.case_unit_id
       where u.org_id = p_org
       order by i.name, u.code nulls last, u.id offset v_off limit v_lim) x;
  when 'kit_contents' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select k.name as kit, k.code as kit_code, k.kit_type, c.name as item, c.code as item_code, p.quantity, p.kind as part_kind
        from public.item_parts p
        join public.price_items k on k.id = p.parent_id
        join public.price_items c on c.id = p.child_id
       where p.org_id = p_org
       order by k.name, p.kind, c.name, p.id offset v_off limit v_lim) x;
  when 'stock_movements' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select m.created_at, i.name as item, i.code as item_code, u.code as unit_code, m.kind, m.quantity,
             f.name as from_location, t.name as to_location, m.note, p.full_name as by
        from public.stock_movements m
        join public.price_items i on i.id = m.item_id
        left join public.stock_units u on u.id = m.unit_id
        left join public.stock_locations f on f.id = m.from_location_id
        left join public.stock_locations t on t.id = m.to_location_id
        left join public.profiles p on p.id = m.created_by
       where m.org_id = p_org
       order by m.created_at, m.id offset v_off limit v_lim) x;
  when 'clients' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select c.name, c.contact_name, c.email, c.phone, c.address, c.tax_id, c.notes, c.archived_at, c.created_at
        from public.clients c where c.org_id = p_org
       order by c.name, c.id offset v_off limit v_lim) x;
  when 'suppliers' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select s.name, s.contact_name, s.email, s.phone, s.address, s.tax_id, s.notes, s.archived_at, s.created_at
        from public.suppliers s where s.org_id = p_org
       order by s.name, s.id offset v_off limit v_lim) x;
  when 'gigs' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as ref, g.name, g.start_date, g.end_date, g.venue, g.status,
             s.name as status_label, ty.name as gig_type,
             (select q.client_company from public.quotes q where q.gig_id = g.id and q.client_company is not null order by q.created_at limit 1) as client,
             g.description as notes, g.created_at
        from public.gigs g
        left join public.gig_statuses s on s.id = g.custom_status_id
        left join public.gig_types ty on ty.id = g.gig_type_id
       where g.org_id = p_org
       order by g.start_date nulls last, g.name, g.id offset v_off limit v_lim) x;
  when 'gig_equipment' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, coalesce(i.name, e.item_name) as item, i.code as item_code,
             e.category, e.quantity, e.planned_from, e.planned_until, e.notes, e.packing_note
        from public.gig_equipment e
        join public.gigs g on g.id = e.gig_id
        left join public.price_items i on i.id = e.item_id
       where g.org_id = p_org
       order by g.start_date nulls last, g.name, e.created_at, e.id offset v_off limit v_lim) x;
  when 'gig_crew' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, p.full_name as name, m.role, m.function_title,
             m.call_time, m.booked_from, m.booked_until
        from public.gig_members m
        join public.gigs g on g.id = m.gig_id
        left join public.profiles p on p.id = m.user_id
       where g.org_id = p_org
       order by g.start_date nulls last, g.name, p.full_name, m.user_id offset v_off limit v_lim) x;
  when 'gig_schedule' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, s.day, s.start_time, s.end_time, s.title, s.location, s.notes
        from public.gig_schedule s
        join public.gigs g on g.id = s.gig_id
       where g.org_id = p_org
       order by g.start_date nulls last, g.name, s.day, s.start_time nulls first, s.id offset v_off limit v_lim) x;
  when 'gig_files' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig, a.name, a.type, a.version, a.file_size, a.created_at
        from public.assets a
        join public.gigs g on g.id = a.gig_id
       where g.org_id = p_org
       order by g.start_date nulls last, g.name, a.created_at, a.id offset v_off limit v_lim) x;
  when 'quotes' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select case when v_prefix = '' then q.number::text else v_prefix || lpad(q.number::text, 4, '0') end as quote_number, q.title, q.status, coalesce(c.name, q.client_company, q.client_name) as client,
             q.client_name as client_contact, q.client_email, q.issue_date, q.valid_until, q.currency, q.vat_rate, q.discount_pct,
             q.total_net, q.version, g.name as gig, q.manager_name, q.payment_terms, q.created_at
        from public.quotes q
        left join public.clients c on c.id = q.client_id
        left join public.gigs g on g.id = q.gig_id
       where q.org_id = p_org
       order by q.created_at, q.id offset v_off limit v_lim) x;
  when 'quote_lines' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select case when v_prefix = '' then q.number::text else v_prefix || lpad(q.number::text, 4, '0') end as quote_number, q.title, coalesce(c.name, q.client_company, q.client_name) as client,
             q.issue_date, q.valid_until, ph.v->>'name' as phase, (ph.v->>'optional')::boolean as optional_phase,
             se.v->>'name' as section, li.v->>'kind' as line_kind, li.v->>'description' as description,
             i.code as item_code, nullif(li.v->>'qty', '')::numeric as quantity, li.v->>'unit' as per,
             nullif(li.v->>'factor', '')::numeric as days, nullif(li.v->>'unit_price', '')::numeric as unit_price,
             nullif(li.v->>'discount_pct', '')::numeric as discount_pct,
             case when li.v->>'kind' = 'comment' then 0 else round(
               coalesce(nullif(li.v->>'qty', '')::numeric, 1) * coalesce(nullif(li.v->>'factor', '')::numeric, 1)
               * coalesce(nullif(li.v->>'unit_price', '')::numeric, 0) * (1 - coalesce(nullif(li.v->>'discount_pct', '')::numeric, 0) / 100), 2) end as line_total
        from public.quotes q
        left join public.clients c on c.id = q.client_id
        cross join lateral jsonb_array_elements(coalesce(q.body->'phases', '[]')) with ordinality ph(v, pn)
        cross join lateral jsonb_array_elements(coalesce(ph.v->'sections', '[]')) with ordinality se(v, sn)
        cross join lateral jsonb_array_elements(coalesce(se.v->'lines', '[]')) with ordinality li(v, ln)
        left join public.price_items i on i.org_id = p_org and i.id::text = li.v->>'item_id'
       where q.org_id = p_org
       order by q.created_at, q.id, ph.pn, se.sn, li.ln offset v_off limit v_lim) x;
  when 'subrentals' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select s.reference, sp.name as supplier, g.name as gig, s.status, s.starts_at, s.ends_at, s.quoted_total, s.notes,
             s.reply_note, s.created_at
        from public.subrentals s
        left join public.suppliers sp on sp.id = s.supplier_id
        left join public.gigs g on g.id = s.gig_id
       where s.org_id = p_org
       order by s.starts_at nulls last, s.created_at, s.id offset v_off limit v_lim) x;
  when 'subrental_lines' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select s.reference, sp.name as supplier, coalesce(i.name, l.description) as item, i.code as item_code, l.description,
             l.quantity, l.unit_cost
        from public.subrental_lines l
        join public.subrentals s on s.id = l.subrental_id
        left join public.suppliers sp on sp.id = s.supplier_id
        left join public.price_items i on i.id = l.item_id
       where l.org_id = p_org
       order by s.starts_at nulls last, s.created_at, s.id, l.position, l.id offset v_off limit v_lim) x;
  when 'repairs' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select r.created_at, i.name as item, i.code as item_code, u.code as unit_code, r.quantity, g.name as gig, r.status,
             r.problem, r.repairer, r.cost, r.charge_client, r.expected_back, r.outcome, r.closed_at
        from public.repairs r
        join public.price_items i on i.id = r.item_id
        left join public.stock_units u on u.id = r.unit_id
        left join public.gigs g on g.id = r.gig_id
       where r.org_id = p_org
       order by r.created_at, r.id offset v_off limit v_lim) x;
  when 'inspections' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select n.done_on, i.name as item, i.code as item_code, u.code as unit_code, n.result, n.inspector, n.notes
        from public.inspections n
        join public.price_items i on i.id = n.item_id
        left join public.stock_units u on u.id = n.unit_id
       where n.org_id = p_org
       order by n.done_on, n.id offset v_off limit v_lim) x;
  else
    raise exception 'Unknown export part %', p_part using errcode = '22023';
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
