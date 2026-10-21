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
  ]
  const due = [
    { item_id: SPK, item_name: w.speaker, inspection_kind: tx('Teste elétrico (PAT)', 'Electrical test (PAT)'), unit_id: units[0].id, unit_code: units[0].code, last_done: day(-370), last_result: 'pass', due_on: day(-5) },
    { item_id: SPK, item_name: w.speaker, inspection_kind: tx('Teste elétrico (PAT)', 'Electrical test (PAT)'), unit_id: units[1].id, unit_code: units[1].code, last_done: day(-355), last_result: 'pass', due_on: day(10) },
  ]
  const suppliers = [
    { id: 'sp1', org_id: orgId, name: 'Audiomatic', contact_name: 'Rui Costa', phone: '+351 912 000 000', email: 'rui@example.com', partner_org_id: null, archived_at: null },
  ]
  const subrentals = [
    { id: 'sb1', org_id: orgId, supplier_id: 'sp1', supplier: { name: 'Audiomatic', partner_org_id: null }, gig_id: gigId, gig: { name: gig.name }, status: 'requested', starts_at: span[0], ends_at: span[1], reference: 'PO-118', notes: null,
      lines: [{ id: 'x1', item_id: SPK, description: w.speaker, quantity: 2, unit_cost: 40, position: 0 }] },
  ]
  const Lq = (id, kind, description, qty, unit, factor, unit_price, item_id) => ({ id, kind, description, details: '', qty, unit, factor, unit_price, discount_pct: 0, ...(item_id ? { item_id } : {}) })
  const quote = {
    id: 'q1', org_id: orgId, gig_id: gigId, number: 143, title: gig.name, status: 'accepted', language: lang, currency: 'EUR',
    client_company: 'Marcolino Produções', client_name: 'Marta Lopes', client_email: 'marta@example.com', client_address: null, client_tax_id: null,
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
      gig_members: myGigs.concat(members.filter(m => !myGigs.some(x => x.gig_id === m.gig_id && x.user_id === m.user_id))),
      gig_schedule: schedule,
      assets,
      gig_invites: persona === 'pm' ? [{ id: 'i1', gig_id: gigId, email: 'joana.r@example.com', role: 'crew', function_title: w.stage, call_time: '08:00', created_at: ago(30) }] : [],
      gig_positions: [],
      availability_requests: persona === 'pm' ? [] : [request],
      crew_unavailability: persona === 'pm' ? [] : [{ id: 'u1', user_id: carla, start_date: day(50), end_date: day(57), note: w.holiday, created_at: ago(100) }],
      notifications: persona === 'pm' ? [] : [{ id: 1, user_id: carla, org_id: orgId, gig_id: gigId, actor_id: ricardo, kind: 'availability_request', details: { gig_name: gig.name, from: `${day(24)}T00:00:00Z`, until: `${day(26)}T00:00:00Z` }, read_at: null, created_at: ago(3) }],
      gig_equipment: gear,
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
      stock_units: units,
      stock_movements: movements,
      repairs,
      inspections: [],
      suppliers,
      subrentals,
      quotes: [{ ...quote, organisations: org }],
      quote_versions: versions,
      quote_shares: [{ id: 'sh1', status: 'accepted', sent_to: 'marta@example.com', emailed: true, created_at: ago(48), expires_at: `${day(28)}T00:00:00Z`, viewed_at: ago(40), responded_at: ago(30), responder_name: 'Marta Lopes', responder_note: null, quote_versions: { version_no: 2 } }],
      quote_templates: [],
      org_branding: [{ org_id: orgId, legal_name: 'Lumen and Pixel, Lda', tax_id: '500000000', address: 'Lisboa', phone: '+351 210 000 000', website: 'lumenandpixel.com', default_vat: 23, validity_days: 30, default_terms: null, brand_color: '#33FB31' }],
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

