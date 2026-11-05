import { supabase } from './supabase'
import { toCsv } from './orgExport'
import { updateIfUnchanged } from './staleSave'

// Expenses (step 9b, docs/BUSINESS.md "How expenses work"). The database checks who may see and
// change what, the links (one live expense per linked record) and the statuses; these helpers do
// the VAT maths, the recurring dates, the totals and the CSV, and talk to Supabase.

export const KINDS = ['direct', 'overhead', 'capital', 'tax_other']
export const PAID_HOW = ['transfer', 'card', 'cash', 'direct_debit', 'other']
export const EVERY = ['month', 'quarter', 'year']
export const LINK_KINDS = ['subrental', 'repair', 'crew_fee', 'stock_movement', 'stock_unit']
export const DEFAULT_VAT = 23
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const num = v => {
  if (v === '' || v === null || v === undefined) return NaN
  return Number(String(v).replace(/\s/g, '').replace(',', '.'))
}

// VAT on an amount excl. VAT, to the cent (the supplier's invoice may differ by a cent: the form
// lets you type theirs)
export const vatOf = (net, rate) => {
  const n = num(net); const r = num(rate)
  return Number.isFinite(n) && Number.isFinite(r) ? round2(n * r / 100) : 0
}

// From a total with VAT back to the amount excl. VAT (for a till receipt that only shows the total)
export const netFromTotal = (total, rate) => {
  const t = num(total); const r = num(rate)
  return Number.isFinite(t) && Number.isFinite(r) ? round2(t / (1 + r / 100)) : 0
}

// What an expense costs the business: the amount excl. VAT, plus the VAT when it can't be
// recovered (the organisation recovers none, or the category's VAT isn't recoverable)
export function costOf(e, category, recoversVat = true) {
  const net = Number(e.amount_net) || 0
  const vat = Number(e.vat_amount) || 0
  const recoverable = recoversVat && (category ? category.vat_recoverable !== false : true)
  return round2(recoverable ? net : net + vat)
}

// A capital expense is spread over its months: the share in one month (straight line)
export const monthlyShare = (amount, months) => (months > 0 ? round2(Number(amount) / months) : Number(amount))

// ── Dates ────────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')
const STEP = { month: 1, quarter: 3, year: 12 }

// The n-th date of a recurring cost: start + n periods. A 31st becomes the month's last day and
// comes back to the 31st the month after (as the database's add_periods does).
export function recurrenceDate(start, every, n) {
  const [y, m, d] = start.split('-').map(Number)
  const months = (m - 1) + n * (STEP[every] || 1)
  const year = y + Math.floor(months / 12)
  const month = ((months % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`
}

// The next `count` dates from the n-th, stopping after `endsOn`
export function upcomingDates({ starts_on, every, drafted = 0, ends_on = null }, count = 3) {
  const out = []
  for (let n = drafted; out.length < count && n < drafted + 600; n++) {
    const day = recurrenceDate(starts_on, every, n)
    if (ends_on && day > ends_on) break
    out.push(day)
  }
  return out
}

// First and last day of a 'YYYY-MM' month
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  return [`${month}-01`, `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`]
}

// ── States ───────────────────────────────────────────────────────────────────
export const isClaim = e => !!e.claimed_by
export const toReimburse = e => isClaim(e) && e.status === 'confirmed' && !e.paid_on && !e.removed_at
export const isUnpaid = e => e.status === 'confirmed' && !e.paid_on && !e.removed_at
export const isOverdue = (e, today) => isUnpaid(e) && !!e.due_on && e.due_on < today

// Which record an expense is linked to: { kind, id } or null
export function linkOf(e) {
  if (e.subrental_id) return { kind: 'subrental', id: e.subrental_id }
  if (e.repair_id) return { kind: 'repair', id: e.repair_id }
  if (e.crew_fee_user_id) return { kind: 'crew_fee', id: e.crew_fee_user_id }
  if (e.stock_movement_id) return { kind: 'stock_movement', id: e.stock_movement_id }
  if (e.stock_unit_id) return { kind: 'stock_unit', id: e.stock_unit_id }
  return null
}

// The column values for a link (the others cleared), for saving
export function linkColumns(kind, id) {
  const cols = { subrental_id: null, repair_id: null, crew_fee_user_id: null, stock_movement_id: null, stock_unit_id: null }
  if (kind && id) cols[{ subrental: 'subrental_id', repair: 'repair_id', crew_fee: 'crew_fee_user_id', stock_movement: 'stock_movement_id', stock_unit: 'stock_unit_id' }[kind]] = id
  return cols
}

// ── Totals ───────────────────────────────────────────────────────────────────
// Totals per currency (never added across currencies): { EUR: { net, vat, total, count } }
export function totalsByCurrency(list) {
  const out = {}
  for (const e of list) {
    const c = e.currency || 'EUR'
    const t = out[c] || (out[c] = { net: 0, vat: 0, total: 0, count: 0 })
    t.net = round2(t.net + (Number(e.amount_net) || 0))
    t.vat = round2(t.vat + (Number(e.vat_amount) || 0))
    t.total = round2(t.total + (Number(e.amount_net) || 0) + (Number(e.vat_amount) || 0))
    t.count++
  }
  return out
}

// Per category (and kind), biggest first: [{ id, category, kind, currency, net, total, count }]
export function byCategory(list, categories) {
  const cats = new Map(categories.map(c => [c.id, c]))
  const groups = new Map()
  for (const e of list) {
    const key = `${e.category_id || ''}|${e.currency || 'EUR'}`
    const cat = cats.get(e.category_id) || null
    const g = groups.get(key) || { id: e.category_id || null, category: cat, kind: cat?.kind || null, currency: e.currency || 'EUR', net: 0, total: 0, count: 0 }
    g.net = round2(g.net + (Number(e.amount_net) || 0))
    g.total = round2(g.total + (Number(e.amount_net) || 0) + (Number(e.vat_amount) || 0))
    g.count++
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.net - a.net)
}

// A category's name in the reader's language (starter ones keep a key until renamed)
export const categoryName = (c, t) => (!c ? t('expenses.noCategory') : c.name || t(`expenses.cat.${c.starter_key}`))

// ── CSV for the accountant ───────────────────────────────────────────────────
export const CSV_COLUMNS = ['date', 'supplier', 'supplier_tax_id', 'invoice_number', 'description', 'category', 'kind',
  'net', 'vat_rate', 'vat', 'total', 'currency', 'due', 'paid_on', 'paid_how', 'gig', 'claimed_by', 'receipt', 'notes']

export function csvRows(list, { categories = [], t, names = {} }) {
  const cats = new Map(categories.map(c => [c.id, c]))
  return list.map(e => {
    const cat = cats.get(e.category_id)
    return {
      date: e.spent_on, supplier: e.supplier?.name || e.supplier_name || '', supplier_tax_id: e.supplier?.tax_id || '',
      invoice_number: e.invoice_number || '', description: e.description, category: cat ? categoryName(cat, t) : '',
      kind: cat ? t(`expenses.kind.${cat.kind}`) : '', net: Number(e.amount_net), vat_rate: Number(e.vat_rate),
      vat: Number(e.vat_amount), total: round2(Number(e.amount_net) + Number(e.vat_amount)), currency: e.currency,
      due: e.due_on || '', paid_on: e.paid_on || '', paid_how: e.paid_how ? t(`expenses.paidHow.${e.paid_how}`) : '',
      gig: e.gig?.name || '', claimed_by: e.claimed_by ? names[e.claimed_by] || '' : '', receipt: e.receipt_name || '', notes: e.notes || '',
    }
  })
}

export function downloadExpensesCsv(list, opts, fileName) {
  const blob = new Blob(['﻿' + toCsv(csvRows(list, opts), CSV_COLUMNS)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ── Form ─────────────────────────────────────────────────────────────────────
// A form's values → the columns to save, or { error: key } for what's missing
export function expenseFromForm(f) {
  if (!f.description?.trim()) return { error: 'expenses.needDescription' }
  if (!f.spent_on) return { error: 'expenses.needDate' }
  const net = num(f.amount_net)
  if (!Number.isFinite(net)) return { error: 'expenses.needAmount' }
  const rate = num(f.vat_rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: 'expenses.badVat' }
  const vatTyped = num(f.vat_amount)
  if (f.paid_on && !f.paid_how && !f.claim) return { error: 'expenses.needPaidHow' }
  return {
    row: {
      spent_on: f.spent_on, description: f.description.trim(), amount_net: round2(net), vat_rate: rate,
      vat_amount: Number.isFinite(vatTyped) ? round2(vatTyped) : vatOf(net, rate), currency: (f.currency || 'EUR').toUpperCase(),
      supplier_id: f.supplier_id || null, supplier_name: f.supplier_id ? null : (f.supplier_name?.trim() || null),
      category_id: f.category_id || null, invoice_number: f.invoice_number?.trim() || null, due_on: f.due_on || null,
      paid_on: f.paid_on || null, paid_how: f.paid_on ? (f.paid_how || null) : null, notes: f.notes?.trim() || null,
      gig_id: f.gig_id || null, ...linkColumns(f.link_kind, f.link_id),
    },
  }
}

// ── Supabase ─────────────────────────────────────────────────────────────────
export const EXPENSE_SELECT = '*, supplier:supplier_id(name, tax_id), gig:gig_id(name, start_date)'
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export const receiptPath = (orgId, expenseId, file) => {
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  return `${orgId}/${expenseId}/${newId()}.${ext}`
}
// Why a file can't be a receipt (an i18n key), or null
export const receiptProblem = file => (!RECEIPT_TYPES.includes(file.type) && !/\.(heic|pdf)$/i.test(file.name)
  ? 'expenses.receiptType' : file.size > MAX_RECEIPT_BYTES ? 'expenses.receiptTooBig' : null)

export async function uploadReceipt(orgId, expenseId, file) {
  const path = receiptPath(orgId, expenseId, file)
  const { error } = await supabase.storage.from('expense-receipts').upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (error) throw error
  return { receipt_path: path, receipt_name: file.name.slice(0, 200) }
}

export async function receiptUrl(path) {
  const { data } = await supabase.storage.from('expense-receipts').createSignedUrl(path, 600)
  return data?.signedUrl || null
}

// New: insert with the id made first (the receipt is uploaded under it). Existing: the stale-save
// guard. Returns { row } or { conflict } like updateIfUnchanged.
export async function saveExpense({ orgId, id, row, updatedAt, claim = false, userId }) {
  if (!updatedAt) {
    const { data, error } = await supabase.from('expenses')
      .insert({ ...row, id, org_id: orgId, ...(claim ? { claimed_by: userId } : {}) }).select(EXPENSE_SELECT).single()
    if (error) throw error
    return { row: data }
  }
  const res = await updateIfUnchanged(supabase, 'expenses', id, row, updatedAt, EXPENSE_SELECT)
  if (res.error) throw res.error
  return res
}

export async function removeExpense(e) {
  const { error } = await supabase.from('expenses').update({ removed_at: new Date().toISOString() }).eq('id', e.id)
  if (error) throw error
}

export async function decideClaim(id, approve, note) {
  const { data, error } = await supabase.rpc('decide_expense_claim', { p_expense: id, p_approve: approve, p_note: note || null })
  if (error) throw error
  return data
}

export async function loadCategories(orgId) {
  await supabase.rpc('ensure_expense_categories', { p_org: orgId })
  const { data, error } = await supabase.from('expense_categories').select('*').eq('org_id', orgId).order('sort').order('created_at')
  if (error) throw error
  return data || []
}
