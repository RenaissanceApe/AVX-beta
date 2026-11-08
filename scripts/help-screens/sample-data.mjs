// Sample data for the guide screenshots (docs/HELP.md, H2). Nothing here is real: the script
// answers the app's database calls from this file, so the pictures never show anyone's data
// and never touch a Supabase project.
//
// Two people: Carla, crew only (no organisation), and Ricardo, admin of Lumen and Pixel and
// production manager of the gig. Dates are counted from today so the gig is always upcoming.

export const SB = 'https://help-screens.supabase.co'

const DAY = 86400e3
const day = n => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
const ago = hours => new Date(Date.now() - hours * 3600e3).toISOString()

export const ids = {
  carla: '44444444-4444-4444-8444-444444444444',
  ricardo: '11111111-1111-4111-8111-111111111111',
  duarte: '55555555-5555-4555-8555-555555555555',
  ana: '66666666-6666-4666-8666-666666666666',
  org: '22222222-2222-4222-8222-222222222222',
  otherOrg: '77777777-7777-4777-8777-777777777777',
  gig: '33333333-3333-4333-8333-333333333333',
  speaker: 'bbbb0000-0000-4000-8000-000000000002',
  jazz: '33333333-3333-4333-8333-333333333334',
  gigChat: 'dddd0000-0000-4000-8000-000000000002',
  direct: 'dddd0000-0000-4000-8000-000000000001',
  orgChat: 'dddd0000-0000-4000-8000-000000000009',
}
const { carla, ricardo, duarte, ana, org: orgId, otherOrg, gig: gigId, jazz: jazzId, gigChat, direct, orgChat } = ids

// Words that appear inside the sample data, per language
const W = {
  pt: {
    sound: 'Técnica de som', lights: 'Operador de luz', production: 'Produção', stage: 'Chefe de palco',
    loadIn: 'Carga e montagem', soundcheck: 'Soundcheck', doors: 'Abertura de portas', show: 'Espetáculo', loadOut: 'Desmontagem',
    dock: 'Cais de carga', stageMain: 'Palco principal', holiday: 'Férias', askMsg: 'Precisamos de si a partir das 08:00 para a montagem. Consegue?',
    welcome: 'Bem-vindos! Carga às 08:00 no cais de carga.', reply: 'Perfeito, lá estarei.', rider: 'Rider de som.pdf', plot: 'Planta de palco.pdf',
    general: 'Geral', safety: 'Capacete obrigatório na zona de carga.', cables: 'Cabo XLR 10m', speaker: 'Coluna NEXT LA210x', desk: 'Mesa Yamaha QL1', powercon: 'Cabo Powercon 5m',
    sys: 'Sistema de som', cab: 'Cabos', warehouse: 'Armazém principal', desc: 'Concerto de Natal, dois dias.',
  },
  en: {
    sound: 'Sound technician', lights: 'Lighting operator', production: 'Production', stage: 'Stage manager',
    loadIn: 'Load-in and setup', soundcheck: 'Soundcheck', doors: 'Doors open', show: 'Show', loadOut: 'Load-out',
    dock: 'Loading dock', stageMain: 'Main stage', holiday: 'Holiday', askMsg: 'We need you from 08:00 for the load-in. Can you make it?',
    welcome: 'Welcome! Load-in at 08:00 at the loading dock.', reply: 'Perfect, I’ll be there.', rider: 'Sound rider.pdf', plot: 'Stage plot.pdf',
    general: 'General', safety: 'Hard hats in the loading area, please.', cables: 'XLR cable 10m', speaker: 'NEXT LA210x speaker', desk: 'Yamaha QL1 desk', powercon: 'Powercon cable 5m',
    sys: 'Sound system', cab: 'Cables', warehouse: 'Main warehouse', desc: 'Christmas concert, two days.',
  },
}

export function sampleData(persona, lang) {
  const w = W[lang]
  const me = persona === 'pm' ? ricardo : carla
  const names = { [carla]: 'Carla Mendes', [ricardo]: 'Ricardo Bedulho', [duarte]: 'Duarte Silva', [ana]: 'Ana Costa' }
  if (persona === 'new') names[carla] = ''
  const phones = { [carla]: '+351 912 345 678', [ricardo]: '+351 913 222 111', [duarte]: '+351 914 555 000', [ana]: '+351 915 000 999' }
  const org = {
    id: orgId, name: 'Lumen and Pixel', equipment_prep_days: 1, equipment_return_days: 1, equipment_steps: ['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in'], field_tools: ['stage_plot', 'input_list'], created_at: '2026-01-10T10:00:00Z',
    legal_name: 'Lumen and Pixel, Lda', tax_id: '500 000 000', address: 'Rua da Cozinha Económica 30\n1300-149 Lisboa', email: 'info@example.com',
    phone: '+351 210 000 000', website: 'example.com', default_vat_rate: 23, quote_validity_days: 30, quote_number_prefix: 'Q',
    quote_terms: lang === 'pt' ? '50% na adjudicação, 50% até 30 dias após o evento.' : '50% on acceptance, 50% within 30 days of the event.',
  }
  const gig = {
    id: gigId, org_id: orgId, name: 'Marcolino — Natal', venue: 'Coliseu dos Recreios, Lisboa', start_date: day(24), end_date: day(25),
    status: 'confirmed', description: w.desc, created_by: ricardo, created_at: ago(400), organisations: { name: 'Lumen and Pixel' },
    custom_values: { cf1: 'PO-2026-118', cf2: 2800, cf3: true, cf4: lang === 'pt' ? 'Interior' : 'Indoor' },
  }
  const jazz = { id: jazzId, org_id: otherOrg, name: 'Festival Jazz Cascais', venue: 'Parque Marechal Carmona', start_date: day(40), end_date: day(42), status: 'confirmed', created_by: ana, created_at: ago(500) }
  const members = [
    { gig_id: gigId, user_id: ricardo, role: 'pm', function_title: w.production, call_time: '07:30', created_at: ago(400) },
    { gig_id: gigId, user_id: carla, role: 'crew', function_title: w.sound, call_time: '08:00', created_at: ago(300) },
    { gig_id: gigId, user_id: duarte, role: 'crew', function_title: w.lights, call_time: '09:00', created_at: ago(200) },
  ]
  const myGigs = persona === 'pm'
    ? [{ role: 'pm', function_title: w.production, call_time: '07:30', gigs: gig, gig_id: gigId, user_id: ricardo }]
    : [{ role: 'crew', function_title: w.sound, call_time: '08:00', gigs: gig, gig_id: gigId, user_id: carla },
      { role: 'crew', function_title: w.sound, call_time: '10:00', gigs: jazz, gig_id: jazzId, user_id: carla }]
  const schedule = [
    { id: 's1', gig_id: gigId, day: day(24), start_time: '08:00:00', end_time: '13:00:00', title: w.loadIn, location: w.dock, notes: null },
    { id: 's2', gig_id: gigId, day: day(24), start_time: '16:00:00', end_time: '17:30:00', title: w.soundcheck, location: w.stageMain, notes: null },
    { id: 's3', gig_id: gigId, day: day(24), start_time: '20:00:00', end_time: null, title: w.doors, location: null, notes: null },
    { id: 's4', gig_id: gigId, day: day(24), start_time: '21:00:00', end_time: '23:00:00', title: w.show, location: w.stageMain, notes: null },
    { id: 's5', gig_id: gigId, day: day(25), start_time: '23:00:00', end_time: '03:00:00', title: w.loadOut, location: w.dock, notes: null },
  ]
  const assets = [
    { id: 'a1', gig_id: gigId, type: 'rider', name: w.rider, version: 2, file_size: 820000, file_path: `${gigId}/rider.pdf`, superseded_by: null, uploaded_by: ricardo, created_at: ago(90) },
    { id: 'a2', gig_id: gigId, type: 'plot', name: w.plot, version: 1, file_size: 1400000, file_path: `${gigId}/plot.pdf`, superseded_by: null, uploaded_by: ricardo, created_at: ago(80) },
  ]
  const XLR = 'bbbb0000-0000-4000-8000-000000000001', SPK = 'bbbb0000-0000-4000-8000-000000000002', QL1 = 'bbbb0000-0000-4000-8000-000000000004', PWC = 'bbbb0000-0000-4000-8000-000000000003'
  const W1 = 'aaaa0000-0000-4000-8000-000000000001'
  // Revenue lines for the last 12 months (report_revenue_lines): a few gigs a month, growing
  const clientsSample = ['Teatro Aveirense', 'Festival Paredes de Coura', 'Câmara Municipal de Braga', 'Altice Arena']
  const revenueLines = []
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.now() - m * 30 * DAY); d.setDate(Math.min(d.getDate(), 20))
    const date = d.toISOString().slice(0, 10)
    const base = 3000 + (11 - m) * 350
    ;[['rental', 0.55, SPK], ['crew', 0.3, null], ['transport', 0.08, null], ['sale', 0.07, XLR]].forEach(([kind, share, item], k) => {
      revenueLines.push({ quote_id: `rq${m}`, quote_number: 100 + m, line_id: `rl${m}-${k}`, phase_id: 'p1', kind, item_id: item, description: kind,
        amount: Math.round(base * share * 100) / 100, currency: 'EUR', report_date: date, phase_start: date,
        gig_id: m === 0 ? gigId : `rg${m}`, gig_name: m === 0 ? gig.name : `${lang === 'pt' ? 'Evento' : 'Gig'} ${100 + m}`, gig_type_id: null,
        gig_status: 'confirmed', gig_custom_status_id: null, client_id: null, client_name: clientsSample[m % clientsSample.length] })
    })
  }
  // Gig finance (step 10): the sample gig first (its Overview panel reads the first row), then a
  // gig a month for Reports → Gig margins
  const fin = (id, name, start, revenue, labour, subrentals, repairs, other, extra = {}) => {
    const cost = Math.round((labour + subrentals + repairs + other) * 100) / 100
    const margin = Math.round((revenue - cost) * 100) / 100
    return { gig_id: id, gig_name: name, start_date: start, end_date: start, gig_status: 'confirmed', gig_custom_status_id: null, gig_type_id: null,
      client_id: null, client_name: clientsSample[(extra.n ?? 0) % clientsSample.length], revenue, revenue_source: 'accepted', quotes: 1,
      labour_planned: labour, labour_actual: null, labour, labour_estimated: 0, people: 4, people_missing: 0, subrentals, repairs, repairs_charged: 0,
      other_costs: other, cost, estimated_cost: 0, margin, margin_pct: revenue > 0 ? Math.round((margin * 1000) / revenue) / 10 : null, other_currencies: null, ...extra, n: undefined }
  }
  const gigFinance = [
    fin(gigId, gig.name, gig.start_date, 6840, 2150, 780, 120, 356.5, { labour_planned: 2400, labour_actual: 1350, labour_estimated: 800, estimated_cost: 800, people: 6, repairs_charged: 300 }),
    ...Array.from({ length: 11 }, (_, i) => {
      const d = new Date(Date.now() - (i + 1) * 30 * DAY); d.setDate(Math.min(d.getDate(), 18))
      const revenue = 2600 + ((i * 937) % 4200)
      return fin(`rg${i + 1}`, `${lang === 'pt' ? 'Evento' : 'Gig'} ${101 + i}`, d.toISOString().slice(0, 10), revenue,
        Math.round(revenue * (0.38 + (i % 3) * 0.12)), i === 6 ? 2900 : i % 4 === 1 ? 900 : 250, i % 5 === 2 ? 640 : 0, 120 + i * 15, { n: i + 1 })
    }),
  ]
  // Reports → Money (K2): finance_results answers by grouping. A quarter's totals, split by month,
  // client or gig; an earlier period (the comparison) is a little lower.
  const moneyBase = { revenue: 48600, revenue_rental: 27800, revenue_sale: 3100, revenue_crew: 13400, revenue_transport: 4300, revenue_other: 0,
    labour: 15200, labour_estimated: 1800, labour_planned: 15900, labour_actual: 11800, days_planned: 124, hours_planned: 1240, hours_actual: 960,
    subrentals: 4800, repairs: 640, gig_expenses: 2150, other_direct: 380, cogs: 1240, overheads: 13900, depreciation: 3900, depreciation_estimated: 300, gigs: 14 }
  const cats = [['rent_utilities', 6000], ['vehicle_running', 3600], ['insurance', 1800], ['accountant_legal', 1550], ['software', 950]]
  const moneyRow = (key, label, f, { company = true, negative = 0, noAccepted = 0 } = {}) => {
    const r = Object.fromEntries(Object.entries(moneyBase).map(([k, v]) => [k, Math.round(v * f * 100) / 100]))
    if (!company) { r.overheads = 0; r.depreciation = 0; r.depreciation_estimated = 0 }
    r.direct_costs = Math.round((r.labour + r.subrentals + r.repairs + r.gig_expenses + r.other_direct + r.cogs) * 100) / 100
    r.gross_margin = Math.round((r.revenue - r.direct_costs) * 100) / 100
    r.operating_result = Math.round((r.gross_margin - r.overheads - r.depreciation) * 100) / 100
    return { group_key: key, group_label: label, currency: 'EUR', ...r, cogs_missing: 0, gigs: Math.round(r.gigs),
      margin_pct: r.revenue ? Math.round(r.gross_margin * 1000 / r.revenue) / 10 : null, estimated: r.labour_estimated + r.depreciation_estimated,
      overheads_by_category: company ? cats.map(([k, v]) => ({ category_id: `cat-${k}`, name: null, starter_key: k, amount: Math.round(v * f * 100) / 100 })) : [],
      gigs_negative: negative, gigs_without_accepted: noAccepted }
  }
  const financeResults = ({ p_group = 'total', p_from = '' } = {}) => {
    const f = p_from < day(-80) ? 0.88 : 1
    if (p_group === 'month') {
      const first = new Date(`${p_from}T00:00:00Z`)
      return [0, 1, 2].map(i => {
        const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)).toISOString().slice(0, 7)
        return d > day(0).slice(0, 7) ? null : moneyRow(d, null, f * [0.36, 0.41, 0.23][i])
      }).filter(Boolean)
    }
    if (p_group === 'client') {
      return [...clientsSample.map((c, i) => moneyRow(`cl${i}`, c, f * [0.34, 0.27, 0.22, 0.17][i], { company: false, negative: i === 3 ? 1 : 0 })),
        { ...moneyRow(null, null, 0), overheads: 13900 * f, depreciation: 3900 * f, operating_result: -17800 * f }]
    }
    if (p_group === 'gig') {
      return gigFinance.slice(0, 6).map((g, i) => ({ ...moneyRow(g.gig_id, g.gig_name, f * [0.16, 0.12, 0.1, 0.09, 0.08, 0.07][i], { company: false }),
        hours_actual: [0, 96, 120, 64, 88, 40][i], labour_actual: i ? Math.round(moneyBase.labour_actual * [0.16, 0.12, 0.1, 0.09, 0.08, 0.07][i]) : null }))
    }
    return [moneyRow('total', null, f, { negative: 2, noAccepted: 1 })]
  }
  // Reports → Money, Cash / Spending / Forecast (K3): sample answers by the call's arguments
  const monthAt = (from, i) => { const d = new Date(`${from}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 10) }
  const thisMonth = `${day(0).slice(0, 7)}-01`
  const cashReport = ({ p_from = thisMonth } = {}) => {
    const rows = []
    for (let i = 0; i < 3; i++) {
      const m = monthAt(p_from, i)
      if (m > thisMonth) break
      rows.push({ section: 'invoiced', month: m, group_key: '', label: null, currency: 'EUR', amount: [21400, 26800, 14200][i], items: 5 + i },
        { section: 'invoiced', month: m, group_key: 'deposit', label: null, currency: 'EUR', amount: [3600, 2400, 4800][i], items: 2 },
        { section: 'received', month: m, group_key: '', label: null, currency: 'EUR', amount: [19800, 22100, 11900][i], items: 6 },
        { section: 'paid_out', month: m, group_key: '', label: null, currency: 'EUR', amount: [14600, 17900, 9400][i], items: 18 })
      if (i === 1) rows.push({ section: 'credited', month: m, group_key: '', label: null, currency: 'EUR', amount: 615, items: 1 })
    }
    rows.push(...[['0_30', 4920], ['31_60', 2460], ['61_90', 0], ['90_plus', 1230]].filter(([, a]) => a)
      .map(([g, a]) => ({ section: 'overdue', month: null, group_key: g, label: null, currency: 'EUR', amount: a, items: 1 })))
    const ins = [[8610, 12300], [0, 15990], [0, 6150]]
    const outs = [[5120, 380, 2210], [3690, 0, 2210], [0, 0, 2420]]
    for (let i = 0; i < 3; i++) {
      const m = monthAt(thisMonth, i)
      if (ins[i][0]) rows.push({ section: 'expected_in', month: m, group_key: 'overdue', label: null, currency: 'EUR', amount: ins[i][0], items: 3 })
      rows.push({ section: 'expected_in', month: m, group_key: 'due', label: null, currency: 'EUR', amount: ins[i][1], items: 3 })
      ;['unpaid', 'claims', 'recurring'].forEach((g, k) => { if (outs[i][k]) rows.push({ section: 'expected_out', month: m, group_key: g, label: null, currency: 'EUR', amount: outs[i][k], items: 2 }) })
      rows.push({ section: 'position', month: m, group_key: '', label: null, currency: 'EUR', amount: ins[i][0] + ins[i][1] - outs[i].reduce((a, b) => a + b, 0), items: 0 })
      rows.push({ section: 'recurring', month: m, group_key: 'rc1', label: lang === 'pt' ? 'Renda do armazém' : 'Warehouse rent', currency: 'EUR', amount: 1845, items: 1 },
        { section: 'recurring', month: m, group_key: 'rc2', label: lang === 'pt' ? 'Software de gestão' : 'Office software', currency: 'EUR', amount: 365, items: 1 })
      if (i === 2) rows.push({ section: 'recurring', month: m, group_key: 'rc3', label: lang === 'pt' ? 'Seguro da carrinha' : 'Van insurance', currency: 'EUR', amount: 210, items: 1 })
    }
    return rows
  }
  const clientBalance = clientsSample.map((c, i) => ({ client_key: `cl${i}`, client_id: `cl${i}`, client_name: c, currency: 'EUR',
    invoiced: [38400, 22100, 15800, 9200][i], deposits: [7200, 3000, 0, 1800][i], credited: [0, 615, 0, 0][i], paid: [30000, 16030, 12720, 7970][i],
    balance: [8400, 5455, 3080, 1230][i], overdue: [4920, 2460, 0, 1230][i], oldest_due: day([-24, -41, 12, -96][i]), open_invoices: [3, 2, 1, 1][i] }))
  const spendingAnswer = ({ p_group = 'category', p_from = '' } = {}) => {
    const f = p_from < day(-80) ? 0.9 : 1
    if (p_group === 'supplier') return [['sp1', 'Audiomatic', 6200], ['sp2', 'Rigging Lda', 3900], ['name:Galp', 'Galp', 2100], ['', null, 5400]]
      .map(([k, l, a], i) => ({ group_key: k, group_label: l, starter_key: null, currency: 'EUR', amount: Math.round(a * (i === 1 ? 1.4 - f * 0.4 : f)), total: Math.round(a * 1.23), items: 4 }))
    return [['ec1', 'hire_in', 7400, 0.7], ['ec6', 'rent_utilities', 5400, 1], ['ec3', 'transport_fuel', 3100, 1.25], ['ec8', 'software', 1150, 1], ['ec5', 'meals_jobs', 890, 0.8]]
      .map(([k, sk, a, prev]) => ({ group_key: k, group_label: null, starter_key: sk, currency: 'EUR', amount: Math.round(a * (f < 1 ? prev : 1)), total: Math.round(a * 1.23), items: 3 }))
  }
  const revenueForecast = [0, 1, 2].map(i => ({ month: monthAt(thisMonth, i), currency: 'EUR', confirmed: [17480, 24300, 9800][i], waiting: [4200, 9720, 6100][i],
    waiting_quotes: [2, 3, 2][i], win_rate_count: 0.62, win_rate_value: 0.58 }))
  const targetProgress = [
    { target_id: 't1', kind: 'revenue', category_id: null, category_name: null, starter_key: null, currency: 'EUR', monthly: 20000, target: 60000, actual: 48600 },
    { target_id: 't2', kind: 'budget', category_id: 'ec6', category_name: null, starter_key: 'rent_utilities', currency: 'EUR', monthly: 2000, target: 6000, actual: 5400 },
    { target_id: 't3', kind: 'budget', category_id: 'ec3', category_name: null, starter_key: 'transport_fuel', currency: 'EUR', monthly: 900, target: 2700, actual: 3100 },
  ]
  const item = (id, name, category, tracking, extra = {}) => ({ id, org_id: orgId, name, category, tracking, kind: 'rental', unit: 'day', unit_price: 10, code: null, archived_at: null, ...extra })
  const items = [
    item(XLR, w.cables, w.cab, 'bulk', { code: 'XLR10', weight_kg: 0.6, unit_price: 2.5 }),
    item(PWC, w.powercon, w.cab, 'bulk', { unit_price: 2 }),
    item(SPK, w.speaker, w.sys, 'serial', { code: 'LA210', weight_kg: 32, power_w: 1600, unit_price: 60 }),
    item(QL1, w.desk, w.sys, 'serial', { weight_kg: 25, power_w: 300, unit_price: 180 }),
  ]
  const gear = [
    { id: 'l1', gig_id: gigId, org_id: orgId, item_id: SPK, item_name: w.speaker, category: w.sys, quantity: 8, planned_from: null, planned_until: null, notes: null },
    { id: 'l2', gig_id: gigId, org_id: orgId, item_id: XLR, item_name: w.cables, category: w.cab, quantity: 60, planned_from: null, planned_until: null, notes: null },
    { id: 'l3', gig_id: gigId, org_id: orgId, item_id: QL1, item_name: w.desk, category: w.sys, quantity: 1, planned_from: null, planned_until: null, notes: null },
  ]
  const span = [`${day(23)}T00:00:00Z`, `${day(27)}T00:00:00Z`]
  const gearStatus = [
    { line_id: 'l1', item_id: SPK, quantity: 8, owned: 7, booked_elsewhere: 2, available: 5, starts_at: span[0], ends_at: span[1], weight_kg: 32, power_w: 1600 },
    { line_id: 'l2', item_id: XLR, quantity: 60, owned: 120, booked_elsewhere: 24, available: 96, starts_at: span[0], ends_at: span[1], weight_kg: 0.6, power_w: null },
    { line_id: 'l3', item_id: QL1, quantity: 1, owned: 1, booked_elsewhere: 0, available: 1, starts_at: span[0], ends_at: span[1], weight_kg: 25, power_w: 300 },
  ]
  const convs = [
    { id: gigChat, kind: 'gig', gig_id: gigId, gig_name: gig.name, other_user: null, other_name: null, last_message_at: ago(1), last_body: w.reply, last_kind: 'text', last_author: duarte, unread: 2, muted: false, archived: false, pinned: 0 },
    { id: direct, kind: 'direct', gig_id: null, gig_name: null, other_user: persona === 'pm' ? carla : ricardo, other_name: persona === 'pm' ? 'Carla Mendes' : 'Ricardo Bedulho', last_message_at: ago(3), last_body: null, last_kind: 'system', last_author: ricardo, unread: 1, muted: false, archived: false, pinned: 0 },
    ...(persona === 'pm' ? [{ id: orgChat, kind: 'org', gig_id: null, gig_name: null, org_id: orgId, org_name: 'Lumen and Pixel', title: w.general, department: null, other_user: null, other_name: null, last_message_at: ago(30), last_body: w.safety, last_kind: 'text', last_author: ricardo, unread: 0, muted: false, archived: false, pinned: 1 }] : []),
  ]
  const messages = {
    [gigChat]: [
      { id: 'g1', conversation_id: gigChat, author_id: ricardo, kind: 'text', body: w.welcome, attachments: [], mentions: [], created_at: ago(20) },
      { id: 'g2', conversation_id: gigChat, author_id: ricardo, kind: 'system', body: null, payload: { event: 'schedule', count: 3, items: [w.loadIn, w.soundcheck, w.show], day: day(24) }, created_at: ago(5) },
      { id: 'g3', conversation_id: gigChat, author_id: duarte, kind: 'text', body: w.reply, attachments: [], mentions: [], created_at: ago(1) },
    ],
    [direct]: [
      { id: 'm1', conversation_id: direct, author_id: ricardo, kind: 'system', payload: { event: 'availability', request_id: 'r1', gig_id: gigId, gig_name: gig.name, from: `${day(24)}T00:00:00Z`, until: `${day(26)}T00:00:00Z`, message: w.askMsg }, created_at: ago(3) },
    ],
  }
  const request = { id: 'r1', gig_id: gigId, org_id: orgId, person_id: carla, asked_by: ricardo, status: 'pending', message: w.askMsg, reply_note: null,
    starts_at: `${day(24)}T00:00:00Z`, ends_at: `${day(26)}T00:00:00Z`, created_at: ago(3), replied_at: null,
    gig_name: gig.name, venue: gig.venue, company: 'Lumen and Pixel', asked_by_name: 'Ricardo Bedulho' }


  // Warehouse, office and admin screens (guides H2b)
  const tx = (ptText, enText) => (lang === 'pt' ? ptText : enText)
  const V1 = 'aaaa0000-0000-4000-8000-000000000002'
  const locations = [
    { id: W1, org_id: orgId, name: w.warehouse, kind: 'warehouse', address: 'Rua da Cozinha Económica 30, Lisboa', archived_at: null },
    { id: V1, org_id: orgId, name: tx('Carrinha 1', 'Van 1'), kind: 'vehicle', address: null, archived_at: null },
  ]
  const units = Array.from({ length: 7 }, (_, i) => ({
    id: `cccc0000-0000-4000-8000-00000000000${i}`, org_id: orgId, item_id: SPK, code: `U-7KQ2M9X${'ABCDEFG'[i]}`, serial: `LA210-0${41 + i}`,
    location_id: i < 6 ? W1 : V1, status: i === 2 ? 'repair' : 'available', purchase_date: '2023-03-15', purchase_cost: 3400, depreciation_months: 72,
    case_unit_id: null, notes: null, price_items: { name: w.speaker },
  }))
  const movements = [
    { id: 3, org_id: orgId, item_id: XLR, kind: 'transfer', quantity: 24, from_location_id: W1, to_location_id: V1, note: null, created_by: ricardo, created_at: ago(30) },
    { id: 2, org_id: orgId, item_id: XLR, kind: 'purchase', quantity: 120, from_location_id: null, to_location_id: W1, note: tx('Importação', 'Import'), created_by: ricardo, created_at: ago(400) },
  ]
  const repairs = [
    { id: 'r1', org_id: orgId, item_id: SPK, unit_id: units[2].id, unit: { code: units[2].code }, quantity: 1, gig_id: gigId, gig: { name: gig.name }, status: 'in_repair', problem: tx('Grelha amolgada, driver a vibrar', 'Dented grille, rattling driver'), photo_path: null, repairer: 'AudioFix', cost: 85, charge_client: false, expected_back: day(4), created_at: ago(120) },
    { id: 'r2', org_id: orgId, item_id: XLR, unit_id: null, unit: null, quantity: 3, gig_id: null, gig: null, status: 'open', problem: tx('Fichas soltas', 'Loose connectors'), photo_path: null, repairer: null, cost: null, charge_client: false, expected_back: null, created_at: ago(20) },
    { id: 'r3', org_id: orgId, item_id: SPK, unit_id: units[1].id, unit: { code: units[1].code }, item: { name: w.speaker }, quantity: 1, gig_id: gigId, gig: { name: gig.name }, status: 'done', problem: tx('Grelha partida na descarga', 'Grille broken at the get-out'), photo_path: null, repairer: 'AudioFix', cost: 180, charge_client: true, invoice_id: null, invoice: null, expected_back: null, created_at: ago(90) },
  ]
  // Payments (step 12): the deposit paid in full, part of the final invoice paid
  const payments = [
    { id: 'pay1', org_id: orgId, invoice_id: 'inv1', paid_on: day(-12), amount: 782.28, method: 'transfer', note: null, removed_at: null, created_at: ago(290), created_by: ricardo },
    { id: 'pay2', org_id: orgId, invoice_id: 'inv2', paid_on: day(-3), amount: 500, method: 'mbway', note: tx('Primeira parte, o resto no fim do mês', 'First part, the rest at the end of the month'), removed_at: null, created_at: ago(70), created_by: ricardo },
  ]
  const due = [
    { item_id: SPK, item_name: w.speaker, inspection_kind: tx('Teste elétrico (PAT)', 'Electrical test (PAT)'), unit_id: units[0].id, unit_code: units[0].code, last_done: day(-370), last_result: 'pass', due_on: day(-5) },
    { item_id: SPK, item_name: w.speaker, inspection_kind: tx('Teste elétrico (PAT)', 'Electrical test (PAT)'), unit_id: units[1].id, unit_code: units[1].code, last_done: day(-355), last_result: 'pass', due_on: day(10) },
  ]
  const suppliers = [
    { id: 'sp1', org_id: orgId, name: 'Audiomatic', contact_name: 'Rui Costa', phone: '+351 912 000 000', email: 'rui@example.com', partner_org_id: null, archived_at: null },
  ]
  // Expenses (step 9b): starter categories, this month's costs, a claim by Carla waiting, a recurring rent
  const ym = new Date().toISOString().slice(0, 7)
  const cat = (id, key, kind, extra = {}) => ({ id, org_id: orgId, starter_key: key, name: null, kind, spread_months: null, vat_recoverable: true, sort: 0, archived_at: null, ...extra })
  const expenseCategories = [
    cat('ec1', 'hire_in', 'direct'), cat('ec2', 'freelance_crew', 'direct'), cat('ec3', 'transport_fuel', 'direct'), cat('ec4', 'tolls_parking', 'direct'),
    cat('ec5', 'meals_jobs', 'direct', { vat_recoverable: false }), cat('ec6', 'rent_utilities', 'overhead'), cat('ec7', 'insurance', 'overhead'),
    cat('ec8', 'software', 'overhead'), cat('ec9', 'equipment', 'capital', { spread_months: 60 }), cat('ec10', 'taxes_fees', 'tax_other'),
  ]
  const ex = (id, d, extra) => ({ id, org_id: orgId, status: 'confirmed', spent_on: `${ym}-${d}`, supplier_id: null, supplier: null, supplier_name: null, category_id: null, vat_rate: 23,
    currency: 'EUR', invoice_number: null, due_on: null, paid_on: null, paid_how: null, notes: null, receipt_path: null, receipt_name: null, gig_id: null, gig: null,
    subrental_id: null, repair_id: null, crew_fee_user_id: null, stock_movement_id: null, stock_unit_id: null, recurrence_id: null, claimed_by: null, review_note: null,
    removed_at: null, created_at: ago(48), updated_at: ago(48), ...extra, vat_amount: Math.round(extra.amount_net * (extra.vat_rate ?? 23)) / 100 })
  const expenses = [
    ex('ex1', '01', { description: tx('Renda do armazém', 'Warehouse rent'), supplier_name: tx('Imobiliária Tejo', 'Tejo Properties'), category_id: 'ec6', amount_net: 1200, paid_on: `${ym}-01`, paid_how: 'direct_debit', recurrence_id: 'rec1' }),
    ex('ex2', '02', { description: tx('Subaluguer de colunas', 'Speaker hire-in'), supplier_id: 'sp1', supplier: { name: 'Audiomatic', tax_id: null }, category_id: 'ec1', amount_net: 640, invoice_number: 'FT 2026/318', due_on: day(10), subrental_id: 'sr1', gig_id: gigId, gig: { name: 'Marcolino — Natal' } }),
    ex('ex3', '03', { description: tx('Gasóleo da carrinha', 'Diesel for the van'), supplier_name: 'Galp', category_id: 'ec3', amount_net: 81.3, paid_on: `${ym}-03`, paid_how: 'card', receipt_path: `${orgId}/ex3/r.jpg`, receipt_name: 'talao-galp.jpg' }),
    ex('ex4', '04', { description: tx('Mesa de mistura Yamaha DM3', 'Yamaha DM3 mixing desk'), supplier_name: 'Thomann', category_id: 'ec9', amount_net: 1890, paid_on: `${ym}-04`, paid_how: 'transfer' }),
    ex('ex5', '04', { description: tx('Licenças de software', 'Software licences'), supplier_name: 'Adobe', category_id: 'ec8', amount_net: 72.5, due_on: day(-2), invoice_number: 'IE-55120' }),
    ex('ex6', '05', { description: tx('Portagens A1', 'A1 tolls'), category_id: 'ec4', amount_net: 21.5, vat_rate: 23, gig_id: gigId, gig: { name: 'Marcolino — Natal' }, claimed_by: carla, status: 'claimed', receipt_path: `${orgId}/ex6/r.jpg`, receipt_name: 'via-verde.pdf' }),
    ex('ex7', '05', { description: tx('Seguro de equipamento', 'Equipment insurance'), supplier_name: 'Fidelidade', category_id: 'ec7', amount_net: 310, vat_rate: 0, status: 'draft', due_on: `${ym}-15`, recurrence_id: 'rec2' }),
  ]
  const expenseRecurrences = [
    { id: 'rec1', org_id: orgId, description: tx('Renda do armazém', 'Warehouse rent'), supplier_id: null, supplier_name: tx('Imobiliária Tejo', 'Tejo Properties'), category_id: 'ec6', amount_net: 1200, vat_rate: 23, currency: 'EUR', paid_how: 'direct_debit', notes: null, every: 'month', starts_on: '2026-01-01', ends_on: null, drafted: 11, next_on: day(26), removed_at: null },
    { id: 'rec2', org_id: orgId, description: tx('Seguro de equipamento', 'Equipment insurance'), supplier_id: null, supplier_name: 'Fidelidade', category_id: 'ec7', amount_net: 310, vat_rate: 0, currency: 'EUR', paid_how: 'transfer', notes: null, every: 'quarter', starts_on: '2026-02-05', ends_on: null, drafted: 4, next_on: day(90), removed_at: null },
  ]
  const clients = [
    { id: 'c1', org_id: orgId, name: 'Marcolino Produções', contact_name: 'Marta Lopes', email: 'marta@example.com', phone: '+351 913 000 000', address: null, tax_id: null, notes: null, archived_at: null },
    { id: 'c2', org_id: orgId, name: tx('Câmara Municipal de Sintra', 'Sintra Town Council'), contact_name: tx('Paulo Reis', 'Paulo Reis'), email: 'eventos@example.com', phone: '+351 219 000 000', address: null, tax_id: 'PT 505 000 002', notes: null, archived_at: null },
    { id: 'c3', org_id: orgId, name: 'Festival Lumière', contact_name: 'Inês Duarte', email: 'ines@example.com', phone: null, address: 'Porto', tax_id: null, notes: null, archived_at: null },
    { id: 'c4', org_id: orgId, name: 'Joana Silva', contact_name: null, email: 'joana.s@example.com', phone: '+351 936 000 000', address: null, tax_id: null, notes: tx('Casamento em junho', 'Wedding in June'), archived_at: null },
  ]
  const subrentals = [
    { id: 'sb1', org_id: orgId, supplier_id: 'sp1', supplier: { name: 'Audiomatic', partner_org_id: null }, gig_id: gigId, gig: { name: gig.name }, status: 'requested', starts_at: span[0], ends_at: span[1], reference: 'PO-118', notes: null,
      lines: [{ id: 'x1', item_id: SPK, description: w.speaker, quantity: 2, unit_cost: 40, position: 0 }] },
  ]
  const Lq = (id, kind, description, qty, unit, factor, unit_price, item_id) => ({ id, kind, description, details: '', qty, unit, factor, unit_price, discount_pct: 0, ...(item_id ? { item_id } : {}) })
  const quote = {
    id: 'q1', org_id: orgId, gig_id: gigId, number: 143, title: gig.name, status: 'accepted', language: lang, currency: 'EUR',
    client_id: 'c1', client_company: 'Marcolino Produções', client_name: 'Marta Lopes', client_email: 'marta@example.com', client_address: null, client_tax_id: null,
    issue_date: day(-10), valid_until: day(20), intro: null, terms: null, payment_terms: null, manager_name: 'Ricardo Bedulho',
    vat_rate: 23, discount_pct: 0, show_line_prices: true, version: 3, created_by: ricardo, total_net: 4280, created_at: ago(240), updated_at: ago(30),
    body: { phases: [
      { id: 'p1', name: tx('Montagem', 'Load-in'), start_date: day(24), start_time: '08:00', end_date: day(24), end_time: '16:00', discount_pct: 0, optional: false, sections: [
        { id: 's1', name: tx('Som', 'Audio'), lines: [Lq('a1', 'rental', w.speaker, 8, 'unit', 2, 60, SPK), Lq('a2', 'rental', w.desk, 1, 'unit', 2, 180, QL1)] },
        { id: 's2', name: tx('Equipa', 'Crew'), lines: [Lq('a3', 'crew', w.sound, 2, 'day', 2, 200)] },
      ] },
      { id: 'p2', name: tx('Espetáculo', 'Show'), start_date: day(24), start_time: '21:00', end_date: day(24), end_time: '23:00', discount_pct: 0, optional: false, sections: [] },
      { id: 'p3', name: tx('Desmontagem', 'Load-out'), start_date: day(25), start_time: '23:00', end_date: day(25), end_time: '03:00', discount_pct: 0, optional: false, sections: [] },
    ] },
  }
  // Invoices (step 11) for the accepted quote: a paid deposit, the rest issued and overdue, and a draft
  const invLine = (id, description, qty, price, vat) => ({ id, kind: 'rental', description, qty, unit_price: price, discount_pct: 0, vat_rate: vat })
  const invoices = [
    { id: 'inv1', org_id: orgId, number: 1, kind: 'invoice', credited_invoice_id: null, quote_id: 'q1', gig_id: gigId, client_id: 'c1', client_name: 'Marcolino Produções', client_tax_id: '509000000', client_address: 'Rua do Ouro 10, Lisboa', client_email: 'marta@example.com',
      scope: 'deposit', phase_ids: null, deposit_pct: 30, language: lang, currency: 'EUR', lines: [invLine('d1', tx('Adiantamento 30% · orçamento Q0143 · IVA 23%', 'Deposit 30% · quote Q0143 · VAT 23%'), 1, 636, 23)],
      net: 636, vat: 146.28, total: 782.28, notes: null, issue_date: day(-40), due_date: day(-10), status: 'paid', sent_at: ago(960), issued_at: ago(950), paid_on: day(-12),
      legal_number: 'FT 2026/41', pdf_url: 'https://example.com/ft-2026-41.pdf', provider: 'invoicexpress', provider_document_id: '41', client_reminded_at: null, removed_at: null, created_at: ago(970), updated_at: ago(300), quote: { id: 'q1', number: 143, title: gig.name, created_by: ricardo }, gig: { id: gigId, name: gig.name } },
    { id: 'inv2', org_id: orgId, number: 2, kind: 'invoice', credited_invoice_id: null, quote_id: 'q1', gig_id: gigId, client_id: 'c1', client_name: 'Marcolino Produções', client_tax_id: '509000000', client_address: 'Rua do Ouro 10, Lisboa', client_email: 'marta@example.com',
      scope: 'rest', phase_ids: null, deposit_pct: null, language: lang, currency: 'EUR', lines: [invLine('a1', w.speaker, 16, 60, 23), invLine('a2', w.desk, 2, 180, 23), invLine('a3', w.sound, 4, 200, 23), { ...invLine('less', tx('Menos adiantamento FT 2026/41', 'Less deposit FT 2026/41'), 1, -636, 23), kind: 'deposit' }],
      net: 1484, vat: 341.32, total: 1825.32, notes: null, issue_date: day(-35), due_date: day(-5), status: 'issued', sent_at: ago(850), issued_at: ago(840), paid_on: null,
      legal_number: 'FT 2026/44', pdf_url: 'https://example.com/ft-2026-44.pdf', provider: 'invoicexpress', provider_document_id: '44', client_reminded_at: null, removed_at: null, created_at: ago(860), updated_at: ago(840), quote: { id: 'q1', number: 143, title: gig.name, created_by: ricardo }, gig: { id: gigId, name: gig.name } },
    { id: 'inv3', org_id: orgId, number: 3, kind: 'invoice', credited_invoice_id: null, quote_id: 'q1', gig_id: gigId, client_id: 'c1', client_name: 'Marcolino Produções', client_tax_id: '509000000', client_address: 'Rua do Ouro 10, Lisboa', client_email: 'marta@example.com',
      scope: 'phases', phase_ids: ['p1'], deposit_pct: null, language: lang, currency: 'EUR', lines: [invLine('x1', tx('Transporte extra', 'Extra transport'), 120, 0.45, 23)],
      net: 54, vat: 12.42, total: 66.42, notes: null, issue_date: day(0), due_date: day(30), status: 'draft', sent_at: null, issued_at: null, paid_on: null,
      legal_number: null, pdf_url: null, provider: null, provider_document_id: null, client_reminded_at: null, removed_at: null, created_at: ago(2), updated_at: ago(2), quote: { id: 'q1', number: 143, title: gig.name, created_by: ricardo }, gig: { id: gigId, name: gig.name } },
  ]
  const versions = [
    { id: 'v2', quote_id: 'q1', version_no: 2, note: tx('Enviado para marta@example.com', 'Sent to marta@example.com'), total_net: 4280, created_at: ago(48), snapshot: quote },
    { id: 'v1', quote_id: 'q1', version_no: 1, note: tx('Antes de cortar o ecrã LED', 'Before cutting the LED wall'), total_net: 5120, created_at: ago(96), snapshot: quote },
  ]
  const priceList = [
    { id: 'pl3', org_id: orgId, name: w.sound, kind: 'crew', unit: 'day', unit_price: 200, category: tx('Equipa', 'Crew'), details: null, tracking: 'none' },
    { id: 'pl4', org_id: orgId, name: tx('Transporte', 'Transport'), kind: 'transport', unit: 'km', unit_price: 0.45, category: tx('Transporte', 'Transport'), details: null, tracking: 'none' },
  ]
  return {
    me, names, persona,
    user: { id: me, email: persona === 'pm' ? 'ricardo@example.com' : 'carla@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { full_name: names[me] }, app_metadata: {} },
    tables: {
      profiles: Object.keys(names).map(id => ({ id, full_name: names[id], phone: phones[id], language: lang, findable: 'managers', email_digest: true })),
      organisations: [org],
      org_members: persona === 'pm'
        ? [{ org_id: orgId, user_id: ricardo, role: 'admin', organisations: org, joined_at: '2026-01-10T10:00:00Z' }, { org_id: orgId, user_id: duarte, role: 'member', organisations: org }]
        : [],
      gigs: persona === 'pm' ? [gig] : [gig, jazz],
      gig_statuses: [
        { id: 'gs1', org_id: orgId, name: tx('Opção', 'Option'), colour: 'yellow', base_status: 'draft', position: 1, created_at: ago(300) },
        { id: 'gs2', org_id: orgId, name: tx('Confirmado', 'Confirmed'), colour: 'blue', base_status: 'confirmed', position: 2, created_at: ago(300) },
        { id: 'gs3', org_id: orgId, name: tx('Na estrada', 'On the road'), colour: 'green', base_status: 'active', position: 3, created_at: ago(300) },
        { id: 'gs4', org_id: orgId, name: tx('Faturado', 'Invoiced'), colour: 'sky', base_status: 'completed', position: 4, created_at: ago(300) },
      ],
      crew_rates: [
        { id: 'cr1', org_id: orgId, function_title: w.sound, user_id: null, day_rate: 220, half_day_rate: 130, hour_rate: null, created_at: ago(300) },
        { id: 'cr2', org_id: orgId, function_title: w.lights, user_id: null, day_rate: 200, half_day_rate: null, hour_rate: 30, created_at: ago(300) },
        { id: 'cr3', org_id: orgId, function_title: w.sound, user_id: carla, day_rate: 180, half_day_rate: null, hour_rate: null, created_at: ago(200) },
      ],
      crew_rate_factors: [{ org_id: orgId, overtime: 1.5, overtime_after_hours: 10, weekend: 1.25, night: 1.2, holiday: 2, night_from: '22:00:00', night_until: '07:00:00', km_rate: 0.36 }],
      gig_crew_fees: persona === 'pm' ? [{ gig_id: gigId, user_id: duarte, org_id: orgId, unit: 'fixed', rate: 300, quantity: 1, note: null }] : [],
      // Time registration (step 8): Carla's first day waiting, her second sent back, Duarte's approved
      time_entries: [
        { id: 'te1', gig_id: gigId, user_id: carla, org_id: orgId, work_date: day(24), start_time: '08:00:00', end_time: '00:30:00', break_minutes: 60, travel_minutes: 40, km: 36, note: null, status: 'submitted', review_note: null, split: null, cost: null, removed_at: null, gigs: { name: gig.name } },
        { id: 'te2', gig_id: gigId, user_id: carla, org_id: orgId, work_date: day(25), start_time: '09:00:00', end_time: '18:00:00', break_minutes: 30, travel_minutes: 40, km: 36, note: null, status: 'returned', review_note: tx('A desmontagem acabou às 20:00', 'Load-out finished at 20:00'), split: null, cost: null, removed_at: null, gigs: { name: gig.name } },
        { id: 'te3', gig_id: gigId, user_id: duarte, org_id: orgId, work_date: day(24), start_time: '09:00:00', end_time: '23:00:00', break_minutes: 60, travel_minutes: 0, km: 0, note: null, status: 'approved', review_note: null, split: { normal: 9, overtime: 3, night: 1, weekend: 0, holiday: 0, worked: 13, travel: 0, km: 0 }, fee_unit: 'fixed', fee_rate: 300, cost: 0, removed_at: null, gigs: { name: gig.name } },
      ].filter(e => persona === 'pm' || e.id === 'te2'),
      org_holidays: [{ id: 'h1', org_id: orgId, day: '2026-06-13', name: 'Santo António' }],
      custom_fields: [
        { id: 'cf1', org_id: orgId, entity: 'gig', label: tx('N.º de encomenda', 'PO number'), kind: 'text', choices: [], position: 1, created_at: ago(200) },
        { id: 'cf2', org_id: orgId, entity: 'gig', label: tx('Lotação', 'Venue capacity'), kind: 'number', choices: [], position: 2, created_at: ago(200) },
        { id: 'cf3', org_id: orgId, entity: 'gig', label: tx('Seguro verificado', 'Insurance checked'), kind: 'yes_no', choices: [], position: 3, created_at: ago(200) },
        { id: 'cf4', org_id: orgId, entity: 'gig', label: tx('Espaço', 'Setting'), kind: 'choice', choices: [tx('Interior', 'Indoor'), tx('Exterior', 'Outdoor')], position: 4, created_at: ago(200) },
        { id: 'cf5', org_id: orgId, entity: 'client', label: tx('Isento de IVA', 'VAT exempt'), kind: 'yes_no', choices: [], position: 1, created_at: ago(200) },
      ],
      gig_types: [
        { id: 'gt1', org_id: orgId, name: tx('Festival', 'Festival'), colour: 'purple', position: 1, created_at: ago(300) },
        { id: 'gt2', org_id: orgId, name: tx('Empresa', 'Corporate'), colour: 'orange', position: 2, created_at: ago(300) },
      ],
      gig_members: myGigs.concat(members.filter(m => !myGigs.some(x => x.gig_id === m.gig_id && x.user_id === m.user_id))),
      gig_schedule: schedule,
      assets,
      gig_invites: persona === 'pm' ? [{ id: 'i1', gig_id: gigId, email: 'joana.r@example.com', role: 'crew', function_title: w.stage, call_time: '08:00', created_at: ago(30) }] : [],
      gig_positions: [],
      availability_requests: persona === 'pm' ? [] : [request],
      // Leave (step 9): Carla's own dates; for Ricardo (admin), Duarte's request waiting and his own approved days
      crew_unavailability: persona === 'pm' ? [
        { id: 'lv1', user_id: duarte, org_id: orgId, type: 'holiday', status: 'requested', start_date: day(30), end_date: day(34), start_half: false, end_half: false, days: 5, note: tx('Casamento da minha irmã', 'My sister’s wedding'), removed_at: null, created_at: ago(20) },
        { id: 'lv2', user_id: ricardo, org_id: orgId, type: 'training', status: 'approved', start_date: day(12), end_date: day(12), start_half: false, end_half: true, days: 0.5, note: null, removed_at: null, created_at: ago(200) },
      ] : [{ id: 'u1', user_id: carla, org_id: null, type: 'holiday', status: 'approved', start_date: day(50), end_date: day(57), start_half: false, end_half: false, days: 8, note: w.holiday, removed_at: null, created_at: ago(100) }],
      notifications: persona === 'pm' ? [] : [{ id: 1, user_id: carla, org_id: orgId, gig_id: gigId, actor_id: ricardo, kind: 'availability_request', details: { gig_name: gig.name, from: `${day(24)}T00:00:00Z`, until: `${day(26)}T00:00:00Z` }, read_at: null, created_at: ago(3) }],
      gig_equipment: gear,
      tasks: [
        { id: 't1', gig_id: gigId, org_id: orgId, title: tx('Fita nos cabos do palco ao FOH', 'Tape the stage-to-FOH cable run'), notes: '', assignee_id: carla, due_on: day(24), checklist: [{ id: 'a', text: tx('Lado esquerdo', 'Stage left'), done: true }, { id: 'b', text: tx('Corredor central', 'Centre aisle'), done: false }, { id: 'c', text: 'FOH', done: false }], status: 'open', source_kind: null, source_id: null, created_by: ricardo, created_at: ago(30), removed_at: null },
        { id: 't2', gig_id: gigId, org_id: orgId, title: tx('Confirmar gerador com o Coliseu', 'Confirm the generator with the venue'), notes: '', assignee_id: ricardo, due_on: day(-1), checklist: [], status: 'open', source_kind: null, source_id: null, created_by: ricardo, created_at: ago(60), removed_at: null },
        { id: 't3', gig_id: gigId, org_id: orgId, title: tx('Q14 · Seguidor atrasado na entrada do coro', 'Q14 · Follow spot late on the chorus entrance'), notes: '', assignee_id: carla, due_on: null, checklist: [], status: 'open', source_kind: 'rehearsal_note', source_id: 'rn1', created_by: ricardo, created_at: ago(5), removed_at: null },
        { id: 't4', gig_id: gigId, org_id: orgId, title: tx('Imprimir folhas de serviço', 'Print the call sheets'), notes: '', assignee_id: null, due_on: day(20), checklist: [], status: 'done', done_by: ricardo, done_at: ago(2), source_kind: null, source_id: null, created_by: ricardo, created_at: ago(90), removed_at: null },
        // The organisation's own: an office job and a repair
        { id: 't5', gig_id: null, org_id: orgId, title: tx('Renovar o seguro da carrinha', 'Renew the van insurance'), notes: '', assignee_id: ricardo, due_on: day(6), checklist: [], status: 'open', source_kind: null, source_id: null, repair_id: null, created_by: ricardo, created_at: ago(200), removed_at: null },
        { id: 't6', gig_id: null, org_id: orgId, title: tx('XLR 10 m — fichas soltas', 'XLR 10 m — loose connectors'), notes: '', assignee_id: duarte, due_on: day(2), checklist: [], status: 'open', source_kind: null, source_id: null, repair_id: 'r2', created_by: ricardo, created_at: ago(50), removed_at: null },
      ].map(x => (x.gig_id ? { ...x, gigs: { id: gigId, name: gig.name } } : x)),
      task_templates: [
        { id: 'tp1', org_id: orgId, name: tx('Verificação da carrinha', 'Van check'), notes: '', items: tx(['Pneus', 'Cintas', 'Combustível', 'Extintor'], ['Tyres', 'Straps', 'Fuel', 'Fire extinguisher']), updated_at: ago(400) },
        { id: 'tp2', org_id: orgId, name: tx('Desmontagem', 'Load-out'), notes: '', items: tx(['Cabos enrolados e contados', 'Flight cases fechados', 'Palco limpo', 'Fotografias do local'], ['Cables coiled and counted', 'Flight cases shut', 'Stage swept', 'Photos of the venue']), updated_at: ago(300) },
      ],
      rehearsal_sessions: [{ id: 'rs1', gig_id: gigId, name: tx('Passagem 2', 'Run-through 2'), fps: 25, frame_count: 'ndf', clock: 'stopwatch', running: true, anchor_at: ago(0.4), anchor_ms: 0, clock_set_by: ricardo, created_by: ricardo, created_at: ago(13), ended_at: null, removed_at: null }],
      rehearsal_notes: [
        { id: 'rn1', session_id: 'rs1', gig_id: gigId, client_id: 'c1', author_id: ricardo, tc_ms: 95000, department: 'lighting', priority: 'fix', cue: 'Q14', body: tx('Seguidor atrasado na entrada do coro', 'Follow spot late on the chorus entrance'), assignee_id: carla, status: 'open', created_at: ago(10), removed_at: null },
        { id: 'rn2', session_id: 'rs1', gig_id: gigId, client_id: 'c2', author_id: carla, tc_ms: 212000, department: 'sound', priority: 'urgent', cue: tx('Música 3', 'Song 3'), body: tx('Feedback no monitor 4 no fim do solo', 'Feedback on wedge 4 at the end of the solo'), assignee_id: null, status: 'open', created_at: ago(7), removed_at: null },
        { id: 'rn3', session_id: 'rs1', gig_id: gigId, client_id: 'c3', author_id: ricardo, tc_ms: 340000, department: 'stage', priority: 'note', cue: null, body: tx('Praticável do baterista 10 cm para a esquerda', 'Move the drum riser 10 cm stage left'), assignee_id: null, status: 'done', done_by: carla, created_at: ago(4), removed_at: null },
      ],
      gig_tools: [{ gig_id: gigId, tool: 'input_list', created_at: ago(300) }, { gig_id: gigId, tool: 'stage_plot', created_at: ago(310) }, { gig_id: gigId, tool: 'patch', created_at: ago(320) }, { gig_id: gigId, tool: 'dmx_patch', created_at: ago(330) }, { gig_id: gigId, tool: 'light_plot', created_at: ago(340) }, { gig_id: gigId, tool: 'system_calc', created_at: ago(350) }],
      gig_show: [{ gig_id: gigId, stage: { width_m: 10, depth_m: 6 }, audio: { boxes: [{ name: 'SB1', inputs: 8, split: true }, { name: 'SB2', inputs: 4, split: false }] },
        lighting: {
          supply: { volts: 230, phases: 3, amps: 16 },
          bars: [
            { id: 'bar1', name: tx('Truss frontal', 'Front truss'), kind: 'truss', x: 5, y: -1.5, length: 10, rotation: 0, height: 6.5, phase: 1 },
            { id: 'bar2', name: tx('Fundo do palco', 'Upstage'), kind: 'pipe', x: 5, y: 5.5, length: 8, rotation: 0, height: 5, phase: 2 },
            { id: 'bar3', name: tx('Chão', 'Floor'), kind: 'floor', x: 5, y: 0.5, length: 6, rotation: 0, height: 0, phase: 3 },
          ],
        },
        system: {
          temp_c: 18, haas_ms: 10, ear_m: 1.2,
          sources: [
            { id: 'src1', name: tx('Principal E', 'Main L'), kind: 'main', x: -1, y: 0, height: 7, spl: 140, angle: 100, count: 8 },
            { id: 'src2', name: tx('Principal D', 'Main R'), kind: 'main', x: 11, y: 0, height: 7, spl: 140, angle: 100, count: 8 },
            { id: 'src3', name: 'Subs', kind: 'sub', x: 5, y: -0.5, height: 0.5, spl: 137, angle: 180, count: 6 },
            { id: 'src4', name: tx('Delay E', 'Delay L'), kind: 'delay', x: 1, y: -32, height: 5, spl: 132, angle: 90, count: 4 },
            { id: 'src5', name: tx('Delay D', 'Delay R'), kind: 'delay', x: 9, y: -32, height: 5, spl: 132, angle: 90, count: 4 },
          ],
          listeners: [
            { id: 'lis1', name: tx('Régie', 'FOH'), x: 5, y: -22 },
            { id: 'lis2', name: tx('Fundo da sala', 'Back of the room'), x: 5, y: -45 },
          ],
        } }],
      gig_fixtures: [
        ...[1, 2, 3, 4, 5, 6].map(n => ({ id: `fx${n}`, gig_id: gigId, name: `Spot ${n}`, fixture_type: 'MAC Encore Performance', mode: 'Extended', footprint: 14, universe: 1, address: 1 + (n - 1) * 14, position: tx('Truss frontal', 'Front truss'), item_id: null, notes: null, sort: n, power_w: 470, weight_kg: 13.5, symbol: null, plot_x: null, plot_y: null })),
        ...[1, 2, 3, 4].map(n => ({ id: `fw${n}`, gig_id: gigId, name: `Wash ${n}`, fixture_type: 'LED par', mode: '7ch', footprint: 7, universe: 1, address: n === 4 ? 99 : 85 + (n - 1) * 7, position: tx('Chão', 'Floor'), item_id: null, notes: null, sort: 10 + n, power_w: 180, weight_kg: 4, symbol: null, plot_x: null, plot_y: null })),
        { id: 'fh1', gig_id: gigId, name: 'Haze', fixture_type: 'Hazer', mode: null, footprint: 2, universe: 2, address: 1, position: tx('Fundo do palco', 'Upstage'), item_id: null, notes: null, sort: 20, power_w: 1200, weight_kg: 20, symbol: null, plot_x: null, plot_y: null },
      ],
      gig_plot_items: [
        ['riser', null, 5, 4.5, 0], ['drum_kit', null, 5, 4.5, 0], ['bass_amp', 'Rui', 2.5, 4.25, 0], ['guitar_amp', 'Marta', 7.5, 4.25, 0],
        ['keyboard', null, 8.25, 2.5, 90], ['vocal_mic', 'Ana', 5, 1.5, 0], ['vocal_mic', 'Marta', 7, 1.75, 0],
        ['wedge', null, 5, 0.5, 180], ['wedge', null, 7, 0.75, 180], ['power', null, 0.5, 5.5, 0],
      ].map(([kind, label, x, y, rotation], n) => ({ id: `pl${n + 1}`, gig_id: gigId, kind, label, x, y, rotation, item_id: null, notes: null, created_at: ago(300 - n) })),
      gig_inputs: [
        [tx('Bombo dentro', 'Kick in'), 'Beta 91A', null, true, 'SB1-01'],
        [tx('Bombo fora', 'Kick out'), 'D6', tx('girafa curta', 'short boom'), false, 'SB1-02'],
        [tx('Tarola cima', 'Snare top'), 'SM57', tx('girafa curta', 'short boom'), false, 'SB1-03'],
        ['Hi-hat', 'KM184', tx('girafa', 'boom'), true, 'SB1-04'],
        [tx('Overhead esq.', 'Overhead L'), 'KM184', tx('girafa alta', 'tall boom'), true, 'SB1-05'],
        [tx('Overhead dir.', 'Overhead R'), 'KM184', tx('girafa alta', 'tall boom'), true, 'SB1-06'],
        [tx('Baixo DI', 'Bass DI'), 'BSS AR-133', null, true, 'SB1-07'],
        [tx('Voz principal', 'Lead vocal'), 'SM58', tx('reto', 'straight'), false, null],
      ].map(([source, mic, stand, phantom, box], n) => ({ id: `in${n + 1}`, gig_id: gigId, channel: n + 1, source, mic, stand, phantom, stage_box: box, notes: n === 7 ? tx('Sem fios de reserva no SB2-02', 'Spare wireless on SB2-02') : null, item_id: null, plot_ref: null, checked: n < 3 })),
      price_items: items.concat(priceList),
      stock_locations: locations,
      import_presets: [],
      import_batches: [{ id: 'imp1', org_id: orgId, kind: 'locations', file_name: 'rentman-warehouses.csv', preset: null, created: 2, updated: 0, unchanged: 0, skipped: 0, created_at: ago(72), undone_at: null }],
      stock_units: units,
      stock_movements: movements,
      repairs,
      inspections: [],
      suppliers,
      clients,
      expense_categories: expenseCategories,
      expenses: persona === 'pm' ? expenses : expenses.filter(e => e.claimed_by === carla),
      expense_recurrences: expenseRecurrences,
      org_finance_settings: [{ org_id: orgId, recovers_vat: true }],
      subrentals,
      quotes: [{ ...quote, organisations: org }],
      invoices: persona === 'pm' ? invoices : [],
      invoice_payments: persona === 'pm' ? payments : [],
      quote_versions: versions,
      quote_shares: [{ id: 'sh1', status: 'accepted', sent_to: 'marta@example.com', emailed: true, created_at: ago(48), expires_at: `${day(28)}T00:00:00Z`, viewed_at: ago(40), responded_at: ago(30), responder_name: 'Marta Lopes', responder_note: null, quote_versions: { version_no: 2 } }],
      quote_templates: [],
      org_branding: [{ org_id: orgId, legal_name: 'Lumen and Pixel, Lda', tax_id: '500000000', address: 'Lisboa', phone: '+351 210 000 000', website: 'lumenandpixel.com', default_vat: 23, validity_days: 30, default_terms: null, brand_color: '#33FB31' }],
      crew_profiles: [{ user_id: me, enabled: true, visibility: 'companies', headline: tx('Técnica de som, FOH e monitores, festivais e digressões', 'Sound engineer, FOH and monitors, festivals and tours'),
        functions: ['foh_engineer', 'monitor_engineer', 'system_tech'], other_functions: null, bio: null, base_place: 'Lisboa, Portugal', base_country: 'PT', base_lat: 38.72, base_lng: -9.14,
        travel_scope: 'europe', travel_km: null, languages: ['en', 'es', 'pt'], experience_years: 12, links: ['https://example.com/carla'],
        certificates: [{ name: 'IPAF 3a', issuer: 'IPAF', expires_on: '2027-05-01' }, { name: tx('Primeiros socorros', 'First aid'), expires_on: '2026-03-01' }] }],
      crew_saved_searches: persona === 'pm' ? [
        { id: 'ss1', org_id: orgId, name: tx('Riggers perto do Porto', 'Riggers near Porto'), filters: { fn: 'rigger', km: 50, place: { label: 'Porto, Portugal', place: 'Porto, Portugal', country: 'PT', lat: 41.15, lng: -8.61 } }, alert: true, created_at: ago(900), removed_at: null },
        { id: 'ss2', org_id: orgId, name: tx('Luz com grandMA3', 'Lighting, grandMA3'), filters: { fn: 'lighting_op', text: 'grandMA3' }, alert: false, created_at: ago(500), removed_at: null },
      ] : [],
      job_posts: persona === 'pm' ? [
        { id: 'jpo1', org_id: orgId, gig_id: gigId, title: 'Rigger', function_key: 'rigger', quantity: 2, starts_on: day(24), ends_on: day(25), place: 'Lisboa, Portugal', country: 'PT',
          languages: ['pt'], certificate: 'IPAF 3a', description: null, pay_mode: 'ask_rate', pay_amount: null, pay_max: null, pay_per: 'day', currency: 'EUR', status: 'open', created_at: ago(30), gigs: { name: 'Marcolino — Natal' } },
      ] : [],
      held_invites: persona === 'pm' ? [
        { id: 'h1', org_id: orgId, email: 'pedro.alves@example.com', full_name: 'Pedro Alves', phone: '+351 914 000 000', functions: tx('Técnico de som', 'Sound engineer'), role: 'viewer', status: 'held', import_file: 'rentman-crew.xlsx' },
        { id: 'h2', org_id: orgId, email: 'sofia.m@example.com', full_name: 'Sofia Martins', phone: null, functions: tx('Luz, rigging', 'Lighting, rigging'), role: 'viewer', status: 'held', import_file: 'rentman-crew.xlsx' },
        { id: 'h3', org_id: orgId, email: 'tiago@example.com', full_name: 'Tiago Rocha', phone: null, functions: tx('Planeamento', 'Planning'), role: 'member', status: 'held', import_file: 'rentman-crew.xlsx' },
      ] : [],
      org_invites: persona === 'pm' ? [{ id: 'oi1', org_id: orgId, email: 'joana.r@example.com', role: 'member', created_at: ago(5) }] : [],
      org_mutes: [],
      reservations: [],
      stock_levels: [
        { org_id: orgId, item_id: XLR, location_id: W1, quantity: 120, in_repair: 0 }, { org_id: orgId, item_id: PWC, location_id: W1, quantity: 40, in_repair: 0 },
        { org_id: orgId, item_id: SPK, location_id: W1, quantity: 7, in_repair: 0 }, { org_id: orgId, item_id: QL1, location_id: W1, quantity: 1, in_repair: 0 },
      ],
      messages: Object.values(messages).flat(),
      conversations: convs.map(c => ({ id: c.id, kind: c.kind, gig_id: c.gig_id, org_id: c.org_id || null, title: c.title || null, department: null, audience: c.kind === 'org' ? 'everyone' : null, admins_post: c.kind === 'org', archived_at: null, gigs: c.gig_id ? { name: gig.name } : null, organisations: c.org_id ? { name: 'Lumen and Pixel' } : null })),
      conversation_members: [{ user_id: carla }, { user_id: ricardo }, { user_id: duarte }],
      conversation_state: [{ muted: false }],
    },
    rpc: {
      my_gig_companies: persona === 'pm' ? [{ org_id: orgId, name: 'Lumen and Pixel' }] : [{ org_id: orgId, name: 'Lumen and Pixel' }, { org_id: otherOrg, name: 'SoundWorks Lisboa' }],
      my_availability_requests: persona === 'pm' ? [] : [request],
      my_unread_counts: [],
      time_settings: { factors: { overtime: 1.5, overtime_after_hours: 10, weekend: 1.25, night: 1.2, holiday: 2, night_from: '22:00', night_until: '07:00', km_rate: 0.36 }, holidays: [{ day: '2026-06-13', name: 'Santo António' }] },
      calendar_feed: '7c1e9a4b'.repeat(8),
      list_jobs: { needs_profile: false, total: 2, more: false, results: [
        { id: 'jp1', org_name: 'Palco Norte, Lda', verified: true, verified_name: 'PALCO NORTE - PRODUCOES LDA', title: tx('Rigger', 'Rigger'), function_key: 'rigger', quantity: 2, starts_on: day(30), ends_on: day(31),
          place: 'Porto, Portugal', country: 'PT', km: 4, languages: ['pt'], certificate: 'IPAF 3a', description: tx('Montagem de truss num festival ao ar livre. Entrada às 8:00.', 'Truss build at an open-air festival. Call 8:00.'),
          pay_mode: 'fixed', pay_amount: 180, pay_max: null, pay_per: 'day', currency: 'EUR', my_status: null },
        { id: 'jp2', org_name: 'Lumen and Pixel', verified: false, title: tx('Técnico de monitores', 'Monitor engineer'), function_key: 'monitor_engineer', quantity: 1, starts_on: day(45), ends_on: day(45),
          place: 'Braga, Portugal', country: 'PT', km: 49, languages: ['en', 'pt'], certificate: null, description: null,
          pay_mode: 'ask_rate', pay_amount: null, pay_max: null, pay_per: 'day', currency: 'EUR', my_status: 'applied' },
      ] },
      my_job_applications: [],
      job_applicants: [
        { id: 'ja1', user_id: 'cp1', status: 'applied', message: tx('IPAF 3a, nove anos de festivais. Posso chegar na véspera.', 'IPAF 3a, nine years of festivals. I can arrive the day before.'),
          day_rate: 180, currency: 'EUR', name: 'Rui Teixeira', worked_with: true, profile: { headline: tx('Rigger e técnico de palco, festivais', 'Rigger and stagehand, festivals'), functions: ['rigger', 'stagehand'],
          base_place: 'Porto, Portugal', base_country: 'PT', travel_scope: 'km', travel_km: 250, languages: ['en', 'pt'], experience_years: 9, certificates: [{ id: 'ce1', name: 'IPAF 3a', expires_on: '2027-05-01', verified: true }, { id: 'ce2', name: tx('Primeiros socorros', 'First aid'), expires_on: '2026-12-31' }], links: [] } },
      ],
      search_crew: { total: 2, more: false, results: [
        { user_id: 'cp1', name: 'Rui Teixeira', headline: tx('Rigger e técnico de palco, festivais', 'Rigger and stagehand, festivals'), functions: ['rigger', 'stagehand'], base_place: 'Porto, Portugal', base_country: 'PT',
          travel_scope: 'km', travel_km: 250, languages: ['en', 'pt'], experience_years: 9, certificates: [{ id: 'ce1', name: 'IPAF 3a', issuer: 'IPAF', expires_on: '2027-05-01', verified: true }], links: [], km: 4, worked_with: 0, free: true, contact_from: 'any' },
        { user_id: 'cp2', name: 'Inês Lopes', headline: tx('Operadora de luz, grandMA3', 'Lighting operator, grandMA3'), functions: ['lighting_op', 'rigger'], base_place: 'Braga, Portugal', base_country: 'PT',
          travel_scope: 'country', travel_km: null, languages: ['en', 'es', 'pt'], experience_years: 6, certificates: [{ id: 'ce3', name: tx('Trabalho em altura', 'Working at height'), expires_on: '2028-03-01', confirmed_by: [{ org_id: 'o-palco', name: 'Palco Norte, Lda' }] }], links: [], km: 49, worked_with: 2, free: false, contact_from: 'known' },
      ] },
      trust_queue_count: null,
      trust_queue: {
        verifications: [{ id: 'v1', org_id: 'o-nordic', org_name: 'Nordic Stage AS', legal_name: 'Nordic Stage AS', tax_id: 'NO 912 345 678', website: 'nordicstage.example',
          note: tx('Registada na Noruega com o n.º 912 345 678 (Brønnøysund).', 'Registered in Norway as 912 345 678 (Brønnøysund).'), requested_by: 'Kari Nordmann', created_at: ago(200) }],
        verified: [{ org_id: 'o-palco', org_name: 'Palco Norte, Lda', verified_name: 'PALCO NORTE - PRODUCOES LDA', verified_method: 'vies', verified_at: ago(5000) }],
        proofs: [{ id: 'pr1', user_id: 'cp1', name: 'Rui Teixeira', cert_name: 'IPAF 3a', expires_on: '2027-05-01', path: 'cp1/ce1/1.pdf', created_at: ago(90) }],
        reports: [{ id: 'r1', target_kind: 'job', target_user: null, target_name: null, target_post: 'jx', post_title: tx('Ajudantes, pagamento em exposição', 'Helpers, paid in exposure'),
          post_description: tx('Sem pagamento, boa experiência.', 'No pay, great experience.'), org_id: 'o-x', org_name: 'Eventos Rápidos', reason: 'spam', note: null, reporter: 'Inês Lopes', created_at: ago(40), profile: null, org_suspended: false }],
        suspended_orgs: [], suspended_profiles: [],
      },
      org_leave_calendar: persona === 'pm' ? [
        { id: 'lv3', user_id: ana, full_name: 'Ana Costa', type: 'holiday', status: 'approved', start_date: day(1), end_date: day(3), start_half: false, end_half: false, days: 3, note: null },
        { id: 'lv4', user_id: duarte, full_name: 'Duarte Silva', type: 'sick', status: 'approved', start_date: day(0), end_date: day(0), start_half: false, end_half: false, days: 1, note: null },
        { id: 'lv2', user_id: ricardo, full_name: 'Ricardo Bedulho', type: 'training', status: 'approved', start_date: day(2), end_date: day(2), start_half: false, end_half: true, days: 0.5, note: null },
      ] : [],
      leave_balances: persona === 'pm' ? [
        { user_id: ana, full_name: 'Ana Costa', role: 'admin', allowance: 22, own_allowance: null, carried: 2, used: 9, asked: 0, left_days: 15, work_days: [1, 2, 3, 4, 5], hours_per_day: 8 },
        { user_id: duarte, full_name: 'Duarte Silva', role: 'member', allowance: 22, own_allowance: null, carried: 0, used: 11, asked: 5, left_days: 11, work_days: [1, 2, 3, 4], hours_per_day: 9 },
        { user_id: ricardo, full_name: 'Ricardo Bedulho', role: 'admin', allowance: 25, own_allowance: 25, carried: 0, used: 14.5, asked: 0, left_days: 10.5, work_days: [1, 2, 3, 4, 5], hours_per_day: 8 },
      ] : [],
      my_clashes: [],
      gig_clashes: persona === 'pm' ? [{ user_id: duarte, kind: 'booked', status: 'confirmed', starts_at: `${day(24)}T00:00:00Z`, ends_at: `${day(25)}T00:00:00Z`, gig_id: null, label: null, company: null, role_label: null }] : [],
      email_clashes: [],
      my_inbox: convs,
      gig_conversation: gigChat,
      read_conversation: null,
      gig_departments: [],
      network_search: [
        { user_id: ana, full_name: 'Ana Costa', functions: [w.stage], gigs_together: 6, last_together: day(-30), busy: false, already: false },
        { user_id: carla, full_name: 'Carla Mendes', functions: [w.sound], gigs_together: 4, last_together: day(-60), busy: false, already: true },
      ],
      gig_equipment_status: gearStatus,
      gig_dispatch_summary: [
        { item_id: SPK, item_name: w.speaker, category: w.sys, tracking: 'serial', planned: 8, out_qty: 6, back_qty: 0, packing_note: null },
        { item_id: XLR, item_name: w.cables, category: w.cab, tracking: 'bulk', planned: 60, out_qty: 60, back_qty: 0, packing_note: null },
        { item_id: QL1, item_name: w.desk, category: w.sys, tracking: 'serial', planned: 1, out_qty: 0, back_qty: 0, packing_note: null },
      ],
      dispatch_scan: { ok: true, kind: 'unit', item_name: w.speaker, unit_code: 'U-7KQ2M9XG', serial: units[0].serial, planned: 8, out: 7, back: 0, batch: 'b1' },
      step_scan: { ok: true, kind: 'unit', step: 'prepped', item_name: w.speaker, unit_code: 'U-7KQ2M9XG', serial: units[0].serial, done: 8, planned: 8, batch: 'b2' },
      undo_scan: { ok: true, rows: 1 },
      // Where the gear is: everything prepped, most of it out, nothing back yet
      gig_step_summary: [
        ...['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in'].map((step, i) => ({ item_id: SPK, step, done: [8, 6, 6, 0, 0, 0][i] })),
        ...['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in'].map((step, i) => ({ item_id: XLR, step, done: [60, 60, 40, 0, 0, 0][i] })),
        ...['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in'].map((step, i) => ({ item_id: QL1, step, done: [1, 0, 0, 0, 0, 0][i] })),
      ],
      gig_units_out: units.slice(0, 2).map(u => ({ unit_id: u.id, item_id: SPK, item_name: w.speaker, code: u.code, serial: u.serial, out_since: ago(10) })),
      maintenance_due: due,
      incoming_hire_requests: [],
      partner_code: 'P-7KQ2M9XA',
      item_bookings: [],
      org_member_list: [
        { user_id: ricardo, full_name: 'Ricardo Bedulho', email: 'ricardo@example.com', role: 'admin', joined_at: '2026-01-10T10:00:00Z' },
        { user_id: ana, full_name: 'Ana Costa', email: 'ana@example.com', role: 'admin', joined_at: '2026-02-01T10:00:00Z' },
        { user_id: duarte, full_name: 'Duarte Silva', email: 'duarte@example.com', role: 'member', joined_at: '2026-03-01T10:00:00Z' },
        { user_id: carla, full_name: 'Carla Mendes', email: 'carla@example.com', role: 'viewer', joined_at: '2026-04-01T10:00:00Z' },
      ],
      equipment_availability: [
        { item_id: SPK, owned: 7, booked: 2, available: 5 }, { item_id: XLR, owned: 120, booked: 24, available: 96 },
        { item_id: PWC, owned: 40, booked: 0, available: 40 }, { item_id: QL1, owned: 1, booked: 0, available: 1 },
      ],
      announcement_status: [],
      ensure_expense_categories: 0,
      draft_recurring_expenses_now: 0,
      supplier_spend: [{ supplier_id: 'sp1', supplier_name: 'Audiomatic', currency: 'EUR', expenses: 3, net: 2140, total: 2632.2, unpaid: 787.2 }],
      // Reports (K1): sample answers for report_overview, report_revenue_lines and equipment_report
      report_overview: { today: day(0), gigs_this_month: { total: 6, confirmed: 4 }, revenue_next_30: { EUR: 18450 },
        waiting: { count: 3, totals: { EUR: 9720 } }, equipment_use_90: 0.38,
        margin_this_month: { EUR: 5420 }, margin_pct_this_month: 29.4, negative_margin: 1,
        revenue_this_month: { EUR: 17480 }, revenue_month_last_year: { EUR: 14920 }, margin_pct_year: 47.6,
        operating_result_year: { EUR: 21340 }, negative_margin_year: 4,
        overdue_now: { EUR: 8610 }, overdue_count: 4, cash_in_30: { EUR: 12300 }, expenses_due_14: { EUR: 4380 }, revenue_next_3m: { EUR: 51580 } },
      finance_results: financeResults,
      cash_report: cashReport,
      client_balance: clientBalance,
      spending: spendingAnswer,
      revenue_forecast: revenueForecast,
      target_progress: targetProgress,
      // K4: Reports → Sales and the client numbers card
      report_overview_k4: { follow_up: { count: 2, totals: { EUR: 6380 } }, win_rate_90: { decided: 13, by_count: 0.62, by_value: 0.57, currency: 'EUR' },
        top_client_year: { key: 'c1', name: 'Marcolino Produções', currency: 'EUR', amount: 28640, share: 0.31 } },
      sales_waiting: [
        { quote_id: 'q1', quote_number: 41, title: gig.name, client_key: 'c1', client_name: 'Marcolino Produções', author_id: ricardo, author_name: 'Ricardo Bedulho', currency: 'EUR', value: 4860, sent_on: day(-12), days_waiting: 12, valid_until: day(4), days_left: 4, opened: true, last_viewed_at: ago(3000), expiring: true, expired: false, follow_up: true },
        { quote_id: 'q2', quote_number: 43, title: tx('Gala de fim de ano', 'End-of-year gala'), client_key: 'c2', client_name: tx('Câmara Municipal de Sintra', 'Sintra Town Council'), author_id: duarte, author_name: 'Duarte Silva', currency: 'EUR', value: 1520, sent_on: day(-9), days_waiting: 9, valid_until: day(21), days_left: 21, opened: false, last_viewed_at: null, expiring: false, expired: false, follow_up: true },
        { quote_id: 'q3', quote_number: 45, title: tx('Casamento Joana', 'Joana\'s wedding'), client_key: 'c4', client_name: 'Joana Silva', author_id: ricardo, author_name: 'Ricardo Bedulho', currency: 'EUR', value: 3340, sent_on: day(-3), days_waiting: 3, valid_until: day(27), days_left: 27, opened: true, last_viewed_at: ago(600), expiring: false, expired: false, follow_up: false },
        { quote_id: 'q4', quote_number: 38, title: tx('Feira do livro', 'Book fair'), client_key: 'c3', client_name: 'Festival Lumière', author_id: duarte, author_name: 'Duarte Silva', currency: 'EUR', value: 980, sent_on: day(-40), days_waiting: 40, valid_until: day(-10), days_left: -10, opened: false, last_viewed_at: null, expiring: false, expired: true, follow_up: false },
      ],
      sales_win_rate: ({ p_group = 'total' } = {}) => {
        const row = (k, label, d, a, va, vd, med, avg, gross) => ({ group_key: k, group_label: label, currency: 'EUR', decided: d, accepted: a, declined: d - a,
          value_accepted: va, value_declined: vd, win_rate_count: d ? Math.round(a / d * 10000) / 10000 : null, win_rate_value: va + vd ? Math.round(va / (va + vd) * 10000) / 10000 : null,
          median_days: med, avg_value: avg, gross_accepted: gross, discount_accepted: Math.round((gross - va) * 100) / 100 })
        if (p_group === 'lost_reason') return [row('price', null, 4, 0, 0, 9200, 6, 2300, 0), row('competitor', null, 2, 0, 0, 5100, 9, 2550, 0), row('cancelled', null, 1, 0, 0, 1800, 3, 1800, 0), row(null, null, 13, 12, 61200, 2400, 5, 4892, 66900)]
        if (p_group === 'client') return [row('c1', 'Marcolino Produções', 7, 5, 28640, 6200, 4, 4977, 31200), row('c2', tx('Câmara Municipal de Sintra', 'Sintra Town Council'), 5, 3, 14800, 5900, 12, 4140, 15600), row('c3', 'Festival Lumière', 4, 2, 11300, 4800, 7, 4025, 12400), row('c4', 'Joana Silva', 2, 1, 3340, 1600, 3, 2470, 3600), row(null, null, 2, 1, 3120, 0, 2, 1560, 4100)]
        if (p_group === 'author') return [row(ricardo, 'Ricardo Bedulho', 12, 8, 38400, 9800, 5, 4017, 42100), row(duarte, 'Duarte Silva', 8, 4, 22800, 8700, 8, 3938, 24800)]
        if (p_group === 'month' || p_group === 'quarter') {
          const months = [-5, -4, -3, -2, -1, 0].map(i => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + i, 1)).toISOString().slice(0, 7))
          const n = [[3, 2], [4, 2], [2, 1], [5, 3], [3, 2], [3, 2]]
          return months.map((m, i) => row(m, null, n[i][0], n[i][1], n[i][1] * 5100, (n[i][0] - n[i][1]) * 3000, 5 + i % 3, 4400, n[i][1] * 5500))
        }
        return [row('total', null, 20, 12, 61200, 18500, 6, 3985, 66900)]
      },
      sales_clients: ({ p_client } = {}) => {
        const c = (k, name, rev, margin, gigs, quotes, decided, accepted, first, last, next, isNew, ret) => ({ client_key: k, client_id: k, client_name: name, currency: 'EUR',
          revenue: rev, gross_margin: margin, margin_pct: rev ? Math.round(margin * 1000 / rev) / 10 : null, gigs, avg_gig_value: gigs ? Math.round(rev / gigs * 100) / 100 : null,
          quotes, decided, accepted, win_rate_count: decided ? Math.round(accepted / decided * 10000) / 10000 : null, win_rate_value: null,
          first_gig: first, last_gig: last, next_gig: next, is_new: isNew, is_returning: ret })
        const rows = [
          c('c1', 'Marcolino Produções', 28640, 11930, 6, 8, 7, 5, day(-700), day(-14), day(24), false, true),
          c('c2', tx('Câmara Municipal de Sintra', 'Sintra Town Council'), 14800, 5480, 3, 6, 5, 3, day(-420), day(-40), day(52), false, true),
          c('c3', 'Festival Lumière', 11300, 3620, 2, 5, 4, 2, day(-150), day(-60), null, true, false),
          c('c4', 'Joana Silva', 3340, 1210, 1, 2, 2, 1, day(-30), day(-30), day(200), true, false),
          { ...c('', null, 34100, 9800, 0, 0, 0, 0, null, null, null, false, false), client_id: null },
        ]
        return p_client ? rows.filter(r => r.client_key === p_client) : rows
      },
      report_revenue_lines: revenueLines,
      gig_finance: gigFinance,
      // Step 11b: the organisation's invoicing program, connected
      invoicing_status: [{ provider: 'invoicexpress', connected: true, expired: false, account: 'lumen-pixel', company_name: null, document_set_name: '2026', ready: true, connected_at: ago(2000) }],
      invoice_summary: [{ ref_id: 'q1', currency: 'EUR', invoiced_net: 2120, invoiced: 2607.6, credited: 0, paid: 1282.28, outstanding: 1325.32, overdue: 1325.32, to_issue: 66.42, invoices: 3, last_issue: day(-35), last_paid: day(-12) }],
      equipment_report: [
        { item_id: SPK, name: w.speaker, category: w.sys, owned: 7, use: 0.46, gigs: 9, last_used: ago(240), revenue: 6720, return_on_cost: 0.32, repairs: 1, repair_cost: 180, charged: 0, lost: 0, lost_value: 0, hired_in: 0, book_value: 14200, cost: 21000, idle: false },
        { item_id: QL1, name: w.desk, category: w.sys, owned: 1, use: 0.31, gigs: 5, last_used: ago(400), revenue: 2160, return_on_cost: 0.18, repairs: 0, repair_cost: 0, charged: 0, lost: 0, lost_value: 0, hired_in: 360, book_value: 9800, cost: 12000, idle: false },
        { item_id: XLR, name: w.cables, category: w.cab, owned: 120, use: 0.22, gigs: 11, last_used: ago(240), revenue: 940, return_on_cost: null, repairs: 0, repair_cost: 0, charged: 0, lost: 3, lost_value: 45, hired_in: 0, book_value: 0, cost: 0, idle: false },
        { item_id: PWC, name: w.powercon, category: w.cab, owned: 40, use: 0, gigs: 0, last_used: null, revenue: 0, return_on_cost: null, repairs: 0, repair_cost: 0, charged: 0, lost: 0, lost_value: 0, hired_in: 0, book_value: 0, cost: 0, idle: true },
      ],
    },
  }
}

// PostgREST-style filters the app uses: eq, neq, in, is. Others (dates, ranges) are ignored.
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns'])
export function applyFilters(rows, params) {
  let out = rows
  for (const [key, raw] of params) {
    if (SKIP.has(key)) continue
    const [op, ...rest] = raw.split('.')
    const value = rest.join('.')
    const has = r => Object.prototype.hasOwnProperty.call(r, key)
    if (op === 'eq') out = out.filter(r => !has(r) || String(r[key]) === value)
    else if (op === 'neq') out = out.filter(r => !has(r) || String(r[key]) !== value)
    else if (op === 'in') { const list = value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, '')); out = out.filter(r => !has(r) || list.includes(String(r[key]))) }
    else if (op === 'is' && value === 'null') out = out.filter(r => !has(r) || r[key] == null)
  }
  return out
}

