import { getLanguage } from '../i18n'
import en from './en'
import pt from './pt'

// Help content (docs/HELP.md): glossary terms, field hints and page notes, in the UI language.
const CONTENT = { en, pt }
const content = () => CONTENT[getLanguage()] || en

export const termIds = () => Object.keys(en.terms)
export const term = id => content().terms[id] || en.terms[id] || null
export const hint = id => content().hints[id] || en.hints[id] || ''
export const page = id => content().pages[id] || en.pages[id] || null

// Terms worth reading for each page (shown under the page note)
export const PAGE_TERMS = {
  home: ['gig', 'gig-status', 'workspace', 'my-work', 'double-booking', 'offline-copy'],
  gig: ['pm', 'crew', 'viewer', 'call-time', 'booking-times', 'call-sheet', 'schedule', 'feed', 'files', 'availability-request', 'crew-call'],
  messages: ['chat', 'direct-message', 'announcement', 'mute', 'report', 'block', 'push-notifications', 'email-summary'],
  inventory: ['catalogue-item', 'bulk-item', 'serial-item', 'location', 'stock-movement', 'subrental', 'inspection', 'repair'],
  'inventory-item': ['unit', 'set', 'case', 'accessory', 'alternative', 'replacement-value', 'depreciation', 'inspection', 'write-off'],
  quotes: ['quote', 'quote-version', 'client-link', 'price-list', 'validity'],
  quote: ['phase', 'factor', 'vat', 'quote-version', 'client-link', 'price-list'],
  orgs: ['organisation', 'org-admin', 'org-member', 'viewer', 'retention'],
}

// For the glossary search: accents and case don't matter
export const normalize = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function searchTerms(query) {
  const q = normalize(query).trim()
  const all = termIds().map(id => ({ id, ...term(id) }))
  const list = q ? all.filter(x => normalize(`${x.term} ${x.definition} ${x.example}`).includes(q)) : all
  return list.sort((a, b) => a.term.localeCompare(b.term, getLanguage()))
}
