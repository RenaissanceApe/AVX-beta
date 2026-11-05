import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, BarChart3, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { OVERVIEW_TILES, moneyLines } from '../../lib/analytics/tiles'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { card, colors, mono } from '../ui'

// The Overview tiles (src/lib/analytics/tiles.js), read in one call (public.report_overview).
// Shown on Reports → Overview and, folded or not, as the key numbers on the organisation's Home.

export function useOverview(orgId, enabled = true) {
  const [state, setState] = useState({ data: null, error: null, loading: !!enabled })
  useEffect(() => {
    if (!orgId || !enabled) return
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    supabase.rpc('report_overview', { p_org: orgId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) logger.error('reports', error, { step: 'overview' })
      setState({ data: data || null, error: error || null, loading: false })
    })
    return () => { cancelled = true }
  }, [orgId, enabled])
  return state
}

function TileValue({ tile, overview }) {
  const { lang } = useI18n()
  const v = tile.value(overview)
  if (tile.kind === 'money') {
    const lines = moneyLines(v)
    return lines.map((l, i) => (
      <div key={l.currency} style={{ ...mono, fontSize: i ? '13px' : '20px', fontWeight: i ? 600 : 800, color: i ? colors.muted : 'var(--text)' }}>
        {formatMoney(l.amount, l.currency, lang)}
      </div>
    ))
  }
  if (tile.kind === 'pct') return <div style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{v == null ? '—' : `${Math.round(v * 100)}%`}</div>
  return <div style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{v}</div>
}

export function OverviewTiles({ orgId, overview, compact = false }) {
  const { t } = useI18n()
  const base = `/org/${orgId}`
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 140 : 170}px, 1fr))`, gap: '8px' }}>
      {OVERVIEW_TILES.map(tile => {
        const sub = tile.sub?.(overview)
        return (
          <li key={tile.key} style={{ minWidth: 0 }}>
            <Link to={tile.to(base)} style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px', height: '100%', boxSizing: 'border-box', color: 'var(--text)', textDecoration: 'none' }}>
              <span style={{ fontSize: '12px', color: colors.muted }}>{t(`reports.tile.${tile.key}`)}</span>
              <TileValue tile={tile} overview={overview} />
              {sub && <span style={{ fontSize: '11px', color: colors.muted }}>{t(`${sub.key}.${sub.vars.count === 1 ? 'one' : 'other'}`, sub.vars)}</span>}
              {!compact && <span style={{ fontSize: '11px', color: colors.muted, marginTop: '4px' }}>{t(`reports.tileHint.${tile.key}`)}</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

const FOLD_KEY = 'avx.home.keyNumbers.folded'

// Key numbers on the organisation's Home (admins and members, not in simple mode); can be folded
export function KeyNumbersStrip({ orgId }) {
  const { t } = useI18n()
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem(FOLD_KEY) === '1' } catch { return false } })
  const { data, loading, error } = useOverview(orgId, !folded)
  const toggle = () => setFolded(f => {
    try { localStorage.setItem(FOLD_KEY, f ? '0' : '1') } catch { /* private window */ }
    return !f
  })
  if (error) return null
  return (
    <section aria-labelledby="key-numbers" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: folded ? 0 : '8px' }}>
        <h2 id="key-numbers" style={{ fontSize: '15px', fontWeight: 700, margin: 0, flex: '1 1 auto' }}>
          <button type="button" onClick={toggle} aria-expanded={!folded}
            style={{ background: 'none', border: 'none', color: 'var(--text)', font: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {folded ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            {t('reports.keyNumbers')}
          </button>
        </h2>
        <Link to={`/org/${orgId}/reports`} style={{ fontSize: '13px', color: colors.accentText, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <BarChart3 size={14} aria-hidden="true" /> {t('reports.allReports')}
        </Link>
      </div>
      {!folded && (loading || !data
        ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} aria-label={t('common.loading')} />
        : <OverviewTiles orgId={orgId} overview={data} compact />)}
    </section>
  )
}
