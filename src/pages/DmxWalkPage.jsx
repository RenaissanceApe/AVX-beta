import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Settings2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../lib/offline'
import { dmxRange } from '../lib/dmx'
import { switchesOn, readDipLayout, saveDipLayout } from '../lib/dmxCalc'
import { useI18n } from '../i18n'
import { btn, colors, card } from '../components/ui'
import Dipswitches, { DipLayoutForm } from '../components/tools/Dipswitches'

const FIELDS = 'id, name, fixture_type, mode, footprint, universe, address, position, sort'
const order = (a, b) => (a.position || '').localeCompare(b.position || '') || a.universe - b.universe || (a.address ?? 9999) - (b.address ?? 9999) || a.sort - b.sort

// On site (docs/TOOLS_PLAN.md §3, D1): walk the rig fixture by fixture, with big dipswitches for
// each address. Grouped by position, so it follows the way people move along a truss. Works
// offline from the DMX patch's saved copy. ?n=3 opens the third fixture.
//   /gig/:id/dmx/walk
export default function DmxWalkPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [list, setList] = useState(null)
  const [layout, setLayout] = useState(readDipLayout)
  const [showLayout, setShowLayout] = useState(false)
  const n = Math.max(1, Number(params.get('n')) || 1)

  useEffect(() => {
    supabase.from('gig_fixtures').select(FIELDS).eq('gig_id', id).then(({ data, error }) => {
      if (error && isNetworkError(error)) return setList((loadSnapshot(`dmx.${id}`)?.data || []).filter(f => f.address).sort(order))
      if (error) logger.error('dmx', error, { step: 'walk' })
      if (data) saveSnapshot(`dmx.${id}`, data)
      setList((data || []).filter(f => f.address).sort(order))
    })
  }, [id])

  if (!list) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><Loader2 size={26} color="var(--accent-text)" style={{ animation: 'spin 1s linear infinite' }} /></div>
  const back = () => navigate(`/gig/${id}?tab=tools&tool=dmx_patch`)
  const at = Math.min(n, Math.max(1, list.length))
  const f = list[at - 1]
  const go = k => setParams({ n: String(Math.min(list.length, Math.max(1, k))) }, { replace: true })
  const changeLayout = l => { setLayout(l); saveDipLayout(l) }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: 'calc(16px + var(--safe-top)) 16px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={back} style={{ ...btn, background: 'transparent' }}><ArrowLeft size={14} /> {t('dmxWalk.back')}</button>
        <button type="button" onClick={() => setShowLayout(s => !s)} aria-expanded={showLayout} style={{ ...btn, background: 'transparent' }}><Settings2 size={14} /> {t('dmxWalk.layout')}</button>
      </div>
      {showLayout && <div style={card}><DipLayoutForm layout={layout} onChange={changeLayout} idPrefix="walk" /></div>}
      {!f ? (
        <p style={{ fontSize: '15px', color: colors.muted }}>{t('dmxWalk.empty')}</p>
      ) : (
        <>
          <h1 style={{ fontSize: '14px', color: colors.muted, fontWeight: 600 }} aria-live="polite">{t('dmxWalk.of', { n: at, total: list.length })}{f.position ? ` · ${f.position}` : ''}</h1>
          <section aria-labelledby="walk-name" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center', padding: '20px 12px' }}>
            <div>
              <h2 id="walk-name" style={{ fontSize: '22px', fontWeight: 800 }}>{f.name}</h2>
              <p style={{ fontSize: '13px', color: colors.soft }}>{[f.fixture_type, f.mode, t('dmx.channelsShort', { count: f.footprint })].filter(Boolean).join(' · ')}</p>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(30px, 10vw, 48px)', fontWeight: 800, lineHeight: 1 }}>
              <span style={{ fontSize: '0.45em', color: colors.muted }}>U{f.universe} · </span>{f.address}
            </p>
            <p style={{ fontSize: '13px', color: colors.muted }}>{t('dmx.channelsRange', { range: dmxRange(f) })}</p>
            {f.address <= 511 ? (
              <>
                <Dipswitches address={f.address} layout={layout} size="big" />
                <p style={{ fontSize: '15px', fontWeight: 700 }}>{switchesOn(f.address, layout).length ? t('dip.onList', { list: switchesOn(f.address, layout).join(', ') }) : t('dip.allOff')}</p>
              </>
            ) : <p style={{ fontSize: '14px', color: 'var(--warn)' }}>{t('dip.over511')}</p>}
          </section>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={() => go(at - 1)} disabled={at <= 1} style={{ ...btn, flex: 1, justifyContent: 'center', minHeight: '56px', fontSize: '16px' }}><ChevronLeft size={18} /> {t('dmxWalk.prev')}</button>
            <button type="button" onClick={() => go(at + 1)} disabled={at >= list.length} style={{ ...btn, flex: 2, justifyContent: 'center', minHeight: '56px', fontSize: '16px' }}>{t('dmxWalk.next')} <ChevronRight size={18} /></button>
          </div>
        </>
      )}
    </main>
  )
}
