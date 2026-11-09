import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { ArrowLeft, Printer, SlidersHorizontal } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { useI18n } from '../../i18n'
import { AvxLoader } from '../ui'
import {
  LABEL_SIZES, SIZE_KEYS, PRINT_MODES, LABEL_FIELDS, DEFAULT_FIELDS,
  pageLayout, labelPosition, paginate, normalizeFields, templatesFrom, sameFields,
  departmentBand, defaultSize,
} from '../../lib/labels'

const MODE_KEY = 'avx.labels.print'
const MM = 96 / 25.4 // CSS pixels in a millimetre
const PAD = { small: 1.5, medium: 2.5, large: 4 }
const BAND = { small: 3.5, medium: 6, large: 11 }
const QR_MAX = { small: 19, medium: 36, large: 52 }
const MAX_CONTENTS = { small: 2, medium: 4, large: 30 }

const remember = (key, fallback) => { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
const keep = (key, value) => { try { localStorage.setItem(key, value) } catch { /* private mode */ } }

// The shared label sheet (U5): three sizes, four ways to print, the organisation's templates.
// Used by Inventory → QR labels and a gig's power labels.
//   labels: [{ key, kind, name, sub? (a line or lines under the name), code?, qr? (the text the QR holds), gig?, contents?: [line], department? }]
//   orgId, orgName: whose templates; the name printed with the "organisation" field
//   sizeKey: where this page remembers its size (on the device)
export default function LabelSheet({ labels, orgId, orgName, sizeKey, onBack, backLabel, onPrint, empty, extra }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const { orgs } = useWorkspace()
  const role = orgs.find(o => o.id === orgId)?.myRole
  const canSave = role === 'admin' || role === 'member'
  const [chosenSize, setChosenSize] = useState(() => remember(sizeKey, ''))
  const [mode, setMode] = useState(() => { const m = remember(MODE_KEY, 'sheet'); return PRINT_MODES.includes(m) ? m : 'sheet' })
  const [saved, setSaved] = useState(() => templatesFrom([]))
  const [draft, setDraft] = useState({})
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [qrs, setQrs] = useState(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => { setChosenSize(remember(sizeKey, '')) }, [sizeKey])
  const size = SIZE_KEYS.includes(chosenSize) ? chosenSize : defaultSize(labels)
  const layout = pageLayout(size, mode)
  const fields = draft[size] || saved[size]
  const on = f => fields.includes(f)

  // The organisation's templates
  useEffect(() => {
    if (!orgId) return
    let gone = false
    supabase.from('label_templates').select('size, fields').eq('org_id', orgId).then(({ data, error }) => {
      if (error) logger.warn('labels', error, { step: 'templates' })
      if (!gone && !error) setSaved(templatesFrom(data))
    })
    return () => { gone = true }
  }, [orgId])

  // QR codes, drawn once per list
  const qrKey = (labels || []).map(l => l.qr || '').join('|')
  useEffect(() => {
    if (!labels) return
    let gone = false
    Promise.all(labels.map(l => (l.qr ? QRCode.toString(l.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : null)))
      .then(svgs => { if (!gone) setQrs(Object.fromEntries(labels.map((l, i) => [l.key, svgs[i]]))) })
      .catch(err => logger.error('labels', err, { step: 'qr' }))
    return () => { gone = true }
  }, [qrKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // On screen, pages shrink to the window (a phone shows the whole sheet); print is always 1:1
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 32) / (layout.page.w * MM)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [layout.page.w])

  const pages = useMemo(() => paginate(labels || [], layout), [labels, layout.perPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickSize = v => { setChosenSize(v); keep(sizeKey, v) }
  const pickMode = v => { setMode(v); keep(MODE_KEY, v) }
  const toggle = f => {
    const next = on(f) ? fields.filter(x => x !== f) : [...fields, f]
    if (!next.length) return
    setDraft(d => ({ ...d, [size]: normalizeFields(next) }))
  }
  async function save(list) {
    setBusy(true)
    const { error } = await supabase.from('label_templates').upsert({ org_id: orgId, size, fields: normalizeFields(list) }, { onConflict: 'org_id,size' })
    setBusy(false)
    if (error) { logger.error('labels', error, { step: 'save-template' }); return notify(userMessage(error), 'error') }
    setSaved(s => ({ ...s, [size]: normalizeFields(list) }))
    setDraft(d => { const n = { ...d }; delete n[size]; return n })
    notify(t('labels.saved'), 'success')
  }

  const sizeName = t(`labels.sizeOpt.${size}`)
  const changed = !sameFields(fields, saved[size])
  const isDefault = sameFields(fields, DEFAULT_FIELDS[size])
  const ready = labels && qrs

  return (
    <div className="ls-root" style={{ minHeight: '100vh', background: '#e9ebef', color: '#111' }}>
      <div className="no-print" style={{ position: 'sticky', top: 'var(--safe-top)', zIndex: 5, background: '#0F1520', color: '#fff' }}>
        <div style={{ padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onBack} style={darkBtn}><ArrowLeft size={14} aria-hidden="true" /> {backLabel}</button>
          <strong style={{ flex: 1, minWidth: '120px' }}>
            {t('inv.labelsTitle', { count: labels?.length || 0 })}
            {labels?.length > 0 && <span style={{ fontWeight: 400, color: '#c9ced8' }}> · {t('labels.pages', { count: pages.length })}</span>}
          </strong>
          {extra}
          <label style={ctl}>
            {t('inv.labelSize')}
            <select value={size} onChange={e => pickSize(e.target.value)} style={selectStyle}>
              {SIZE_KEYS.map(k => <option key={k} value={k}>{t(`labels.sizeOpt.${k}`)}</option>)}
            </select>
          </label>
          <label style={ctl}>
            {t('labels.printOn')}
            <select value={mode} onChange={e => pickMode(e.target.value)} style={selectStyle}>
              {PRINT_MODES.map(m => <option key={m} value={m}>{t(`labels.mode.${m}`, { count: pageLayout(size, m).perPage })}</option>)}
            </select>
          </label>
          <button onClick={() => setEditing(v => !v)} aria-expanded={editing} aria-controls="label-fields" style={darkBtn}>
            <SlidersHorizontal size={14} aria-hidden="true" /> {t('labels.fields')}
          </button>
          <button onClick={() => { onPrint?.(size, mode); window.print() }} disabled={!ready || !labels.length} style={darkBtn}><Printer size={14} aria-hidden="true" /> {t('inv.print')}</button>
        </div>
        {editing && (
          <fieldset id="label-fields" style={{ margin: 0, border: 0, borderTop: '1px solid rgba(255,255,255,0.15)', padding: '12px 16px 14px' }}>
            <legend style={{ float: 'left', width: '100%', padding: 0, marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>{t('labels.fieldsFor', { size: sizeName })}</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', clear: 'both' }}>
              {LABEL_FIELDS.map(f => (
                <label key={f} style={{ ...ctl, gap: '8px', minHeight: '32px' }}>
                  <input type="checkbox" checked={on(f)} disabled={on(f) && fields.length === 1} onChange={() => toggle(f)} />
                  {t(`labels.field.${f}`)}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
              {canSave ? (
                <>
                  <button onClick={() => save(fields)} disabled={busy || !changed} style={darkBtn}>{t('labels.saveTemplate')}</button>
                  <button onClick={() => { setDraft(d => ({ ...d, [size]: [...DEFAULT_FIELDS[size]] })) }} disabled={busy || isDefault} style={darkBtn}>{t('labels.resetTemplate')}</button>
                  <span style={{ fontSize: '13px', color: '#c9ced8' }}>{t('labels.saveHint')}</span>
                </>
              ) : (
                <span style={{ fontSize: '13px', color: '#c9ced8' }}>{t('labels.cantSave')}</span>
              )}
            </div>
          </fieldset>
        )}
      </div>
      {!ready ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><AvxLoader size={24} /></div>
      ) : labels.length === 0 ? (
        <p className="no-print" style={{ textAlign: 'center', padding: '60px 16px', color: '#555', fontSize: '14px' }}>{empty}</p>
      ) : (
        <div className="ls-pages" style={{ '--ls-zoom': zoom }}>
          {pages.map((page, p) => (
            <div key={p} className="ls-page" style={{ width: `${layout.page.w}mm`, height: `${layout.page.h}mm` }}>
              {page.map((l, i) => {
                const at = labelPosition(layout, i)
                return (
                  <div key={l.key} className={`ls-cell${layout.cutLines ? ' ls-cut' : ''}`} style={{ left: `${at.x}mm`, top: `${at.y}mm`, width: `${layout.label.w}mm`, height: `${layout.label.h}mm` }}>
                    <LabelFace label={l} size={size} on={on} orgName={orgName} svg={qrs[l.key]} t={t} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <style>{`
        .ls-pages { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 16px 40px; }
        @media screen { .ls-pages > .ls-page { zoom: var(--ls-zoom, 1); } }
        .ls-page { position: relative; flex-shrink: 0; box-sizing: border-box; background: #fff; border: 1px solid #c8ccd4; overflow: hidden; }
        .ls-cell { position: absolute; box-sizing: border-box; overflow: hidden; outline: 1px dashed #c8ccd4; }
        .ls-cut { outline: 0.2mm dashed #8a909c; }
        .lf { width: 100%; height: 100%; display: flex; flex-direction: column; font-family: Helvetica, Arial, sans-serif; color: #000; }
        .lf-band { flex-shrink: 0; display: flex; align-items: center; padding: 0 2mm; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .lf-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }
        .lf-qr svg { width: 100%; height: 100%; display: block; }
        .lf-qr { flex-shrink: 0; }
        .lf-text { min-width: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .lf-name { font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; overflow: hidden; }
        .lf-sub, .lf-meta, .lf-contents { line-height: 1.2; overflow-wrap: anywhere; }
        .lf-code { font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: .03em; }
        .lf-contents { overflow: hidden; }
        .lf-contents ul { margin: 0; padding: 0; list-style: none; }
        .lf-small .lf-name { font-size: 7.5pt; max-height: 2.3em; }
        .lf-small .lf-sub, .lf-small .lf-meta, .lf-small .lf-contents { font-size: 5.5pt; }
        .lf-small .lf-code { font-size: 7pt; margin-top: .5mm; }
        .lf-small .lf-band { font-size: 5.5pt; padding: 0 1mm; }
        .lf-medium .lf-name { font-size: 12pt; max-height: 2.3em; }
        .lf-medium .lf-sub { font-size: 8pt; margin-top: .5mm; }
        .lf-medium .lf-code { font-size: 10pt; margin-top: 1mm; }
        .lf-medium .lf-meta { font-size: 7.5pt; margin-top: .5mm; }
        .lf-medium .lf-contents { font-size: 7pt; margin-top: 1mm; }
        .lf-medium .lf-band { font-size: 9pt; }
        .lf-large .lf-band { font-size: 16pt; padding: 0 4mm; }
        .lf-large .lf-name { font-size: 18pt; max-height: 3.5em; }
        .lf-large .lf-sub { font-size: 10pt; margin-top: 1mm; }
        .lf-large .lf-code { font-size: 13pt; }
        .lf-large .lf-meta { font-size: 10pt; margin-top: 1mm; }
        .lf-large .lf-contents { flex: 1; min-height: 0; font-size: 9pt; margin-top: 3mm; border-top: 0.3mm solid #000; padding-top: 2mm; }
        .lf-large .lf-contents ul { columns: 2; column-gap: 4mm; }
        .lf-label { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1mm; }
        @media print {
          @page { size: ${layout.page.w}mm ${layout.page.h}mm; margin: 0; }
          body, html { background: #fff !important; }
          .no-print { display: none !important; }
          .ls-root { min-height: 0 !important; background: #fff !important; }
          .ls-pages { display: block; padding: 0; }
          .ls-page { border: 0; margin: 0; break-after: page; }
          .ls-page:last-child { break-after: auto; }
          .ls-cell { outline: 0; }
          .ls-cut { outline: 0.2mm dashed #8a909c; }
        }
      `}</style>
    </div>
  )
}

// One label, drawn from the template's fields. Absent data simply isn't printed.
function LabelFace({ label, size, on, orgName, svg, t }) {
  const pad = PAD[size]
  const band = on('department') ? departmentBand(label.department) : null
  const bandH = band ? BAND[size] : 0
  const { h } = LABEL_SIZES[size].label
  const qr = on('qr') && svg ? Math.min(QR_MAX[size], h - 2 * pad - bandH - (band ? 1 : 0)) : 0
  const contents = on('contents') ? label.contents || [] : []
  const shown = contents.slice(0, MAX_CONTENTS[size])
  const more = contents.length - shown.length
  const meta = [on('org') && orgName, on('gig') && label.gig].filter(Boolean)
  const name = on('name') && (
    <>
      <div className="lf-name">{label.name}</div>
      {[].concat(label.sub || []).filter(Boolean).map((x, i) => <div key={i} className="lf-sub">{x}</div>)}
    </>
  )
  const code = on('code') && label.code && <div className="lf-code">{label.code}</div>
  const qrBox = qr > 0 && <div className="lf-qr" style={{ width: `${qr}mm`, height: `${qr}mm` }} dangerouslySetInnerHTML={{ __html: svg }} />
  const list = shown.length > 0 && (
    <div className="lf-contents">
      {size === 'large' && <div className="lf-label">{t('labels.field.contents')}</div>}
      <ul>
        {shown.map((c, i) => <li key={i}>{c}</li>)}
        {more > 0 && <li>{t('labels.contentsMore', { count: more })}</li>}
      </ul>
    </div>
  )
  return (
    <div className={`lf lf-${size}`}>
      {band && <div className="lf-band" style={{ height: `${bandH}mm`, background: band.bg, color: band.fg }}>{band.name}</div>}
      {size === 'large' ? (
        <div className="lf-text" style={{ padding: `${pad}mm` }}>
          {name}
          {(qrBox || code || meta.length > 0) && (
            <div style={{ display: 'flex', gap: '4mm', alignItems: 'flex-end', marginTop: '3mm' }}>
              {qrBox}
              <div style={{ minWidth: 0 }}>
                {code}
                {meta.map((m, i) => <div key={i} className="lf-meta">{m}</div>)}
              </div>
            </div>
          )}
          {list}
        </div>
      ) : (
        <div className="lf-body" style={{ padding: `${band ? 1 : pad}mm ${pad}mm ${pad}mm`, gap: `${pad}mm` }}>
          {qrBox}
          <div className="lf-text" style={{ justifyContent: qrBox ? 'center' : 'flex-start' }}>
            {name}
            {code}
            {meta.map((m, i) => <div key={i} className="lf-meta">{m}</div>)}
            {list}
          </div>
        </div>
      )}
    </div>
  )
}

const darkBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', minHeight: '36px',
  border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}
const ctl = { fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap' }
const selectStyle = { padding: '6px 8px', background: '#1a2230', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', minWidth: 0, maxWidth: '100%', flex: '1 1 auto', textOverflow: 'ellipsis' }
