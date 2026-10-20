import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Users, Loader2, Check, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { quoteToGigPlan } from '../../lib/quotes'
import { expandPlan, broughtList } from '../../lib/inventory'
import { useKits } from '../../lib/useInventory'
import { track } from '../../lib/usage'
import { useI18n } from '../../i18n'
import { Modal, btnPrimary, input, label, colors } from '../ui'

const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const row = { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: `1px solid ${colors.border}` }

// Fill a gig from its quote: schedule items from the phase dates, crew positions
// from the crew lines, equipment from lines picked from the catalogue. Everything is listed first; untick or adjust before adding.
// Items already on the gig (same day, time and title / same position) start unticked.
export default function GigPlanModal({ quoteId, body, gig, userId, onClose, onDone }) {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const plan = useMemo(() => quoteToGigPlan(body), [body])
  const [schedule, setSchedule] = useState(null)
  const [positions, setPositions] = useState(null)
  const [equipment, setEquipment] = useState(null)
  const [haveGear, setHaveGear] = useState({})
  const [saving, setSaving] = useState(false)
  const kits = useKits(gig.org_id)

  useEffect(() => {
    if (!kits.loaded) return
    let cancelled = false
    Promise.all([
      supabase.from('gig_schedule').select('day, start_time, title').eq('gig_id', gig.id),
      supabase.from('gig_positions').select('title').eq('gig_id', gig.id),
      supabase.from('gig_equipment').select('item_id, quantity').eq('gig_id', gig.id),
    ]).then(([s, p, e]) => {
      if (cancelled) return
      const haveItems = new Set((s.data || []).map(i => `${i.day}|${String(i.start_time).slice(0, 5)}|${i.title.toLowerCase()}`))
      const havePositions = new Set((p.data || []).map(i => i.title.toLowerCase()))
      setSchedule(plan.schedule.map((item, i) => {
        const name = item.phase || t('quote.phaseN', { n: i + 1 })
        const title = (item.dayCount > 1 ? t('plan.dayOf', { name, n: item.dayIndex, count: item.dayCount }) : name).slice(0, 200)
        const exists = haveItems.has(`${item.day}|${item.start_time}|${title.toLowerCase()}`)
        return { ...item, key: `${item.day}-${i}`, title, exists, on: !exists }
      }))
      setPositions(plan.positions.map((pos, i) => {
        const exists = havePositions.has(pos.title.toLowerCase())
        return { ...pos, key: `p${i}`, exists, on: !exists }
      }))
      // Equipment already on the gig starts unticked; ticking it sets the quote's quantity
      // Only stock-tracked items and sets (which become their contents) can be planned
      const have = Object.fromEntries((e.data || []).map(r => [r.item_id, r.quantity]))
      setHaveGear(have)
      setEquipment(plan.equipment
        .filter(g => kits.items[g.item_id] && (kits.items[g.item_id].tracking !== 'none' || kits.items[g.item_id].kit_type === 'set'))
        .map(g => ({ ...g, key: g.item_id, isSet: kits.items[g.item_id].kit_type === 'set', current: have[g.item_id] ?? null, on: have[g.item_id] == null })))
    })
    return () => { cancelled = true }
  }, [gig.id, plan, t, kits.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = schedule === null || positions === null || equipment === null
  const chosenItems = (schedule || []).filter(i => i.on)
  const chosenPositions = (positions || []).filter(p => p.on && p.title.trim())
  const chosenGear = (equipment || []).filter(g => g.on && Number(g.quantity) >= 1)

  async function add() {
    setSaving(true)
    const gear = expandPlan(Object.fromEntries(chosenGear.map(g => [g.item_id, Math.min(100000, Math.max(1, Math.round(Number(g.quantity))))])),
      haveGear, kits.parts, kits.items)
    const [s, p, e] = await Promise.all([
      chosenItems.length
        ? supabase.from('gig_schedule').insert(chosenItems.map(i => ({
            gig_id: gig.id, day: i.day, start_time: i.start_time, end_time: i.end_time, title: i.title, created_by: userId,
          })))
        : { error: null },
      chosenPositions.length
        ? supabase.from('gig_positions').insert(chosenPositions.map(pos => ({
            gig_id: gig.id, title: pos.title.trim().slice(0, 120), quantity: Math.min(99, Math.max(1, Math.round(Number(pos.quantity) || 1))),
            notes: pos.phases.length ? pos.phases.join(', ').slice(0, 500) : null, source_quote_id: quoteId, created_by: userId,
          })))
        : { error: null },
      Object.keys(gear.lines).length
        ? supabase.from('gig_equipment').upsert(Object.entries(gear.lines).map(([item_id, quantity]) => ({
            gig_id: gig.id, org_id: gig.org_id, item_id, quantity, source_quote_id: quoteId,
          })), { onConflict: 'gig_id,item_id' })
        : { error: null },
    ])
    setSaving(false)
    const error = s.error || p.error || e.error
    if (error) {
      logger.error('gigPlan', error, { quoteId, gigId: gig.id })
      return notify(error.code === '42501' ? t('plan.notManager') : userMessage(error), 'error')
    }
    track('quote:gig-filled')
    notify(t('plan.addedAll', { items: chosenItems.length, positions: chosenPositions.length, gear: chosenGear.length }), 'success')
    if (Object.keys(gear.added).length) notify(t('equip.alsoAdded', { list: broughtList(gear.added, kits.items) }), 'success')
    onDone()
  }

  const setPos = (key, changes) => setPositions(list => list.map(p => (p.key === key ? { ...p, ...changes } : p)))
  const setGear = (key, changes) => setEquipment(list => list.map(g => (g.key === key ? { ...g, ...changes } : g)))

  return (
    <Modal title={t('plan.title', { gig: gig.name })} onClose={onClose} maxWidth={600}>
      <p style={{ ...small, marginBottom: '14px' }}>{t('plan.intro')}</p>
      {loading ? <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : (
        <>
          <h3 style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarClock size={13} /> {t('plan.schedule')}</h3>
          {schedule.length === 0 ? <p style={{ ...small, marginBottom: '14px' }}>{t('plan.noDates')}</p> : (
            <div style={{ marginBottom: '16px' }}>
              {schedule.map(i => (
                <label key={i.key} style={{ ...row, cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={i.on} onChange={e => setSchedule(list => list.map(x => (x.key === i.key ? { ...x, on: e.target.checked } : x)))} />
                  <span style={{ width: '92px', flexShrink: 0, color: colors.soft }}>{fmt(i.day, 'EEE d MMM')}</span>
                  <span style={{ width: '88px', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{i.start_time}{i.end_time ? `–${i.end_time}` : ''}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{i.title}{i.exists && <span style={{ ...small, marginLeft: '6px' }}>({t('plan.already')})</span>}</span>
                </label>
              ))}
            </div>
          )}

          <h3 style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={13} /> {t('plan.positions')}</h3>
          {positions.length === 0 ? <p style={{ ...small, marginBottom: '14px' }}>{t('plan.noCrew')}</p> : (
            <div style={{ marginBottom: '16px' }}>
              {positions.map(pos => (
                <div key={pos.key} style={row}>
                  <input type="checkbox" checked={pos.on} onChange={e => setPos(pos.key, { on: e.target.checked })} aria-label={t('plan.include', { name: pos.title })} />
                  <input value={pos.title} onChange={e => setPos(pos.key, { title: e.target.value })} maxLength={120} aria-label={t('positions.title')} style={{ ...input, flex: 1, padding: '7px 10px' }} />
                  <input type="number" min={1} max={99} value={pos.quantity} onChange={e => setPos(pos.key, { quantity: e.target.value })} aria-label={t('positions.quantity')} style={{ ...input, width: '64px', padding: '7px 8px' }} />
                  {pos.exists && <span style={small}>{t('plan.already')}</span>}
                </div>
              ))}
              <p style={{ ...small, marginTop: '6px' }}>{t('plan.positionsHint')}</p>
            </div>
          )}

          <h3 style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Package size={13} /> {t('plan.equipment')}</h3>
          {equipment.length === 0 ? <p style={{ ...small, marginBottom: '14px' }}>{t('plan.noEquipment')}</p> : (
            <div style={{ marginBottom: '16px' }}>
              {equipment.map(g => (
                <div key={g.key} style={row}>
                  <input type="checkbox" checked={g.on} onChange={ev => setGear(g.key, { on: ev.target.checked })} aria-label={t('plan.include', { name: g.description })} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '13px' }}>{g.description}{g.isSet && <span style={small}> · {t('kit.typeOpt.set')}</span>}</span>
                  <input type="number" min={1} max={100000} value={g.quantity} onChange={ev => setGear(g.key, { quantity: ev.target.value })} aria-label={t('equip.quantityFor', { name: g.description })} style={{ ...input, width: '72px', padding: '7px 8px' }} />
                  {g.current != null && <span style={small}>{t('plan.gearAlready', { count: g.current })}</span>}
                </div>
              ))}
              <p style={{ ...small, marginTop: '6px' }}>{t('plan.equipmentHint')}</p>
            </div>
          )}

          <button onClick={add} disabled={saving || (!chosenItems.length && !chosenPositions.length && !chosenGear.length)} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />}
            {t('plan.addAll', { items: chosenItems.length, positions: chosenPositions.length, gear: chosenGear.length })}
          </button>
        </>
      )}
    </Modal>
  )
}
