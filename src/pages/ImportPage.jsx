import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Upload, MapPin, Package, Barcode, Boxes, AlertTriangle, Check, Download, Undo2, Save, FileText, Building2, Truck, Users, CalendarDays, PackageCheck, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { KINDS, FIELDS, looksLikeRentman, MAX_ROWS, parseTable, guessMapping, applyPreset, missingFields, reportCsv, serverMessage } from '../lib/importer'
import CheckStep from '../components/import/CheckStep'
import { isContacts, isHeld, isJob, unbatched, contactsOff } from '../components/import/kinds'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { Modal, btn, btnPrimary, btnDanger, input, label, colors, AvxLoader, PageHeader, space } from '../components/ui'

const STEPS = ['choose', 'match', 'check', 'done']
const KIND_ICONS = { locations: MapPin, items: Package, units: Barcode, kits: Boxes, clients: Building2, suppliers: Truck, crew: Users, gigs: CalendarDays, gig_equipment: PackageCheck, quotes: Receipt }
// Kit contents are kept as equipment imports with subject 'kits' (presets and history too)
const stored = kind => (kind === 'kits' ? { kind: 'items', subject: 'kits' } : { kind, subject: null })
const MAX_FILE = 5 * 1024 * 1024
// The kinds on the first step, in groups. Inventory kinds are numbered in the order they depend on
// each other, and so are jobs (their equipment needs the jobs and the catalogue first).
const KIND_GROUPS = [
  { key: 'inventory', kinds: ['locations', 'items', 'units', 'kits'], numbered: true, note: 'imp.order' },
  { key: 'contacts', kinds: ['clients', 'suppliers'] },
  { key: 'work', kinds: ['crew', 'gigs', 'gig_equipment', 'quotes'], note: 'imp.orderWork' },
]
// Where each kind's records are looked at: [path, label key]
function homeOf(orgId, kind) {
  if (isHeld(kind)) return [`/org/${orgId}?panel=members`, 'nav.members']
  if (kind === 'quotes') return [`/org/${orgId}/quotes`, 'nav.quotes']
  if (isJob(kind)) return [`/org/${orgId}`, 'nav.orgGigs']
  if (isContacts(kind)) return [`/org/${orgId}/contacts${kind === 'suppliers' ? '?tab=suppliers' : ''}`, 'contacts.title']
  return [`/org/${orgId}/inventory${kind === 'locations' ? '?tab=locations' : ''}`, 'inv.title']
}

// The import wizard (docs/SWITCHING.md, S1): choose what to import and drop a CSV file (or paste
// from a spreadsheet), match its columns to AVX's fields (saved as presets), check what will
// happen, import in one batch, and read the report. Earlier imports can be undone while nothing
// has used what they added.
//   /org/:orgId/inventory/import (?kind=locations|items|units|kits|clients|suppliers|crew)
export default function ImportPage() {
  const { orgId } = useParams()
  const [params] = useSearchParams()
  const { orgs, roleIn, loading } = useWorkspace()
  const role = roleIn(orgId)
  const org = orgs.find(o => o.id === orgId)
  const canImport = role === 'admin' || role === 'member'
  // Inviting people is for admins only, so crew are only offered to them
  const kinds = KINDS.filter(k => !isHeld(k) || role === 'admin')
  const [kind, setKind] = useState(KINDS.includes(params.get('kind')) ? params.get('kind') : 'items')
  useEffect(() => { if (!loading && isHeld(kind) && role !== 'admin') setKind('items') }, [loading, role, kind])
  const [step, setStep] = useState('choose')
  const [source, setSource] = useState({ text: '', fileName: null })
  const [headerRow, setHeaderRow] = useState(true)
  const [mapping, setMapping] = useState({})
  const [presetName, setPresetName] = useState(null)
  const [defaultLocation, setDefaultLocation] = useState('')
  const [result, setResult] = useState(null)
  const [historyKey, setHistoryKey] = useState(0)
  // The fixes made in the check, kept here so Back and Next keep them; a new file or kind starts afresh
  const [fixes, setFixes] = useState([])
  useEffect(() => { setFixes([]) }, [source.text, kind, headerRow])

  const table = useMemo(() => parseTable(source.text, { headerRow }), [source.text, headerRow])
  const restart = nextKind => { setStep('choose'); setSource({ text: '', fileName: null }); setMapping({}); setPresetName(null); setResult(null); if (nextKind) setKind(nextKind) }

  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!canImport) return <AppShell><p style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', color: colors.muted, fontSize: '14px', lineHeight: 1.6, padding: '0 16px' }}>{t('inv.noAccess')}</p></AppShell>

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: `${space[5]} var(--gutter) ${space[7]}` }}>
        <Link to={homeOf(orgId, kind)[0]} style={{ ...btn, background: 'transparent', color: colors.soft, padding: '6px 12px', textDecoration: 'none', marginBottom: space[4] }}>
          <ArrowLeft size={14} /> {t(homeOf(orgId, kind)[1])}
        </Link>
        <PageHeader eyebrow={org?.name} title={t('imp.title')} line={t('imp.subtitle')} />

        {/* The steps: the current one is the text colour with a 2px accent bar under it, not a box (DESIGN.md rule 3) */}
        <ol aria-label={t('imp.steps')} style={{ listStyle: 'none', padding: 0, margin: `0 0 ${space[6]}`, display: 'flex', gap: `${space[1]} ${space[4]}`, flexWrap: 'wrap', borderBottom: `1px solid ${colors.border}` }}>
          {STEPS.map((s, i) => {
            const on = s === step, done = STEPS.indexOf(step) > i
            return (
              <li key={s} aria-current={on ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: '14px', fontWeight: on ? 700 : 400,
                color: on ? 'var(--text)' : done ? colors.soft : colors.muted, padding: `${space[2]} 0`, marginBottom: '-1px', borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}` }}>
                <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', color: done ? colors.accentText : undefined }}>{done ? '✓' : i + 1}</span> {t(`imp.step.${s}`)}
              </li>
            )
          })}
        </ol>

        {step === 'choose' && (
          <>
            <SwitchChecklist orgId={orgId} kinds={kinds} kind={kind} onPick={setKind} />
            <ChooseStep kinds={kinds} kind={kind} setKind={setKind} source={source} setSource={setSource} headerRow={headerRow} setHeaderRow={setHeaderRow} table={table}
              onNext={() => { setMapping(guessMapping(table.headers, kind)); setPresetName(null); setStep('match') }} />
          </>
        )}
        {step === 'match' && (
          <MatchStep orgId={orgId} kind={kind} table={table} mapping={mapping} setMapping={setMapping} presetName={presetName} setPresetName={setPresetName}
            defaultLocation={defaultLocation} setDefaultLocation={setDefaultLocation}
            onBack={() => setStep('choose')} onNext={() => setStep('check')} />
        )}
        {step === 'check' && (
          <CheckStep orgId={orgId} kind={kind} table={table} mapping={mapping} headerRow={headerRow} defaultLocation={defaultLocation} fileName={source.fileName} presetName={presetName}
            fixes={fixes} setFixes={setFixes}
            onBack={() => setStep('match')} onDone={res => { setResult(res); setStep('done'); setHistoryKey(k => k + 1) }} />
        )}
        {step === 'done' && result && <DoneStep orgId={orgId} kind={kind} result={result} onAgain={restart} />}

        <History orgId={orgId} key={historyKey} />
      </div>
    </AppShell>
  )
}

// The move from another tool, in order, with what's already in AVX for each step
// (docs/SWITCHING.md, S4). A step is ticked once something of its kind is in the organisation.
const CHECKLIST = [
  { kind: 'locations', table: 'stock_locations' },
  { kind: 'items', table: 'price_items' },
  { kind: 'units', table: 'stock_units' },
  { kind: 'kits', table: 'item_parts' },
  { kind: 'clients', table: 'clients' },
  { kind: 'suppliers', table: 'suppliers' },
  { kind: 'crew', table: 'held_invites' },
  { kind: 'gigs', table: 'gigs', imported: true },
  { kind: 'gig_equipment', table: 'gig_equipment' },
  { kind: 'quotes', table: 'quotes', imported: true },
]
function SwitchChecklist({ orgId, kinds, kind, onPick }) {
  const [counts, setCounts] = useState(null)
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('avx.switchChecklist') !== 'closed' } catch { return true } })
  useEffect(() => {
    Promise.all(CHECKLIST.map(c => {
      let q = supabase.from(c.table).select('*', { count: 'exact', head: true }).eq('org_id', orgId)
      if (c.imported) q = q.not('import_ref', 'is', null)
      return q.then(({ count }) => [c.kind, count || 0])
    })).then(list => setCounts(Object.fromEntries(list)))
  }, [orgId])
  function toggle() {
    setOpen(o => { try { localStorage.setItem('avx.switchChecklist', o ? 'closed' : 'open') } catch { /* private mode */ } return !o })
  }
  if (!counts) return null
  const steps = CHECKLIST.filter(c => kinds.includes(c.kind))
  const done = steps.filter(c => counts[c.kind] > 0).length
  return (
    <section aria-labelledby="switch-title" style={{ marginBottom: space.section }}>
      <button type="button" onClick={toggle} aria-expanded={open} style={{ display: 'flex', width: '100%', alignItems: 'baseline', gap: space[3], background: 'none', border: 'none', padding: 0, minHeight: '44px', color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <h2 id="switch-title" style={{ font: '700 16px/24px var(--font-mono)', margin: 0, flex: 1 }}>{t('imp.switch.title')}</h2>
        <span style={{ fontSize: '13px', color: colors.soft }}>{t('imp.switch.progress', { done, total: steps.length })}</span>
      </button>
      {open && (
        <>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: `0 0 ${space[3]}` }}>{t('imp.switch.intro')}</p>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${colors.border}` }}>
            {steps.map((c, i) => {
              const n = counts[c.kind]
              return (
                <li key={c.kind}>
                  <button type="button" onClick={() => onPick(c.kind)} aria-pressed={kind === c.kind} style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: space[2], minHeight: '44px', padding: `${space[2]} ${space[2]}`, border: 'none', borderBottom: `1px solid ${colors.border}`, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                    background: kind === c.kind ? 'var(--selection)' : 'none', borderLeft: `2px solid ${kind === c.kind ? colors.accent : 'transparent'}`, color: 'var(--text)', fontSize: '14px',
                  }}>
                    <span aria-hidden="true" style={{ width: '20px', textAlign: 'center', color: n ? colors.accentText : colors.muted, fontWeight: 700 }}>{n ? '✓' : i + 1}</span>
                    <span style={{ flex: 1 }}>{t(`imp.kind.${c.kind}`)}</span>
                    <span style={{ fontSize: '13px', color: colors.muted }}>{n ? t('imp.switch.count', { count: n }) : t('imp.switch.todo')}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

function ChooseStep({ kinds, kind, setKind, source, setSource, headerRow, setHeaderRow, table, onNext }) {
  const { notify } = useToast()
  const fileRef = useRef(null)
  async function readFile(file) {
    if (!file) return
    if (file.size > MAX_FILE) return notify(t('imp.tooBig'), 'error')
    // Excel workbooks: the first sheet, read here (the reader is only loaded when needed)
    if (/\.xlsx$/i.test(file.name)) {
      try {
        const { readXlsx, rowsToText } = await import('../lib/xlsx')
        const { rows } = readXlsx(await file.arrayBuffer())
        setSource({ text: rowsToText(rows), fileName: file.name })
      } catch (error) {
        logger.error('import', error, { step: 'xlsx' })
        notify(t('imp.xlsxError'), 'error')
      }
      return
    }
    if (/\.(xls|xlsm|ods|numbers)$/i.test(file.name)) return notify(t('imp.notCsv'), 'error')
    const reader = new FileReader()
    reader.onload = () => setSource({ text: String(reader.result || ''), fileName: file.name })
    reader.onerror = () => notify(t('imp.readError'), 'error')
    reader.readAsText(file)
  }
  const tooMany = table.rows.length > MAX_ROWS
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[6] }}>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ font: '700 16px/24px var(--font-mono)', padding: 0, marginBottom: space[3] }}>{t('imp.what')}</legend>
        {KIND_GROUPS.map(group => {
          const inGroup = group.kinds.filter(k => kinds.includes(k))
          if (!inGroup.length) return null
          return (
            <div key={group.key} style={{ marginBottom: space[5] }}>
              <p style={{ ...label, margin: `0 0 ${space[2]}` }}>{t(`imp.group.${group.key}`)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: `0 ${space[5]}` }}>
                {inGroup.map((k, i) => {
                  const Icon = KIND_ICONS[k]
                  return (
                    // A choice row, not a box: the radio and a 2px bar show the chosen one (one box deep)
                    <label key={k} style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', cursor: 'pointer', padding: `${space[3]} ${space[2]}`, borderBottom: `1px solid ${colors.border}`,
                      borderLeft: `2px solid ${kind === k ? colors.accent : 'transparent'}` }}>
                      <input type="radio" name="imp-kind" value={k} checked={kind === k} onChange={() => setKind(k)} style={{ accentColor: 'var(--accent)', marginTop: '3px' }} />
                      <span>
                        <strong style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: '14px' }}><Icon size={15} color={colors.accentText} aria-hidden="true" /> {group.numbered ? `${i + 1}. ` : ''}{t(`imp.kind.${k}`)}</strong>
                        <span style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t(`imp.kindAbout.${k}`)}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {group.note && <p style={{ fontSize: '13px', color: colors.muted, marginTop: space[2] }}>{t(group.note)}</p>}
            </div>
          )
        })}
      </fieldset>

      <div>
        <span style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[3], display: 'block' }}>{t('imp.file')}</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={btn}><Upload size={14} /> {t('imp.chooseFile')}</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
          {source.fileName && <span style={{ fontSize: '13px', display: 'flex', gap: space[2], alignItems: 'center' }}><FileText size={14} aria-hidden="true" /> {source.fileName}</span>}
          <span style={{ fontSize: '13px', color: colors.muted }}>{t('imp.fileHint')}</span>
        </div>
        <label htmlFor="imp-paste" style={{ ...label }}>{t('imp.paste')}</label>
        <textarea id="imp-paste" rows={6} wrap="off" value={source.fileName ? '' : source.text} placeholder={source.fileName ? t('imp.fromFile') : t('imp.pastePlaceholder')}
          onChange={e => setSource({ text: e.target.value, fileName: null })}
          style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '13px', resize: 'vertical' }} />
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginTop: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={headerRow} onChange={e => setHeaderRow(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> {t('imp.headerRow')}
        </label>
      </div>

      {source.text && (
        <p role="status" style={{ fontSize: '13px', color: tooMany ? colors.danger : colors.soft }}>
          {tooMany ? t('imp.tooMany', { max: MAX_ROWS }) : t('imp.read', { rows: table.rows.length, cols: table.headers.length })}
        </p>
      )}
      <div>
        <button type="button" onClick={onNext} disabled={!table.rows.length || tooMany} style={btnPrimary}>{t('imp.next')} <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}

function MatchStep({ orgId, kind, table, mapping, setMapping, presetName, setPresetName, defaultLocation, setDefaultLocation, onBack, onNext }) {
  const { notify } = useToast()
  const [presets, setPresets] = useState([])
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const fields = FIELDS[kind]

  const loadPresets = useCallback(async () => {
    if (unbatched(kind)) return setPresets([])
    const where = stored(kind)
    let q = supabase.from('import_presets').select('id, name, mapping').eq('org_id', orgId).eq('kind', where.kind)
    q = where.subject ? q.eq('subject', where.subject) : q.is('subject', null)
    const { data, error } = await q.order('name')
    if (error) logger.error('import', error, { step: 'presets' })
    setPresets(data || [])
  }, [orgId, kind])
  useEffect(() => { loadPresets() }, [loadPresets])

  // Quantities without a location column (Rentman's equipment export): one warehouse for them all
  const used = Object.values(mapping)
  const needsLocation = kind === 'items' && used.includes('quantity') && !used.includes('location')
  const [locations, setLocations] = useState([])
  useEffect(() => {
    if (!needsLocation) return
    supabase.from('stock_locations').select('name').eq('org_id', orgId).is('archived_at', null).order('name')
      .then(({ data }) => setLocations(data || []))
  }, [needsLocation, orgId])

  const missing = missingFields(mapping, kind)
  const samples = i => table.rows.map(r => r[i]).filter(Boolean).slice(0, 3).join(' · ')
  function pick(header, key) {
    setMapping(m => {
      const next = { ...m }
      // A field comes from one column: the other column using it lets go
      if (key) for (const h of Object.keys(next)) if (next[h] === key) delete next[h]
      if (key) next[header] = key; else delete next[header]
      return next
    })
  }
  async function savePreset() {
    const name = saveName.trim()
    if (!name) return
    setSaving(true)
    const existing = presets.find(p => p.name.toLowerCase() === name.toLowerCase())
    const { error } = existing
      ? await supabase.from('import_presets').update({ mapping, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await supabase.from('import_presets').insert({ org_id: orgId, ...stored(kind), name, mapping })
    setSaving(false)
    if (error) return notify(contactsOff(error, kind) ? t('imp.contactsOff') : userMessage(error), 'error')
    notify(t('imp.presetSaved', { name }), 'success')
    setPresetName(name)
    setSaveName('')
    loadPresets()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {presets.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '220px' }}>
            <label style={label} htmlFor="imp-preset">{t('imp.preset')}</label>
            <select id="imp-preset" value={presets.find(p => p.name === presetName)?.id || ''} style={{ ...input, appearance: 'auto' }}
              onChange={e => { const p = presets.find(x => x.id === e.target.value); if (p) { setMapping(applyPreset(table.headers, p.mapping)); setPresetName(p.name) } }}>
              <option value="">{t('imp.presetPick')}</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      )}
      {looksLikeRentman(table.headers) && (
        <p role="status" style={{ fontSize: '13px', display: 'flex', gap: space[2], alignItems: 'center', color: colors.accentText }}>
          <Check size={14} aria-hidden="true" /> {t('imp.rentman')}
        </p>
      )}
      <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>{t('imp.matchHelp')}</p>
      {/* One row per column of the file, hairlines between (an ignored column's choice reads muted) */}
      <ul aria-label={t('imp.step.match')} style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${colors.border}` }}>
        {table.headers.map((h, i) => (
          <li key={h + i} style={{ padding: `${space[3]} 0`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: `${space[2]} ${space[3]}`, alignItems: 'center',
            borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '14px', overflowWrap: 'anywhere' }}>{h}</strong>
              <span style={{ display: 'block', fontSize: '13px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{samples(i) || '—'}</span>
            </span>
            <select aria-label={t('imp.becomesFor', { column: h })} value={mapping[h] || ''} onChange={e => pick(h, e.target.value || null)}
              style={{ ...input, appearance: 'auto', padding: '6px 8px', minHeight: '36px', fontSize: '13px', color: mapping[h] ? 'var(--text)' : colors.muted }}>
              <option value="">{t('imp.ignore')}</option>
              {fields.map(f => <option key={f.key} value={f.key}>{t(`imp.field.${kind}.${f.key}`)}{f.required ? ' *' : ''}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {needsLocation && (
        <div style={{ maxWidth: '360px' }}>
          <label style={label} htmlFor="imp-default-loc">{t('imp.defaultLocation')}</label>
          <select id="imp-default-loc" value={defaultLocation} onChange={e => setDefaultLocation(e.target.value)} style={{ ...input, appearance: 'auto' }}>
            <option value="">{t('imp.defaultLocationNone')}</option>
            {locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
          <p style={{ fontSize: '13px', color: colors.muted, marginTop: space[1] }}>{t('imp.defaultLocationHint')}</p>
        </div>
      )}
      {missing.length > 0 && (
        <p role="status" style={{ fontSize: '13px', color: 'var(--warn)', display: 'flex', gap: space[2], alignItems: 'center' }}>
          <AlertTriangle size={14} aria-hidden="true" /> {t(`imp.missing.${kind}`)}
        </p>
      )}
      {!unbatched(kind) && <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 260px' }}>
          <label style={label} htmlFor="imp-save">{t('imp.saveAs')}</label>
          <input id="imp-save" maxLength={80} value={saveName} onChange={e => setSaveName(e.target.value)} placeholder={t('imp.saveAsPlaceholder')} style={input} />
        </div>
        <button type="button" onClick={savePreset} disabled={saving || !saveName.trim() || !Object.keys(mapping).length} style={btn}><Save size={14} /> {t('imp.savePreset')}</button>
      </div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={onBack} style={btn}><ArrowLeft size={14} /> {t('imp.back')}</button>
        <button type="button" onClick={onNext} disabled={missing.length > 0} style={btnPrimary}>{t('imp.next')} <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}

function DoneStep({ orgId, kind, result, onAgain }) {
  const problems = result.problems || []
  const next = { locations: 'items', items: 'units', units: 'kits', gigs: 'gig_equipment' }[kind]
  const message = p => { const s = serverMessage(p.message); return s ? t(`imp.srv.${s.key}`, { name: s.name }) : p.message }
  function download() {
    const csv = reportCsv(problems.map(p => ({ ...p, message: message(p) })), { row: t('imp.lineShort'), level: t('imp.result'), message: t('imp.message'), skip: t('imp.action.skip'), note: t('imp.note') })
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `avx-import-${kind}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p role="status" style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: '16px', fontWeight: 600, margin: 0 }}>
        <Check size={16} color={colors.accentText} aria-hidden="true" /> {t('imp.doneSummary', { created: result.created, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped })}
      </p>
      {isHeld(kind) && <p style={{ fontSize: '14px', color: colors.soft, lineHeight: 1.6 }}>{t('imp.heldNote')}</p>}
      {isJob(kind) && <p style={{ fontSize: '14px', color: colors.soft, lineHeight: 1.6 }}>{t(`imp.jobNote.${kind}`)}</p>}
      {problems.length > 0 && (
        <section aria-labelledby="imp-report">
          <h2 id="imp-report" style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[2] }}>{t('imp.report')}</h2>
          <ul tabIndex={0} aria-label={t('imp.report')} style={{ listStyle: 'none', padding: 0, fontSize: '13px', lineHeight: 1.7, maxHeight: '260px', overflowY: 'auto' }}>
            {problems.map((p, i) => (
              <li key={i} style={{ color: p.level === 'skip' ? 'var(--warn)' : colors.soft }}>
                <strong>{t('imp.line', { n: p.row })}</strong> · {p.level === 'skip' ? t('imp.action.skip') : t('imp.note')}: {message(p)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {problems.length > 0 && <button type="button" onClick={download} style={btn}><Download size={14} /> {t('imp.download')}</button>}
        <button type="button" onClick={() => onAgain()} style={btn}><Upload size={14} /> {t('imp.another')}</button>
        {next && <button type="button" onClick={() => onAgain(next)} style={btnPrimary}>{t('imp.nextKind', { kind: t(`imp.kind.${next}`) })} <ArrowRight size={14} /></button>}
        <Link to={homeOf(orgId, kind)[0]} style={{ ...(isHeld(kind) ? btnPrimary : btn), textDecoration: 'none' }}>{t(isHeld(kind) ? 'imp.reviewHeld' : 'imp.see')}</Link>
      </div>
    </div>
  )
}

function History({ orgId }) {
  const { notify } = useToast()
  const { fmt } = useI18n()
  const [batches, setBatches] = useState(null)
  const [undoing, setUndoing] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('import_batches').select('id, kind, subject, file_name, preset, created, updated, unchanged, skipped, created_at, undone_at')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(30)
    if (error) logger.error('import', error, { step: 'history' })
    setBatches(data || [])
  }, [orgId])
  useEffect(() => { load() }, [load])
  if (!batches?.length) return null
  return (
    <section aria-labelledby="imp-history" style={{ marginTop: space.section }}>
      <h2 id="imp-history" style={{ font: '700 16px/24px var(--font-mono)', marginBottom: space[3] }}>{t('imp.history')}</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${colors.border}` }}>
        {batches.map(b => (
          <li key={b.id} style={{ padding: `${space[3]} 0`, minHeight: '52px', borderBottom: `1px solid ${colors.border}`, display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', opacity: b.undone_at ? 0.75 : 1 }}>
            <span style={{ flex: '1 1 240px', minWidth: 0 }}>
              <strong style={{ fontSize: '14px' }}>{t(`imp.kind.${b.subject || b.kind}`)}</strong>
              <span style={{ fontSize: '13px', color: colors.muted }}> · {fmt(b.created_at, 'd MMM yyyy, HH:mm')}{b.file_name ? ` · ${b.file_name}` : ''}{b.preset ? ` · ${b.preset}` : ''}</span>
              <span style={{ display: 'block', fontSize: '13px', color: colors.soft }}>{t('imp.doneSummary', { created: b.created, updated: b.updated, unchanged: b.unchanged, skipped: b.skipped })}</span>
            </span>
            {b.undone_at
              ? <span style={{ fontSize: '13px', fontWeight: 700, color: colors.muted }}>{t('imp.undone')}</span>
              : (b.created > 0 || b.updated > 0) && <button type="button" onClick={() => setUndoing(b)} style={{ ...btnDanger, padding: '6px 12px', fontSize: '13px' }}><Undo2 size={13} /> {t('imp.undo')}</button>}
          </li>
        ))}
      </ul>
      {undoing && <UndoModal batch={undoing} onClose={() => setUndoing(null)} onDone={msg => { setUndoing(null); notify(msg, 'success'); load() }} onError={msg => notify(msg, 'error')} />}
    </section>
  )
}

// Undoing removes records for good, so it says exactly what happens and asks to confirm
function UndoModal({ batch, onClose, onDone, onError }) {
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  async function undo() {
    setBusy(true)
    const { data, error } = await supabase.rpc('undo_import', { p_batch: batch.id })
    setBusy(false)
    if (error) {
      logger.error('import', error, { step: 'undo' })
      if (error.code === 'PGRST202') return onError(t('imp.undoMissing'))
      if (error.code === '23503') return onError(t('imp.undoInUse'))
      return onError(userMessage(error))
    }
    track('import:undo')
    onDone(t('imp.undoDone', { removed: data.removed, restored: data.restored, kept: data.kept }))
  }
  return (
    <Modal title={t('imp.undoTitle')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', lineHeight: 1.6 }}>
        <p style={{ display: 'flex', gap: '8px', color: colors.danger, fontWeight: 700 }}><AlertTriangle size={18} aria-hidden="true" style={{ flexShrink: 0 }} /> {t('imp.undoWarning')}</p>
        <ul style={{ paddingLeft: '18px', color: colors.soft }}>
          {batch.created > 0 && <li>{t('imp.undoRemoves', { count: batch.created })}</li>}
          {batch.updated > 0 && <li>{t('imp.undoRestores', { count: batch.updated })}</li>}
          <li>{t('imp.undoKeeps')}</li>
        </ul>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} style={{ accentColor: 'var(--danger)', marginTop: '4px' }} /> {t('imp.undoSure')}
        </label>
        <button type="button" onClick={undo} disabled={!sure || busy} style={{ ...btnDanger, justifyContent: 'center' }}>
          {busy ? <AvxLoader size={14} /> : <Undo2 size={14} />} {t('imp.undoConfirm')}
        </button>
      </div>
    </Modal>
  )
}
