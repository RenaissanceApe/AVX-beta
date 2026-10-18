import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { quoteEquipment, quoteEquipmentDates, normalizeBody } from '../../lib/quotes'
import { quoteWindow, shortBy } from '../../lib/inventory'
import { rangeText } from '../../lib/clashes'
import { track } from '../../lib/usage'
import { t } from '../../i18n'
import { Modal, card, colors } from '../ui'

const AMBER = '#F59E0B'

// Is the quoted equipment free on the quote's dates? Lines picked from the catalogue are
// checked against stock and other bookings (the quote's own gig doesn't count against it).
export default function QuoteAvailabilityModal({ quote, body, org, onClose }) {
  const [rows, setRows] = useState(null)
  const needs = quoteEquipment(body)
  const win = quoteWindow(quoteEquipmentDates(body), org)
  const unlinked = normalizeBody(body).phases.filter(p => !p.optional)
    .flatMap(p => p.sections.flatMap(s => s.lines)).filter(l => ['rental', 'sale'].includes(l.kind) && !l.item_id && l.description.trim()).length

  useEffect(() => {
    if (!needs.length || !win) return setRows([])
    track('quote:availability-checked')
    supabase.rpc('equipment_availability', {
      p_org: quote.org_id, p_items: needs.map(n => n.item_id), p_from: win.from, p_until: win.until, p_exclude_gig: quote.gig_id || null,
    }).then(({ data, error }) => {
      if (error) logger.error('quote', error, { step: 'availability' })
      const free = Object.fromEntries((data || []).map(r => [r.item_id, r]))
      setRows(needs.map(n => ({ ...n, ...(free[n.item_id] || { owned: 0, available: 0, missingItem: true }) })))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const short = (rows || []).filter(r => shortBy(r) > 0)
  return (
    <Modal title={t('quoteAvail.title')} onClose={onClose} maxWidth={560}>
      {!win ? (
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6 }}>{t('quoteAvail.noDates')}</p>
      ) : !needs.length ? (
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6 }}>{t('quoteAvail.noItems')}</p>
      ) : !rows ? (
        <Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <>
          <p style={{ fontSize: '13px', color: colors.soft, marginBottom: '10px' }}>{t('quoteAvail.window', { range: rangeText(win.from, win.until) })}</p>
          <div role="status" style={{ ...card, marginBottom: '12px', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center',
            color: short.length ? AMBER : colors.accent, borderColor: short.length ? 'rgba(245,158,11,0.4)' : 'rgba(30,200,120,0.3)' }}>
            {short.length ? <AlertTriangle size={15} /> : <Check size={15} />}
            {short.length ? t('quoteAvail.short', { count: short.length }) : t('quoteAvail.allFree')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {rows.map(r => {
              const missing = shortBy(r)
              return (
                <div key={r.item_id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${colors.border}`, fontSize: '13px' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{r.description}</span>
                  <span style={{ color: colors.muted, whiteSpace: 'nowrap' }}>{t('quoteAvail.need', { count: r.quantity })}</span>
                  <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: missing ? AMBER : colors.accent }}>
                    {r.missingItem ? t('quoteAvail.notInCatalogue') : missing ? t('equip.short', { count: missing, free: Math.max(0, r.available) }) : t('equip.freeOf', { count: r.available, owned: r.owned })}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
      {unlinked > 0 && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '12px', lineHeight: 1.5 }}>{t('quoteAvail.unlinked', { count: unlinked })}</p>}
    </Modal>
  )
}
