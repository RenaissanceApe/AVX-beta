// Organisation export (docs/SWITCHING.md, S5): everything an organisation holds, as CSV files in a
// zip. export_org_part() gives each file's rows, with names in place of internal ids; this builds
// the files. Headings are plain English words the AVX import wizard recognises, so the catalogue,
// units, kit contents, contacts, gigs, their equipment and quote lines import straight back.

// In the order a company would bring them into another tool (what depends on what)
export const PARTS = [
  { part: 'organisation', columns: ['name', 'legal_name', 'tax_id', 'address', 'email', 'phone', 'website', 'default_vat_rate', 'quote_validity_days', 'quote_number_prefix', 'quote_next_number', 'quote_terms', 'time_zone', 'equipment_prep_days', 'equipment_return_days', 'created_at'] },
  { part: 'members', columns: ['name', 'email', 'role', 'joined_at'] },
  { part: 'held_invites', columns: ['full_name', 'email', 'phone', 'functions', 'role', 'notes', 'status', 'created_at', 'sent_at'] },
  { part: 'locations', columns: ['name', 'kind', 'address', 'notes', 'archived_at'] },
  { part: 'items', columns: ['name', 'code', 'category', 'brand', 'model', 'kind', 'charged_per', 'unit_price', 'tracking', 'kit_type', 'weight_kg', 'power_w', 'dimensions', 'replacement_value', 'cost_price', 'depreciation_months', 'min_stock', 'packing_note', 'details', 'inspection_kind', 'inspection_months', 'archived_at', 'created_at'] },
  { part: 'stock', columns: ['item', 'item_code', 'location', 'quantity', 'in_repair'] },
  { part: 'units', columns: ['item', 'item_code', 'code', 'serial', 'location', 'status', 'purchase_date', 'purchase_cost', 'depreciation_months', 'disposal_value', 'disposed_on', 'in_case', 'notes', 'created_at'] },
  { part: 'kit_contents', columns: ['kit', 'kit_code', 'kit_type', 'item', 'item_code', 'quantity', 'part_kind'] },
  { part: 'stock_movements', columns: ['created_at', 'item', 'item_code', 'unit_code', 'kind', 'quantity', 'unit_cost', 'from_location', 'to_location', 'note', 'by'] },
  { part: 'clients', columns: ['name', 'contact_name', 'email', 'phone', 'address', 'tax_id', 'notes', 'archived_at', 'created_at'] },
  { part: 'suppliers', columns: ['name', 'contact_name', 'email', 'phone', 'address', 'tax_id', 'notes', 'archived_at', 'created_at'] },
  { part: 'gigs', columns: ['ref', 'name', 'start_date', 'end_date', 'venue', 'status', 'status_label', 'gig_type', 'client', 'notes', 'created_at'] },
  { part: 'gig_equipment', columns: ['gig_ref', 'gig', 'item', 'item_code', 'category', 'quantity', 'planned_from', 'planned_until', 'notes', 'packing_note'] },
  { part: 'gig_crew', columns: ['gig_ref', 'gig', 'name', 'role', 'function_title', 'call_time', 'booked_from', 'booked_until'] },
  { part: 'gig_schedule', columns: ['gig_ref', 'gig', 'day', 'start_time', 'end_time', 'title', 'location', 'notes'] },
  { part: 'gig_files', columns: ['gig_ref', 'gig', 'name', 'type', 'version', 'file_size', 'created_at'] },
  { part: 'quotes', columns: ['quote_number', 'title', 'status', 'client', 'client_contact', 'client_email', 'issue_date', 'valid_until', 'currency', 'vat_rate', 'discount_pct', 'total_net', 'version', 'gig', 'manager_name', 'payment_terms', 'sent_at', 'decided_at', 'lost_reason', 'lost_note', 'created_at'] },
  { part: 'quote_lines', columns: ['quote_number', 'title', 'client', 'issue_date', 'valid_until', 'phase', 'optional_phase', 'section', 'line_kind', 'description', 'item_code', 'quantity', 'per', 'days', 'unit_price', 'discount_pct', 'line_total'] },
  { part: 'subrentals', columns: ['reference', 'supplier', 'gig', 'status', 'starts_at', 'ends_at', 'quoted_total', 'notes', 'reply_note', 'created_at'] },
  { part: 'subrental_lines', columns: ['reference', 'supplier', 'item', 'item_code', 'description', 'quantity', 'unit_cost'] },
  { part: 'repairs', columns: ['created_at', 'item', 'item_code', 'unit_code', 'quantity', 'gig', 'status', 'problem', 'repairer', 'cost', 'charge_client', 'expected_back', 'outcome', 'closed_at'] },
  { part: 'inspections', columns: ['done_on', 'item', 'item_code', 'unit_code', 'result', 'inspector', 'cost', 'notes'] },
  { part: 'crew_rates', columns: ['function_title', 'person', 'day_rate', 'half_day_rate', 'hour_rate', 'note', 'created_at'] },
  { part: 'crew_rate_factors', columns: ['overtime', 'overtime_after_hours', 'weekend', 'night', 'holiday', 'night_from', 'night_until', 'km_rate', 'updated_at'] },
  { part: 'gig_crew_fees', columns: ['gig_ref', 'gig', 'name', 'function_title', 'unit', 'rate', 'quantity', 'total', 'note', 'updated_at'] },
  { part: 'org_holidays', columns: ['day', 'name', 'created_at'] },
  { part: 'time_entries', columns: ['gig_ref', 'gig', 'name', 'function_title', 'work_date', 'start_time', 'end_time', 'break_minutes', 'travel_minutes', 'km', 'status', 'normal', 'overtime', 'night', 'weekend', 'holiday', 'fee_unit', 'fee_rate', 'cost', 'note', 'review_note', 'reviewed_at'] },
  { part: 'leave_settings', columns: ['holiday_days', 'updated_at'] },
  { part: 'work_weeks', columns: ['name', 'days', 'hours_per_day', 'updated_at'] },
  { part: 'leave_years', columns: ['name', 'year', 'allowance', 'carried', 'note', 'updated_at'] },
  { part: 'leave', columns: ['name', 'type', 'status', 'start_date', 'end_date', 'start_half', 'end_half', 'days', 'note', 'decision_note', 'decided_by', 'decided_at', 'created_at'] },
  { part: 'expense_categories', columns: ['name', 'kind', 'spread_months', 'vat_recoverable', 'archived_at', 'created_at'] },
  { part: 'expenses', columns: ['spent_on', 'supplier', 'supplier_tax_id', 'invoice_number', 'description', 'category', 'category_kind', 'amount_net', 'vat_rate', 'vat_amount', 'total', 'currency', 'due_on', 'paid_on', 'paid_how', 'status', 'gig_ref', 'gig', 'linked_to', 'claimed_by', 'review_note', 'receipt', 'notes', 'created_at'] },
  { part: 'expense_recurrences', columns: ['description', 'supplier', 'category', 'amount_net', 'vat_rate', 'currency', 'paid_how', 'every', 'starts_on', 'ends_on', 'next_on', 'notes', 'created_at'] },
  { part: 'gig_finance', columns: ['gig_ref', 'gig', 'start_date', 'end_date', 'gig_status', 'client', 'revenue', 'revenue_source', 'quotes', 'labour_planned', 'labour_actual', 'labour', 'labour_estimated', 'subrentals', 'repairs', 'repairs_charged', 'other_costs', 'cost', 'estimated_cost', 'margin', 'margin_pct', 'other_currencies'] },
  { part: 'invoices', columns: ['avx_number', 'kind', 'legal_number', 'credits', 'status', 'overdue', 'quote_number', 'gig', 'client', 'client_tax_id', 'scope', 'deposit_pct', 'issue_date', 'due_date', 'paid_on', 'currency', 'net', 'vat', 'total', 'pdf_url', 'notes', 'sent_at', 'issued_at', 'removed_at', 'created_at', 'program'] },
  { part: 'invoice_lines', columns: ['avx_number', 'legal_number', 'line', 'kind', 'description', 'qty', 'unit_price', 'discount_pct', 'vat_rate', 'vat_exemption', 'net', 'currency'] },
  { part: 'invoicing_connection', columns: ['program', 'account', 'company', 'series', 'connected_at'] },
]

export const PAGE_SIZE = 5000

// "02-members.csv": numbered, so the files sort in the order above
export const fileName = (part, i = PARTS.findIndex(p => p.part === part)) => `${String(i + 1).padStart(2, '0')}-${part.replace(/_/g, '-')}.csv`

// "unit_price" → "unit price"
export const heading = key => key.replace(/_/g, ' ')

// One cell: semicolon-separated with decimal commas, like the app's other CSV files, so
// spreadsheets in Portugal open them directly; yes/no for true/false
export function cell(v) {
  let s
  if (v == null) s = ''
  else if (typeof v === 'boolean') s = v ? 'yes' : 'no'
  else if (typeof v === 'number') s = String(v).replace('.', ',')
  else if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// The rows as CSV text: the part's columns first, then anything else the rows carry
export function toCsv(rows, columns) {
  const extra = []
  for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k) && !extra.includes(k)) extra.push(k)
  const cols = [...columns, ...extra]
  return [cols.map(c => cell(heading(c))).join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\r\n') + '\r\n'
}

// All of a part's rows, page by page
export async function fetchPart(rpc, org, part) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await rpc('export_org_part', { p_org: org, p_part: part, p_offset: offset })
    if (error) throw error
    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

// "Lumen & Pixel" → "lumen-pixel"
export const slug = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organisation'

// Everything into one zip: the CSV files, the messages (as JSON, like the Messages download) and a
// README. onProgress(done, total) after each file. Returns { blob, counts }.
export async function buildOrgExport({ rpc, org, readme, onProgress = () => {} }) {
  const { zipSync, strToU8 } = await import('fflate')
  const files = {}
  const counts = {}
  const total = PARTS.length + 1
  let done = 0
  for (const { part, columns } of PARTS) {
    const rows = await fetchPart(rpc, org.id, part)
    counts[part] = rows.length
    files[fileName(part)] = strToU8(`\uFEFF${toCsv(rows, columns)}`)
    onProgress(++done, total)
  }
  const { data: messages, error } = await rpc('export_org_messages', { p_org: org.id })
  if (error) throw error
  counts.messages = (messages || []).reduce((n, c) => n + (c.messages?.length || 0), 0)
  files['messages.json'] = strToU8(JSON.stringify({ organisation: org.name, exported_at: new Date().toISOString(), conversations: messages || [] }, null, 2))
  files['README.txt'] = strToU8(readme)
  onProgress(++done, total)
  const zip = zipSync(files, { level: 6 })
  return { blob: new Blob([zip], { type: 'application/zip' }), counts }
}
