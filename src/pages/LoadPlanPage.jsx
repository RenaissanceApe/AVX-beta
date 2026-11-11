import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Truck, AlertTriangle, Wand2, ClipboardList, ScanLine, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { rangeText } from '../lib/clashes'
import { buildGroups, loadsByTrip, loadRows, unassigned, tripTotals, suggestSplit, moveLoad } from '../lib/vehicleLoads'
import { useI18n } from '../i18n'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { Hint } from '../components/help/HelpParts'
import { Modal, btn, btnPrimary, input, card, colors, tint, AvxLoader, PageHeader, StatusBadge, Stack, space } from '../components/ui'

// The packing list per vehicle (step 23, V3; docs/BUSINESS.md, "How the packing list per vehicle
// works"): which cases and items ride in which vehicle on the gig's outward trips, with weight and
// volume against each vehicle's capacity. Everyone on the gig sees it; the people who plan
// transport move things and can ask for a suggested split, shown before it's used.
//   /gig/:id/loads
export default function LoadPlanPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const { orgs } = useWorkspace()
  const [gig, setGig] = useState(null)
  const [plan, setPlan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [suggestion, setSuggestion] = useState(null)

  const load = useCallback(async () => {
    const [g, p] = await Promise.all([
      supabase.from('gigs').select('id, name, org_id').eq('id', id).maybeSingle(),
      supabase.rpc('gig_load_plan', { p_gig: id }),
    ])
    if (g.error) logger.error('loads', g.error, { step: 'gig' })
    if (p.error) logger.error('loads', p.error, { step: 'plan' })
    setGig(g.data || false)
    setPlan(p.data || false)
  }, [id])
  useEffect(() => { load() }, [load])

  const trips = useMemo(() => (plan ? plan.trips : []), [plan])
  const groups = useMemo(() => {
    if (!plan) return []
    const items = Object.fromEntries((plan.parts || []).map(p => [p.child_id, p]))
    return buildGroups(plan.lines, plan.parts, items)
  }, [plan])
  const byTrip = useMemo(() => (plan ? loadsByTrip(plan.loads, groups, trips.map(x => x.id)) : {}), [plan, groups, trips])
  const left = useMemo(() => unassigned(groups, byTrip), [groups, byTrip])

  const num = (n, digits = 1) => Number(n).toLocaleString(lang, { maximumFractionDigits: digits })
  const timeZone = orgs.find(o => o.id === gig?.org_id)?.time_zone

  async function save(next, how) {
    setSaving(true)
    const { error } = await supabase.rpc('set_vehicle_loads', { p_gig: id, p_loads: loadRows(next) })
    setSaving(false)
    if (error) {
      logger.error('loads', error, { step: 'save' })
      notify(userMessage(error), 'error')
      return false
    }
    track(`loads:${how}`)
    setPlan(p => ({ ...p, loads: loadRows(next) }))
    return true
  }

  if (gig === null || plan === null) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!gig || !plan) return (
    <AppShell>
      <div style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' }}>{t('loads.noAccess')}</p>
        <button type="button" onClick={() => navigate(gig ? `/gig/${id}` : '/dashboard')} style={btn}><ArrowLeft size={14} aria-hidden="true" /> {t('common.back')}</button>
      </div>
    </AppShell>
  )

  const canPlan = !!plan.can_plan
  const unknownUnits = groups.reduce((s, g) => s + (g.kg === null || g.m3 === null ? g.count : 0), 0)
  const places = [...trips.map(x => ({ id: x.id, label: x.vehicle_name })), { id: null, label: t('loads.notLoaded') }]

  return (
    <AppShell>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '16px 16px 60px' }}>
        <button type="button" onClick={() => navigate(`/gig/${id}?tab=transport`)} style={{ ...btn, background: 'transparent', border: 'none', color: colors.soft, padding: '8px 0', minHeight: '44px', marginBottom: space[2] }}>
          <ArrowLeft size={14} aria-hidden="true" /> {gig.name}
        </button>
        <PageHeader title={t('loads.title')} line={t('loads.intro')}
          secondary={[
            { label: t('dispatch.packingList'), icon: <ClipboardList size={14} aria-hidden="true" />, onClick: () => navigate(`/gig/${id}/packing`) },
            { label: t('loads.scanOut'), icon: <ScanLine size={14} aria-hidden="true" />, onClick: () => navigate(`/gig/${id}/scan`) },
          ]}
          primary={canPlan && trips.length > 0 && groups.length > 0 && (
            <button type="button" onClick={() => setSuggestion(suggestSplit(groups, trips))} style={{ ...btnPrimary, minHeight: '44px' }}>
              <Wand2 size={15} aria-hidden="true" /> {t('loads.suggest')}
            </button>
          )} />

        {trips.length === 0 ? (
          <EmptyState icon={<Truck size={24} />} title={t('loads.noTripsTitle')} body={canPlan ? t('loads.noTripsBodyPlan') : t('loads.noTripsBody')}
            action={canPlan ? t('loads.openTransport') : null} onAction={() => navigate(`/gig/${id}?tab=transport`)} guide="pm-vehicle-load" />
        ) : groups.length === 0 ? (
          <EmptyState icon={<Package size={24} />} title={t('loads.noEquipmentTitle')} body={t('loads.noEquipmentBody')}
            action={canPlan ? t('loads.openEquipment') : null} onAction={() => navigate(`/gig/${id}?tab=equipment`)} guide="pm-vehicle-load" />
        ) : (
          <Stack gap={4}>
            {unknownUnits > 0 && (
              <p role="note" style={{ ...card, display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', lineHeight: 1.5, borderColor: colors.warn, background: tint(colors.warn, 8) }}>
                <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px', color: colors.warn }} />
                <span>{t('loads.unknownNote', { count: unknownUnits })} <Hint id="load-unknown" label={t('loads.unknownLabel')} /></span>
              </p>
            )}
            {trips.map(trip => (
              <VehicleCard key={trip.id} trip={trip} groups={groups} items={byTrip[trip.id] || {}} timeZone={timeZone} num={num}
                canPlan={canPlan} saving={saving} places={places.filter(p => p.id !== trip.id)}
                onMove={(itemId, to, qty) => save(moveLoad(byTrip, itemId, trip.id, to, qty, groups), 'move')} />
            ))}
            <section aria-labelledby="loads-left" style={card}>
              <h2 id="loads-left" style={{ fontSize: '16px', fontWeight: 700, marginBottom: space[2] }}>{t('loads.leftTitle')}</h2>
              {Object.keys(left).length === 0 ? (
                <p style={{ fontSize: '13px', color: colors.muted }}>{t('loads.allLoaded')}</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {groups.filter(g => left[g.item_id]).map(g => (
                    <LoadLine key={g.item_id} group={g} qty={left[g.item_id]} num={num} canPlan={canPlan} saving={saving}
                      places={places.filter(p => p.id !== null)}
                      onMove={(to, qty) => save(moveLoad(byTrip, g.item_id, null, to, qty, groups), 'move')} />
                  ))}
                </ul>
              )}
            </section>
            <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('loads.footer')}</p>
          </Stack>
        )}
      </div>
      {suggestion && (
        <SuggestionModal suggestion={suggestion} trips={trips} groups={groups} num={num} saving={saving}
          onClose={() => setSuggestion(null)}
          onApply={async () => { if (await save(suggestion.byTrip, 'suggest')) { setSuggestion(null); notify(t('loads.applied'), 'success') } }} />
      )}
    </AppShell>
  )
}

// How full: "640 / 1,000 kg" with a bar, the overload in words, and how many have no figure
function Meter({ label, used, max, unit, unknown, unknownKey, num, over }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0
  return (
    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', marginBottom: '4px', flexWrap: 'wrap' }}>
        <span style={{ color: colors.soft }}>{label}</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {max !== null ? `${num(used, unit === 'm³' ? 2 : 1)} / ${num(max, unit === 'm³' ? 2 : 1)} ${unit}` : `${num(used, unit === 'm³' ? 2 : 1)} ${unit}`}
        </strong>
      </div>
      {max !== null && (
        <div aria-hidden="true" style={{ height: '6px', background: colors.fill }}>
          <div style={{ height: '100%', width: `${pct}%`, background: over ? colors.danger : colors.accent }} />
        </div>
      )}
      <div style={{ fontSize: '13px', color: colors.muted, marginTop: '4px', lineHeight: 1.4 }}>
        {unknown > 0 && <div>{unknownKey}</div>}
      </div>
    </div>
  )
}

function Capacity({ totals, num }) {
  const { t } = useI18n()
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Meter label={t('loads.weight')} used={totals.kg} max={totals.maxKg} unit="kg" num={num} over={totals.overKg}
          unknown={totals.unknownKg} unknownKey={t('loads.noWeight', { count: totals.unknownKg })} />
        <Meter label={t('loads.volume')} used={totals.m3} max={totals.maxM3} unit="m³" num={num} over={totals.overM3}
          unknown={totals.unknownM3} unknownKey={t('loads.noVolume', { count: totals.unknownM3 })} />
      </div>
      {(totals.maxKg === null || totals.maxM3 === null) && <p style={{ fontSize: '13px', color: colors.muted, marginTop: '6px' }}>{t('loads.capacityMissing')}</p>}
      {(totals.overKg || totals.overM3) && (
        <p role="alert" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px', fontSize: '13px', fontWeight: 600 }}>
          <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, color: colors.danger, marginTop: '2px' }} />
          <span>
            {totals.overKg && t('loads.overKg', { amount: num(totals.kg - totals.maxKg) })}
            {totals.overKg && totals.overM3 && ' '}
            {totals.overM3 && t('loads.overM3', { amount: num(totals.m3 - totals.maxM3, 2) })}
          </span>
        </p>
      )}
    </>
  )
}

function VehicleCard({ trip, groups, items, timeZone, num, canPlan, saving, places, onMove }) {
  const { t } = useI18n()
  const totals = tripTotals(groups, items, trip)
  const list = groups.filter(g => items[g.item_id])
  const over = totals.overKg || totals.overM3
  return (
    <section aria-label={trip.vehicle_name} style={{ ...card, borderColor: over ? colors.danger : colors.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: space[3] }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <Truck size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ overflowWrap: 'anywhere' }}>{trip.vehicle_name}{trip.vehicle_plate ? ` · ${trip.vehicle_plate}` : ''}</span>
          {over && <StatusBadge tone="danger" small>{t('loads.over')}</StatusBadge>}
        </h2>
        <span style={{ fontSize: '13px', color: colors.muted }}>
          {t(`transport.dir.${trip.direction}`)} · {rangeText(trip.departs_at, trip.arrives_at, timeZone)}
        </span>
      </div>
      <Capacity totals={totals} num={num} />
      {list.length === 0 ? (
        <p style={{ fontSize: '13px', color: colors.muted, marginTop: space[3] }}>{t('loads.emptyVehicle')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: `${space[3]} 0 0`, padding: 0 }}>
          {list.map(g => (
            <LoadLine key={g.item_id} group={g} qty={items[g.item_id]} num={num} canPlan={canPlan} saving={saving} places={places}
              onMove={(to, qty) => onMove(g.item_id, to, qty)} />
          ))}
        </ul>
      )}
    </section>
  )
}

// One line: how many, what, their weight; for planners, move some or all of it elsewhere
function LoadLine({ group, qty, num, canPlan, saving, places, onMove }) {
  const { t } = useI18n()
  const [to, setTo] = useState('')
  const [count, setCount] = useState(String(qty))
  useEffect(() => { setCount(String(qty)) }, [qty])
  const kg = group.kg === null ? t('loads.unknown') : `${num(group.kg * qty)} kg`
  const m3 = group.m3 === null ? t('loads.unknown') : `${num(group.m3 * qty, 2)} m³`
  const fieldId = `move-${group.item_id}-${places.map(p => p.id || 'none').join('')}`.slice(0, 80)
  return (
    <li style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${colors.line}`, fontSize: '13px' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{qty} ×</strong> <span style={{ overflowWrap: 'anywhere' }}>{group.name}</span>
        {group.kind === 'case' && <> <StatusBadge tone="info" small>{t('loads.case')}</StatusBadge></>}
        <div style={{ color: colors.muted, fontSize: '13px', marginTop: '2px' }}>
          {kg} · {m3}
          {group.kind === 'case' && group.contents.length > 0 && <> · {t('loads.withContents', { count: group.contents.reduce((s, c) => s + c.quantity, 0) * qty })}</>}
        </div>
      </div>
      {canPlan && (
        <form onSubmit={e => { e.preventDefault(); if (to !== '') onMove(to === 'none' ? null : to, Number(count) || qty) }}
          style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {qty > 1 && (
            <input type="number" min={1} max={qty} value={count} onChange={e => setCount(e.target.value)} aria-label={t('loads.howMany', { name: group.name })}
              style={{ ...input, width: '72px', minHeight: '40px', padding: '6px 8px' }} />
          )}
          <select id={fieldId} value={to} onChange={e => setTo(e.target.value)} aria-label={t('loads.moveTo', { name: group.name })}
            style={{ ...input, width: 'auto', maxWidth: '180px', minHeight: '40px', padding: '6px 8px' }}>
            <option value="">{t('loads.moveToPlaceholder')}</option>
            {places.map(p => <option key={p.id || 'none'} value={p.id || 'none'}>{p.label}</option>)}
          </select>
          <button type="submit" disabled={saving || to === ''} style={{ ...btn, minHeight: '40px' }}>{t('loads.move')}</button>
        </form>
      )}
    </li>
  )
}

function SuggestionModal({ suggestion, trips, groups, num, saving, onClose, onApply }) {
  const { t } = useI18n()
  return (
    <Modal title={t('loads.suggestTitle')} onClose={onClose} maxWidth={620}>
      <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.5, marginBottom: space[3] }}>
        {t('loads.suggestIntro')} <Hint id="load-split" label={t('loads.suggest')} />
      </p>
      {suggestion.over.length > 0 && (
        <p role="alert" style={{ display: 'flex', gap: '8px', fontSize: '13px', fontWeight: 600, marginBottom: space[3] }}>
          <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, color: colors.danger, marginTop: '2px' }} />
          {t('loads.suggestOver', { count: suggestion.over.length })}
        </p>
      )}
      {suggestion.unknownUnits > 0 && <p style={{ fontSize: '13px', color: colors.muted, marginBottom: space[3] }}>{t('loads.suggestUnknown', { count: suggestion.unknownUnits })}</p>}
      <Stack gap={3}>
        {trips.map(trip => {
          const items = suggestion.byTrip[trip.id] || {}
          const list = groups.filter(g => items[g.item_id])
          return (
            <section key={trip.id} aria-label={trip.vehicle_name} style={{ ...card, padding: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: space[2], display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Truck size={14} aria-hidden="true" /> {trip.vehicle_name}
                {suggestion.over.includes(trip.id) && <StatusBadge tone="danger" small>{t('loads.over')}</StatusBadge>}
              </h3>
              <Capacity totals={tripTotals(groups, items, trip)} num={num} />
              <p style={{ fontSize: '13px', color: colors.soft, marginTop: space[2], lineHeight: 1.6 }}>
                {list.length === 0 ? t('loads.emptyVehicle') : list.map(g => `${items[g.item_id]} × ${g.name}`).join(' · ')}
              </p>
            </section>
          )
        })}
      </Stack>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: space[4], flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} style={btn}>{t('common.cancel')}</button>
        <button type="button" onClick={onApply} disabled={saving} style={btnPrimary}>
          {saving ? <AvxLoader size={15} /> : <Wand2 size={15} aria-hidden="true" />} {t('loads.apply')}
        </button>
      </div>
    </Modal>
  )
}
