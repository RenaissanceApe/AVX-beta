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

// Guides (docs/HELP.md, H2): who each is for, the pages whose ? lists it, the glossary words
// it links to, and a screenshot per step (null: no picture). The words are in en.js / pt.js.
// Screenshots come from scripts/help-screens (npm run help:screens), in both languages.
export const GUIDE_ROLES = ['crew', 'pm', 'warehouse', 'office', 'admin']
export const GUIDES = {
  'crew-join': { role: 'crew', pages: ['home'], terms: ['gig', 'my-work', 'workspace'], shots: [null, 'welcome', 'gig-list', null] },
  'crew-install': { role: 'crew', pages: ['home'], terms: ['push-notifications', 'offline-copy'], shots: [null, null, null, 'push'] },
  'crew-call-time': { role: 'crew', pages: ['home', 'gig'], terms: ['call-time', 'schedule', 'call-sheet'], shots: ['gig-list', 'call-time', 'schedule-callsheet', 'call-sheet'] },
  'crew-unavailable': { role: 'crew', pages: ['home'], terms: ['unavailable-dates', 'double-booking'], shots: ['more-availability', 'unavailable', null] },
  'crew-availability': { role: 'crew', pages: ['home', 'messages'], terms: ['availability-request', 'crew-call'], shots: [null, 'requests', 'chat-availability'] },
  'crew-chat': { role: 'crew', pages: ['gig', 'messages'], terms: ['chat', 'direct-message', 'mute', 'report'], shots: ['inbox', 'chat-compose', null, null] },
  'crew-damage': { role: 'crew', pages: ['gig'], terms: ['damage', 'unit', 'repair'], shots: ['equipment-report', 'damage-form', null] },
  'crew-appearance': { role: 'crew', pages: ['home'], terms: ['offline-copy'], shots: [null, 'appearance', null] },
  'crew-offline': { role: 'crew', pages: ['gig', 'home'], terms: ['offline-copy', 'files'], shots: [null, 'files-offline', 'offline-banner', null] },
  'pm-create-gig': { role: 'pm', pages: ['home'], terms: ['gig', 'gig-status', 'workspace'], shots: [null, 'gig-form', null] },
  'pm-invite-crew': { role: 'pm', pages: ['gig'], terms: ['pm', 'crew', 'viewer', 'network', 'call-time', 'crew-call'], shots: ['crew-invite', 'invite-form', null, null] },
  'pm-schedule': { role: 'pm', pages: ['gig'], terms: ['schedule', 'call-time', 'feed'], shots: ['schedule-add', 'schedule-form', null] },
  'pm-call-sheet': { role: 'pm', pages: ['gig'], terms: ['call-sheet', 'schedule', 'call-time'], shots: [null, 'schedule-callsheet', 'call-sheet-send', null] },
  'pm-double-booking': { role: 'pm', pages: ['gig', 'home'], terms: ['double-booking', 'booking-times', 'availability-request', 'unavailable-dates'], shots: ['crew-clash', 'ask-form', null, null] },
  'pm-equipment': { role: 'pm', pages: ['gig'], terms: ['catalogue-item', 'prep-return-days', 'subrental', 'alternative'], shots: ['equipment-add', 'equipment-picker', null, null] },
  'wh-import': { role: 'warehouse', pages: ['inventory'], terms: ['catalogue-item', 'bulk-item', 'serial-item', 'location'], shots: [null, 'inv-import', null] },
  'wh-locations': { role: 'warehouse', pages: ['inventory'], terms: ['location', 'stock-movement'], shots: ['inv-locations', null, null] },
  'wh-units-labels': { role: 'warehouse', pages: ['inventory-item', 'inventory'], terms: ['serial-item', 'unit', 'depreciation'], shots: ['item-units', null, 'labels'] },
  'wh-scan': { role: 'warehouse', pages: ['gig', 'inventory'], terms: ['packing-list', 'scan-out-in', 'case', 'unit'], shots: [null, 'dispatch-out', null] },
  'wh-returns': { role: 'warehouse', pages: ['gig', 'inventory'], terms: ['scan-out-in', 'damage', 'mark-lost', 'repair'], shots: ['dispatch-in', null, null] },
  'wh-repairs': { role: 'warehouse', pages: ['inventory', 'inventory-item'], terms: ['repair', 'inspection', 'write-off', 'damage'], shots: ['maintenance', null, null] },
  'wh-subrentals': { role: 'warehouse', pages: ['inventory'], terms: ['subrental', 'supplier', 'cross-hire-code'], shots: [null, 'sub-form', null, null] },
  'wh-reports': { role: 'warehouse', pages: ['inventory'], terms: ['replacement-value', 'depreciation', 'write-off'], shots: ['reports', null, null] },
  'of-company': { role: 'office', pages: ['quotes'], terms: ['vat', 'validity'], shots: [null, 'company-details', null] },
  'of-price-list': { role: 'office', pages: ['quotes', 'quote'], terms: ['price-list', 'catalogue-item'], shots: ['price-list', null, null] },
  'of-build-quote': { role: 'office', pages: ['quotes', 'quote'], terms: ['quote', 'phase', 'factor', 'vat', 'price-list'], shots: [null, 'quote-phases', null, null] },
  'of-versions': { role: 'office', pages: ['quote'], terms: ['quote-version', 'quote'], shots: [null, 'quote-versions', null] },
  'of-send-quote': { role: 'office', pages: ['quote'], terms: ['client-link', 'quote-version', 'validity'], shots: [null, 'send-quote', null] },
  'of-quote-to-gig': { role: 'office', pages: ['quote', 'gig'], terms: ['quote', 'gig', 'phase'], shots: [null, 'quote-gig', null] },
  'ad-members': { role: 'admin', pages: ['orgs', 'home'], terms: ['organisation', 'org-admin', 'org-member', 'viewer'], shots: [null, 'members', null] },
  'ad-mute': { role: 'admin', pages: ['orgs', 'messages'], terms: ['mute', 'email-summary', 'push-notifications'], shots: ['orgs-mute', null, null] },
  'ad-delete': { role: 'admin', pages: ['gig', 'orgs'], terms: ['gig-status', 'organisation'], shots: [null, null, 'gig-danger', null] },
  'ad-export': { role: 'admin', pages: ['orgs'], terms: ['retention', 'organisation'], shots: ['export-account', null, null] },
}

export const guideIds = () => Object.keys(GUIDES)
export function guide(id) {
  const meta = GUIDES[id]
  const text = content().guides[id] || en.guides[id]
  return meta && text ? { id, ...meta, ...text } : null
}
export const guidesFor = pageId => guideIds().filter(id => GUIDES[id].pages.includes(pageId))
export const guidesByRole = role => guideIds().filter(id => GUIDES[id].role === role)
export const shotUrl = shot => `/help/shots/${getLanguage() === 'pt' ? 'pt' : 'en'}/${shot}.jpg`
