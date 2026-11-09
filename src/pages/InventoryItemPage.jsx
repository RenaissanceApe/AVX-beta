import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Boxes, Pencil, Archive, ArchiveRestore, PackagePlus, PackageMinus, ArrowRightLeft, ClipboardCheck, Plus, QrCode, AlertTriangle, FileUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useInventory, useKits } from '../lib/useInventory'
import { isLowStock, bookValue, dailyAvailability } from '../lib/inventory'
import { rangeText } from '../lib/clashes'
import { formatMoney } from '../lib/quotes'
import { useCustomFields, displayValue } from '../lib/customFields'
import { useI18n, t, fmt } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { ItemModal, MovementModal, AddUnitsModal, UnitModal } from '../components/inventory/InventoryModals'
import { KitPanel, CaseContentsModal } from '../components/inventory/KitPanels'
import ContextThread from '../components/messages/ContextThread'
import { ItemMaintenance } from '../components/inventory/MaintenancePanels'
import ItemMoneyCard from '../components/inventory/ItemMoneyCard'
import FixtureTypeCard from '../components/inventory/FixtureTypeCard'
import { MovementList, useNames, LOCATION_ICONS } from './InventoryPage'
import { btn, btnPrimary, iconBtn, label, colors, StatusBadge, AvxLoader, PageHeader, Section, Stack, MoreMenu, space } from '../components/ui'
import { PageHelp } from '../components/help/HelpParts'
import { speakerFacts, riggingOf } from '../lib/speakers'
import { framesFor, framesFingerprint, dataCheckState } from '../lib/lineArray'
import { electricalFacts } from '../lib/power'

const STATUS_TONE = { available: 'ok', repair: 'warn', lost: 'danger', retired: 'off' }
const ghost = { ...btn, background: 'transparent', borderColor: 'var(--line-strong)', color: colors.soft }
const small = { ...ghost, padding: '4px 8px', fontSize: '13px' }
// A list row on the page ground with a hairline under it (DESIGN.md "Room to breathe": lists are rows, not a card each)
const rowStyle = { display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', minHeight: '52px', padding: `${space[2]} 0`, borderBottom: `1px solid ${colors.border}` }

// One catalogue item: details, stock per location (bulk) or per unit (serial), history.
//   /org/:orgId/inventory/:itemId (?unit=<id> highlights a unit, e.g. after scanning)
export default function InventoryItemPage() {
  const { orgId, itemId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { notify } = useToast()
  const { lang, fmt } = useI18n()
  const navigate = useNavigate()
  const inv = useInventory(orgId)
  const kits = useKits(orgId, inv.canManage)
  const { fields: customFields } = useCustomFields(orgId, 'item')
  const [units, setUnits] = useState([])
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState(false)
  const [movement, setMovement] = useState(null) // { mode, locationId }
  const [addingUnits, setAddingUnits] = useState(false)
  const [unit, setUnit] = useState(null)
  const [selected, setSelected] = useState([])
  const [packedIn, setPackedIn] = useState({}) // case unit id -> units packed in it
  const [packing, setPacking] = useState(null)
  const [addingGdtf, setAddingGdtf] = useState(false)
  const item = inv.items.find(i => i.id === itemId)
  const nameOf = useNames(history.map(h => h.created_by))
  const highlight = params.get('unit')

  async function loadDetails() {
    const [unitsRes, histRes] = await Promise.all([
      supabase.from('stock_units').select('*, out_gig:gigs(name), in_case:case_unit_id(code)').eq('item_id', itemId).order('code'),
      supabase.from('stock_movements').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(100),
    ])
    if (unitsRes.error) logger.error('inventory', unitsRes.error, { step: 'units' })
    if (histRes.error) logger.error('inventory', histRes.error, { step: 'history' })
    setUnits(unitsRes.data || [])
    setHistory(histRes.data || [])
    const ids = (unitsRes.data || []).map(u => u.id)
    const { data: inside } = ids.length
      ? await supabase.from('stock_units').select('case_unit_id').in('case_unit_id', ids)
      : { data: [] }
    setPackedIn((inside || []).reduce((m, u) => ({ ...m, [u.case_unit_id]: (m[u.case_unit_id] || 0) + 1 }), {}))
  }
  useEffect(() => { if (inv.canManage) loadDetails() }, [itemId, inv.canManage]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { inv.reload(); loadDetails() }

  if (inv.loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!inv.canManage || !item) return (
    <AppShell>
      <div style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' }}>{inv.canManage ? t('inv.itemNotFound') : t('inv.noAccess')}</p>
        <Link to={`/org/${orgId}/inventory`} style={{ ...btn, textDecoration: 'none' }}><ArrowLeft size={14} /> {t('inv.title')}</Link>
      </div>
    </AppShell>
  )

  const s = inv.stock[item.id]
  const hasStock = history.length > 0 || units.length > 0
  const low = isLowStock(item, s?.total)
  const activeUnits = units.filter(u => u.status === 'available' || u.status === 'repair')
  const facts = [
    [t('prices.price'), `${formatMoney(item.unit_price, 'EUR', lang)} / ${t(`unit.${item.unit}`, { count: 1 })}`],
    [t('inv.brand'), [item.brand, item.model].filter(Boolean).join(' ')],
    [t('inv.weight'), item.weight_kg != null ? `${Number(item.weight_kg)} kg` : ''],
    [t('inv.power'), item.power_w != null ? `${item.power_w} W` : ''],
    [t('inv.dimensions'), item.dimensions],
    [t('inv.replacementValue'), item.replacement_value != null ? formatMoney(item.replacement_value, 'EUR', lang) : ''],
    [t('inv.minStock'), item.min_stock ?? ''],
    [t('inv.packingNote'), item.packing_note],
    ...speakerFacts(item, t),
    ...electricalFacts(item, t),
    ...customFields.map(f => {
      const text = displayValue(f, item.custom_values?.[f.id], { yesNo: [t('custom.yes'), t('custom.no')], date: d => fmt(d, 'd MMM yyyy') })
      return [f.label, f.kind === 'link' && text ? <a href={text} target="_blank" rel="noopener noreferrer" style={{ color: colors.accentText }}>{text.replace(/^https?:\/\//i, '')}</a> : text]
    }),
  ].filter(([, v]) => v !== '' && v != null)

  async function setArchived(archived) {
    if (archived && !window.confirm(t('inv.archiveItemConfirm', { name: item.name }))) return
    const { error } = await supabase.from('price_items').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', item.id)
    if (error) return notify(userMessage(error), 'error')
    inv.reload()
  }
  const toggle = id => setSelected(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))
  const labelsLink = selected.length
    ? `/org/${orgId}/inventory/labels?units=${selected.join(',')}`
    : `/org/${orgId}/inventory/labels?items=${item.id}${item.tracking === 'serial' ? `&units=${activeUnits.map(u => u.id).join(',')}` : ''}`

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: `${space[5]} var(--gutter) ${space[7]}` }}>
        <button onClick={() => navigate(`/org/${orgId}/inventory`)} style={{ ...ghost, marginBottom: space[4], padding: '6px 12px' }}><ArrowLeft size={14} /> {t('inv.title')}</button>
        <PageHeader
          eyebrow={[item.category, t(`lineKind.${item.kind}`)].filter(Boolean).join(' · ')}
          title={item.name}
          help={<PageHelp page="inventory-item" />}
          line={(
            <span style={{ display: 'inline-flex', gap: space[3], flexWrap: 'wrap' }}>
              {item.code && <span style={{ fontFamily: 'var(--font-mono)' }}>{item.code}</span>}
              {item.kit_type ? <span>{t(`kit.typeOpt.${item.kit_type}`)}</span> : null}
              {item.kit_type !== 'set' && <span>{t(`inv.trackingOpt.${item.tracking}`)}</span>}
              {item.archived_at && <span style={{ color: 'var(--warn)' }}>{t('inv.archived')}</span>}
            </span>
          )}
          secondary={[
            { label: t('common.edit'), icon: <Pencil size={14} aria-hidden="true" />, onClick: () => setEditing(true) },
            ...(item.tracking !== 'none' ? [{ label: selected.length ? t('inv.labelsSelected', { count: selected.length }) : t('inv.labels'), icon: <QrCode size={14} aria-hidden="true" />, onClick: () => navigate(labelsLink) }] : []),
          ]}
          more={[{ label: t('gdtf.add'), icon: <FileUp size={15} aria-hidden="true" />, onClick: () => setAddingGdtf(true) }, item.archived_at
            ? { label: t('inv.restore'), icon: <ArchiveRestore size={15} aria-hidden="true" />, onClick: () => setArchived(false) }
            : { label: t('inv.archive'), icon: <Archive size={15} aria-hidden="true" />, onClick: () => setArchived(true) }]}
        />

        <Stack gap="section">
        {facts.length > 0 && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: space[4], margin: 0 }}>
            {facts.map(([k, v], i) => (
              <div key={i} style={{ minWidth: 0 }}>
                <dt style={{ ...label, marginBottom: space[1] }}>{k}</dt>
                <dd style={{ fontSize: '14px', overflowWrap: 'anywhere', margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {riggingOf(item.rigging) && <RiggingFacts item={item} userId={user?.id} onChecked={rigging => inv.setItems(list => list.map(i => (i.id === item.id ? { ...i, rigging } : i)))} />}

        {item.kit_type !== 'set' && (item.kind === 'rental' || item.kind === 'sale') && <ItemMoneyCard orgId={orgId} item={item} />}

        <Section id="item-stock" title={(
          <>
            {t('inv.stock')}{item.tracking !== 'none' && <span style={{ color: low ? 'var(--warn)' : colors.soft }}> · {s?.total || 0}</span>}
            {low && <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 400, fontSize: '13px', color: 'var(--warn)' }}><AlertTriangle size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('inv.belowMin', { count: item.min_stock })}</span>}
          </>
        )} aside={!item.archived_at && item.tracking !== 'none' && (
          <Stack direction="row" gap={2} wrap>
            {item.tracking === 'bulk' && (
              <>
                <button onClick={() => setMovement({ mode: 'count' })} disabled={!inv.activeLocations.length} style={ghost}><ClipboardCheck size={14} /> {t('inv.mode.count')}</button>
                <button onClick={() => setMovement({ mode: 'add' })} disabled={!inv.activeLocations.length} style={btnPrimary}><PackagePlus size={15} /> {t('inv.mode.add')}</button>
              </>
            )}
            {item.tracking === 'serial' && (
              <button onClick={() => setAddingUnits(true)} style={btnPrimary}><Plus size={15} /> {t('inv.addUnits')}</button>
            )}
          </Stack>
        )}>
          {item.kit_type === 'set' && <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, margin: 0 }}>{t('kit.setNoStock')}</p>}
          {item.tracking === 'none' && item.kit_type !== 'set' && (
            <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, margin: 0 }}>
              {t('inv.notTracked')} <button onClick={() => setEditing(true)} style={{ ...small, marginLeft: space[2] }}><Pencil size={12} /> {t('inv.startTracking')}</button>
            </p>
          )}
          {item.tracking !== 'none' && inv.activeLocations.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--warn)', marginBottom: space[3] }}>
              {t('inv.noLocationsYet')} <Link to={`/org/${orgId}/inventory?tab=locations`} style={{ color: colors.accentText }}>{t('inv.addLocation')}</Link>
            </p>
          )}

          {item.tracking === 'bulk' && (
            Object.keys(s?.byLocation || {}).length === 0 ? (
              <p style={{ fontSize: '13px', color: colors.muted }}>{t('inv.noStockYet')}</p>
            ) : (
              <div style={{ borderTop: `1px solid ${colors.border}` }}>
                {Object.entries(s.byLocation).map(([locId, qty]) => {
                  const loc = inv.locations.find(l => l.id === locId)
                  const Icon = LOCATION_ICONS[loc?.kind] || LOCATION_ICONS.other
                  return (
                    <div key={locId} style={rowStyle}>
                      <Icon size={16} color={colors.soft} />
                      <span style={{ flex: '1 1 140px', fontWeight: 600, fontSize: '14px' }}>{loc?.name || t('inv.noLocation')}{loc?.archived_at && <span style={{ color: colors.muted, fontWeight: 400 }}> · {t('inv.archived')}</span>}</span>
                      <strong style={{ fontSize: '16px', minWidth: '40px', textAlign: 'right' }}>{qty}</strong>
                      {/* Two buttons in view per row, the rest in its ⋯ (DESIGN.md rule 5) */}
                      <span style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
                        <button onClick={() => setMovement({ mode: 'move', locationId: locId })} style={small}><ArrowRightLeft size={12} /> {t('inv.mode.move')}</button>
                        <button onClick={() => setMovement({ mode: 'remove', locationId: locId })} style={small}><PackageMinus size={12} /> {t('inv.mode.remove')}</button>
                        {!loc?.archived_at && <MoreMenu label={t('inv.moreForLocation', { name: loc?.name || t('inv.noLocation') })}
                          items={[{ label: t('inv.mode.count'), icon: <ClipboardCheck size={15} aria-hidden="true" />, onClick: () => setMovement({ mode: 'count', locationId: locId }) }]} />}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {item.tracking === 'serial' && (
            units.length === 0 ? (
              <p style={{ fontSize: '13px', color: colors.muted }}>{t('inv.noUnitsYet')}</p>
            ) : (
              <div style={{ borderTop: `1px solid ${colors.border}` }}>
                {units.map(u => {
                  const value = bookValue(u)
                  return (
                    <div key={u.id} style={{
                      ...rowStyle, paddingLeft: highlight === u.id ? space[3] : 0, paddingRight: highlight === u.id ? space[2] : 0,
                      opacity: u.status === 'lost' || u.status === 'retired' ? 0.6 : 1,
                      // The selection wash marks the unit you came for (scanned), with a bar so it isn't colour alone
                      background: highlight === u.id ? 'var(--selection)' : undefined,
                      borderLeft: highlight === u.id ? `2px solid ${colors.accent}` : undefined,
                    }}>
                      <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} aria-label={t('inv.selectUnit', { code: u.code })} style={{ accentColor: colors.accent }} />
                      <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700 }}>{u.code}</span>
                        <span style={{ fontSize: '13px', color: colors.muted }}>
                          {[u.serial ? `${t('inv.serial')} ${u.serial}` : t('inv.noSerial'), u.case_unit_id && t('kit.inCase', { code: u.in_case?.code || '…' })].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span style={{ fontSize: '13px', color: colors.soft, flex: '1 1 120px' }}>
                        {u.out_on_gig
                          ? <Link to={`/gig/${u.out_on_gig}?tab=equipment`} style={{ color: 'var(--sky)' }}>{t('inv.outOn', { gig: u.out_gig?.name || '…' })}</Link>
                          : inv.locationName(u.location_id) || t('inv.noLocation')}
                      </span>
                      <StatusBadge small tone={STATUS_TONE[u.status] || 'open'}>{t(`inv.unitStatus.${u.status}`)}</StatusBadge>
                      {value != null && <span style={{ fontSize: '13px', color: colors.muted, whiteSpace: 'nowrap' }} title={t('inv.bookValueHint')}>{formatMoney(value, 'EUR', lang)}</span>}
                      {item.kit_type === 'case' && (
                        <button onClick={() => setPacking(u)} style={small} title={t('kit.packHint')}><Boxes size={12} /> {t('kit.packed', { count: packedIn[u.id] || 0 })}</button>
                      )}
                      <button onClick={() => setUnit(u)} aria-label={t('inv.editUnit', { code: u.code })} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </Section>

        <FixtureTypeCard orgId={orgId} item={item} adding={addingGdtf} onCloseAdding={() => setAddingGdtf(false)} onItemChanged={inv.reload} />

        <KitPanel orgId={orgId} item={item} kits={kits} />

        <ItemMaintenance orgId={orgId} item={item} onChanged={refresh} />

        <ContextThread type="item" id={item.id} />

        {item.tracking !== 'none' && <Bookings item={item} owned={(s?.total || 0) - (s?.inRepair || 0)} />}

        <Section id="item-history" title={t('inv.history')}>
          <MovementList rows={history} locationName={id => inv.locationName(id) || '—'} nameOf={nameOf}
            unitCode={id => units.find(u => u.id === id)?.code || ''} />
        </Section>
        </Stack>
      </div>

      {editing && (
        <ItemModal orgId={orgId} userId={user.id} item={item} hasStock={hasStock}
          categories={[...new Set(inv.items.map(i => i.category).filter(Boolean))]}
          onClose={() => setEditing(false)} onSaved={refresh} />
      )}
      {movement && (
        <MovementModal item={item} mode={movement.mode} locationId={movement.locationId === 'none' ? '' : movement.locationId}
          locations={movement.mode === 'add' || movement.mode === 'count' ? inv.activeLocations : inv.locations.filter(l => !l.archived_at || s?.byLocation?.[l.id])}
          stock={s} onClose={() => setMovement(null)} onSaved={refresh} />
      )}
      {addingUnits && <AddUnitsModal item={item} locations={inv.activeLocations} onClose={() => setAddingUnits(false)} onSaved={refresh} />}
      {packing && <CaseContentsModal caseUnit={packing} kits={kits} onClose={() => setPacking(null)} onSaved={loadDetails} />}
      {unit && <UnitModal unit={unit} locations={inv.locations.filter(l => !l.archived_at || l.id === unit.location_id)} onClose={() => setUnit(null)} onSaved={refresh} />}
    </AppShell>
  )
}

// Where the item is booked in the coming weeks, and how many are free each day
const DAYS = 42
function Bookings({ item, owned }) {
  const { fmt } = useI18n()
  const [bookings, setBookings] = useState(null)
  const today = new Date()
  const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  useEffect(() => {
    const from = new Date(`${startDate}T00:00:00`)
    const until = new Date(from); until.setDate(until.getDate() + 120)
    supabase.rpc('item_bookings', { p_item: item.id, p_from: from.toISOString(), p_until: until.toISOString() })
      .then(({ data, error }) => { if (error) logger.error('inventory', error, { step: 'bookings' }); setBookings(data || []) })
  }, [item.id, startDate])
  if (!bookings) return null
  const days = dailyAvailability(owned, bookings, startDate, DAYS)
  const tight = days.filter(d => d.free <= 0).length
  return (
    <Section id="item-bookings" title={t('inv.bookings')}>
      <p style={{ fontSize: '13px', color: tight ? 'var(--warn)' : colors.muted, margin: `0 0 ${space[3]}` }}>
        {tight ? t('inv.daysFullyBooked', { count: tight, days: DAYS }) : t('inv.freeNextDays', { days: DAYS })}
      </p>
      {/* Square day cells (DESIGN.md "InventoryItem"): line nothing booked, accent-text enough free,
          warn partly booked, danger fully booked. The day's numbers are in each cell's title and the legend says the words. */}
      <div role="img" aria-label={t('inv.availabilityStrip', { days: DAYS })} style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS}, 1fr)`, gap: '4px', marginBottom: space[1] }}>
        {days.map(d => (
          <div key={d.day} title={`${fmt(d.day, 'EEE d MMM')}: ${t('inv.freeOn', { free: Math.max(0, d.free), owned })}`} style={{
            height: '16px', background: stripColour(d, owned),
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '11px', color: colors.muted, marginBottom: space[3] }}>
        <span>{fmt(days[0].day, 'd MMM')}</span><span>{fmt(days[days.length - 1].day, 'd MMM')}</span>
      </div>
      {bookings.length === 0 ? <p style={{ fontSize: '13px', color: colors.muted }}>{t('inv.noBookings')}</p> : (
        <div>
          {bookings.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: space[3], alignItems: 'baseline', padding: `${space[2]} 0`, borderBottom: `1px solid ${colors.border}`, fontSize: '13px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: colors.soft, minWidth: '120px' }}>{rangeText(b.starts_at, b.ends_at)}</span>
              <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                {b.gig_id ? <Link to={`/gig/${b.gig_id}?tab=equipment`} style={{ color: 'var(--text)' }}>{b.gig_name}</Link> : '—'}
                {b.status === 'hold' && <> <StatusBadge small tone="warn">{t('clash.hold')}</StatusBadge></>}
              </span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>× {b.quantity}</strong>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// One day of the availability strip: nothing booked, enough free, partly booked (under a quarter left), fully booked
function stripColour(d, owned) {
  if (d.free <= 0) return 'var(--danger)'
  if (!d.booked) return 'var(--line-strong)'
  return d.free < Math.max(1, owned) / 4 ? 'var(--warn)' : 'var(--accent-text)'
}

// The manufacturer's rigging data as typed (A1), the bumper limits RG3 uses for its preset, and the
// second person's check (PENDING D73): someone who didn't type the data marks it checked; any
// change to the data, or to the bumper limits in AVX, makes it "not checked" again
function RiggingFacts({ item, userId, onChecked }) {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const rigging = riggingOf(item.rigging)
  const raw = item.rigging || {}
  const frames = framesFor(item.speaker_preset)
  const state = dataCheckState(raw, item.speaker_preset)
  const sameTypist = raw.entered_by && raw.entered_by === userId
  async function markChecked() {
    setBusy(true)
    const { data, error } = await supabase.rpc('mark_speaker_rigging_checked', { p_item: item.id, p_frames: frames.length ? framesFingerprint(item.speaker_preset) : null })
    setBusy(false)
    if (error) {
      logger.warn('inventory', error, { step: 'riggingCheck' })
      return notify(error.hint === 'rigging_same_person' ? t('la.signoff.samePerson') : error.hint === 'rigging_author_unknown' ? t('la.signoff.unknownAuthor') : userMessage(error), 'error')
    }
    onChecked(data)
    notify(t('la.signoff.done'), 'success')
  }
  return (
    <section aria-labelledby="rigging-title">
      <h2 id="rigging-title" style={{ ...label, marginBottom: space[2] }}>{t('spk.rigging')}</h2>
      {state === 'checked' ? (
        <p role="note" style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.5, marginBottom: space[2] }}>
          {t('la.signoff.checkedBy', { name: raw.checked_name || t('la.signoff.someone'), date: raw.checked_at ? fmt(raw.checked_at, 'd MMM yyyy') : '—' })}
        </p>
      ) : (
        <div role="note" style={{ fontSize: '13px', color: 'var(--warn)', lineHeight: 1.5, marginBottom: space[2] }}>
          <p style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> {state === 'outdated' ? t('la.signoff.outdated') : t('spk.riggingUnchecked')}
          </p>
          {sameTypist ? (
            <p style={{ color: colors.muted, marginTop: space[1] }}>{t('la.signoff.youTyped')}</p>
          ) : (
            <button type="button" onClick={markChecked} disabled={busy} style={{ ...btn, marginTop: space[2] }}>
              <ClipboardCheck size={14} /> {t('la.signoff.mark')}
            </button>
          )}
          <p style={{ color: colors.muted, marginTop: space[1] }}>{t('la.signoff.how')}</p>
        </div>
      )}
      <dl style={{ display: 'flex', flexDirection: 'column', gap: space[2], margin: 0 }}>
        {['cog', 'pickup_points', 'frame_limits', 'source'].filter(k => rigging[k]).map(k => (
          <div key={k}>
            <dt style={{ ...label, marginBottom: space[1] }}>{t(`spk.rig.${k}`)}</dt>
            <dd style={{ fontSize: '14px', overflowWrap: 'anywhere', whiteSpace: 'pre-line', margin: 0 }}>{rigging[k]}</dd>
          </div>
        ))}
        {frames.length > 0 && (
          <div>
            <dt style={{ ...label, marginBottom: space[1] }}>{t('la.signoff.frames')}</dt>
            {frames.map(f => (
              <dd key={f.id} style={{ fontSize: '14px', margin: `0 0 ${space[1]}` }}>
                <strong>{f.name}</strong> · {f.kg === null ? t('la.notPrinted') : `${f.kg} kg`} · {t('la.limits', { safe: f.safe ?? '—', max: f.max ?? '—' })}{f.swl_kg !== null && t('la.limitsSwl', { swl: f.swl_kg })}
                <span style={{ display: 'block', fontSize: '13px', color: colors.soft }}>“{f.quote}” ({t('la.page', { page: f.page })})</span>
              </dd>
            ))}
          </div>
        )}
      </dl>
    </section>
  )
}
