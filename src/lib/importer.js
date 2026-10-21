// The import wizard (docs/SWITCHING.md, S1): reading a spreadsheet export, matching its columns
// to AVX's fields, cleaning the values and predicting what an import will do. The import itself
// runs in the database (run_import), which checks everything again.
import { parsePrice } from './quotes'

export const KINDS = ['locations', 'items', 'units', 'kits', 'clients', 'suppliers', 'crew', 'gigs', 'gig_equipment', 'quotes']
// Kinds that go to the contacts directory (S2), not the inventory
export const CONTACT_KINDS = ['clients', 'suppliers']
// Kinds kept outside the import batches: crew become invitations held until an admin sends them (S3a)
export const HELD_KINDS = ['crew']
// Upcoming jobs, their equipment and open quotes (S3b): also outside the batches, imported by import_jobs
export const JOB_KINDS = ['gigs', 'gig_equipment', 'quotes']
export const MAX_ROWS = 5000
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

// Words people (and Rentman, in Dutch or English) use for each choice
const WORDS = {
  locationKind: {
    warehouse: ['warehouse', 'magazijn', 'armazem', 'depot', 'store', 'storage', 'opslag', 'loja'],
    vehicle: ['vehicle', 'van', 'truck', 'lorry', 'bus', 'carrinha', 'camiao', 'viatura', 'voertuig', 'bestelbus', 'vrachtwagen'],
    site: ['site', 'venue', 'local', 'locatie', 'sala', 'recinto'],
    other: ['other', 'overig', 'outro', 'anders'],
  },
  itemKind: {
    rental: ['rental', 'rent', 'hire', 'verhuur', 'huur', 'aluguer', 'aluguel', 'equipment'],
    sale: ['sale', 'sell', 'verkoop', 'venda', 'consumable', 'verbruik', 'consumivel'],
    crew: ['crew', 'personeel', 'staff', 'equipa', 'pessoal', 'labour', 'labor'],
    transport: ['transport', 'vervoer', 'transporte', 'vehicle'],
    other: ['other', 'overig', 'outro'],
  },
  unit: {
    unit: ['unit', 'piece', 'pc', 'pcs', 'each', 'stuk', 'stuks', 'unidade', 'un'],
    day: ['day', 'days', 'dag', 'dagen', 'dia', 'dias', 'per day'],
    hour: ['hour', 'hours', 'uur', 'hora', 'horas', 'per hour'],
    km: ['km', 'kilometer', 'kilometre', 'quilometro'],
    set: ['set', 'conjunto', 'kit'],
    lump: ['lump', 'lump sum', 'fixed', 'vast', 'fixo', 'forfait'],
  },
  tracking: {
    none: ['none', 'no', 'nee', 'nao', 'not tracked', 'geen', 'exclude from stock tracking', 'niet bijhouden', 'nao controlar'],
    bulk: ['bulk', 'quantity', 'count', 'counted', 'aantal', 'quantidade', 'ja', 'yes', 'sim', 'track stock', 'voorraad bijhouden', 'controlar stock'],
    serial: ['serial', 'serials', 'serial numbers', 'serienummer', 'serienummers', 'serie', 'numero de serie', 'individual', 'unit'],
  },
  partKind: {
    content: ['content', 'contents', 'inhoud', 'conteudo', 'in case', 'in set', 'packed', 'case content', 'set content'],
    accessory: ['accessory', 'accessories', 'accessoire', 'accessoires', 'toebehoren', 'acessorio', 'acessorios', 'extra', 'with'],
  },
  kitType: {
    set: ['set', 'conjunto', 'kit', 'package', 'pakket', 'pacote'],
    case: ['case', 'flightcase', 'flight case', 'koffer', 'kist', 'caixa', 'mala', 'rack'],
  },
  yesNo: {
    yes: ['yes', 'true', '1', 'y', 'ja', 'sim', 'active', 'actief', 'ativo', 'x'],
    no: ['no', 'false', '0', 'n', 'nee', 'nao', 'inactive', 'inactief', 'inativo'],
  },
  orgRole: {
    admin: ['admin', 'administrator', 'beheerder', 'administrador', 'owner', 'eigenaar', 'dono'],
    member: ['member', 'membro', 'staff', 'employee', 'medewerker', 'werknemer', 'funcionario', 'office', 'kantoor', 'escritorio', 'planner', 'manager'],
    viewer: ['viewer', 'crew', 'freelancer', 'freelance', 'zzp', 'zzp er', 'technician', 'technicus', 'tecnico', 'equipa', 'observador', 'leitor', 'lezer'],
  },
  gigStatus: {
    confirmed: ['confirmed', 'bevestigd', 'confirmado', 'booked', 'geboekt', 'reservado', 'definitive', 'definitief', 'definitivo'],
    draft: ['draft', 'concept', 'option', 'optie', 'opcao', 'request', 'aanvraag', 'pedido', 'pending', 'in afwachting', 'pendente', 'rascunho', 'quote', 'offerte', 'orcamento', 'tentative'],
    active: ['active', 'in progress', 'lopend', 'em curso', 'on site'],
    completed: ['completed', 'finished', 'done', 'closed', 'afgerond', 'voltooid', 'gesloten', 'concluido', 'terminado', 'fechado'],
    cancelled: ['cancelled', 'canceled', 'geannuleerd', 'cancelado', 'anulado', 'lost', 'verloren', 'perdido'],
  },
  unitStatus: {
    available: ['available', 'beschikbaar', 'disponivel', 'ok', 'in stock', 'active', 'actief', 'ativo'],
    repair: ['repair', 'in repair', 'reparatie', 'defect', 'defective', 'broken', 'reparacao', 'avariado'],
    lost: ['lost', 'missing', 'kwijt', 'vermist', 'perdido', 'desaparecido'],
    retired: ['retired', 'sold', 'written off', 'afgeschreven', 'verkocht', 'abatido', 'vendido', 'inactive', 'inactief'],
  },
}

// Clients and suppliers (S2). The address can come whole or in parts (street, postcode, city,
// country), which are put together on separate lines.
const CONTACT_FIELDS = [
  { key: 'name', type: 'text', max: 200, required: true, names: ['name', 'naam', 'nome', 'company', 'company name', 'bedrijf', 'bedrijfsnaam', 'empresa', 'client', 'customer', 'klant', 'cliente', 'supplier', 'leverancier', 'fornecedor', 'contact', 'organisation', 'organization', 'displayname', 'display name'] },
  { key: 'contact_name', type: 'text', max: 120, names: ['contact person', 'contact name', 'contactpersoon', 'pessoa de contacto', 'contacto', 'attention', 'attn', 'person'] },
  { key: 'email', type: 'email', names: ['email', 'e mail', 'mail', 'email address', 'e mailadres', 'emailadres', 'correio electronico', 'correio eletronico', 'email 1'] },
  { key: 'phone', type: 'text', max: 60, names: ['phone', 'telephone', 'tel', 'telefoon', 'telefoonnummer', 'telefone', 'mobile', 'mobiel', 'telemovel', 'phone number', 'phone 1'] },
  { key: 'address', type: 'text', max: 500, names: ['address', 'adres', 'morada', 'endereco', 'full address', 'visiting address', 'bezoekadres'] },
  { key: 'street', type: 'text', max: 200, names: ['street', 'straat', 'rua', 'street address', 'address line 1', 'address 1', 'straatnaam', 'visit street'] },
  { key: 'house_number', type: 'text', max: 20, names: ['house number', 'huisnummer', 'number', 'nummer', 'numero', 'no', 'nr', 'visit number'] },
  { key: 'postcode', type: 'text', max: 20, names: ['postcode', 'postal code', 'zip', 'zip code', 'codigo postal', 'cp', 'postalcode', 'visit postalcode'] },
  { key: 'city', type: 'text', max: 100, names: ['city', 'town', 'plaats', 'woonplaats', 'stad', 'cidade', 'localidade', 'visit city'] },
  { key: 'country', type: 'text', max: 80, names: ['country', 'land', 'pais'] },
  { key: 'tax_id', type: 'text', max: 40, names: ['tax id', 'tax number', 'vat', 'vat number', 'vat id', 'btw', 'btw nummer', 'btw nr', 'nif', 'nipc', 'contribuinte', 'numero de contribuinte', 'tax', 'vat code'] },
  { key: 'notes', type: 'text', max: 1000, names: ['notes', 'note', 'remarks', 'opmerkingen', 'opmerking', 'notas', 'observacoes', 'comments'] },
]

// Each kind's fields: key, type, whether it's required, and the column names it's guessed from
// (compared without capitals, accents or punctuation). Order matters: a column goes to the
// first field that claims it.
export const FIELDS = {
  locations: [
    { key: 'name', type: 'text', max: 100, required: true, names: ['name', 'naam', 'nome', 'location', 'location name', 'warehouse', 'locatie', 'local', 'armazem', 'magazijn'] },
    { key: 'kind', type: 'enum', words: 'locationKind', names: ['kind', 'type', 'soort', 'tipo'] },
    { key: 'address', type: 'text', max: 300, names: ['address', 'adres', 'morada', 'endereco', 'street', 'straat'] },
    { key: 'notes', type: 'text', max: 500, names: ['notes', 'note', 'remarks', 'opmerkingen', 'opmerking', 'notas', 'observacoes'] },
  ],
  items: [
    { key: 'name', type: 'text', max: 200, required: true, names: ['name', 'naam', 'nome', 'item', 'equipment', 'artigo', 'equipamento', 'displayname', 'display name', 'article', 'artikel', 'product', 'produto'] },
    { key: 'code', type: 'code', names: ['code', 'number', 'nummer', 'item code', 'article number', 'artikelnummer', 'codigo', 'referencia', 'ref', 'sku', 'barcode', 'equipment code'] },
    { key: 'category', type: 'text', max: 80, names: ['category', 'categorie', 'categoria', 'folder', 'map', 'group', 'groep', 'grupo', 'pasta'] },
    { key: 'brand', type: 'text', max: 80, names: ['brand', 'merk', 'marca', 'manufacturer', 'fabrikant', 'fabricante', 'make'] },
    { key: 'model', type: 'text', max: 80, names: ['model', 'modelo'] },
    { key: 'unit_price', type: 'money', names: ['price', 'rental price', 'prijs', 'verhuurprijs', 'preco', 'price per day', 'dagprijs', 'day price', 'rate', 'tarief', 'unit price', 'preco unitario', 'preco de aluguer'] },
    { key: 'kind', type: 'enum', words: 'itemKind', names: ['kind', 'rental sales', 'rental or sale', 'verhuur verkoop', 'aluguer venda', 'item type'] },
    { key: 'unit', type: 'enum', words: 'unit', names: ['charged per', 'price per', 'per', 'prijs per', 'preco por', 'cobrado por'] },
    { key: 'tracking', type: 'enum', words: 'tracking', names: ['tracking', 'stock tracking', 'serials', 'serial numbers', 'serienummers', 'stock management', 'voorraadbeheer', 'controlo de stock'] },
    { key: 'quantity', type: 'int', max: 100000, names: ['quantity', 'qty', 'stock', 'aantal', 'voorraad', 'quantidade', 'in stock', 'current stock', 'stock quantity', 'existencias', 'current quantity'] },
    { key: 'location', type: 'text', max: 100, names: ['location', 'warehouse', 'magazijn', 'locatie', 'local', 'armazem', 'stock location'] },
    { key: 'weight_kg', type: 'number', names: ['weight', 'weight kg', 'gewicht', 'peso', 'kg'] },
    { key: 'power_w', type: 'int', max: 1000000, names: ['power', 'power w', 'vermogen', 'potencia', 'watt', 'watts', 'w'] },
    { key: 'dimensions', type: 'text', max: 80, names: ['dimensions', 'size', 'afmetingen', 'dimensoes', 'measurements'] },
    { key: 'replacement_value', type: 'money', names: ['list price', 'replacement value', 'vervangingswaarde', 'new price', 'nieuwprijs', 'valor de reposicao', 'value', 'waarde', 'insured value'] },
    { key: 'min_stock', type: 'int', max: 100000, names: ['critical stock level', 'minimum stock', 'min stock', 'minimale voorraad', 'stock minimo'] },
    { key: 'packing_note', type: 'text', max: 500, names: ['internal remark', 'packing note', 'pakbon opmerking', 'nota de embalagem'] },
    { key: 'details', type: 'text', max: 2000, names: ['external remark', 'details', 'description', 'omschrijving', 'beschrijving', 'descricao', 'notes', 'remarks', 'opmerkingen', 'notas'] },
  ],
  units: [
    { key: 'item', type: 'text', max: 200, names: ['item', 'equipment', 'item name', 'equipment name', 'naam', 'name', 'artigo', 'equipamento', 'nome', 'artikel'] },
    { key: 'item_code', type: 'code', names: ['item code', 'equipment code', 'equipment number', 'artikelcode', 'artikelnummer', 'codigo do artigo', 'article number'] },
    { key: 'code', type: 'code', names: ['barcode', 'code', 'label', 'asset', 'asset tag', 'asset number', 'qr', 'qr code', 'codigo de barras', 'etiqueta', 'streepjescode', 'id', 'ref', 'reference', 'internal reference'] },
    { key: 'serial', type: 'text', max: 80, names: ['serial', 'serial number', 'serienummer', 'numero de serie', 'sn', 's n', 'serial no'] },
    { key: 'location', type: 'text', max: 100, names: ['location', 'warehouse', 'magazijn', 'locatie', 'local', 'armazem', 'current location', 'asset location'] },
    { key: 'status', type: 'enum', words: 'unitStatus', names: ['status', 'state', 'estado', 'conditie', 'condition'] },
    { key: 'purchase_date', type: 'date', names: ['purchase date', 'bought', 'aankoopdatum', 'data de compra', 'purchased', 'date purchased', 'in use since', 'purchasedate'] },
    { key: 'purchase_cost', type: 'money', names: ['purchase price', 'purchase cost', 'cost', 'aankoopprijs', 'inkoopprijs', 'custo', 'preco de compra', 'valor de compra', 'purchase costs'] },
    { key: 'notes', type: 'text', max: 500, names: ['notes', 'remarks', 'remark', 'opmerkingen', 'notas', 'observacoes', 'comment', 'comments'] },
  ],
  kits: [
    { key: 'kit', type: 'text', max: 200, names: ['kit', 'set', 'case', 'parent', 'kit name', 'set name', 'case name', 'parent name', 'hoofdartikel', 'samengesteld artikel', 'conjunto', 'caixa', 'artigo principal'] },
    { key: 'kit_code', type: 'code', names: ['kit code', 'set code', 'case code', 'parent code', 'parent number', 'codigo do conjunto', 'codigo da caixa'] },
    { key: 'item', type: 'text', max: 200, names: ['item', 'content', 'contents', 'part', 'child', 'component', 'onderdeel', 'inhoud', 'artikel', 'componente', 'conteudo', 'equipment', 'name', 'naam', 'nome'] },
    { key: 'item_code', type: 'code', names: ['item code', 'part code', 'child code', 'component code', 'code', 'artikelcode', 'artikelnummer', 'codigo'] },
    { key: 'quantity', type: 'int', max: 1000, names: ['quantity', 'qty', 'aantal', 'quantidade', 'number', 'count'] },
    { key: 'part_kind', type: 'enum', words: 'partKind', names: ['kind', 'type', 'soort', 'tipo', 'relation', 'relatie', 'part type'] },
    { key: 'kit_type', type: 'enum', words: 'kitType', names: ['kit type', 'set or case', 'parent type', 'tipo de conjunto'] },
  ],
  clients: CONTACT_FIELDS,
  suppliers: CONTACT_FIELDS,
  gigs: [
    { key: 'ref', type: 'text', max: 80, names: ['number', 'nummer', 'project number', 'projectnummer', 'job number', 'ref', 'reference', 'referentie', 'referencia', 'numero', 'id'] },
    { key: 'name', type: 'text', max: 200, names: ['name', 'naam', 'project', 'project name', 'projectnaam', 'job', 'job name', 'event', 'evento', 'nome', 'title', 'titel', 'titulo', 'displayname', 'display name'] },
    { key: 'start_date', type: 'date', names: ['start', 'start date', 'startdatum', 'begin', 'begindatum', 'from', 'van', 'data de inicio', 'inicio', 'period start', 'planperiode start', 'usage period start', 'planperiod start', 'usageperiod start'] },
    { key: 'end_date', type: 'date', names: ['end', 'end date', 'einddatum', 'eind', 'to', 'tot', 'data de fim', 'fim', 'period end', 'planperiode eind', 'usage period end', 'planperiod end', 'usageperiod end'] },
    { key: 'venue', type: 'text', max: 300, names: ['venue', 'location', 'locatie', 'local', 'recinto', 'address', 'adres', 'morada'] },
    { key: 'status', type: 'enum', words: 'gigStatus', names: ['status', 'state', 'estado', 'project status', 'projectstatus'] },
    { key: 'client', type: 'text', max: 200, names: ['client', 'customer', 'klant', 'opdrachtgever', 'cliente', 'contact', 'relation', 'relatie'] },
    { key: 'notes', type: 'text', max: 4000, names: ['notes', 'note', 'description', 'omschrijving', 'opmerkingen', 'remarks', 'notas', 'descricao', 'observacoes'] },
  ],
  gig_equipment: [
    { key: 'gig_ref', type: 'text', max: 80, names: ['gig ref', 'project number', 'projectnummer', 'job number', 'number', 'nummer', 'ref', 'reference', 'referencia', 'numero do projeto'] },
    { key: 'gig', type: 'text', max: 200, names: ['gig', 'gig name', 'project', 'project name', 'projectnaam', 'job', 'job name', 'event', 'evento', 'projeto'] },
    { key: 'item', type: 'text', max: 200, names: ['item', 'equipment', 'name', 'naam', 'artikel', 'artigo', 'equipamento', 'product', 'produto', 'nome'] },
    { key: 'item_code', type: 'code', names: ['item code', 'code', 'equipment code', 'artikelcode', 'artikelnummer', 'codigo', 'article number'] },
    { key: 'quantity', type: 'int', max: 100000, names: ['quantity', 'qty', 'aantal', 'quantidade', 'count', 'planned', 'gepland'] },
    { key: 'notes', type: 'text', max: 500, names: ['notes', 'note', 'remark', 'opmerking', 'opmerkingen', 'notas'] },
  ],
  quotes: [
    { key: 'quote_ref', type: 'text', max: 80, names: ['quote number', 'offertenummer', 'number', 'nummer', 'ref', 'reference', 'referentie', 'numero', 'numero do orcamento', 'quote'] },
    { key: 'title', type: 'text', max: 200, names: ['title', 'titel', 'titulo', 'name', 'naam', 'nome', 'project', 'subject', 'onderwerp', 'assunto'] },
    { key: 'client', type: 'text', max: 200, names: ['client', 'customer', 'klant', 'opdrachtgever', 'cliente', 'contact', 'relation', 'relatie'] },
    { key: 'issue_date', type: 'date', names: ['date', 'datum', 'quote date', 'offertedatum', 'data', 'issue date', 'data do orcamento'] },
    { key: 'valid_until', type: 'date', names: ['valid until', 'geldig tot', 'expiry', 'expires', 'validade', 'valido ate', 'expiry date', 'vervaldatum'] },
    { key: 'section', type: 'text', max: 120, names: ['section', 'group', 'groep', 'category', 'categorie', 'categoria', 'seccao', 'secao', 'grupo'] },
    { key: 'description', type: 'text', max: 500, names: ['description', 'omschrijving', 'line', 'regel', 'descricao', 'text', 'tekst', 'texto', 'item', 'artikel', 'artigo'] },
    { key: 'item_code', type: 'code', names: ['item code', 'code', 'artikelcode', 'artikelnummer', 'codigo', 'equipment code'] },
    { key: 'quantity', type: 'number', names: ['quantity', 'qty', 'aantal', 'quantidade'] },
    { key: 'factor', type: 'number', names: ['days', 'dagen', 'dias', 'factor', 'periods', 'periode', 'period', 'periodo'] },
    { key: 'unit_price', type: 'money', names: ['price', 'unit price', 'prijs', 'stukprijs', 'eenheidsprijs', 'preco', 'preco unitario', 'rate', 'tarief'] },
    { key: 'discount_pct', type: 'number', names: ['discount', 'discount pct', 'korting', 'desconto', 'percentage'] },
  ],
  crew: [
    { key: 'email', type: 'email', required: true, names: ['email', 'e mail', 'mail', 'email address', 'e mailadres', 'emailadres', 'correio electronico', 'correio eletronico'] },
    { key: 'full_name', type: 'text', max: 120, names: ['name', 'full name', 'naam', 'volledige naam', 'nome', 'nome completo', 'displayname', 'display name', 'crew member', 'crewlid'] },
    { key: 'first_name', type: 'text', max: 60, names: ['first name', 'firstname', 'voornaam', 'primeiro nome', 'given name'] },
    { key: 'last_name', type: 'text', max: 60, names: ['last name', 'lastname', 'surname', 'achternaam', 'apelido', 'sobrenome', 'family name'] },
    { key: 'phone', type: 'text', max: 60, names: ['phone', 'telephone', 'tel', 'telefoon', 'telefoonnummer', 'telefone', 'mobile', 'mobiel', 'telemovel', 'phone number'] },
    { key: 'functions', type: 'text', max: 200, names: ['function', 'functions', 'functie', 'functies', 'funcao', 'funcoes', 'skills', 'vaardigheden', 'competencias', 'job title', 'role description', 'specialty'] },
    { key: 'role', type: 'enum', words: 'orgRole', names: ['role', 'rol', 'papel', 'type', 'soort', 'tipo', 'access', 'contract', 'employment'] },
    { key: 'notes', type: 'text', max: 500, names: ['notes', 'note', 'remarks', 'opmerkingen', 'opmerking', 'notas', 'observacoes', 'comments'] },
    { key: 'active', type: 'enum', words: 'yesNo', names: ['active', 'actief', 'ativo', 'enabled', 'in service', 'in dienst'] },
  ],
}

// "Número de Série" → "numero de serie"
export const normalise = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── Reading ──────────────────────────────────────────────────────────────────
// The file's records: its lines, with a line break inside quotes kept in its record
function records(text) {
  const out = []
  let buf = null
  for (const line of String(text || '').split(/\r?\n/)) {
    buf = buf === null ? line : `${buf}\n${line}`
    if (((buf.match(/"/g) || []).length % 2) === 0) { out.push(buf); buf = null }
  }
  if (buf !== null) out.push(buf)
  return out.filter(r => r.trim() !== '')
}

// Which character separates the columns: the one that splits the first records most evenly
export function detectDelimiter(text) {
  const lines = records(text).slice(0, 5)
  let best = '\t', bestScore = -1
  for (const d of ['\t', ';', ',', '|']) {
    const counts = lines.map(l => splitLine(l, d).length)
    const min = Math.min(...counts)
    const score = min > 1 && counts.every(c => c === counts[0]) ? min * 10 : min
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

function splitLine(line, d) {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"' && cur.trim() === '') { quoted = true; cur = '' }
    else if (ch === d) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

// A CSV/TSV file or text pasted from a spreadsheet → { headers, rows } (rows are arrays of
// strings; quoted cells may hold the separator, quotes and line breaks). headers: the first row,
// or "Column 1", "Column 2"… when the file has none.
export function parseTable(text, { headerRow = true, delimiter } = {}) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const d = delimiter || detectDelimiter(src)
  const rows = records(src).map(r => splitLine(r, d))
  const width = Math.max(0, ...rows.map(r => r.length))
  if (!rows.length) return { headers: [], rows: [], delimiter: d }
  const headers = headerRow
    ? rows[0].map((h, i) => h || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`)
  return { headers, rows: (headerRow ? rows.slice(1) : rows).map(r => headers.map((_, i) => r[i] ?? '')), delimiter: d }
}

// ── Matching columns ─────────────────────────────────────────────────────────
// { header: fieldKey } for the columns AVX recognises; each field from one column at most
export function guessMapping(headers, kind) {
  const fields = FIELDS[kind] || []
  const mapping = {}
  const taken = new Set()
  // Exact names first, then names contained in the header ("Rental price (€)")
  for (const pass of ['exact', 'contains']) {
    for (const h of headers) {
      if (mapping[h]) continue
      const n = normalise(h)
      const f = fields.find(f => !taken.has(f.key) && f.names.some(name => (pass === 'exact' ? n === name : n.split(' ').length > 1 && (` ${n} `).includes(` ${name} `) && name.length > 2)))
      if (f) { mapping[h] = f.key; taken.add(f.key) }
    }
  }
  return mapping
}

// A saved preset applied to this file: only the columns that exist
export const applyPreset = (headers, preset) => Object.fromEntries(headers.filter(h => preset?.[h]).map(h => [h, preset[h]]))

// Column names only Rentman's exports use (its API field names): a file with a few of them is
// recognised as a Rentman export, whose columns the guesses above already cover
const RENTMAN_HEADERS = new Set(['displayname', 'rental sales', 'stock management', 'current quantity', 'critical stock level', 'list price',
  'internal remark', 'external remark', 'email 1', 'phone 1', 'visit street', 'visit number', 'visit postalcode', 'visit city', 'vat code',
  'planperiod start', 'planperiod end', 'usageperiod start', 'usageperiod end', 'purchasedate', 'purchase costs', 'asset location', 'firstname', 'lastname'])
export const looksLikeRentman = headers => headers.filter(h => RENTMAN_HEADERS.has(normalise(h))).length >= 2

// Required fields not matched to any column
export function missingFields(mapping, kind) {
  const used = new Set(Object.values(mapping))
  if (kind === 'units') return used.has('item') || used.has('item_code') ? [] : ['item']
  if (kind === 'kits') return [...(used.has('kit') || used.has('kit_code') ? [] : ['kit']), ...(used.has('item') || used.has('item_code') ? [] : ['item'])]
  if (kind === 'items') return used.has('name') || used.has('code') ? [] : ['name']
  if (kind === 'crew') return used.has('email') ? [] : ['email']
  if (kind === 'gigs') return used.has('name') || used.has('ref') ? [] : ['name']
  if (kind === 'gig_equipment') return [...(used.has('gig') || used.has('gig_ref') ? [] : ['gig']), ...(used.has('item') || used.has('item_code') ? [] : ['item'])]
  if (kind === 'quotes') return [...(used.has('title') || used.has('quote_ref') ? [] : ['title']), ...(used.has('description') || used.has('item_code') ? [] : ['description'])]
  return (FIELDS[kind] || []).filter(f => f.required && !used.has(f.key)).map(f => f.key)
}

// ── Cleaning values ──────────────────────────────────────────────────────────
// "1.234,50" → 1234.5; "2 kg" → 2; returns NaN when it isn't a number
export function parseNumber(text) {
  const s = String(text ?? '').trim()
  if (!s) return NaN
  if (!/\d/.test(s)) return NaN
  return parsePrice(s.replace(/[a-zA-Z€$£]/g, ''))
}

// 2024-03-01, 01-03-2024, 1/3/2024, 01.03.2024 → '2024-03-01' (day before month), or null
export function parseDate(text) {
  const s = String(text ?? '').trim()
  let y, m, d
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (r) [, y, m, d] = r
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) [, d, m, y] = r
  else return null
  const date = new Date(Date.UTC(+y, +m - 1, +d))
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseChoice(text, words) {
  const n = normalise(text)
  if (!n) return null
  for (const [value, list] of Object.entries(WORDS[words] || {})) if (value === n || list.includes(n)) return value
  return undefined
}

// One cell for one field → { value } or { error } (an i18n key under imp.err.*)
export function cleanValue(raw, field) {
  const s = String(raw ?? '').trim()
  if (!s) return { value: null }
  switch (field.type) {
    case 'money':
    case 'number': {
      const n = parseNumber(s)
      return Number.isFinite(n) && n >= 0 ? { value: Math.round(n * 1000) / 1000 } : { error: 'number' }
    }
    case 'int': {
      const n = parseNumber(s)
      return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= (field.max || 1e9) ? { value: n } : { error: 'whole' }
    }
    case 'date': {
      const d = parseDate(s)
      return d ? { value: d } : { error: 'date' }
    }
    case 'enum': {
      const v = parseChoice(s, field.words)
      return v ? { value: v } : { error: 'choice' }
    }
    case 'code': return CODE_RE.test(s) ? { value: s } : { error: 'code' }
    case 'email': return /^[^@\s]+@[^@\s]+$/.test(s) && s.length <= 200 ? { value: s } : { error: 'email' }
    default: return s.length <= (field.max || 200) ? { value: s } : { error: 'long' }
  }
}

// The file's rows as AVX rows: [{ _row (line in the file), field: value, …, _errors: [{ field, error }] }].
// Rows with nothing in the matched columns are left out.
// defaultLocation: where quantities go when the file has no location column (Rentman's equipment
// export, a single warehouse)
export function buildRows(table, mapping, kind, { headerRow = true, defaultLocation = null } = {}) {
  const fields = FIELDS[kind] || []
  const cols = table.headers.map((h, i) => ({ i, field: fields.find(f => f.key === mapping[h]) })).filter(c => c.field)
  const out = []
  table.rows.forEach((cells, n) => {
    const row = { _row: n + (headerRow ? 2 : 1), _errors: [] }
    let any = false
    for (const { i, field } of cols) {
      const { value, error } = cleanValue(cells[i], field)
      if (error) row._errors.push({ field: field.key, error })
      if (value !== null && value !== undefined) { row[field.key] = value; any = true }
      else if (error) any = true
    }
    if (!any) return
    if (CONTACT_KINDS.includes(kind)) joinAddress(row)
    if (kind === 'crew') joinName(row)
    // People marked inactive in the old tool aren't invited
    if (kind === 'crew' && row.active === 'no') row._errors.push({ field: 'active', error: 'inactive' })
    if (kind === 'crew') delete row.active
    if (kind === 'gigs' && !row.name && !row.ref) row._errors.push({ field: 'name', error: 'missing' })
    if (kind === 'gigs' && row.start_date && row.end_date && row.end_date < row.start_date) row._errors.push({ field: 'end_date', error: 'dates' })
    if (kind === 'gig_equipment' && !row.gig && !row.gig_ref) row._errors.push({ field: 'gig', error: 'missing' })
    if (kind === 'gig_equipment' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'gig_equipment' && row.quantity === 0) row._errors.push({ field: 'quantity', error: 'whole' })
    if (kind === 'quotes' && !row.title && !row.quote_ref) row._errors.push({ field: 'title', error: 'missing' })
    if (kind === 'quotes' && !row.description && !row.item_code) row._errors.push({ field: 'description', error: 'missing' })
    if (kind === 'crew' && !row.email && !row._errors.some(e => e.field === 'email')) row._errors.push({ field: 'email', error: 'missing' })
    if ((kind === 'locations' || CONTACT_KINDS.includes(kind)) && !row.name) row._errors.push({ field: 'name', error: 'missing' })
    if (kind === 'items' && !row.name && !row.code) row._errors.push({ field: 'name', error: 'missing' })
    if (kind === 'units' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'kits' && !row.kit && !row.kit_code) row._errors.push({ field: 'kit', error: 'missing' })
    if (kind === 'kits' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'kits' && row.quantity === 0) row._errors.push({ field: 'quantity', error: 'whole' })
    if (kind === 'items' && row.quantity > 0 && !row.location && defaultLocation) row.location = defaultLocation
    if (kind === 'items' && row.quantity > 0 && !row.location) row._errors.push({ field: 'location', error: 'needLocation' })
    out.push(row)
  })
  return out
}

// Street, postcode, city and country → the address, on separate lines (after a whole address
// if the file has one too)
function joinAddress(row) {
  const place = [row.postcode, row.city].filter(Boolean).join(' ')
  const street = [row.street, row.house_number].filter(Boolean).join(' ')
  const lines = [row.address, street, place, row.country].filter(Boolean)
  for (const k of ['street', 'house_number', 'postcode', 'city', 'country']) delete row[k]
  if (lines.length) row.address = lines.join('\n')
  if (row.address?.length > 500) row._errors.push({ field: 'address', error: 'long' })
}

// First and last name → the full name (unless the file has one)
function joinName(row) {
  const joined = [row.first_name, row.last_name].filter(Boolean).join(' ')
  delete row.first_name
  delete row.last_name
  if (!row.full_name && joined) row.full_name = joined.slice(0, 120)
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A gig by its old number, then by name (and start date when given), as the database finds it
function findGig(gigs = [], ref, name, start) {
  const lower = s => String(s || '').toLowerCase()
  if (ref) {
    const byRef = gigs.find(g => g.import_ref && lower(g.import_ref) === lower(ref))
    if (byRef) return byRef
  }
  if (!name) return null
  const named = gigs.filter(g => lower(g.name) === lower(name) && (!start || g.start_date === start))
  return named.length === 1 ? named[0] : null
}

// A tax number compared without spaces, dots, dashes or capitals (as the database does)
export const taxKey = s => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

// What sending these rows will do, predicted from what exists: each row gets
// { action: 'create' | 'match' | 'skip', reason } (the database has the final word)
export function dryRun(rows, kind, existing) {
  const lower = s => String(s || '').toLowerCase()
  const locations = new Set((existing.locations || []).filter(l => !l.archived_at).map(l => lower(l.name)))
  const items = (existing.items || []).filter(i => !i.archived_at)
  const itemByCode = new Map(items.filter(i => i.code).map(i => [i.code.toUpperCase(), i]))
  const itemsByName = new Map()
  for (const i of items) itemsByName.set(lower(i.name), [...(itemsByName.get(lower(i.name)) || []), i])
  const unitCodes = new Set((existing.units || []).map(u => u.code.toUpperCase()))
  const seen = new Set()
  const findItem = (code, name) => (code && itemByCode.get(code.toUpperCase())) || (name && itemsByName.get(lower(name))?.length === 1 ? itemsByName.get(lower(name))[0] : null)
  const plan = rows.map(row => {
    if (row._errors.length) return { action: 'skip', reason: row._errors[0].error, field: row._errors[0].field }
    if (kind === 'locations') {
      const key = lower(row.name)
      const action = locations.has(key) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'items') {
      if (row.location && !locations.has(lower(row.location))) return { action: 'skip', reason: 'unknownLocation', value: row.location }
      if (!row.code && row.name && (itemsByName.get(lower(row.name))?.length || 0) > 1) return { action: 'skip', reason: 'sameName', value: row.name }
      const key = row.code ? `#${row.code.toUpperCase()}` : lower(row.name)
      const action = findItem(row.code, row.name) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'gigs') {
      if (row.status === 'cancelled') return { action: 'skip', reason: 'cancelledJob', value: row.name || row.ref }
      if ((row.end_date || row.start_date) && (row.end_date || row.start_date) < today()) return { action: 'skip', reason: 'pastJob', value: row.name || row.ref }
      const found = findGig(existing.gigs, row.ref, row.name, row.start_date)
      if (!found && !row.start_date) return { action: 'skip', reason: 'noStart', field: 'start_date' }
      const key = row.ref ? `#${lower(row.ref)}` : `${lower(row.name)}|${row.start_date}`
      const action = found || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'gig_equipment') {
      const gig = findGig(existing.gigs, row.gig_ref, row.gig, null)
      if (!gig) return { action: 'skip', reason: 'unknownJob', value: row.gig_ref || row.gig }
      const item = findItem(row.item_code, row.item)
      if (!item) return { action: 'skip', reason: 'unknownItem', value: row.item_code || row.item }
      if (item.tracking === 'none') return { action: 'skip', reason: 'notTracked', value: item.name }
      const key = `${gig.id}>${item.id}`
      const action = (existing.lines || []).some(l => l.gig_id === gig.id && l.item_id === item.id) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'quotes') {
      const key = lower(row.quote_ref || row.title)
      const action = (row.quote_ref && (existing.quotes || []).some(q => lower(q.import_ref) === lower(row.quote_ref))) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'crew') {
      const email = lower(row.email)
      const known = new Set([...(existing.members || []), ...(existing.invites || []), ...(existing.held || [])].map(lower))
      const action = known.has(email) || seen.has(email) ? 'match' : 'create'
      seen.add(email)
      return { action }
    }
    if (CONTACT_KINDS.includes(kind)) {
      const contacts = (existing.contacts || [])
      const byTax = row.tax_id && contacts.find(c => taxKey(c.tax_id) && taxKey(c.tax_id) === taxKey(row.tax_id))
      let match = byTax
      if (!match) {
        const named = contacts.filter(c => !c.archived_at && lower(c.name) === lower(row.name))
        const narrowed = named.length > 1 && row.email ? named.filter(c => lower(c.email) === lower(row.email)) : named
        if (narrowed.length > 1) return { action: 'skip', reason: 'sameContact', value: row.name }
        match = narrowed[0]
      }
      const key = row.tax_id ? `#${taxKey(row.tax_id)}` : lower(row.name)
      const action = match || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'kits') {
      const kit = findItem(row.kit_code, row.kit)
      if (!kit) return { action: 'skip', reason: 'unknownKit', value: row.kit_code || row.kit }
      const item = findItem(row.item_code, row.item)
      if (!item) return { action: 'skip', reason: 'unknownItem', value: row.item_code || row.item }
      if (kit.id === item.id) return { action: 'skip', reason: 'selfKit', value: kit.name }
      const partKind = row.part_kind || (!kit.kit_type && kit.tracking !== 'none' && !row.kit_type ? 'accessory' : 'content')
      const key = `${kit.id}>${item.id}>${partKind}`
      const action = (existing.parts || []).some(p => p.parent_id === kit.id && p.child_id === item.id && p.kind === partKind) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    // units
    if (row.location && !locations.has(lower(row.location))) return { action: 'skip', reason: 'unknownLocation', value: row.location }
    const item = findItem(row.item_code, row.item)
    // An item created by an earlier import in this session isn't known here yet; the database decides
    if (!item) return { action: 'skip', reason: 'unknownItem', value: row.item_code || row.item }
    if (item.tracking === 'bulk') return { action: 'skip', reason: 'bulkItem', value: item.name }
    const key = row.code ? row.code.toUpperCase() : null
    const action = (key && (unitCodes.has(key) || seen.has(key))) ? 'match' : 'create'
    if (key) seen.add(key)
    return { action }
  })
  const counts = { create: 0, match: 0, skip: 0 }
  for (const p of plan) counts[p.action] += 1
  return { plan, counts }
}

// Rows to send: only the fields (and the line number)
export const toPayload = rows => rows.filter(r => !r._errors.length).map(({ _errors, ...rest }) => rest)

// The import's report as CSV: line, result, message
export function reportCsv(problems, labels) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [[labels.row, labels.level, labels.message].map(esc).join(','),
    ...(problems || []).map(p => [p.row, labels[p.level] || p.level, p.message].map(esc).join(','))].join('\n')
}

// The database's reasons for skipping a row, as i18n keys (imp.srv.*) with their values; null
// for anything else (shown as it came)
const SERVER = [
  [/^The name is missing/, 'nameMissing'],
  [/^Unknown location: (.+)$/, 'unknownLocation'],
  [/^Several items are called (.+?): add their codes/, 'sameName'],
  [/^Unknown item: (.+)$/, 'unknownItem'],
  [/^Item (.+) is counted in bulk/, 'bulkItem'],
  [/^Item (.+) is archived/, 'archived'],
  [/^Code (.+) belongs to a unit of another item/, 'otherItem'],
  [/^Serial-numbered items get their stock/, 'serialQuantity'],
  [/^A quantity needs a location/, 'needLocation'],
  [/^Quantity not added/, 'quantityKept'],
  [/^duplicate key value/, 'duplicate'],
  [/^Only rental or sale items can have stock/, 'notStock'],
  [/^Unknown kit: (.+)$/, 'unknownKit'],
  [/^The quantity must be 1 to 1000/, 'kitQuantity'],
  [/^Only sets and cases have contents/, 'notKit'],
  [/^Accessories belong to stock-tracked items/, 'accessoryUntracked'],
  [/^Only stock-tracked items can be part of a kit/, 'partUntracked'],
  [/^An item can't contain itself/, 'selfKit'],
  [/violates check constraint "price_items_kit_check"/, 'kitType'],
  [/^Stock tracking can't change/, 'trackingLocked'],
  [/^Not an e-mail address: (.+)$/, 'email'],
  [/^Several contacts are called (.+?): add their tax numbers/, 'sameContact'],
  [/^The e-mail address is missing/, 'emailMissing'],
  [/^Unknown role: (.+)$/, 'unknownRole'],
  [/^Already a member: (.+)$/, 'alreadyMember'],
  [/^Already invited: (.+)$/, 'alreadyInvited'],
  [/^Unknown status: (.+)$/, 'unknownStatus'],
  [/^Cancelled job left out: (.+)$/, 'cancelledJob'],
  [/^Past job left out: (.+)$/, 'pastJob'],
  [/^The job ends before it starts/, 'dates'],
  [/^The start date is missing/, 'noStart'],
  [/^Several gigs are called (.+?): add the job numbers/, 'sameGig'],
  [/^Unknown job: (.+)$/, 'unknownJob'],
  [/^Only stock-tracked items can be planned/, 'notTracked'],
  [/^The quantity must be 1 to 100000/, 'gigQuantity'],
  [/^The quote has no title or number/, 'noTitle'],
  [/^A line has no description or item/, 'noDescription'],
  [/^Quote already sent, left as it is: (.+)$/, 'quoteSent'],
]
export function serverMessage(message) {
  for (const [re, key] of SERVER) {
    const m = String(message || '').match(re)
    if (m) return { key, name: m[1] }
  }
  return null
}
