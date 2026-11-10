import { describe, it, expect } from 'vitest'
import { dryRun, checkImport, historyFix, historyFrom, quoteHistory, fixesFor, serverMessage, parseChoice, HISTORY_YEARS } from './importer'

// IM4: the history import (docs/SWITCHING.md, "How IM4 works")
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const yearsAgo = (y, extra = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() + extra); return d.toISOString().slice(0, 10) }
const gig = (over = {}) => ({ _row: 2, _errors: [], name: 'Congress', ref: 'P-1', start_date: day(-40), end_date: day(-38), ...over })
const quote = (over = {}) => ({ _row: 2, _errors: [], quote_ref: 'Q-1', title: 'Congress', description: 'PA', issue_date: day(-60), ...over })

describe('history import: past jobs', () => {
  it('leaves past jobs out on purpose, with "Import as past jobs"', () => {
    const [p] = dryRun([gig()], 'gigs', { gigs: [] }).plan
    expect(p).toMatchObject({ action: 'skip', reason: 'pastJob', purpose: true })
    expect(fixesFor('pastJob')).toEqual([{ id: 'importPast', im3: false }])
  })
  it('brings a past job in when it was chosen', () => {
    expect(dryRun([gig({ _history: 'completed' })], 'gigs', { gigs: [] }).plan[0]).toEqual({ action: 'create' })
  })
  it('keeps past cancelled jobs out unless "Import as cancelled" was chosen', () => {
    const plan = dryRun([gig({ status: 'cancelled' }), gig({ status: 'cancelled', _history: 'completed' }), gig({ status: 'cancelled', _history: 'cancelled' })], 'gigs', { gigs: [] }).plan
    expect(plan[0]).toMatchObject({ reason: 'pastCancelled', purpose: true })
    expect(plan[1]).toMatchObject({ reason: 'pastCancelled', purpose: true })
    expect(plan[2].action).toBe('create')
    expect(fixesFor('pastCancelled').map(f => f.id)).toEqual(['importCancelled'])
  })
  it('still leaves upcoming cancelled jobs out, with nothing to choose', () => {
    const [p] = dryRun([gig({ status: 'cancelled', start_date: day(10), end_date: day(11) })], 'gigs', { gigs: [] }).plan
    expect(p).toMatchObject({ reason: 'cancelledJob', purpose: true })
    expect(fixesFor('cancelledJob')).toEqual([])
  })
  it(`says jobs from more than ${HISTORY_YEARS} years ago are too old, chosen or not`, () => {
    const old = gig({ start_date: yearsAgo(11), end_date: yearsAgo(11) })
    expect(dryRun([old], 'gigs', { gigs: [] }).plan[0]).toMatchObject({ reason: 'tooOld', purpose: true })
    expect(dryRun([{ ...old, _history: 'completed' }], 'gigs', { gigs: [] }).plan[0]).toMatchObject({ reason: 'tooOld' })
    // The limit is by the end date: one that ended a day inside the 10 years comes in
    expect(dryRun([gig({ start_date: yearsAgo(10, -3), end_date: yearsAgo(10, 1), _history: 'completed' })], 'gigs', { gigs: [] }).plan[0].action).toBe('create')
    expect(historyFrom(new Date(2026, 10, 10))).toBe('2016-11-10')
  })
  it('matches a past gig imported before by its old number, and never turns a real gig into a past one', () => {
    const before = { id: 'g1', name: 'Congress', import_ref: 'P-1', start_date: day(-40), from_history: true }
    expect(dryRun([gig({ _history: 'completed' })], 'gigs', { gigs: [before] }).plan[0]).toEqual({ action: 'match' })
    const real = { ...before, from_history: false }
    expect(dryRun([gig({ _history: 'completed' })], 'gigs', { gigs: [real] }).plan[0]).toMatchObject({ reason: 'gigThere', purpose: true })
  })
  it('leaves equipment lines for a past gig out on purpose (they would book stock)', () => {
    const existing = { gigs: [{ id: 'g1', name: 'Congress', import_ref: 'P-1', from_history: true }], items: [{ id: 'i1', name: 'SM58', code: 'SM58', tracking: 'bulk' }], lines: [] }
    const [p] = dryRun([{ _row: 2, _errors: [], gig_ref: 'P-1', item_code: 'SM58', quantity: 2 }], 'gig_equipment', existing).plan
    expect(p).toMatchObject({ action: 'skip', reason: 'historyGig', purpose: true })
  })
})

describe('history import: the fix in the check', () => {
  const table = { headers: ['Number', 'Name', 'Start', 'End', 'Status'], rows: [
    ['P-1', 'Congress', day(-40), day(-38), 'Afgerond'],
    ['P-2', 'Old launch', day(-30), day(-30), 'Geannuleerd'],
    ['P-3', 'Festival', day(20), day(22), 'Bevestigd'],
  ] }
  const mapping = { Number: 'ref', Name: 'name', Start: 'start_date', End: 'end_date', Status: 'status' }
  const existing = { gigs: [], clients: [] }

  it('groups past jobs and past cancelled jobs, left out until chosen', () => {
    const check = checkImport({ table, mapping, kind: 'gigs', existing })
    expect(check.groups.map(g => g.reason).sort()).toEqual(['pastCancelled', 'pastJob'])
    expect(check.counts).toMatchObject({ create: 1, purpose: 2 })
    expect(check.sendable.map(r => r.ref)).toEqual(['P-3'])
  })
  it('sends the chosen rows with _history, and taking the fix back leaves them out again', () => {
    const first = checkImport({ table, mapping, kind: 'gigs', existing })
    const past = first.groups.find(g => g.reason === 'pastJob')
    const fix = historyFix(past)
    expect(fix).toMatchObject({ type: 'cells', fix: 'importPast', count: 1, edits: { 2: { _history: 'completed' } } })
    const check = checkImport({ table, mapping, kind: 'gigs', existing, fixes: [fix] })
    expect(check.sendable.find(r => r.ref === 'P-1')).toMatchObject({ status: 'completed', _history: 'completed' })
    expect(check.groups.map(g => g.reason)).toEqual(['pastCancelled'])
    const cancelled = historyFix(check.groups[0])
    expect(cancelled).toMatchObject({ fix: 'importCancelled', edits: { 3: { _history: 'cancelled' } } })
    const both = checkImport({ table, mapping, kind: 'gigs', existing, fixes: [fix, cancelled] })
    expect(both.sendable.map(r => [r.ref, r._history ?? null])).toEqual([['P-1', 'completed'], ['P-2', 'cancelled'], ['P-3', null]])
    expect(checkImport({ table, mapping, kind: 'gigs', existing, fixes: [] }).sendable).toHaveLength(1)
  })
})

describe('history import: quotes with their status and dates', () => {
  it('reads the status words', () => {
    expect(parseChoice('Aceite', 'quoteStatus')).toBe('accepted')
    expect(parseChoice('Afgewezen', 'quoteStatus')).toBe('declined')
    expect(parseChoice('Verzonden', 'quoteStatus')).toBe('sent')
    expect(parseChoice('Won', 'quoteStatus')).toBe('accepted')
  })
  it('lets drafts and decided quotes with sensible dates through', () => {
    expect(quoteHistory(quote())).toBeNull()
    expect(quoteHistory(quote({ status: 'accepted', sent_date: day(-50), decided_date: day(-45) }))).toBeNull()
    expect(quoteHistory(quote({ status: 'declined', lost_reason: 'Too expensive' }))).toBeNull()
  })
  it('refuses dates after today and a decision before the quote was sent', () => {
    expect(quoteHistory(quote({ status: 'accepted', decided_date: day(3) }))).toMatchObject({ reason: 'futureDate', field: 'decided_date' })
    expect(quoteHistory(quote({ status: 'sent', sent_date: day(3) }))).toMatchObject({ reason: 'futureDate', field: 'sent_date' })
    expect(quoteHistory(quote({ status: 'accepted', sent_date: day(-10), decided_date: day(-20) }))).toMatchObject({ reason: 'decidedFirst', field: 'decided_date' })
  })
  it(`says a quote decided more than ${HISTORY_YEARS} years ago is too old (the decided date, else sent, else the quote's date)`, () => {
    expect(quoteHistory(quote({ status: 'accepted', issue_date: yearsAgo(12) }))).toMatchObject({ reason: 'tooOld', purpose: true })
    expect(quoteHistory(quote({ status: 'accepted', issue_date: yearsAgo(12), decided_date: yearsAgo(9) }))).toBeNull()
    // A quote still waiting for an answer isn't decided, so it isn't too old
    expect(quoteHistory(quote({ status: 'sent', issue_date: yearsAgo(12) }))).toBeNull()
  })
  it('checks only the first line of a quote, and still leaves quotes already sent in AVX as they are', () => {
    const rows = [quote({ status: 'accepted', decided_date: day(5) }), quote({ _row: 3, description: 'Lights' })]
    const plan = dryRun(rows, 'quotes', { quotes: [], clients: [] }).plan
    expect(plan[0]).toMatchObject({ reason: 'futureDate' })
    expect(plan[1].action).toBe('create')
    const sent = dryRun([quote({ status: 'accepted' })], 'quotes', { quotes: [{ import_ref: 'Q-1', status: 'accepted' }], clients: [] }).plan[0]
    expect(sent).toMatchObject({ reason: 'quoteSent', purpose: true })
  })
})

describe('history import: what the database says', () => {
  it('reads its new messages', () => {
    expect(serverMessage('Too old to import: Congress')).toEqual({ key: 'tooOld', name: 'Congress' })
    expect(serverMessage('Already in AVX, left as it is: Congress')).toEqual({ key: 'gigThere', name: 'Congress' })
    expect(serverMessage("Past job: equipment isn't planned on it")).toMatchObject({ key: 'historyGig' })
    expect(serverMessage('Unknown quote status: Maybe')).toEqual({ key: 'unknownStatus', name: 'Maybe' })
    expect(serverMessage('The quote is decided before it was sent')).toMatchObject({ key: 'decidedFirst' })
    expect(serverMessage('A date is after today')).toMatchObject({ key: 'futureDate' })
  })
})
