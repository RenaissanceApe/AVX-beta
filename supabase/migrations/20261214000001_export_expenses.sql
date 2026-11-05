-- Step 9b: expenses in the organisation export (docs/SWITCHING.md S5). Three new files:
-- expense_categories, expenses (claims included, removed ones left out) and expense_recurrences.
-- The export function is renamed export_org_part_pre_step9b and wrapped, as in step 9.
-- Written without destructive statements.

alter function private.export_org_part_unchecked(uuid, text, integer) rename to export_org_part_pre_step9b;

create or replace function private.export_org_part_unchecked(p_org uuid, p_part text, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb; v_lim constant integer := 5000; v_off integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not private.is_org_admin(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  case p_part
  when 'expense_categories' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select coalesce(c.name, c.starter_key) as name, c.kind, c.spread_months, c.vat_recoverable, c.archived_at, c.created_at
        from public.expense_categories c where c.org_id = p_org
       order by c.sort, c.created_at, c.id offset v_off limit v_lim) x;
  when 'expenses' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select e.spent_on, coalesce(s.name, e.supplier_name) as supplier, s.tax_id as supplier_tax_id, e.description,
             coalesce(c.name, c.starter_key) as category, c.kind as category_kind, e.amount_net, e.vat_rate, e.vat_amount,
             e.total, e.currency, e.invoice_number, e.due_on, e.paid_on, e.paid_how, e.status,
             coalesce(g.import_ref, g.id::text) as gig_ref, g.name as gig,
             case when e.subrental_id is not null then 'subrental' when e.repair_id is not null then 'repair'
                  when e.crew_fee_user_id is not null then 'crew_fee'
                  when e.stock_movement_id is not null or e.stock_unit_id is not null then 'stock_purchase' end as linked_to,
             cp.full_name as claimed_by, e.review_note, e.receipt_name as receipt, e.notes, e.created_at
        from public.expenses e
        left join public.suppliers s on s.id = e.supplier_id
        left join public.expense_categories c on c.id = e.category_id
        left join public.gigs g on g.id = e.gig_id
        left join public.profiles cp on cp.id = e.claimed_by
       where e.org_id = p_org and e.removed_at is null
       order by e.spent_on, e.created_at, e.id offset v_off limit v_lim) x;
  when 'expense_recurrences' then
    select jsonb_agg(to_jsonb(x)) into v_out from (
      select r.description, coalesce(s.name, r.supplier_name) as supplier, coalesce(c.name, c.starter_key) as category,
             r.amount_net, r.vat_rate, r.currency, r.paid_how, r.every, r.starts_on, r.ends_on, r.next_on, r.notes, r.created_at
        from public.expense_recurrences r
        left join public.suppliers s on s.id = r.supplier_id
        left join public.expense_categories c on c.id = r.category_id
       where r.org_id = p_org and r.removed_at is null
       order by r.starts_on, r.id offset v_off limit v_lim) x;
  else
    return private.export_org_part_pre_step9b(p_org, p_part, p_offset);
  end case;
  return coalesce(v_out, '[]'::jsonb);
end $$;
revoke execute on function private.export_org_part_unchecked(uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.export_org_part_pre_step9b(uuid, text, integer) from public, anon, authenticated;
