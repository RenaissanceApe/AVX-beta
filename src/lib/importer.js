// The import wizard (docs/SWITCHING.md, S1): reading a spreadsheet export, matching its columns
// to AVX's fields, cleaning the values and predicting what an import will do. The import itself
// runs in the database (run_import), which checks everything again.
import { parsePrice } from './quotes'
import { SPEC_FIELDS, inRange, findPreset, fillFromPreset } from './speakers'
import { electricalProblems } from './power'

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
// The CEE sockets' names: amps with one phase (3 pins, blue) or three (5 pins, red)
function ceeWords() {
  const out = {}
  for (const a of [16, 32, 63, 125]) {
    for (const [p, pins, kinds] of [[1, 3, ['single phase', 'monofasico', 'monofasica', 'blue', 'azul', '230v']], [3, 5, ['three phase', 'trifasico', 'trifasica', 'red', 'vermelho', 'vermelha', '400v']]]) {
      if (a === 125 && p === 1) continue
      const list = [`cee ${a} ${p}`, `cee${a} ${p}`, `cee ${a}a ${p}`, `cee ${a}a ${p}p`, `cee ${a} ${p}p`, `cee ${a}a ${pins}p`, `cee ${a} ${pins}p`, `cee ${a}a ${pins} pin`, `${a}a ${pins}p`, `${a}a ${p}p`]
      for (const k of kinds) list.push(`cee ${a}a ${k}`, `cee ${a} ${k}`, `cee ${a} a ${k}`)
      out[`cee${a}_${p}`] = list
    }
  }
  return out
}

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
  speakerType: {
    point_source: ['point source', 'point', 'top', 'full range', 'fullrange', 'coluna', 'topo'],
    line_array: ['line array', 'array', 'line array element', 'line source', 'linha', 'array de linha'],
    subwoofer: ['subwoofer', 'sub', 'subs', 'bass', 'grave', 'graves'],
    monitor: ['monitor', 'wedge', 'floor monitor', 'retorno', 'monitor de palco'],
    column: ['column', 'column array', 'steerable column', 'coluna linear'],
  },
  // Power connectors (P1): CEE as "CEE 32/3", "CEE 32A 5P", "CEE 32 A three-phase"…
  connector: {
    schuko: ['schuko', 'shuko', 'cee 7 4', 'cee7 4', 'tomada schuko', 'schuko 16a'],
    ...ceeWords(),
    powerlock: ['powerlock', 'power lock'],
    socapex: ['socapex', 'soca', 'socapex 19', '19 pin'],
    powercon: ['powercon', 'powercon blue', 'powercon 20a', 'powercon a'],
    powercon_true1: ['powercon true1', 'powercon true 1', 'true1', 'true 1', 'true1 top'],
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
    // Electrical fields (P1): only what the datasheet gives; amps need the voltage they're given at
    { key: 'power_typical_w', type: 'int', max: 1000000, names: ['typical power', 'power typical', 'typical watts', 'typical w', 'potencia tipica', 'consumo tipico', 'typisch vermogen'] },
    { key: 'power_factor', type: 'number', names: ['power factor', 'pf', 'cos phi', 'cosphi', 'fator de potencia', 'factor de potencia', 'arbeidsfactor', 'vermogensfactor'] },
    { key: 'inrush_a', type: 'number', names: ['inrush', 'inrush current', 'inrush a', 'inrush amps', 'corrente de arranque', 'corrente de pico', 'inschakelstroom'] },
    { key: 'current_a', type: 'number', names: ['current', 'current a', 'amps', 'amperes', 'ampere', 'current draw', 'corrente', 'consumo a', 'stroom'] },
    { key: 'current_v', type: 'int', max: 480, names: ['current voltage', 'voltage', 'volts', 'tensao', 'voltagem', 'spanning'] },
    { key: 'connector_in', type: 'enum', words: 'connector', names: ['connector', 'connector in', 'power connector', 'power in', 'input connector', 'ficha', 'ficha de entrada', 'conector', 'connector entrada', 'stekker'] },
    { key: 'connector_out', type: 'enum', words: 'connector', names: ['connector out', 'power out', 'output connector', 'thru', 'link out', 'ficha de saida', 'conector de saida'] },
    { key: 'dimensions', type: 'text', max: 80, names: ['dimensions', 'size', 'afmetingen', 'dimensoes', 'measurements'] },
    // Speaker specs (A1): a preset fills what the file leaves empty
    { key: 'speaker_preset', type: 'text', max: 120, names: ['speaker preset', 'preset', 'speaker model', 'predefinicao', 'modelo de coluna'] },
    { key: 'speaker_type', type: 'enum', words: 'speakerType', names: ['speaker type', 'speaker kind', 'tipo de coluna', 'tipo de altifalante', 'luidspreker type'] },
    { key: 'sensitivity_db', type: 'number', names: ['sensitivity', 'sensitivity db', 'sensibilidade', 'gevoeligheid'] },
    { key: 'max_spl_db', type: 'number', names: ['max spl', 'maximum spl', 'spl max', 'max spl db', 'spl', 'spl maximo'] },
    { key: 'dispersion_h', type: 'number', names: ['horizontal dispersion', 'dispersion h', 'h dispersion', 'horizontal coverage', 'dispersao horizontal', 'cobertura horizontal'] },
    { key: 'dispersion_v', type: 'number', names: ['vertical dispersion', 'dispersion v', 'v dispersion', 'vertical coverage', 'dispersao vertical', 'cobertura vertical'] },
    { key: 'freq_low_hz', type: 'number', names: ['low frequency', 'frequency low', 'freq low', 'min frequency', 'frequency from', 'frequencia minima'] },
    { key: 'freq_high_hz', type: 'number', names: ['high frequency', 'frequency high', 'freq high', 'max frequency', 'frequency to', 'frequencia maxima'] },
    { key: 'impedance_ohm', type: 'number', names: ['impedance', 'impedance ohm', 'ohm', 'ohms', 'impedancia', 'impedantie'] },
    { key: 'amp_channels', type: 'int', max: 1000, names: ['amp channels', 'amplifier channels', 'canais de amplificador', 'versterkerkanalen'] },
    { key: 'spec_source', type: 'text', max: 500, names: ['datasheet', 'data sheet', 'spec source', 'specs source', 'fonte das especificacoes'] },
    { key: 'replacement_value', type: 'money', names: ['list price', 'replacement value', 'vervangingswaarde', 'new price', 'nieuwprijs', 'valor de reposicao', 'value', 'waarde', 'insured value'] },
    { key: 'cost_price', type: 'money', names: ['cost price', 'cost', 'purchase price', 'purchase cost', 'purchase costs', 'kostprijs', 'inkoopprijs', 'aankoopprijs', 'custo', 'preco de custo', 'preco de compra', 'valor de compra'] },
    { key: 'depreciation_months', type: 'int', max: 600, names: ['depreciation months', 'depreciation', 'write off months', 'write off period', 'useful life', 'afschrijving', 'afschrijvingstermijn', 'amortizacao', 'meses de amortizacao', 'vida util'] },
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
// or "Column 1", "Column 2"… when the file has none. headerAt: how many lines (title lines) come
// before the headings; they're left out, and `offset` says how many were.
export function parseTable(text, { headerRow = true, delimiter, headerAt = 0 } = {}) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const all = records(src)
  const offset = Math.min(Math.max(0, Math.floor(Number(headerAt) || 0)), Math.max(0, all.length - 1))
  const kept = all.slice(offset)
  const d = delimiter || detectDelimiter(kept.join('\n'))
  const rows = kept.map(r => splitLine(r, d))
  const width = Math.max(0, ...rows.map(r => r.length))
  if (!rows.length) return { headers: [], rows: [], delimiter: d, offset: 0 }
  const headers = headerRow
    ? rows[0].map((h, i) => h || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`)
  return { headers, rows: (headerRow ? rows.slice(1) : rows).map(r => headers.map((_, i) => r[i] ?? '')), delimiter: d, offset }
}

// The line of the file a table's first row is on (the lines are the file's non-empty lines)
export const firstLine = (table, headerRow = true) => (headerRow ? 2 : 1) + (table?.offset || 0)

// Which line holds the headings (0 = the first): title lines above them ("Stock list March") have
// fewer filled cells than the headings. Suggested on the Choose step, never forced.
export function suggestHeaderRow(text) {
  const recs = records(String(text || '').replace(/^\uFEFF/, '')).slice(0, 20)
  if (recs.length < 2) return 0
  const filled = (r, d) => splitLine(r, d).filter(Boolean).length
  let d = '\t', width = 1
  for (const c of ['\t', ';', ',', '|']) {
    const w = Math.max(...recs.map(r => filled(r, c)))
    if (w > width) { d = c; width = w }
  }
  if (width < 2) return 0
  const need = Math.max(2, Math.ceil(width / 2))
  return Math.max(0, recs.findIndex(r => filled(r, d) >= need))
}

// A file's bytes as text: UTF-8 when it is valid UTF-8, UTF-16 when it starts with its mark, and
// otherwise Western (Windows-1252), which is how Excel on Windows saves a CSV file ("Armazém"
// instead of "Armaz�m"). encoding forces one. noticed: Windows-1252 was chosen because the file
// wasn't UTF-8, so the page says so and offers a switch.
export function decodeText(buffer, encoding = null) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (encoding) return { text: new TextDecoder(encoding).decode(bytes), encoding, noticed: false }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', noticed: false }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', noticed: false }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', noticed: false }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', noticed: true }
  }
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

// "This looks like a Units file": the kind whose fields the headings fit best, when it isn't the one
// chosen. A heading counts when it is one of a kind's own column names, and more the fewer kinds
// name it ("Serial number" is only a unit's); a kind is suggested when the chosen one lacks a
// required field and the other has them all, or when the other fits clearly better. null when the
// chosen kind is as good as any.
export function guessKind(headers, current, kinds = KINDS) {
  const all = kinds.concat(kinds.includes(current) ? [] : [current])
  const maps = Object.fromEntries(all.map(k => [k, guessMapping(headers, k)]))
  const names = Object.fromEntries(all.map(k => [k, new Set((FIELDS[k] || []).flatMap(f => f.names))]))
  const exact = (k, h) => names[k].has(normalise(h))
  const claims = h => all.filter(k => exact(k, h)).length
  const score = k => headers.filter(h => exact(k, h)).reduce((sum, h) => sum + 1 / claims(h), 0)
  const fits = k => Object.keys(maps[k]).length > 0 && missingFields(maps[k], k).length === 0
  const here = { score: score(current), fits: fits(current) }
  let best = null
  for (const k of kinds) {
    if (k === current || !fits(k)) continue
    const s = score(k)
    if (!best || s > best.score + 1e-9) best = { kind: k, score: s }
  }
  if (!best) return null
  return !here.fits || best.score >= here.score + 0.75 ? best.kind : null
}

// The file's columns with something in them that no field takes ("Not imported: Remarks, Colour")
export const unusedColumns = (table, mapping) =>
  table.headers.filter((h, i) => !mapping[h] && table.rows.some(r => String(r[i] ?? '').trim() !== ''))

// "Same for every row": the fields a file may leave out and give one value for all its rows
// instead, per kind. Each entry lists the fields that say the same thing (an item by its code or
// its name); the value goes in the first one that the choice fills.
export const SAME_FOR_ALL = {
  locations: [['kind']],
  items: [['location']],
  units: [['item_code', 'item'], ['location'], ['status']],
  kits: [['kit_code', 'kit']],
  gigs: [['status'], ['client']],
  gig_equipment: [['gig_ref', 'gig']],
  quotes: [['client']],
  crew: [['role']],
}
// The "same for every row" fields a mapping leaves open (no column gives any of them)
export function openDefaults(mapping, kind) {
  const used = new Set(Object.values(mapping))
  return (SAME_FOR_ALL[kind] || []).filter(keys => !keys.some(k => used.has(k)))
}

// Required fields not matched to any column (a "same for every row" value counts as one)
export function missingFields(mapping, kind, defaults = {}) {
  const used = new Set([...Object.values(mapping), ...Object.keys(defaults || {}).filter(k => defaults[k] != null && defaults[k] !== '')])
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

// 2024-03-01, 01-03-2024, 1/3/2024, 01.03.2024 → '2024-03-01' (day before month, unless order is
// 'mdy': 3/1/2024), or null
export function parseDate(text, order = 'dmy') {
  const s = String(text ?? '').trim()
  let y, m, d
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (r) [, y, m, d] = r
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) [, d, m, y] = order === 'mdy' ? [r[0], r[2], r[1], r[3]] : r
  else return null
  const date = new Date(Date.UTC(+y, +m - 1, +d))
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// How a date column writes its days and months, from its values: 'dmy' (a 31/12/2025 tells),
// 'mdy' (a 12/31/2025 tells), 'ask' when no value tells (or they disagree), or null when there's
// nothing to decide (dates written year first, or the same day and month)
export function dateOrder(values) {
  let dayFirst = false, monthFirst = false, open = false
  for (const v of values) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
    if (!m) continue
    const a = Number(m[1]), b = Number(m[2])
    if (a > 12 && b <= 12) dayFirst = true
    else if (b > 12 && a <= 12) monthFirst = true
    else if (a !== b) open = true
  }
  if (dayFirst !== monthFirst) return dayFirst ? 'dmy' : 'mdy'
  return dayFirst || open ? 'ask' : null
}

// The date order of each date column a mapping uses: { orders: { field: 'dmy' | 'mdy' }, columns:
// [{ header, field, noticed, order }], open: [field] } (open: asked and not answered yet). chosen:
// what the person picked ({ field: order }), which wins over what was noticed.
export function dateOrders(table, mapping, kind, custom = [], chosen = {}) {
  const fields = fieldsFor(kind, custom)
  const columns = table.headers.map((header, i) => ({ header, i, field: fields.find(f => f.key === mapping[header]) }))
    .filter(c => c.field?.type === 'date')
    .map(({ header, i, field }) => {
      const noticed = dateOrder(table.rows.map(r => r[i]))
      const order = chosen[field.key] || (noticed === 'dmy' || noticed === 'mdy' ? noticed : null)
      return { header, field: field.key, noticed, order }
    })
    .filter(c => c.noticed)
  return {
    orders: Object.fromEntries(columns.filter(c => c.order).map(c => [c.field, c.order])),
    columns,
    open: columns.filter(c => !c.order).map(c => c.field),
  }
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
      const d = parseDate(s, field.order)
      return d ? { value: d } : { error: 'date' }
    }
    // The organisation's own fields (customFieldDefs): checked as the database checks them
    case 'anyNumber': {
      const n = parseNumber(s.replace(/^-/, ''))
      return Number.isFinite(n) ? { value: s.startsWith('-') ? -n : n } : { error: 'number' }
    }
    case 'yesNo': {
      const v = parseChoice(s, 'yesNo')
      return v ? { value: v === 'yes' } : { error: 'choice' }
    }
    case 'pick': {
      const v = (field.choices || []).find(c => normalise(c) === normalise(s))
      return v ? { value: v } : { error: 'choice' }
    }
    case 'link': return /^https?:\/\/\S+$/i.test(s) && s.length <= 500 ? { value: s } : { error: 'link' }
    case 'enum': {
      const v = parseChoice(s, field.words)
      return v ? { value: v } : { error: 'choice' }
    }
    case 'code': return CODE_RE.test(s) ? { value: s } : { error: 'code' }
    case 'email': return /^[^@\s]+@[^@\s]+$/.test(s) && s.length <= 200 ? { value: s } : { error: 'email' }
    default: return s.length <= (field.max || 200) ? { value: s } : { error: 'long' }
  }
}

// The organisation's own fields (custom_fields, docs/BUSINESS.md) as fields a column can go to:
// key 'cf:<id>', checked by their kind. Their values go in the row's custom_values.
const CUSTOM_TYPES = { text: { type: 'text', max: 1000 }, number: { type: 'anyNumber' }, date: { type: 'date' }, yes_no: { type: 'yesNo', words: 'yesNo' }, choice: { type: 'pick' }, link: { type: 'link' } }
export const CUSTOM_ENTITY = { items: 'item', clients: 'client', suppliers: 'supplier', gigs: 'gig' }
export const customFieldDefs = custom => (custom || []).map(f => ({ key: `cf:${f.id}`, ...(CUSTOM_TYPES[f.kind] || CUSTOM_TYPES.text), choices: f.choices || [], label: f.label, custom: true, names: [] }))
export const fieldsFor = (kind, custom = []) => [...(FIELDS[kind] || []), ...(CUSTOM_ENTITY[kind] ? customFieldDefs(custom) : [])]

// The file's rows as AVX rows: [{ _row (line in the file), field: value, …, _errors: [{ field, error }] }].
// Rows with nothing in the matched columns are left out.
// Options:
//   defaults     "same for every row" values ({ field: text }) for fields no column gives; for
//                equipment the location is where quantities go (Rentman's export, one warehouse)
//   dateOrders   { field: 'dmy' | 'mdy' } how each date column writes its dates
//   custom       the organisation's own fields (custom_fields rows) a column can go to
//   only         the lines to read (the rows the database refused, tried again); the rest are left out
export function buildRows(table, mapping, kind, { headerRow = true, defaultLocation = null, defaults = {}, dateOrders = {}, custom = [], only = null } = {}) {
  const fields = fieldsFor(kind, custom)
  const cols = table.headers.map((h, i) => {
    const field = fields.find(f => f.key === mapping[h])
    return { i, field: field && field.type === 'date' && dateOrders[field.key] ? { ...field, order: dateOrders[field.key] } : field }
  }).filter(c => c.field)
  const given = new Set(cols.map(c => c.field.key))
  const sameForAll = Object.entries(defaults || {}).filter(([k, v]) => v != null && v !== '' && !given.has(k) && !(kind === 'items' && k === 'location'))
  const where = (kind === 'items' && !given.has('location') && defaults?.location) || defaultLocation
  const lines = only ? new Set(only.map(Number)) : null
  const first = firstLine(table, headerRow)
  const out = []
  table.rows.forEach((cells, n) => {
    const row = { _row: n + first, _errors: [] }
    if (lines && !lines.has(row._row)) return
    let any = false
    for (const { i, field } of cols) {
      const { value, error } = cleanValue(cells[i], field)
      if (error) row._errors.push({ field: field.key, error })
      if (value !== null && value !== undefined) {
        if (field.custom) row.custom_values = { ...row.custom_values, [field.key.slice(3)]: value }
        else row[field.key] = value
        any = true
      } else if (error) any = true
    }
    if (!any) return
    for (const [key, text] of sameForAll) {
      const field = fields.find(f => f.key === key)
      const { value } = field ? cleanValue(text, field) : { value: null }
      if (value !== null && value !== undefined) row[key] = value
    }
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
    if (kind === 'items') speakerChecks(row)
    if (kind === 'items') electricalChecks(row)
    if (kind === 'units' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'kits' && !row.kit && !row.kit_code) row._errors.push({ field: 'kit', error: 'missing' })
    if (kind === 'kits' && !row.item && !row.item_code) row._errors.push({ field: 'item', error: 'missing' })
    if (kind === 'kits' && row.quantity === 0) row._errors.push({ field: 'quantity', error: 'whole' })
    if (kind === 'items' && row.quantity > 0 && !row.location && where) row.location = where
    if (kind === 'items' && row.quantity > 0 && !row.location) row._errors.push({ field: 'location', error: 'needLocation' })
    out.push(row)
  })
  return out
}

// A catalogue row's speaker specs (A1): a named preset fills the cells the file left empty (never
// replaces the file's values); values outside the limits the database checks are refused here
function speakerChecks(row) {
  if (row.speaker_preset) {
    const p = findPreset(row.speaker_preset)
    if (!p) row._errors.push({ field: 'speaker_preset', error: 'unknownPreset' })
    else Object.assign(row, fillFromPreset({ ...row, speaker_preset: p.id }, p), { speaker_preset: p.id })
  }
  for (const f of SPEC_FIELDS) {
    if (row[f.key] !== undefined && row[f.key] !== null && !inRange(f, row[f.key])) row._errors.push({ field: f.key, error: 'speakerRange' })
  }
  if (row.freq_low_hz != null && row.freq_high_hz != null && row.freq_low_hz >= row.freq_high_hz) row._errors.push({ field: 'freq_high_hz', error: 'freqOrder' })
}

// A catalogue row's electrical fields (P1): values outside the limits the database checks are
// refused here; datasheet amps need the voltage they're given at; typical can't be above max
function electricalChecks(row) {
  const problems = electricalProblems(row)
  for (const [field, problem] of Object.entries(problems)) {
    if (row._errors.some(e => e.field === field)) continue
    row._errors.push({ field, error: problem === 'needVolts' ? 'powerNeedVolts' : problem === 'overMax' ? 'powerTypical' : 'powerRange' })
  }
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
// Gigs the name (and start date) fits when more than one does: the database refuses those rows
function sameGigs(gigs = [], ref, name, start) {
  const lower = s => String(s || '').toLowerCase()
  if (!name || (ref && gigs.some(g => g.import_ref && lower(g.import_ref) === lower(ref)))) return 0
  return gigs.filter(g => lower(g.name) === lower(name) && (!start || g.start_date === start)).length
}

// A tax number compared without spaces, dots, dashes or capitals (as the database does)
export const taxKey = s => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

// What sending these rows will do, predicted from what exists: each row gets
// { action: 'create' | 'match' | 'skip', reason, field, value } (the database has the final word).
// A skipped row is either a problem (with fixes, see FIXES) or left out on purpose ({ purpose: true }:
// past jobs, people already in…); a row that goes in can carry a heads-up ({ note }).
export function dryRun(rows, kind, existing) {
  const lower = s => String(s || '').toLowerCase()
  const allLocations = existing.locations || []
  const locations = new Set(allLocations.filter(l => !l.archived_at).map(l => lower(l.name)))
  const archivedLocations = new Set(allLocations.filter(l => l.archived_at).map(l => lower(l.name)))
  const items = (existing.items || []).filter(i => !i.archived_at)
  const archivedCodes = new Set((existing.items || []).filter(i => i.archived_at && i.code).map(i => i.code.toUpperCase()))
  const itemByCode = new Map(items.filter(i => i.code).map(i => [i.code.toUpperCase(), i]))
  const itemsByName = new Map()
  for (const i of items) itemsByName.set(lower(i.name), [...(itemsByName.get(lower(i.name)) || []), i])
  const unitItem = new Map((existing.units || []).map(u => [u.code.toUpperCase(), u.item_id]))
  const stocked = new Set(existing.stocked || [])
  const clients = new Set((existing.clients || []).filter(c => !c.archived_at).map(c => lower(c.name)))
  const seen = new Set()
  const findItem = (code, name) => (code && itemByCode.get(code.toUpperCase())) || (name && itemsByName.get(lower(name))?.length === 1 ? itemsByName.get(lower(name))[0] : null)
  // Why an item (or kit) wasn't found: its code is archived, or its name is shared, or it isn't there
  const missingItem = (code, name, reason, codeField, nameField) => {
    if (code && archivedCodes.has(code.toUpperCase()) && !itemByCode.has(code.toUpperCase())) return { action: 'skip', reason: 'archived', field: codeField, value: code }
    if (!code && name && (itemsByName.get(lower(name))?.length || 0) > 1) return { action: 'skip', reason: 'sameName', field: nameField, value: name }
    return { action: 'skip', reason, field: code ? codeField : nameField, value: code || name }
  }
  const badLocation = row => {
    if (!row.location || locations.has(lower(row.location))) return null
    return archivedLocations.has(lower(row.location))
      ? { action: 'skip', reason: 'archivedLocation', field: 'location', value: row.location }
      : { action: 'skip', reason: 'unknownLocation', field: 'location', value: row.location }
  }
  const clientNote = (row, result) => (result.action !== 'skip' && row.client && !clients.has(lower(row.client)) ? { ...result, note: 'clientUnknown', field: 'client', value: row.client } : result)
  const plan = rows.map(row => {
    if (row._errors.length) {
      const e = row._errors[0]
      return e.error === 'inactive' ? { action: 'skip', reason: 'inactive', field: e.field, purpose: true } : { action: 'skip', reason: e.error, field: e.field }
    }
    if (kind === 'locations') {
      const key = lower(row.name)
      const action = locations.has(key) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'items') {
      const where = badLocation(row)
      if (where) return where
      if (!row.code && row.name && (itemsByName.get(lower(row.name))?.length || 0) > 1) return { action: 'skip', reason: 'sameName', field: 'name', value: row.name }
      if (row.code && archivedCodes.has(row.code.toUpperCase()) && !itemByCode.has(row.code.toUpperCase())) return { action: 'skip', reason: 'archived', field: 'code', value: row.code }
      const key = row.code ? `#${row.code.toUpperCase()}` : lower(row.name)
      const found = findItem(row.code, row.name)
      if (!found && !seen.has(key) && row.quantity > 0 && row.tracking === 'serial') return { action: 'skip', reason: 'serialQuantity', field: 'quantity', value: row.name || row.code }
      if (found && row.tracking && row.tracking !== found.tracking && stocked.has(found.id)) return { action: 'skip', reason: 'trackingLocked', field: 'tracking', value: found.name }
      const action = found || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return found && row.quantity > 0 ? { action, note: 'quantityKept', field: 'quantity', value: found.name } : { action }
    }
    if (kind === 'gigs') {
      if (row.status === 'cancelled') return { action: 'skip', reason: 'cancelledJob', value: row.name || row.ref, purpose: true }
      if ((row.end_date || row.start_date) && (row.end_date || row.start_date) < today()) return { action: 'skip', reason: 'pastJob', value: row.name || row.ref, purpose: true }
      const found = findGig(existing.gigs, row.ref, row.name, row.start_date)
      if (!found && sameGigs(existing.gigs, row.ref, row.name, row.start_date) > 1) return { action: 'skip', reason: 'sameGig', field: 'name', value: row.name }
      if (!found && !row.start_date) return { action: 'skip', reason: 'noStart', field: 'start_date' }
      const key = row.ref ? `#${lower(row.ref)}` : `${lower(row.name)}|${row.start_date}`
      const action = found || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return clientNote(row, { action })
    }
    if (kind === 'gig_equipment') {
      const gig = findGig(existing.gigs, row.gig_ref, row.gig, null)
      if (!gig && sameGigs(existing.gigs, row.gig_ref, row.gig, null) > 1) return { action: 'skip', reason: 'sameGig', field: 'gig', value: row.gig }
      if (!gig) return { action: 'skip', reason: 'unknownJob', field: row.gig_ref ? 'gig_ref' : 'gig', value: row.gig_ref || row.gig }
      const item = findItem(row.item_code, row.item)
      if (!item) return missingItem(row.item_code, row.item, 'unknownItem', 'item_code', 'item')
      if (item.tracking === 'none') return { action: 'skip', reason: 'notTracked', field: row.item_code ? 'item_code' : 'item', value: item.name }
      const key = `${gig.id}>${item.id}`
      const action = (existing.lines || []).some(l => l.gig_id === gig.id && l.item_id === item.id) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'quotes') {
      const key = lower(row.quote_ref || row.title)
      const known = row.quote_ref && (existing.quotes || []).find(q => lower(q.import_ref) === lower(row.quote_ref))
      if (known && known.status && known.status !== 'draft') return { action: 'skip', reason: 'quoteSent', value: row.quote_ref, purpose: true }
      const action = known || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return clientNote(row, { action })
    }
    if (kind === 'crew') {
      const email = lower(row.email)
      if ((existing.members || []).map(lower).includes(email)) return { action: 'skip', reason: 'alreadyMember', value: row.email, purpose: true }
      if ((existing.invites || []).map(lower).includes(email)) return { action: 'skip', reason: 'alreadyInvited', value: row.email, purpose: true }
      const action = (existing.held || []).map(lower).includes(email) || seen.has(email) ? 'match' : 'create'
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
        if (narrowed.length > 1) return { action: 'skip', reason: 'sameContact', field: 'name', value: row.name }
        match = narrowed[0]
      }
      const key = row.tax_id ? `#${taxKey(row.tax_id)}` : lower(row.name)
      const action = match || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    if (kind === 'kits') {
      const kit = findItem(row.kit_code, row.kit)
      if (!kit) return missingItem(row.kit_code, row.kit, 'unknownKit', 'kit_code', 'kit')
      const item = findItem(row.item_code, row.item)
      if (!item) return missingItem(row.item_code, row.item, 'unknownItem', 'item_code', 'item')
      if (kit.id === item.id) return { action: 'skip', reason: 'selfKit', field: row.item_code ? 'item_code' : 'item', value: kit.name }
      const partKind = row.part_kind || (!kit.kit_type && kit.tracking !== 'none' && !row.kit_type ? 'accessory' : 'content')
      const key = `${kit.id}>${item.id}>${partKind}`
      const action = (existing.parts || []).some(p => p.parent_id === kit.id && p.child_id === item.id && p.kind === partKind) || seen.has(key) ? 'match' : 'create'
      seen.add(key)
      return { action }
    }
    // units
    const where = badLocation(row)
    if (where) return where
    const item = findItem(row.item_code, row.item)
    // An item created by an earlier import in this session isn't known here yet; the database decides
    if (!item) return missingItem(row.item_code, row.item, 'unknownItem', 'item_code', 'item')
    if (item.tracking === 'bulk') return { action: 'skip', reason: 'bulkItem', field: row.item_code ? 'item_code' : 'item', value: item.name }
    const key = row.code ? row.code.toUpperCase() : null
    if (key && unitItem.has(key) && unitItem.get(key) !== item.id) return { action: 'skip', reason: 'otherItem', field: 'code', value: row.code }
    const action = (key && (unitItem.has(key) || seen.has(key))) ? 'match' : 'create'
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
  [/violates check constraint "price_items_speaker_check"/, 'speakerSpec'],
  [/violates check constraint "price_items_power_check"/, 'powerSpec'],
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
  // One of the organisation's own fields (custom_values_before)
  [/^Value does not fit the field/, 'customValue'],
  [/^Unknown field/, 'customField'],
]
export function serverMessage(message) {
  for (const [re, key] of SERVER) {
    const m = String(message || '').match(re)
    if (m) return { key, name: m[1] }
  }
  return null
}
// Every key the database's reasons can turn into (for the FIXES coverage test)
export const SERVER_KEYS = SERVER.map(([, key]) => key)

// ── Fixing it in the check (docs/SWITCHING.md, "Import overhaul: fix it here") ─────────────────
// The pipeline: table → fixTable(table, mapping, fixes) → buildRows → dryRun(rows, kind,
// withPending(existing, fixes)) → groupProblems. The fixes are a list kept by the wizard page, so
// Back and Next keep them; each one can be taken back. A fix is one of:
//   { type: 'replace', field, from, set }   every row whose cell in `field` is `from` (compared
//                                           without capitals or spaces around) gets the cells in
//                                           `set` ({ field: text }); '' empties a cell
//   { type: 'cells', edits }                edited cells: { [line]: { field: text } }
//   { type: 'skip', lines }                 rows left out on purpose
//   { type: 'add', what, record, edits? }   something to add when Import is pressed: a location
//                                           ({ name, kind }), an item ({ name, code, tracking, kind })
//                                           or a client ({ name }); edits as for 'cells'
//   { type: 'restore', id, name }           an archived location brought back when Import is pressed
//   { type: 'track', id, name }             an item starts being counted in stock when Import is pressed
// Each fix also carries `key` (the problem group it answers) and `fix` (which of FIXES it is).

// Which fixes each reason offers. Every group can also be left out ('skip'); fixes listed under
// im3 need the database part (IM3) and show as not available yet. Reasons with purpose: true are
// left out on purpose (no fix needed), and note: true marks a heads-up, not a problem.
export const FIXES = {
  // A bad or missing cell
  number: { fixes: ['edit', 'treatEmpty'] },
  whole: { fixes: ['edit', 'treatEmpty'] },
  date: { fixes: ['edit', 'treatEmpty'] },
  email: { fixes: ['edit', 'treatEmpty'] },
  code: { fixes: ['edit', 'stripSpaces', 'treatEmpty'] },
  long: { fixes: ['edit', 'cut'] },
  missing: { fixes: ['edit'] },
  noStart: { fixes: ['edit'] },
  dates: { fixes: ['swapDates', 'edit'] },
  choice: { fixes: ['treatAs', 'leaveEmpty'] },
  needLocation: { fixes: ['putIn'] },
  // Speaker and power specs (D80, D93)
  unknownPreset: { fixes: ['pickPreset', 'leaveEmpty'] },
  speakerRange: { fixes: ['edit'] },
  freqOrder: { fixes: ['edit'] },
  powerRange: { fixes: ['edit'] },
  powerTypical: { fixes: ['edit'] },
  powerNeedVolts: { fixes: ['fillVolts', 'edit'] },
  // What the row points at
  unknownLocation: { fixes: ['addLocation', 'useLocation'] },
  archivedLocation: { fixes: ['restoreLocation', 'useLocation'] },
  unknownItem: { fixes: ['useItem', 'addItem'] },
  unknownKit: { fixes: ['useItem', 'addKit'] },
  sameName: { fixes: ['chooseItem'] },
  archived: { fixes: ['restoreItem', 'useItem'], im3: ['restoreItem'] },
  bulkItem: { fixes: ['useItem'] },
  notTracked: { fixes: ['startTracking', 'useItem'] },
  selfKit: { fixes: ['useItem'] },
  unknownJob: { fixes: ['useGig'] },
  sameGig: { fixes: ['chooseGig'] },
  sameContact: { fixes: ['chooseContact', 'newContact'], im3: ['newContact'] },
  serialQuantity: { fixes: ['countBulk', 'dropQuantity'] },
  otherItem: { fixes: ['edit'] },
  trackingLocked: { fixes: ['keepTracking'] },
  // Left out on purpose (IM4 adds "Import as past jobs")
  pastJob: { purpose: true },
  cancelledJob: { purpose: true },
  inactive: { purpose: true },
  alreadyMember: { purpose: true },
  alreadyInvited: { purpose: true },
  quoteSent: { purpose: true },
  // Heads-ups before importing
  quantityKept: { note: true },
  clientUnknown: { note: true, fixes: ['addContact', 'linkContact'] },
  // Only the database gives these (after the import; IM2 brings them back to the check)
  nameMissing: { fixes: ['edit'] },
  emailMissing: { fixes: ['edit'] },
  noTitle: { fixes: ['edit'] },
  noDescription: { fixes: ['edit'] },
  duplicate: { fixes: ['edit'] },
  notStock: { fixes: ['edit'] },
  kitQuantity: { fixes: ['edit'] },
  gigQuantity: { fixes: ['edit'] },
  kitType: { fixes: ['edit'] },
  notKit: { fixes: ['useItem'] },
  accessoryUntracked: { fixes: ['useItem'] },
  partUntracked: { fixes: ['useItem'] },
  speakerSpec: { fixes: ['edit'] },
  powerSpec: { fixes: ['edit'] },
  unknownRole: { fixes: ['edit'] },
  unknownStatus: { fixes: ['edit'] },
  // The organisation's own fields (IM2): a link that isn't one is edited or left empty; what the
  // database refuses after the import comes back to the check (fix and try again)
  link: { fixes: ['edit', 'treatEmpty'] },
  customValue: { fixes: ['edit'] },
  customField: { fixes: ['edit'] },
  // Any other refusal brought back from the database: its rows can be edited or left out
  refused: { fixes: ['edit'] },
}

// The fixes a group offers, in order, each { id, im3 } (not available until IM3), ending with 'skip'
export function fixesFor(reason) {
  const entry = FIXES[reason]
  if (!entry || entry.purpose) return []
  const list = (entry.fixes || []).map(id => ({ id, im3: (entry.im3 || []).includes(id) }))
  return entry.note ? list : [...list, { id: 'skip', im3: false }]
}

// Problems answered by changing one value for every row that has it (the rest are grouped by field)
const BY_VALUE = new Set(['choice', 'unknownPreset', 'unknownLocation', 'archivedLocation', 'unknownItem', 'unknownKit', 'sameName', 'archived',
  'bulkItem', 'notTracked', 'selfKit', 'unknownJob', 'sameGig', 'sameContact', 'clientUnknown', 'refused'])
const keyOf = s => String(s ?? '').trim().toLowerCase()

// The column a field comes from, adding an empty one when the file has none (a fix can fill a
// field the file left out, e.g. the voltage)
function columnFor(table, mapping, field) {
  const header = Object.keys(mapping).find(h => mapping[h] === field)
  if (header !== undefined) return table.headers.indexOf(header)
  const name = `⁣${field}`
  table.headers.push(name)
  for (const r of table.rows) r.push('')
  mapping[name] = field
  return table.headers.length - 1
}

// The table with the fixes applied (a copy: the file itself never changes)
export function fixTable(table, mapping, fixes = [], { headerRow = true } = {}) {
  const out = { ...table, headers: [...table.headers], rows: table.rows.map(r => [...r]) }
  const map = { ...mapping }
  const first = firstLine(table, headerRow)
  const editCells = edits => {
    for (const [line, cells] of Object.entries(edits || {})) {
      const row = out.rows[Number(line) - first]
      if (!row) continue
      for (const [field, text] of Object.entries(cells)) {
        const col = columnFor(out, map, field)
        row[col] = String(text ?? '')
      }
    }
  }
  for (const fix of fixes) {
    if (fix.type === 'replace') {
      const col = Object.keys(map).find(h => map[h] === fix.field)
      if (col === undefined) continue
      const i = out.headers.indexOf(col)
      const lines = out.rows.map((r, n) => (keyOf(r[i]) === fix.from ? n : -1)).filter(n => n >= 0)
      for (const [field, text] of Object.entries(fix.set || {})) {
        const c = columnFor(out, map, field)
        for (const n of lines) out.rows[n][c] = String(text ?? '')
      }
    }
    if (fix.type === 'cells' || fix.type === 'add') editCells(fix.edits)
  }
  return { table: out, mapping: map }
}

// What exists, plus what the fixes will add or bring back when Import is pressed
export function withPending(existing, fixes = []) {
  if (!existing) return existing
  const ex = { ...existing, locations: [...(existing.locations || [])], items: [...(existing.items || [])], clients: [...(existing.clients || [])] }
  fixes.forEach((fix, n) => {
    if (fix.type === 'add' && fix.what === 'location') ex.locations.push({ name: fix.record.name, pending: true })
    if (fix.type === 'add' && fix.what === 'item') ex.items.push({ id: `pending-${n}`, name: fix.record.name, code: fix.record.code || null, tracking: fix.record.tracking, pending: true })
    if (fix.type === 'add' && fix.what === 'client') ex.clients.push({ name: fix.record.name, pending: true })
    if (fix.type === 'restore') ex.locations = ex.locations.map(l => (l.id === fix.id ? { ...l, archived_at: null } : l))
    if (fix.type === 'track') ex.items = ex.items.map(i => (i.id === fix.id ? { ...i, tracking: 'bulk' } : i))
  })
  return ex
}

// Which group a row's problem goes in: by reason and field, and for value problems by the cell
// (what a 'replace' fix looks for)
const groupKey = (reason, field, cell, value) => `${reason}|${field || ''}|${BY_VALUE.has(reason) ? keyOf(cell || value) : ''}`

// The rows with a problem (or a heads-up, or left out on purpose), grouped by cause and value:
// [{ key, reason, field, value, from, lines: [{ line, raw, value }], purpose, note, fixes }]. raw(line, field)
// gives a cell as the file has it (after the fixes), for editing.
export function groupProblems(rows, plan, kind, raw = () => '') {
  const groups = new Map()
  rows.forEach((row, i) => {
    const p = plan[i]
    if (p.leftOut) return
    const reason = p.action === 'skip' ? p.reason : p.note
    if (!reason) return
    const cell = p.field ? raw(row._row, p.field) : ''
    const key = groupKey(reason, p.field, cell, p.value)
    if (!groups.has(key)) {
      const entry = FIXES[reason] || {}
      // A refusal with no field to edit can only be left out
      const fixes = fixesFor(reason).filter(f => f.id !== 'edit' || p.field)
      groups.set(key, { key, kind, reason, field: p.field || null, value: BY_VALUE.has(reason) ? (p.value ?? cell) : null, from: BY_VALUE.has(reason) ? keyOf(cell || p.value) : '',
        lines: [], purpose: !!entry.purpose || !!p.purpose, note: !!entry.note && p.action !== 'skip', refused: !!p.refused, fixes })
    }
    groups.get(key).lines.push({ line: row._row, raw: cell, value: p.value ?? null })
  })
  return [...groups.values()]
}

// The names closest to a value first: the same once spaces and accents are ignored, then
// one inside the other, then the fewest letters apart
export function closest(value, names) {
  const v = normalise(value)
  const distance = (a, b) => {
    const d = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]
      d[0] = i
      for (let j = 1; j <= b.length; j++) {
        const keep = d[j]
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
        prev = keep
      }
    }
    return d[b.length]
  }
  const score = name => {
    const n = normalise(name)
    if (n === v) return -2
    if (v && (n.includes(v) || v.includes(n))) return -1
    return distance(n, v)
  }
  return [...names].map((name, i) => ({ name, i, s: score(name) })).sort((a, b) => a.s - b.s || a.i - b.i).map(x => x.name)
}

// The whole check: the rows as they'll be sent, the plan, the groups and the counts.
// Groups nobody decided on are left out of the import (the owner's default, principle 6).
// defaults, dateOrders, custom and only are buildRows's options. refused: the rows the database
// refused last time ({ [line]: { message, sent } }, see refusedRows); each comes back as a problem
// until it changes or a fix answers its group.
export function checkImport({ table, mapping, kind, headerRow = true, defaultLocation = null, defaults = {}, dateOrders = {}, custom = [], only = null, refused = null, existing, fixes = [] }) {
  const fixed = fixTable(table, mapping, fixes, { headerRow })
  const rows = buildRows(fixed.table, fixed.mapping, kind, { headerRow, defaultLocation, defaults, dateOrders, custom, only })
  const { plan } = dryRun(rows, kind, withPending(existing, fixes))
  const first = firstLine(table, headerRow)
  const raw = (line, field) => {
    const header = Object.keys(fixed.mapping).find(h => fixed.mapping[h] === field)
    const r = fixed.table.rows[line - first]
    return header === undefined || !r ? '' : String(r[fixed.table.headers.indexOf(header)] ?? '')
  }
  if (refused) {
    const answered = new Set(fixes.filter(f => f.type !== 'skip' && f.key).map(f => f.key))
    rows.forEach((row, i) => {
      const r = refused[row._row]
      if (!r || plan[i].action === 'skip' || JSON.stringify(sent(row)) !== r.sent) return
      const said = serverMessage(r.message)
      const reason = said ? said.key : 'refused'
      const field = refusedField(reason, row, kind)
      const value = said ? said.name ?? null : r.message
      if (answered.has(groupKey(reason, field, field ? raw(row._row, field) : '', value))) return
      plan[i] = { action: 'skip', reason, field, value, refused: true }
    })
  }
  const out = new Set(fixes.filter(f => f.type === 'skip').flatMap(f => f.lines))
  rows.forEach((row, i) => { if (out.has(row._row)) plan[i] = { action: 'skip', reason: 'leftOut', leftOut: true } })
  const groups = groupProblems(rows, plan, kind, raw)
  const counts = { create: 0, match: 0, problems: 0, purpose: 0, leftOut: 0, notes: 0 }
  plan.forEach(p => {
    if (p.action !== 'skip') counts[p.action] += 1
    else if (p.leftOut) counts.leftOut += 1
    else if (p.purpose) counts.purpose += 1
    else counts.problems += 1
    if (p.note) counts.notes += 1
  })
  const sendable = toPayload(rows.filter((_, i) => plan[i].action !== 'skip'))
  const adds = { location: 0, item: 0, client: 0 }
  for (const f of fixes) if (f.type === 'add') adds[f.what] += 1
  return { rows, plan, groups, counts, sendable, adds, raw, mapping: fixed.mapping }
}

// ── After the import (docs/SWITCHING.md, "Done step") ────────────────────────────────────────
// A row as it was sent, without its line number (to tell whether it changed since)
const sent = ({ _row, _errors, ...rest }) => rest

// The field a refusal from the database is about, so its rows can be edited (null: none to edit)
function refusedField(reason, row, kind) {
  const item = row.item_code ? 'item_code' : 'item'
  const fields = {
    nameMissing: 'name', emailMissing: 'email', email: 'email', noTitle: 'title', noDescription: 'description', noStart: 'start_date',
    dates: 'end_date', unknownRole: 'role', unknownStatus: 'status', kitQuantity: 'quantity', gigQuantity: 'quantity', kitType: 'kit_type',
    notStock: 'kind', unknownLocation: 'location', needLocation: 'location', otherItem: 'code', duplicate: kind === 'items' || kind === 'units' ? 'code' : 'name',
    unknownItem: kind === 'items' ? 'name' : item, sameName: kind === 'items' ? 'name' : item, archived: kind === 'items' ? 'code' : item,
    bulkItem: item, notTracked: item, partUntracked: item, accessoryUntracked: item, selfKit: item, notKit: row.kit_code ? 'kit_code' : 'kit',
    unknownKit: row.kit_code ? 'kit_code' : 'kit', unknownJob: row.gig_ref ? 'gig_ref' : 'gig', sameGig: row.gig_ref ? 'gig_ref' : 'gig',
    serialQuantity: 'quantity', trackingLocked: 'tracking', sameContact: 'name',
  }
  const field = fields[reason] || null
  return field && (FIELDS[kind] || []).some(f => f.key === field) ? field : null
}

// The rows the database refused in an import's result, by line: { [line]: { message, sent } },
// for "fix and try again". Left out on purpose isn't a refusal. sentRows: the rows as sent.
export function refusedRows(problems, sentRows) {
  const byLine = new Map((sentRows || []).map(r => [Number(r._row), r]))
  const out = {}
  for (const p of problems || []) {
    if (p.level !== 'skip') continue
    const said = serverMessage(p.message)
    if (said && FIXES[said.key]?.purpose) continue
    const row = byLine.get(Number(p.row))
    if (row) out[p.row] = { message: p.message, sent: JSON.stringify(sent(row)) }
  }
  return out
}

// More than MAX_ROWS rows go in parts of MAX_ROWS, each its own import (a batch each in Earlier
// imports). A quote's lines stay together, as the database groups them (by number, else title).
export function splitParts(rows, kind, size = MAX_ROWS) {
  if (rows.length <= size) return [rows]
  const groups = new Map()
  rows.forEach((r, n) => {
    const key = kind === 'quotes' ? String(r.quote_ref || r.title || `#${n}`).trim().toLowerCase() : `#${n}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  })
  const parts = []
  let part = []
  for (const g of groups.values()) {
    if (part.length && part.length + g.length > size) { parts.push(part); part = [] }
    part.push(...g)
  }
  if (part.length) parts.push(part)
  return parts
}

// The results of several parts as one
export function mergeResults(results) {
  const sum = k => results.reduce((n, r) => n + (Number(r?.[k]) || 0), 0)
  return { ...results.at(-1), created: sum('created'), updated: sum('updated'), unchanged: sum('unchanged'), skipped: sum('skipped'), problems: results.flatMap(r => r?.problems || []) }
}

// The rows left out, as a CSV file with the file's own columns and a Problem column, to fix in a
// spreadsheet and import as a small file. entries: [{ line, problem }] (several for one line are
// joined); the cells are the file's own, before any fix.
export function leftOutCsv(table, entries, { headerRow = true, problem = 'Problem' } = {}) {
  const esc = v => (/[",\n\r;]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))
  const first = firstLine(table, headerRow)
  const byLine = new Map()
  for (const e of entries || []) byLine.set(Number(e.line), [...(byLine.get(Number(e.line)) || []), e.problem].filter((p, i, a) => p && a.indexOf(p) === i))
  const lines = [...byLine.keys()].filter(n => table.rows[n - first]).sort((a, b) => a - b)
  const out = lines.map(n => [...table.rows[n - first], byLine.get(n).join('; ')].map(esc).join(','))
  return [...(headerRow ? [[...table.headers, problem].map(esc).join(',')] : []), ...out].join('\n')
}

// The values each choice field takes (for "treat X as …"): { words: [value, …] }
export const WORD_VALUES = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, Object.keys(v)]))
