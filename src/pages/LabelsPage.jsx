import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { scanUrl, LABEL_SIZES } from '../lib/inventory'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { toolbarBtn } from '../components/quotes/QuoteDocument'

const SIZE_KEY = 'avx.labelSize'
const ids = value => (value || '').split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500)

// Printable QR labels on A4. Each code opens /scan/<code>, which finds the item or unit.
//   /org/:orgId/inventory/labels                 every stock-tracked item
//   ?items=<id,…>&units=<id,…>                   just these
export default function LabelsPage() {
  const { orgId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { orgs } = useWorkspace()
  const [labels, setLabels] = useState(null) // [{ key, code, title, subtitle, svg }]
  const [size, setSize] = useState(() => { try { return localStorage.getItem(SIZE_KEY) || 'small' } catch { return 'small' } })
  const orgName = orgs.find(o => o.id === orgId)?.name || ''
  const itemIds = ids(params.get('items'))
  const unitIds = ids(params.get('units'))
  const key = `${itemIds.join(',')}|${unitIds.join(',')}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      const everything = !itemIds.length && !unitIds.length
      let itemQuery = supabase.from('price_items').select('id, name, code, tracking, brand, model').eq('org_id', orgId).neq('tracking', 'none').is('archived_at', null)
      if (!everything) itemQuery = itemIds.length ? itemQuery.in('id', itemIds) : null
      const [itemsRes, unitsRes] = await Promise.all([
        itemQuery ? itemQuery.order('name') : Promise.resolve({ data: [] }),
        unitIds.length ? supabase.from('stock_units').select('id, code, serial, item_id, price_items(name)').eq('org_id', orgId).in('id', unitIds).order('code') : Promise.resolve({ data: [] }),
      ])
      if (itemsRes.error) logger.error('labels', itemsRes.error, { step: 'items' })
      if (unitsRes.error) logger.error('labels', unitsRes.error, { step: 'units' })
      const origin = window.location.origin
      const list = [
        ...(itemsRes.data || []).filter(i => i.code).map(i => ({ key: i.id, code: i.code, title: i.name, subtitle: [i.brand, i.model].filter(Boolean).join(' ') })),
        ...(unitsRes.data || []).map(u => ({ key: u.id, code: u.code, title: u.price_items?.name || '', subtitle: u.serial ? `S/N ${u.serial}` : '' })),
      ]
      const withQr = await Promise.all(list.map(async l => ({
        ...l, svg: await QRCode.toString(scanUrl(origin, l.code), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
      })))
      if (!cancelled) setLabels(withQr)
    }
    load()
    return () => { cancelled = true }
  }, [orgId, key]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = value => { setSize(value); try { localStorage.setItem(SIZE_KEY, value) } catch { /* private mode */ } }
  const s = LABEL_SIZES[size] || LABEL_SIZES.small

  return (
    <div style={{ minHeight: '100vh', background: '#e9ebef', color: '#111' }}>
      <div className="no-print" style={{ position: 'sticky', top: 'var(--safe-top)', zIndex: 5, background: '#0F1520', color: '#fff', padding: '10px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => navigate(-1)} style={toolbarBtn}><ArrowLeft size={14} /> {t('common.back')}</button>
        <strong style={{ flex: 1, minWidth: '120px' }}>{t('inv.labelsTitle', { count: labels?.length || 0 })}</strong>
        <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {t('inv.labelSize')}
          <select value={size} onChange={e => pick(e.target.value)} style={{ padding: '6px 8px', borderRadius: '8px', background: '#1a2230', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
            {Object.keys(LABEL_SIZES).map(k => <option key={k} value={k}>{t(`inv.labelSizeOpt.${k}`)}</option>)}
          </select>
        </label>
        <button onClick={() => { track('inventory:labels-printed'); window.print() }} disabled={!labels?.length} style={toolbarBtn}><Printer size={14} /> {t('inv.print')}</button>
      </div>
      {!labels ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : labels.length === 0 ? (
        <p className="no-print" style={{ textAlign: 'center', padding: '60px 16px', color: '#555', fontSize: '14px' }}>{t('inv.noLabels')}</p>
      ) : (
        <div className="label-sheet" style={{ gridTemplateColumns: `repeat(${s.cols}, ${s.widthMm}mm)` }}>
          {labels.map(l => (
            <div key={l.key} className="label" style={{ width: `${s.widthMm}mm`, height: `${s.heightMm}mm` }}>
              <div className="label-qr" style={{ width: `${s.qrMm}mm`, height: `${s.qrMm}mm` }} dangerouslySetInnerHTML={{ __html: l.svg }} />
              <div className="label-text">
                <div className="label-title">{l.title}</div>
                {l.subtitle && <div className="label-sub">{l.subtitle}</div>}
                <div className="label-code">{l.code}</div>
                <div className="label-org">{orgName}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .label-sheet { display: grid; gap: 0; justify-content: center; padding: 16px 0 40px; }
        .label { box-sizing: border-box; background: #fff; border: 1px dashed #c8ccd4; padding: 3mm; display: flex; gap: 3mm; align-items: center; overflow: hidden; }
        .label-qr svg { width: 100%; height: 100%; display: block; }
        .label-qr { flex-shrink: 0; }
        .label-text { min-width: 0; font-family: Helvetica, Arial, sans-serif; }
        .label-title { font-weight: 700; font-size: 10pt; line-height: 1.2; overflow-wrap: anywhere; max-height: 3.6em; overflow: hidden; }
        .label-sub { font-size: 8pt; color: #333; margin-top: 1mm; }
        .label-code { font-family: 'Courier New', monospace; font-weight: 700; font-size: 9pt; margin-top: 1.5mm; letter-spacing: .03em; }
        .label-org { font-size: 7pt; color: #666; margin-top: 1mm; }
        @media print {
          @page { size: A4; margin: 10mm; }
          body, html { background: #fff !important; }
          .no-print { display: none !important; }
          .label-sheet { padding: 0; justify-content: start; }
          .label { border-color: #e3e5ea; break-inside: avoid; }
        }
        @media screen and (max-width: 700px) { .label-sheet { transform-origin: top left; zoom: 0.55; } }
      `}</style>
    </div>
  )
}
