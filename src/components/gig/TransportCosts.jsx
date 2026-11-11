import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { colors } from '../ui'
import { Hint } from '../help/HelpParts'

// The gig's transport cost per vehicle (step 23, V4), on its Transport tab, for those who see
// money only (admins and members; public.gig_transport_cost refuses everyone else). Its own block,
// apart from the trip list. Reloads when the trips change (`version`).
export default function TransportCosts({ gig, version }) {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('gig_transport_cost', { p_gig: gig.id }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { logger.error('transport', error, { step: 'costs', gig: gig.id }); setFailed(true); return }
      setFailed(false)
      setRows(data || [])
    })
    return () => { cancelled = true }
  }, [gig.id, version])

  if (failed) return <p role="alert" style={{ color: colors.danger, fontSize: '13px', marginTop: '16px' }}>{t('transport.cost.loadFailed')}</p>
  if (!rows || rows.length === 0) return null
  const num = v => Number(v || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')
  const money = v => formatMoney(Number(v) || 0, 'EUR', lang)
  const total = rows.reduce((s, r) => s + Number(r.running || 0), 0)
  const missing = rows.reduce((s, r) => s + Number(r.km_missing || 0), 0)
  const noRates = rows.filter(r => r.cost_per_km == null && r.cost_per_day == null)
  const small = { display: 'block', fontSize: '13px', fontWeight: 400, color: colors.muted }
  const amount = { margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <section aria-labelledby="transport-cost-title" style={{ marginTop: '20px', paddingTop: '12px', borderTop: `1px solid ${colors.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
        <h3 id="transport-cost-title" style={{ fontSize: '16px', margin: 0 }}>{t('transport.cost.title')}</h3>
        <Hint id="transport-cost" label={t('transport.cost.title')} />
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px 12px', fontSize: '14px', margin: 0 }}>
        {rows.map(r => (
          <div key={r.vehicle_id} style={{ display: 'contents' }}>
            <dt>
              {r.vehicle_name}{r.plate ? ` · ${r.plate}` : ''}
              <span style={small}>
                {[
                  t('transport.cost.trips', { count: r.trips }),
                  t('transport.cost.km', { km: num(r.km) }),
                  t('transport.cost.days', { count: r.days }),
                  r.cost_per_km != null || r.cost_per_day != null
                    ? t('transport.cost.rates', { km: money(r.cost_per_km), day: money(r.cost_per_day) })
                    : t('transport.cost.noRates'),
                ].join(' · ')}
              </span>
            </dt>
            <dd style={amount}>{money(r.running)}</dd>
          </div>
        ))}
        <dt style={{ fontWeight: 600, paddingTop: '8px', borderTop: `1px solid ${colors.border}` }}>{t('transport.cost.total')}</dt>
        <dd style={{ ...amount, fontWeight: 600, paddingTop: '8px', borderTop: `1px solid ${colors.border}` }}>{money(total)}</dd>
      </dl>
      {missing > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)', margin: '8px 0 0' }}>{t('transport.cost.kmMissing', { count: missing })}</p>}
      {noRates.length > 0 && (
        <p style={{ fontSize: '13px', color: colors.muted, margin: '8px 0 0' }}>
          {t('transport.cost.setRates')}{' '}
          <Link to={`/org/${gig.org_id}/inventory?tab=vehicles`} style={{ color: colors.accentText }}>{t('transport.cost.setRatesLink')}</Link>
        </p>
      )}
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: '8px 0 0' }}>{t('transport.cost.how')}</p>
    </section>
  )
}
