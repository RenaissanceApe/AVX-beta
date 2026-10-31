import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Upload, Loader2, MapPin, Package, Barcode, Boxes, AlertTriangle, Check, Download, Undo2, Save, FileText, Building2, Truck, Users, CalendarDays, PackageCheck, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/selectAll'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { KINDS, CONTACT_KINDS, HELD_KINDS, JOB_KINDS, FIELDS, looksLikeRentman, MAX_ROWS, parseTable, guessMapping, applyPreset, missingFields, buildRows, dryRun, toPayload, reportCsv, serverMessage } from '../lib/importer'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { Modal, btn, btnPrimary, btnDanger, input, label, card, colors, tint } from '../components/ui'

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
const isContacts = kind => CONTACT_KINDS.includes(kind)
// Crew aren't kept in import batches (no presets or history): they become held invitations
const isHeld = kind => HELD_KINDS.includes(kind)
// Jobs, their equipment and quotes aren't either: what they add is removed the usual way
const isJob = kind => JOB_KINDS.includes(kind)
const unbatched = kind => isHeld(kind) || isJob(kind)
// Where each kind's records are looked at: [path, label key]
function homeOf(orgId, kind) {
  if (isHeld(kind)) return [`/org/${orgId}?panel=members`, 'nav.members']
  if (kind === 'quotes') return [`/org/${orgId}/quotes`, 'nav.quotes']
  if (isJob(kind)) return [`/org/${orgId}`, 'nav.orgGigs']
  if (isContacts(kind)) return [`/org/${orgId}/contacts${kind === 'suppliers' ? '?tab=suppliers' : ''}`, 'contacts.title']
  return [`/org/${orgId}/inventory${kind === 'locations' ? '?tab=locations' : ''}`, 'inv.title']
}
// Importing contacts needs the hand-run file (docs/SWITCHING.md, S2); until then the database says so
const contactsOff = (error, kind) => isContacts(kind) && (error?.code === '0A000' || error?.code === '23514')

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

  const table = useMemo(() => parseTable(source.text, { headerRow }), [source.text, headerRow])
  const restart = nextKind => { setStep('choose'); setSource({ text: '', fileName: null }); setMapping({}); setPresetName(null); setResult(null); if (nextKind) setKind(nextKind) }

  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!canImport) return <AppShell><p style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', color: colors.muted, fontSize: '14px', lineHeight: 1.6, padding: '0 16px' }}>{t('inv.noAccess')}</p></AppShell>

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 60px' }}>
        <Link to={homeOf(orgId, kind)[0]} style={{ ...btn, background: 'transparent', color: colors.soft, padding: '6px 10px', textDecoration: 'none', marginBottom: '12px' }}>
          <ArrowLeft size={14} /> {t(homeOf(orgId, kind)[1])}
        </Link>
        <div style={{ fontSize: '12px', color: colors.muted }}>{org?.name}</div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px', marginBottom: '4px' }}>{t('imp.title')}</h1>
        <p style={{ fontSize: '14px', color: colors.soft, lineHeight: 1.6, marginBottom: '16px', maxWidth: '640px' }}>{t('imp.subtitle')}</p>

        <ol aria-label={t('imp.steps')} style={{ listStyle: 'none', padding: 0, display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {STEPS.map((s, i) => {
            const on = s === step, done = STEPS.indexOf(step) > i
            return (
              <li key={s} aria-current={on ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: on ? 800 : 600,
                color: on ? colors.accentText : done ? colors.soft : colors.muted, padding: '4px 10px', borderRadius: '20px', border: `1px solid ${on ? tint(colors.accent, 45) : colors.border}` }}>
                <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)' }}>{done ? '✓' : i + 1}</span> {t(`imp.step.${s}`)}
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
            onBack={() => setStep('match')} onDone={res => { setResult(res); setStep('done'); setHistoryKey(k => k + 1) }} />
        )}
        {step === 'done' && result && <DoneStep orgId={orgId} kind={kind} result={result} onAgain={restart} />}

        <History orgId={orgId} key={historyKey} />
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
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
    <section aria-labelledby="switch-title" style={{ ...card, marginBottom: '18px' }}>
      <button type="button" onClick={toggle} aria-expanded={open} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', background: 'none', border: 'none', padding: 0, color: 'var(--text)', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <h2 id="switch-title" style={{ fontSize: '15px', fontWeight: 800, flex: 1 }}>{t('imp.switch.title')}</h2>
        <span style={{ fontSize: '12px', color: colors.soft }}>{t('imp.switch.progress', { done, total: steps.length })}</span>
      </button>
      {open && (
        <>
          <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, margin: '4px 0 8px' }}>{t('imp.switch.intro')}</p>
          <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {steps.map((c, i) => {
              const n = counts[c.kind]
              return (
                <li key={c.kind}>
                  <button type="button" onClick={() => onPick(c.kind)} aria-pressed={kind === c.kind} style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '8px', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                    background: kind === c.kind ? tint(colors.accent, 12) : 'none', color: 'var(--text)', fontSize: '13px',
                  }}>
                    <span aria-hidden="true" style={{ width: '18px', textAlign: 'center', color: n ? colors.accentText : colors.muted, fontWeight: 700 }}>{n ? '✓' : i + 1}</span>
                    <span style={{ flex: 1 }}>{t(`imp.kind.${c.kind}`)}</span>
                    <span style={{ fontSize: '12px', color: colors.muted }}>{n ? t('imp.switch.count', { count: n }) : t('imp.switch.todo')}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ ...label, marginBottom: '8px' }}>{t('imp.what')}</legend>
        {KIND_GROUPS.map(group => {
          const inGroup = group.kinds.filter(k => kinds.includes(k))
          if (!inGroup.length) return null
          return (
            <div key={group.key} style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: colors.soft, margin: '0 0 6px' }}>{t(`imp.group.${group.key}`)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                {inGroup.map((k, i) => {
                  const Icon = KIND_ICONS[k]
                  return (
                    <label key={k} style={{ ...card, display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', borderColor: kind === k ? colors.accent : undefined }}>
                      <input type="radio" name="imp-kind" value={k} checked={kind === k} onChange={() => setKind(k)} style={{ accentColor: 'var(--accent)', marginTop: '3px' }} />
                      <span>
                        <strong style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '14px' }}><Icon size={15} color={colors.accentText} aria-hidden="true" /> {group.numbered ? `${i + 1}. ` : ''}{t(`imp.kind.${k}`)}</strong>
                        <span style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t(`imp.kindAbout.${k}`)}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {group.note && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '6px' }}>{t(group.note)}</p>}
            </div>
          )
        })}
      </fieldset>

      <div>
        <span style={{ ...label, marginBottom: '6px', display: 'block' }}>{t('imp.file')}</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={btn}><Upload size={14} /> {t('imp.chooseFile')}</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
          {source.fileName && <span style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}><FileText size={14} aria-hidden="true" /> {source.fileName}</span>}
          <span style={{ fontSize: '12px', color: colors.muted }}>{t('imp.fileHint')}</span>
        </div>
        <label htmlFor="imp-paste" style={{ ...label }}>{t('imp.paste')}</label>
        <textarea id="imp-paste" rows={6} wrap="off" value={source.fileName ? '' : source.text} placeholder={source.fileName ? t('imp.fromFile') : t('imp.pastePlaceholder')}
          onChange={e => setSource({ text: e.target.value, fileName: null })}
          style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '12px', resize: 'vertical' }} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
        <p role="status" style={{ fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center', color: colors.accentText }}>
          <Check size={14} aria-hidden="true" /> {t('imp.rentman')}
        </p>
      )}
      <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>{t('imp.matchHelp')}</p>
      <ul aria-label={t('imp.step.match')} style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {table.headers.map((h, i) => (
          <li key={h + i} style={{ ...card, padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px 12px', alignItems: 'center',
            borderColor: mapping[h] ? tint(colors.accent, 35) : undefined }}>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '14px', overflowWrap: 'anywhere' }}>{h}</strong>
              <span style={{ display: 'block', fontSize: '12px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{samples(i) || '—'}</span>
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
          <p style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>{t('imp.defaultLocationHint')}</p>
        </div>
      )}
      {missing.length > 0 && (
        <p role="status" style={{ fontSize: '13px', color: 'var(--warn)', display: 'flex', gap: '6px', alignItems: 'center' }}>
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

function CheckStep({ orgId, kind, table, mapping, headerRow, defaultLocation, fileName, presetName, onBack, onDone }) {
  const { notify } = useToast()
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)
  const rows = useMemo(() => buildRows(table, mapping, kind, { headerRow, defaultLocation: defaultLocation || null }), [table, mapping, kind, headerRow, defaultLocation])

  useEffect(() => {
    if (isHeld(kind)) {
      Promise.all([
        supabase.rpc('org_member_list', { p_org: orgId }),
        selectAll(() => supabase.from('org_invites').select('email').eq('org_id', orgId).order('id')),
        selectAll(() => supabase.from('held_invites').select('email').eq('org_id', orgId).eq('status', 'held').order('id')),
      ]).then(([m, i, h]) => setExisting({ members: (m.data || []).map(x => x.email), invites: (i.data || []).map(x => x.email), held: (h.data || []).map(x => x.email) }))
      return
    }
    if (isJob(kind)) {
      Promise.all([
        selectAll(() => supabase.from('gigs').select('id, name, start_date, import_ref').eq('org_id', orgId).order('id')),
        kind === 'gig_equipment' ? selectAll(() => supabase.from('price_items').select('id, name, code, tracking, kit_type, archived_at').eq('org_id', orgId).order('id')) : Promise.resolve({ data: [] }),
        kind === 'gig_equipment' ? selectAll(() => supabase.from('gig_equipment').select('gig_id, item_id').eq('org_id', orgId).order('id')) : Promise.resolve({ data: [] }),
        kind === 'quotes' ? selectAll(() => supabase.from('quotes').select('import_ref, status').eq('org_id', orgId).not('import_ref', 'is', null).order('id')) : Promise.resolve({ data: [] }),
      ]).then(([g, i, l, q]) => setExisting({ gigs: g.data || [], items: i.data || [], lines: l.data || [], quotes: q.data || [] }))
      return
    }
    if (isContacts(kind)) {
      selectAll(() => supabase.from(kind).select('name, email, tax_id, archived_at').eq('org_id', orgId).order('id'))
        .then(({ data }) => setExisting({ contacts: data || [] }))
      return
    }
    Promise.all([
      selectAll(() => supabase.from('stock_locations').select('name, archived_at').eq('org_id', orgId).order('id')),
      selectAll(() => supabase.from('price_items').select('id, name, code, tracking, kit_type, archived_at').eq('org_id', orgId).order('id')),
      kind === 'units' ? selectAll(() => supabase.from('stock_units').select('code').eq('org_id', orgId).order('id')) : Promise.resolve({ data: [] }),
      kind === 'kits' ? selectAll(() => supabase.from('item_parts').select('parent_id, child_id, kind').eq('org_id', orgId).order('id')) : Promise.resolve({ data: [] }),
    ]).then(([l, i, u, p]) => setExisting({ locations: l.data || [], items: i.data || [], units: u.data || [], parts: p.data || [] }))
  }, [orgId, kind])

  const run = useMemo(() => (existing ? dryRun(rows, kind, existing) : null), [rows, kind, existing])
  const used = FIELDS[kind].filter(f => Object.values(mapping).includes(f.key))
  const problems = run ? rows.map((r, i) => ({ row: r._row, p: run.plan[i] })).filter(x => x.p.action === 'skip') : []
  // The rows the check found nothing wrong with (the database checks them all again)
  const sendable = run ? toPayload(rows.filter((_, i) => run.plan[i].action !== 'skip')) : []

  async function importNow() {
    setBusy(true)
    const { data, error } = isHeld(kind)
      ? await supabase.rpc('import_crew', { p_org: orgId, p_rows: sendable, p_file: fileName })
      : isJob(kind) ? await supabase.rpc('import_jobs', { p_org: orgId, p_kind: kind, p_rows: sendable, p_file: fileName })
      : await supabase.rpc('run_import', { p_org: orgId, p_kind: kind, p_rows: sendable, p_file: fileName, p_preset: presetName })
    setBusy(false)
    if (error) { logger.error('import', error, { step: 'run', kind }); return notify(contactsOff(error, kind) ? t('imp.contactsOff') : userMessage(error), 'error') }
    track(`import:${kind}`)
    onDone(data)
  }

  if (!run) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div role="status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
        <Count label={t('imp.willCreate')} value={run.counts.create} />
        <Count label={t('imp.willMatch')} value={run.counts.match} hint={t('imp.willMatchHint')} />
        <Count label={t('imp.willSkip')} value={run.counts.skip} warn={run.counts.skip > 0} />
      </div>
      {problems.length > 0 && (
        <section aria-labelledby="imp-problems" style={{ ...card, borderColor: tint('var(--warn)', 40) }}>
          <h2 id="imp-problems" style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px' }}>{t('imp.problemsTitle', { count: problems.length })}</h2>
          <ul style={{ listStyle: 'none', padding: 0, fontSize: '13px', lineHeight: 1.7, maxHeight: '220px', overflowY: 'auto' }} tabIndex={0} aria-label={t('imp.problemsTitle', { count: problems.length })}>
            {problems.slice(0, 200).map(({ row, p }) => (
              <li key={row}><strong>{t('imp.line', { n: row })}</strong> · {p.field ? `${t(`imp.field.${kind}.${p.field}`)}: ` : ''}{t(`imp.err.${p.reason}`, { value: p.value })}</li>
            ))}
          </ul>
          <p style={{ fontSize: '12px', color: colors.muted, marginTop: '6px' }}>{t('imp.problemsHint')}</p>
        </section>
      )}
      <div role="region" aria-label={t('imp.preview')} tabIndex={0} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <caption style={{ ...label, display: 'table-caption', captionSide: 'top', textAlign: 'left', paddingBottom: '6px', marginBottom: 0 }}>{t('imp.preview')}</caption>
          <thead>
            <tr style={{ textAlign: 'left', color: colors.muted }}>
              <th style={{ padding: '4px 6px' }}>{t('imp.lineShort')}</th>
              {used.map(f => <th key={f.key} style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{t(`imp.field.${kind}.${f.key}`)}</th>)}
              <th style={{ padding: '4px 6px' }}>{t('imp.result')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 30).map((r, i) => {
              const p = run.plan[i]
              return (
                <tr key={r._row} style={{ borderTop: `1px solid ${colors.border}`, color: p.action === 'skip' ? 'var(--warn)' : undefined }}>
                  <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)' }}>{r._row}</td>
                  {used.map(f => <td key={f.key} style={{ padding: '4px 6px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[f.key] ?? ''}</td>)}
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', fontWeight: 700 }}>{t(`imp.action.${p.action}`)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length > 30 && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>{t('imp.andMore', { count: rows.length - 30 })}</p>}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={btn}><ArrowLeft size={14} /> {t('imp.back')}</button>
        <button type="button" onClick={importNow} disabled={busy || !sendable.length} style={btnPrimary}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />} {t('imp.importButton', { count: sendable.length })}
        </button>
      </div>
    </div>
  )
}

function Count({ label: text, value, hint, warn }) {
  return (
    <div style={{ ...card, padding: '10px 12px', borderColor: warn ? tint('var(--warn)', 40) : undefined }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: '12px', color: colors.soft }}>{text}</div>
      {hint && <div style={{ fontSize: '11px', color: colors.muted, marginTop: '2px' }}>{hint}</div>}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p role="status" style={{ ...card, display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', borderColor: tint(colors.accent, 40) }}>
        <Check size={16} color={colors.accentText} aria-hidden="true" /> {t('imp.doneSummary', { created: result.created, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped })}
      </p>
      {isHeld(kind) && <p style={{ fontSize: '14px', color: colors.soft, lineHeight: 1.6 }}>{t('imp.heldNote')}</p>}
      {isJob(kind) && <p style={{ fontSize: '14px', color: colors.soft, lineHeight: 1.6 }}>{t(`imp.jobNote.${kind}`)}</p>}
      {problems.length > 0 && (
        <section aria-labelledby="imp-report">
          <h2 id="imp-report" style={{ ...label, marginBottom: '6px' }}>{t('imp.report')}</h2>
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
    <section aria-labelledby="imp-history" style={{ marginTop: '32px' }}>
      <h2 id="imp-history" style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px' }}>{t('imp.history')}</h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {batches.map(b => (
          <li key={b.id} style={{ ...card, padding: '8px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', opacity: b.undone_at ? 0.75 : 1 }}>
            <span style={{ flex: '1 1 240px', minWidth: 0 }}>
              <strong style={{ fontSize: '14px' }}>{t(`imp.kind.${b.subject || b.kind}`)}</strong>
              <span style={{ fontSize: '12px', color: colors.muted }}> · {fmt(b.created_at, 'd MMM yyyy, HH:mm')}{b.file_name ? ` · ${b.file_name}` : ''}{b.preset ? ` · ${b.preset}` : ''}</span>
              <span style={{ display: 'block', fontSize: '12px', color: colors.soft }}>{t('imp.doneSummary', { created: b.created, updated: b.updated, unchanged: b.unchanged, skipped: b.skipped })}</span>
            </span>
            {b.undone_at
              ? <span style={{ fontSize: '12px', fontWeight: 700, color: colors.muted }}>{t('imp.undone')}</span>
              : (b.created > 0 || b.updated > 0) && <button type="button" onClick={() => setUndoing(b)} style={{ ...btnDanger, padding: '6px 10px', fontSize: '12px' }}><Undo2 size={13} /> {t('imp.undo')}</button>}
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
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Undo2 size={14} />} {t('imp.undoConfirm')}
        </button>
      </div>
    </Modal>
  )
}
