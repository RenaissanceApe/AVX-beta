// The accountant's read-only link (K9): admins make one for a period, with an expiry, and can revoke
// it. Only the SHA-256 hash of its token is stored (public.report_links, like quote links); the page
// at /r/<token> asks the report-link-public Edge Function, which shows nothing for unknown, expired
// or revoked links. docs/ANALYTICS.md, "How K9 works".

import { supabase } from '../supabase'
import { periodRange, addMonthsIso } from './periods'

export const LINK_PERIODS = ['last_year', 'this_year', 'last_12_months']
export const LINK_DAYS = [7, 30, 90]

// The two dates (until exclusive) of a link's period, from today in the organisation's time zone
export function linkPeriod(key, today) {
  if (key === 'last_year') {
    const y = Number(today.slice(0, 4)) - 1
    return { from: `${y}-01-01`, until: `${y + 1}-01-01` }
  }
  const r = periodRange(LINK_PERIODS.includes(key) ? key : 'this_year', { today })
  return { from: r.from, until: r.until }
}

export const reportLinkUrl = (token, origin = window.location.origin) => `${origin}/r/${token}`

export function linkStatus(link, now = new Date()) {
  if (link.revoked_at) return 'revoked'
  if (new Date(link.expires_at) <= now) return 'expired'
  return 'active'
}

export async function listLinks(orgId) {
  const { data, error } = await supabase.from('report_links')
    .select('id, label, period_from, period_until, expires_at, revoked_at, last_viewed_at, views, created_at')
    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data || []
}

export async function createLink(orgId, { label, from, until, days }) {
  const { data, error } = await supabase.rpc('create_report_link', { p_org: orgId, p_label: label, p_from: from, p_until: until, p_days: days })
  if (error) throw error
  return data // { id, token, expires_at }: the token is shown once
}

export async function revokeLink(id) {
  const { error } = await supabase.rpc('revoke_report_link', { p_id: id })
  if (error) throw error
}

async function errorBody(error) {
  try {
    const body = await error.context?.json?.()
    if (body) return body
  } catch { /* not JSON */ }
  return {}
}

// The public page: { state: 'ok', report } | { state: 'not_found' } | { state: 'error' }
export async function loadLinkReport(token) {
  const { data, error } = await supabase.functions.invoke('report-link-public', { body: { t: token } })
  if (error) {
    const body = await errorBody(error)
    return body.state ? body : { state: 'error' }
  }
  return data
}

// ── For the page: turn the answer into tables, one per currency ─────────────────────────────
// Months of the period as 'YYYY-MM', in order (until exclusive)
export function linkMonths(from, until) {
  const out = []
  for (let m = `${from.slice(0, 7)}-01`; m < until; m = addMonthsIso(m, 1)) out.push(m.slice(0, 7))
  return out
}

const CASH = ['invoiced', 'credited', 'received', 'paid_out']

// [{ currency, months: [{ month, revenue, …, invoiced, received, … }], total }] — a currency's
// months are listed even when empty, so the accountant sees every month of the period
export function linkTables(report) {
  if (!report) return []
  const months = linkMonths(report.from, report.until)
  const currencies = [...new Set([...(report.months || []), ...(report.total || []), ...(report.cash || [])].map(r => r.currency).filter(Boolean))].sort()
  return currencies.map(currency => ({
    currency,
    months: months.map(month => {
      const r = (report.months || []).find(x => x.month === month && x.currency === currency) || {}
      const cash = Object.fromEntries(CASH.map(section => [section, (report.cash || [])
        .filter(c => c.section === section && c.currency === currency && String(c.month || '').slice(0, 7) === month)
        .reduce((s, c) => s + (Number(c.amount) || 0), 0)]))
      return {
        month,
        revenue: Number(r.revenue) || 0, direct_costs: Number(r.direct_costs) || 0, gross_margin: Number(r.gross_margin) || 0,
        overheads: Number(r.overheads) || 0, depreciation: Number(r.depreciation) || 0, operating_result: Number(r.operating_result) || 0,
        estimated: Number(r.estimated) || 0, ...cash,
      }
    }),
    total: (report.total || []).find(x => x.currency === currency) || null,
    spending: (report.spending || []).filter(s => s.currency === currency),
  }))
}
