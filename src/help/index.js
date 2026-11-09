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
  'pocket-tools': ['dmx-universe', 'dmx-address'],
  home: ['gig', 'gig-status', 'workspace', 'my-work', 'double-booking', 'offline-copy'],
  gig: ['pm', 'crew', 'viewer', 'call-time', 'booking-times', 'call-sheet', 'schedule', 'feed', 'files', 'availability-request', 'crew-call', 'field-tools', 'input-list', 'stage-plot', 'dmx-universe', 'truss', 'timecode', 'distro', 'breaker-headroom', 'neutral-current'],
  messages: ['chat', 'direct-message', 'announcement', 'mute', 'report', 'block', 'push-notifications', 'email-summary', 'weekly-key-numbers'],
  inventory: ['catalogue-item', 'bulk-item', 'serial-item', 'location', 'stock-movement', 'subrental', 'inspection', 'repair', 'charged-repair'],
  'inventory-item': ['unit', 'set', 'case', 'accessory', 'alternative', 'replacement-value', 'depreciation', 'inspection', 'write-off', 'payback', 'speaker-specs', 'power-factor'],
  quotes: ['quote', 'quote-version', 'client-link', 'price-list', 'validity', 'e-signature'],
  contacts: ['client', 'supplier', 'subrental', 'quote'],
  'crew-profile': ['unavailable-dates', 'block'],
  'crew-search': ['crew-call', 'availability-request', 'network', 'block'],
  jobs: ['crew-call', 'block'],
  'org-jobs': ['crew-call', 'block'],
  'org-tasks': ['repair'],
  'my-hours': ['hours-split'],
  'my-numbers': ['fee-paid', 'year-statement'],
  'my-statement': ['year-statement'],
  'org-hours': ['hours-split'],
  'org-leave': ['leave', 'holiday-balance', 'working-week', 'unavailable-dates'],
  'org-expenses': ['expense', 'expense-claim', 'recurring-cost', 'capital-expense', 'vat'],
  'org-invoices': ['invoice', 'credit-note', 'payment', 'certified-program', 'vat'],
  'org-reports': ['net-revenue', 'estimate', 'comparison-period', 'utilisation', 'gig-margin', 'cash-position', 'win-rate', 'follow-up', 'time-to-decision', 'equipment-profit', 'payback', 'demand-against-stock', 'idle-stock', 'crew-day', 'staff-utilisation', 'time-to-fill', 'saved-view', 'management-pack', 'accountant-link'],
  'gig-wrapup': ['gig-wrapup', 'crew-day', 'hours-split'],
  'org-person': ['crew-day', 'staff-utilisation', 'holiday-balance'],
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
  'crew-call-time': { role: 'crew', pages: ['home', 'gig'], terms: ['call-time', 'schedule', 'call-sheet'], shots: ['gig-list', 'call-time', 'schedule-callsheet', 'call-sheet', 'call-sheet-large'] },
  'crew-calendar': { role: 'crew', pages: ['home'], terms: ['gig', 'call-time'], shots: [null, 'calendar-feed', null] },
  'crew-jobs': { role: 'crew', pages: ['jobs', 'crew-profile'], terms: ['crew-call'], shots: [null, 'jobs-board', null] },
  'crew-rehearsal': { role: 'crew', pages: ['gig'], terms: ['timecode'], shots: [null, 'rehearsal', null, null] },
  'pm-tasks': { role: 'pm', pages: ['gig'], terms: [], shots: [null, 'gig-tasks', null] },
  'pm-org-tasks': { role: 'pm', pages: ['org-tasks', 'inventory'], terms: ['repair'], shots: [null, 'org-task-templates', null] },
  'crew-onsite': { role: 'crew', pages: ['gig'], terms: ['call-time', 'schedule'], shots: [null, 'onsite', null] },
  'crew-dmx-calc': { role: 'crew', pages: ['pocket-tools', 'gig'], terms: ['dmx-address', 'dmx-universe'], shots: [null, 'dmx-calc', 'dmx-walk'] },
  'crew-trust': { role: 'crew', pages: ['crew-profile', 'jobs'], terms: [], shots: [null, null, null] },
  'crew-profile': { role: 'crew', pages: ['crew-profile', 'home'], terms: ['unavailable-dates'], shots: [null, 'crew-profile', null] },
  'crew-unavailable': { role: 'crew', pages: ['home'], terms: ['unavailable-dates', 'double-booking'], shots: ['more-availability', 'unavailable', null] },
  'crew-availability': { role: 'crew', pages: ['home', 'messages'], terms: ['availability-request', 'crew-call'], shots: [null, 'requests', 'chat-availability'] },
  'crew-chat': { role: 'crew', pages: ['gig', 'messages'], terms: ['chat', 'direct-message', 'mute', 'report'], shots: ['inbox', 'chat-compose', null, null] },
  'crew-damage': { role: 'crew', pages: ['gig'], terms: ['damage', 'unit', 'repair'], shots: ['equipment-report', 'damage-form', null] },
  'crew-appearance': { role: 'crew', pages: ['home'], terms: ['offline-copy'], shots: [null, 'appearance', null] },
  'crew-offline': { role: 'crew', pages: ['gig', 'home'], terms: ['offline-copy', 'files'], shots: [null, 'files-offline', 'offline-banner', null] },
  'pm-create-gig': { role: 'pm', pages: ['home'], terms: ['gig', 'gig-status', 'workspace'], shots: [null, 'gig-form', null, null] },
  'pm-post-job': { role: 'pm', pages: ['org-jobs', 'gig'], terms: ['crew-call'], shots: [null, null, 'org-jobs'] },
  'pm-find-crew': { role: 'pm', pages: ['crew-search', 'gig'], terms: ['crew-call', 'availability-request'], shots: [null, 'crew-search', 'crewsearch-offer'] },
  'pm-invite-crew': { role: 'pm', pages: ['gig'], terms: ['pm', 'crew', 'viewer', 'network', 'call-time', 'crew-call'], shots: ['crew-invite', 'invite-form', null, null] },
  'pm-schedule': { role: 'pm', pages: ['gig'], terms: ['schedule', 'call-time', 'feed'], shots: ['schedule-add', 'schedule-form', null] },
  'pm-call-sheet': { role: 'pm', pages: ['gig'], terms: ['call-sheet', 'schedule', 'call-time'], shots: [null, 'schedule-callsheet', 'call-sheet-send', null] },
  'pm-double-booking': { role: 'pm', pages: ['gig', 'home'], terms: ['double-booking', 'booking-times', 'availability-request', 'unavailable-dates'], shots: ['crew-clash', 'ask-form', null, null] },
  'pm-patch': { role: 'pm', pages: ['gig'], terms: ['stage-box', 'split', 'input-list'], shots: [null, 'patch-boxes', 'patch-fill', null] },
  'pm-dmx': { role: 'pm', pages: ['gig'], terms: ['dmx-universe', 'dmx-address', 'field-tools'], shots: [null, 'dmx-form', 'dmx-list', null] },
  'pm-system-calc': { role: 'pm', pages: ['gig'], terms: ['haas', 'spl', 'field-tools', 'speaker-specs'], shots: [null, 'system-sources', 'system-listeners', null] },
  'pm-light-plot': { role: 'pm', pages: ['gig'], terms: ['truss', 'power-phase', 'dmx-address'], shots: [null, 'light-bar', 'light-plot', 'light-power'] },
  'pm-power': { role: 'pm', pages: ['gig'], terms: ['distro', 'power-phase', 'breaker-headroom', 'neutral-current', 'power-factor'], shots: [null, null, null, null] },
  'pm-cables': { role: 'pm', pages: ['gig'], terms: ['voltage-drop', 'cable-capacity', 'inrush-current', 'distro', 'breaker-headroom'], shots: [null, null, null, null] },
  'pm-rigging': { role: 'pm', pages: ['gig'], terms: ['wll', 'hoist-class', 'dynamic-factor', 'hang-point', 'truss'], shots: [null, null, null, null] },
  'pm-line-arrays': { role: 'pm', pages: ['gig'], terms: ['line-array', 'bumper-limit', 'centre-of-gravity', 'splay-angle', 'wll'], shots: [null, null, null, null] },
  'pm-mvr': { role: 'pm', pages: ['gig', 'inventory-item'], terms: ['mvr', 'gdtf', 'dmx-address', 'field-tools'], shots: [null, 'mvr-match', null, null] },
  'pm-stage-plot': { role: 'pm', pages: ['gig'], terms: ['stage-plot', 'input-list', 'field-tools'], shots: [null, 'plot-drawing', 'plot-list', 'plot-to-inputs'] },
  'pm-input-list': { role: 'pm', pages: ['gig'], terms: ['input-list', 'phantom-power', 'stage-box', 'line-check', 'field-tools'], shots: ['tools-add', 'input-form', 'input-list', null] },
  'pm-equipment': { role: 'pm', pages: ['gig'], terms: ['catalogue-item', 'prep-return-days', 'subrental', 'alternative'], shots: ['equipment-add', 'equipment-picker', null, null] },
  'wh-import': { role: 'warehouse', pages: ['inventory'], terms: ['catalogue-item', 'bulk-item', 'serial-item', 'location'], shots: [null, 'imp-choose', 'imp-match', 'imp-check'] },
  'wh-locations': { role: 'warehouse', pages: ['inventory'], terms: ['location', 'stock-movement'], shots: ['inv-locations', null, null, null] },
  'wh-units-labels': { role: 'warehouse', pages: ['inventory-item', 'inventory'], terms: ['serial-item', 'unit', 'depreciation'], shots: ['item-units', null, 'labels'] },
  'wh-scan': { role: 'warehouse', pages: ['gig', 'inventory'], terms: ['packing-list', 'scan-out-in', 'scan-mode', 'case', 'unit'], shots: [null, 'dispatch-out', null, 'scan-mode'] },
  'wh-delivery-note': { role: 'warehouse', pages: ['gig'], terms: ['e-signature', 'packing-list', 'scan-out-in'], shots: [null, null, null, null] },
  'of-signed-quote': { role: 'office', pages: ['quote'], terms: ['e-signature', 'client-link', 'quote-version'], shots: [null, null, null] },
  'wh-steps': { role: 'warehouse', pages: ['gig', 'inventory', 'orgs'], terms: ['equipment-steps', 'scan-out-in', 'packing-list'], shots: ['step-picker', 'step-bars', 'packing-steps', 'org-steps'] },
  'wh-returns': { role: 'warehouse', pages: ['gig', 'inventory'], terms: ['scan-out-in', 'damage', 'mark-lost', 'repair'], shots: ['dispatch-in', null, null] },
  'wh-repairs': { role: 'warehouse', pages: ['inventory', 'inventory-item'], terms: ['repair', 'inspection', 'write-off', 'damage'], shots: ['maintenance', null, null] },
  'wh-subrentals': { role: 'warehouse', pages: ['inventory'], terms: ['subrental', 'supplier', 'cross-hire-code'], shots: [null, 'sub-form', null, null] },
  'wh-reports': { role: 'warehouse', pages: ['inventory'], terms: ['replacement-value', 'depreciation', 'write-off'], shots: ['reports', null, null] },
  'warehouse-equipment-money': { role: 'warehouse', pages: ['org-reports', 'inventory', 'inventory-item'], terms: ['equipment-profit', 'payback', 'buy-or-hire', 'depreciation', 'replacement-value'], shots: ['equip-profit', 'equip-details', 'equip-payback', 'equip-buy', 'item-money'] },
  'warehouse-numbers': { role: 'warehouse', pages: ['org-reports', 'inventory', 'home'], terms: ['demand-against-stock', 'idle-stock', 'subrental', 'repair', 'inspection', 'scan-out-in'], shots: ['wh-demand', 'wh-suppliers', 'wh-damage', 'wh-dispatch', 'reports-overview'] },
  'of-company': { role: 'office', pages: ['quotes'], terms: ['vat', 'validity'], shots: [null, 'company-details', null] },
  'of-price-list': { role: 'office', pages: ['quotes', 'quote'], terms: ['price-list', 'catalogue-item'], shots: ['price-list', null, null] },
  'of-contacts': { role: 'office', pages: ['contacts', 'quotes', 'quote'], terms: ['client', 'supplier'], shots: ['contacts', null, 'quote-client', null] },
  'of-import-jobs': { role: 'office', pages: ['inventory', 'quotes', 'home'], terms: ['gig', 'gig-status', 'quote'], shots: [null, 'imp-jobs', null, null] },
  'of-build-quote': { role: 'office', pages: ['quotes', 'quote'], terms: ['quote', 'phase', 'factor', 'vat', 'price-list'], shots: [null, 'quote-phases', null, null] },
  'of-versions': { role: 'office', pages: ['quote'], terms: ['quote-version', 'quote'], shots: [null, 'quote-versions', null] },
  'of-send-quote': { role: 'office', pages: ['quote'], terms: ['client-link', 'quote-version', 'validity'], shots: [null, 'send-quote', null, null] },
  'of-quote-to-gig': { role: 'office', pages: ['quote', 'gig'], terms: ['quote', 'gig', 'phase'], shots: [null, 'quote-gig', null] },
  'ad-members': { role: 'admin', pages: ['orgs', 'home'], terms: ['organisation', 'org-admin', 'org-member', 'viewer', 'time-zone'], shots: [null, 'members', null, null] },
  'ad-org-export': { role: 'admin', pages: ['orgs', 'home'], terms: ['organisation'], shots: [null, 'org-export', null] },
  'ad-verify-company': { role: 'admin', pages: ['org-jobs', 'orgs'], terms: ['organisation'], shots: [null, 'org-verify', null] },
  'ad-gig-statuses': { role: 'admin', pages: ['orgs', 'home', 'gig'], terms: ['gig-status'], shots: [null, 'org-labels', null] },
  'crew-hours': { role: 'crew', pages: ['gig', 'my-hours'], terms: ['hours-split'], shots: ['hours-log', null, null] },
  'crew-numbers': { role: 'crew', pages: ['my-numbers', 'my-statement', 'home'], terms: ['fee-paid', 'year-statement'], shots: ['my-numbers-tiles', 'my-numbers', 'fee-paid', 'year-statement'] },
  'pm-approve-hours': { role: 'admin', pages: ['gig', 'org-hours', 'orgs'], terms: ['hours-split'], shots: ['gig-hours', null, 'org-hours'] },
  'of-leave': { role: 'office', pages: ['org-leave', 'home'], terms: ['leave', 'holiday-balance'], shots: ['leave-ask', null, null] },
  'ad-leave': { role: 'admin', pages: ['org-leave', 'orgs'], terms: ['leave', 'holiday-balance', 'working-week'], shots: ['leave-requests', 'leave-balances', null] },
  'office-expenses': { role: 'office', pages: ['org-expenses', 'gig', 'contacts'], terms: ['expense', 'expense-claim', 'recurring-cost', 'capital-expense'], shots: ['expenses-month', 'expense-add', 'expense-claim', 'expense-approve', 'expense-recurring'] },
  'office-invoices': { role: 'office', pages: ['org-invoices', 'quote', 'contacts'], terms: ['invoice', 'credit-note', 'certified-program', 'invoicing-connection', 'vat', 'payment'], shots: ['quote-invoices', 'invoice-new', 'invoice-send', 'invoicing-program', 'invoices-list', 'invoice-paid'] },
  'office-payments': { role: 'office', pages: ['org-invoices', 'inventory'], terms: ['payment', 'charged-repair', 'invoice', 'credit-note'], shots: ['invoice-repairs', 'invoice-paid', null] },
  'pm-operations': { role: 'admin', pages: ['org-reports', 'gig', 'gig-wrapup', 'org-person', 'org-tasks', 'home'], terms: ['crew-day', 'staff-utilisation', 'time-to-fill', 'gig-wrapup'], shots: ['ops-activity', 'ops-people', 'ops-staffing', 'gig-wrapup', 'reports-overview'] },
  'office-money': { role: 'office', pages: ['org-reports', 'org-expenses', 'home'], terms: ['gross-margin', 'operating-result', 'depreciation', 'cost-of-goods-sold', 'estimate'], shots: ['money-results', 'money-details', 'money-margins', 'money-labour', 'reports-overview'] },
  'office-sales': { role: 'office', pages: ['org-reports', 'quotes', 'contacts'], terms: ['win-rate', 'follow-up', 'time-to-decision', 'discount-given', 'new-client'], shots: ['sales-waiting', 'sales-winrate', 'sales-clients', 'client-numbers'] },
  'office-report-extras': { role: 'admin', pages: ['org-reports', 'messages'], terms: ['saved-view', 'management-pack', 'accountant-link', 'weekly-key-numbers'], shots: ['views-save', 'views-pinned', 'reports-pack', 'accountant-links', 'accountant-page', 'weekly-numbers'] },
  'office-cash': { role: 'office', pages: ['org-reports', 'org-invoices', 'org-expenses', 'home'], terms: ['cash-position', 'overdue-age', 'win-rate', 'budget-target'], shots: ['money-cash', 'money-cash-details', 'money-spending', 'money-forecast', 'reports-overview'] },
  'office-gig-finance': { role: 'office', pages: ['gig', 'org-reports'], terms: ['gig-margin', 'estimate', 'net-revenue'], shots: ['gig-finance', null, 'reports-margins', null] },
  'office-reports': { role: 'office', pages: ['org-reports', 'home', 'inventory'], terms: ['net-revenue', 'comparison-period', 'utilisation', 'estimate'], shots: ['reports-overview', 'reports-revenue', 'reports-details', 'home-key-numbers'] },
  'pm-labour-cost': { role: 'admin', pages: ['orgs', 'gig', 'org-jobs'], terms: ['crew-call'], shots: ['org-rates', 'gig-labour', 'quote-crew-total', 'crewcall-fee', 'job-pay', 'quote-crew-margin'] },
  'ad-custom-fields': { role: 'admin', pages: ['orgs', 'gig', 'contacts', 'inventory'], terms: [], shots: ['org-fields', null, null] },
  'ad-import-crew': { role: 'admin', pages: ['orgs', 'home'], terms: ['organisation', 'viewer', 'org-member'], shots: [null, null, 'held-invites'] },
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
