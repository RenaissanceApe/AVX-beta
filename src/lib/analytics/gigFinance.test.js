import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import fx from './gigFinanceFixtures.json'
import { costOf } from '../expenses'
import { gigFinanceRow, countedQuotes, financeTotals, filterFinanceRows, isEstimate, hasMargin, cardFees } from './gigFinance'

// The fixtures as the database reads them: keys become ids, and each gig gets only its own rows
const categories = new Map(fx.categories.map(c => [c.key, c]))
const rates = fx.rates.map(r => ({ ...r, user_id: r.user, removed_at: r.removed ? '2026-01-01' : null }))
const subrentalGig = new Map(fx.subrentals.map(s => [s.key, s.gig]))
const repairGig = new Map(fx.repairs.map(r => [r.key, r.gig]))
function input(gigKey) {
  const gig = { ...fx.gigs.find(g => g.key === gigKey), id: gigKey }
  const mine = list => list.filter(x => x.gig === gigKey)
  const expenses = fx.expenses.map(e => {
    const category = categories.get(e.category) || null
    return {
      ...e, id: e.key, subrental_id: e.subrental || null, repair_id: e.repair || null, crew_fee_user_id: e.crew_fee || null,
      removed_at: e.removed ? '2026-11-06' : null, kind: category?.kind ?? null, cost: costOf(e, category, fx.recovers_vat),
      gig: e.subrental ? subrentalGig.get(e.subrental) : e.repair ? repairGig.get(e.repair) : e.gig,
    }
  })
  return {
    gig, rates, factors: fx.factors,
    quotes: mine(fx.quotes).map(q => ({ ...q, id: q.key, gig_id: gigKey })),
    members: mine(fx.members).map(m => ({ ...m, user_id: m.user })),
    fees: mine(fx.fees).map(f => ({ ...f, user_id: f.user })),
    entries: mine(fx.time_entries).map(e => ({ ...e, user_id: e.user })),
    subrentals: mine(fx.subrentals).map(s => ({ ...s, id: s.key })),
    repairs: mine(fx.repairs).map(r => ({ ...r, id: r.key })),
    expenses: mine(expenses),
  }
}

describe('gig finance (shared fixtures)', () => {
  for (const [gig, expected] of Object.entries(fx.expect)) {
    it(`adds up ${gig}`, () => {
      const row = gigFinanceRow(input(gig))
      for (const [key, value] of Object.entries(expected)) expect([key, row[key]]).toEqual([key, value])
    })
  }

  it('picks the gigs of each period by their start date', () => {
    for (const p of fx.periods) {
      const keys = fx.gigs.filter(g => g.start_date >= p.from && g.start_date < p.until).map(g => g.key)
      expect(keys.sort()).toEqual([...p.gigs].sort())
    }
  })

  it('gives the overview tiles: margin this month and gigs with a negative margin', () => {
    const month = fx.overview.at.slice(0, 7)
    const rows = fx.gigs.filter(g => g.start_date.startsWith(month)).map(g => gigFinanceRow(input(g.key))).filter(hasMargin)
    const totals = financeTotals(rows)
    expect(totals.margin).toBe(fx.overview.margin_this_month)
    expect(totals.marginPct).toBe(fx.overview.margin_pct_this_month)
    expect(totals.negative).toBe(fx.overview.negative_margin)
  })

  it('is copied verbatim into the database test', () => {
    const sql = readFileSync(new URL('../../../supabase/tests/gig_finance.sql', import.meta.url), 'utf8')
    const m = /\$fixtures\$([\s\S]*?)\$fixtures\$/.exec(sql)
    expect(m).not.toBe(null)
    expect(JSON.parse(m[1])).toEqual(fx)
  })
})

describe('gig finance helpers', () => {
  it('counts accepted quotes, else the newest sent one, never drafts', () => {
    expect(countedQuotes([{ status: 'draft' }])).toEqual({ quotes: [], estimate: false })
    const sent = [{ id: 1, status: 'sent', sent_at: '2026-01-01' }, { id: 2, status: 'sent', sent_at: '2026-02-01' }]
    expect(countedQuotes(sent)).toEqual({ quotes: [sent[1]], estimate: true })
    expect(countedQuotes([...sent, { id: 3, status: 'accepted' }]).quotes.map(q => q.id)).toEqual([3])
  })

  it('marks estimates and leaves gigs without a quote out of the negative count', () => {
    expect(isEstimate({ revenue_source: 'estimate', estimated_cost: 0 })).toBe(true)
    expect(isEstimate({ revenue_source: 'accepted', estimated_cost: 10 })).toBe(true)
    expect(isEstimate({ revenue_source: 'accepted', estimated_cost: 0 })).toBe(false)
    const t = financeTotals([
      { revenue: 0, cost: 100, margin: -100, revenue_source: 'none', estimated_cost: 0 },
      { revenue: 500, cost: 600, margin: -100, revenue_source: 'estimate', estimated_cost: 50 },
    ])
    expect(t).toEqual({ gigs: 2, revenue: 500, cost: 700, margin: -200, marginPct: -40, estimated: 550, negative: 1 })
    expect(financeTotals([]).marginPct).toBe(null)
  })

  it('filters by status, type and client', () => {
    const rows = [
      { gig_status: 'completed', gig_custom_status_id: null, gig_type_id: 't1', client_name: 'Alpha' },
      { gig_status: 'confirmed', gig_custom_status_id: 's1', gig_type_id: null, client_name: 'Beta' },
    ]
    expect(filterFinanceRows(rows, { status: 'base:completed' })).toHaveLength(1)
    expect(filterFinanceRows(rows, { status: 'own:s1' })[0].client_name).toBe('Beta')
    expect(filterFinanceRows(rows, { type: 'none' })[0].client_name).toBe('Beta')
    expect(filterFinanceRows(rows, { type: 't1', client: 'Alpha' })).toHaveLength(1)
  })

  it('turns rate-card labour into agreed fees (weekend days as one fixed amount)', () => {
    const { gig, members, fees } = input('G1')
    const out = cardFees({ gig, members, rates, factors: fx.factors, fees })
    // Only u2 has no agreed fee and a day rate: Friday to Sunday, two weekend days at 1.5
    expect(out).toEqual([{ gig_id: 'G1', user_id: 'u2', unit: 'fixed', rate: 800, quantity: 1 }])
    const weekday = { id: 'g', start_date: '2026-11-09', end_date: '2026-11-10' }
    expect(cardFees({ gig: weekday, members: [{ user_id: 'u2', function_title: 'Lighting Op' }], rates, factors: fx.factors, fees: [] }))
      .toEqual([{ gig_id: 'g', user_id: 'u2', unit: 'day', rate: 200, quantity: 2 }])
  })
})
