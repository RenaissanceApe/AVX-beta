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
    sys: 'Sistema de som', cab: 'Cabos', warehouse: 'Armazém Alcântara', desc: 'Concerto de Natal, dois dias.',
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
  const org = { id: orgId, name: 'Lumen and Pixel', equipment_prep_days: 1, equipment_return_days: 1, created_at: '2026-01-10T10:00:00Z' }
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
    item(XLR, w.cables, w.cab, 'bulk', { code: 'XLR10', weight_kg: 0.6 }),
    item(PWC, w.powercon, w.cab, 'bulk'),
    item(SPK, w.speaker, w.sys, 'serial', { code: 'LA210', weight_kg: 32, power_w: 1600 }),
    item(QL1, w.desk, w.sys, 'serial', { weight_kg: 25, power_w: 300 }),
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
      price_items: items,
      stock_locations: [{ id: W1, org_id: orgId, name: w.warehouse, kind: 'warehouse', address: null, archived_at: null }],
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
      gig_dispatch_summary: [],
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

