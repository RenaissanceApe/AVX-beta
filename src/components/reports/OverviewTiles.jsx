import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { retryOnce } from '../../lib/selectAll'
import { OVERVIEW_TILES, OVERVIEW_SOURCES, moneyLines, mergeOverview, tileSource } from '../../lib/analytics/tiles'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { card, colors, mono, AvxLoader, Section, SwipeRow, space } from '../ui'

// The Overview tiles (src/lib/analytics/tiles.js), read from public.report_overview and the
// functions later steps add next to it (each tile's `source`), merged into one object.
// Shown on Reports → Overview and as the key numbers on the organisation's Home.
// A source that fails leaves the others' tiles in place (`failed` lists it); `error` only when none answered.

export function useOverview(orgId, enabled = true) {
  const [state, setState] = useState({ data: null, error: null, failed: [], loading: !!enabled })
  useEffect(() => {
    if (!orgId || !enabled) return
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    Promise.all(OVERVIEW_SOURCES.map(fn => retryOnce(() => supabase.rpc(fn, { p_org: orgId })))).then(results => {
      if (cancelled) return
      const { data, failed, error } = mergeOverview(results)
      results.forEach((r, i) => { if (r.error) logger.error('reports', r.error, { step: 'overview', source: OVERVIEW_SOURCES[i] }) })
      setState({ data, error, failed, loading: false })
    })
    return () => { cancelled = true }
  }, [orgId, enabled])
  return state
}

// A tile whose source didn't answer: a dash and a line saying so (not colour alone)
const isFailed = (tile, failed) => !!failed?.includes(tileSource(tile))

function TileValue({ tile, overview, big, failed }) {
  const { lang } = useI18n()
  if (failed) return <div style={{ ...mono, fontSize: big ? '24px' : '20px', fontWeight: 700 }}>—</div>
  const v = tile.value(overview)
  if (big) return <BigValue tile={tile} v={v} lang={lang} />
  if (tile.kind === 'money') {
    const lines = moneyLines(v)
    return lines.map((l, i) => (
      <div key={l.currency} style={{ ...mono, fontSize: i ? '13px' : '20px', fontWeight: i ? 600 : 800, color: i ? colors.muted : 'var(--text)' }}>
        {formatMoney(l.amount, l.currency, lang)}
      </div>
    ))
  }
  if (tile.kind === 'pctValue') return <div style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{v == null ? '—' : `${Number(v).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`}</div>
  if (tile.kind === 'pct') return <div style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{v == null ? '—' : `${Math.round(v * 100)}%`}</div>
  return <div style={{ ...mono, fontSize: '20px', fontWeight: 700 }}>{v}</div>
}

// The home's tiles (DR1): the number at 24px (DESIGN.md "Typography": a big number), a second currency at 13px
function BigValue({ tile, v, lang }) {
  const big = { ...mono, fontSize: '24px', lineHeight: '32px', fontWeight: 700, overflowWrap: 'anywhere' }
  if (tile.kind === 'money') {
    return moneyLines(v).map((l, i) => (
      <div key={l.currency} style={i ? { ...mono, fontSize: '13px', color: colors.muted } : big}>{formatMoney(l.amount, l.currency, lang)}</div>
    ))
  }
  if (tile.kind === 'pctValue') return <div style={big}>{v == null ? '—' : `${Number(v).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`}</div>
  if (tile.kind === 'pct') return <div style={big}>{v == null ? '—' : `${Math.round(v * 100)}%`}</div>
  return <div style={big}>{v}</div>
}

// A percentage or an amount in a tile's line, written the reader's way ("29.4" / "29,4", "1 200,00 €")
const subVars = (vars, lang) => ({
  ...vars,
  ...(vars.pct == null ? {} : { pct: Number(vars.pct).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') }),
  ...(vars.amount == null ? {} : { amount: formatMoney(vars.amount, vars.currency || 'EUR', lang) }),
})

export function OverviewTiles({ orgId, overview, failed = [], compact = false }) {
  const { t, lang } = useI18n()
  const base = `/org/${orgId}`
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 140 : 170}px, 1fr))`, gap: '8px' }}>
      {OVERVIEW_TILES.map(tile => {
        const off = isFailed(tile, failed)
        const sub = off ? null : tile.sub?.(overview)
        return (
          <li key={tile.key} style={{ minWidth: 0 }}>
            <Link to={tile.to(base)} style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', boxSizing: 'border-box', color: 'var(--text)', textDecoration: 'none' }}>
              <span style={{ fontSize: '13px', color: colors.muted }}>{t(`reports.tile.${tile.key}`)}</span>
              <TileValue tile={tile} overview={overview} failed={off} />
              {off && <span style={{ fontSize: '11px', color: colors.muted }}>{t('reports.tileFailed')}</span>}
              {sub && <span style={{ fontSize: '11px', color: colors.muted }}>{sub.vars.count == null ? t(sub.key, subVars(sub.vars, lang)) : t(`${sub.key}.${sub.vars.count === 1 ? 'one' : 'other'}`, sub.vars)}</span>}
              {!compact && <span style={{ fontSize: '11px', color: colors.muted, marginTop: '4px' }}>{t(`reports.tileHint.${tile.key}`)}</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// Key numbers on the organisation's Home (admins and members, not in simple mode): a Section with the six
// tiles in a SwipeRow (a sideways swipe row on phone, three columns on desktop). Hidden or moved with
// "Arrange home" (src/lib/homeLayout.js).
export function KeyNumbersStrip({ orgId }) {
  const { t, lang } = useI18n()
  const { data, loading, error, failed } = useOverview(orgId)
  if (error) return null
  const base = `/org/${orgId}`
  return (
    <Section id="key-numbers" title={t('reports.keyNumbers')} link={{ to: `${base}/reports`, label: t('reports.allReports') }}>
      {loading || !data
        ? <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
        : (
          <SwipeRow label={t('reports.keyNumbers')} item="64%">
            {OVERVIEW_TILES.map(tile => {
              const off = isFailed(tile, failed)
              const sub = off ? null : tile.sub?.(data)
              return (
                <Link key={tile.key} to={tile.to(base)} style={{ ...card, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[1], height: '100%', color: 'var(--text)', textDecoration: 'none' }}>
                  <span style={{ fontSize: '13px', color: colors.muted }}>{t(`reports.tile.${tile.key}`)}</span>
                  <TileValue tile={tile} overview={data} big failed={off} />
                  {off && <span style={{ fontSize: '13px', color: colors.muted }}>{t('reports.tileFailed')}</span>}
                  {sub && <span style={{ fontSize: '13px', color: colors.muted }}>{sub.vars.count == null ? t(sub.key, subVars(sub.vars, lang)) : t(`${sub.key}.${sub.vars.count === 1 ? 'one' : 'other'}`, sub.vars)}</span>}
                </Link>
              )
            })}
          </SwipeRow>
        )}
    </Section>
  )
}
