import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Archive, ArchiveRestore, PackagePlus, PackageMinus, ArrowRightLeft, ClipboardCheck, Plus, QrCode, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useInventory } from '../lib/useInventory'
import { isLowStock, bookValue } from '../lib/inventory'
import { formatMoney } from '../lib/quotes'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { ItemModal, MovementModal, AddUnitsModal, UnitModal } from '../components/inventory/InventoryModals'
import { MovementList, useNames, LOCATION_ICONS } from './InventoryPage'
import { btn, btnPrimary, iconBtn, card, label, colors } from '../components/ui'

const STATUS_COLOR = { available: colors.accent, repair: '#F59E0B', lost: colors.danger, retired: colors.muted }
const ghost = { ...btn, background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: colors.soft }
const small = { ...ghost, padding: '5px 9px', fontSize: '12px' }

// One catalogue item: details, stock per location (bulk) or per unit (serial), history.
//   /org/:orgId/inventory/:itemId (?unit=<id> highlights a unit, e.g. after scanning)
export default function InventoryItemPage() {
  const { orgId, itemId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { notify } = useToast()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const inv = useInventory(orgId)
  const [units, setUnits] = useState([])
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState(false)
  const [movement, setMovement] = useState(null) // { mode, locationId }
  const [addingUnits, setAddingUnits] = useState(false)
  const [unit, setUnit] = useState(null)
  const [selected, setSelected] = useState([])
  const item = inv.items.find(i => i.id === itemId)
  const nameOf = useNames(history.map(h => h.created_by))
  const highlight = params.get('unit')

  async function loadDetails() {
    const [unitsRes, histRes] = await Promise.all([
      supabase.from('stock_units').select('*').eq('item_id', itemId).order('code'),
      supabase.from('stock_movements').select('*').eq('item_id', itemId).order('created_at', { ascending: false }).limit(100),
    ])
    if (unitsRes.error) logger.error('inventory', unitsRes.error, { step: 'units' })
    if (histRes.error) logger.error('inventory', histRes.error, { step: 'history' })
    setUnits(unitsRes.data || [])
    setHistory(histRes.data || [])
  }
  useEffect(() => { if (inv.canManage) loadDetails() }, [itemId, inv.canManage]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { inv.reload(); loadDetails() }

  if (inv.loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
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
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 16px 60px' }}>
        <button onClick={() => navigate(`/org/${orgId}/inventory`)} style={{ ...ghost, marginBottom: '14px', padding: '6px 10px' }}><ArrowLeft size={14} /> {t('inv.title')}</button>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: colors.muted }}>{[item.category, t(`lineKind.${item.kind}`)].filter(Boolean).join(' · ')}</div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px', overflowWrap: 'anywhere' }}>{item.name}</h1>
            <div style={{ fontSize: '13px', color: colors.soft, display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
              {item.code && <span style={{ fontFamily: 'monospace' }}>{item.code}</span>}
              <span>{t(`inv.trackingOpt.${item.tracking}`)}</span>
              {item.archived_at && <span style={{ color: '#F59E0B' }}>{t('inv.archived')}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {item.tracking !== 'none' && <Link to={labelsLink} style={{ ...ghost, textDecoration: 'none' }}><QrCode size={14} /> {selected.length ? t('inv.labelsSelected', { count: selected.length }) : t('inv.labels')}</Link>}
            <button onClick={() => setEditing(true)} style={ghost}><Pencil size={14} /> {t('common.edit')}</button>
            <button onClick={() => setArchived(!item.archived_at)} style={ghost} title={item.archived_at ? t('inv.restore') : t('inv.archiveItemHint')}>
              {item.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />} {item.archived_at ? t('inv.restore') : t('inv.archive')}
            </button>
          </div>
        </div>

        {facts.length > 0 && (
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px 16px', marginBottom: '18px' }}>
            {facts.map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ ...label, marginBottom: '2px' }}>{k}</div>
                <div style={{ fontSize: '14px', overflowWrap: 'anywhere' }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        <section style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, flex: '1 1 auto' }}>
              {t('inv.stock')}{item.tracking !== 'none' && <span style={{ color: low ? '#F59E0B' : colors.soft, fontWeight: 600 }}> · {s?.total || 0}</span>}
              {low && <span style={{ fontSize: '12px', color: '#F59E0B', marginLeft: '8px' }}><AlertTriangle size={12} style={{ verticalAlign: '-1px' }} /> {t('inv.belowMin', { count: item.min_stock })}</span>}
            </h2>
            {item.tracking === 'bulk' && !item.archived_at && (
              <>
                <button onClick={() => setMovement({ mode: 'add' })} disabled={!inv.activeLocations.length} style={btnPrimary}><PackagePlus size={15} /> {t('inv.mode.add')}</button>
                <button onClick={() => setMovement({ mode: 'count' })} disabled={!inv.activeLocations.length} style={ghost}><ClipboardCheck size={14} /> {t('inv.mode.count')}</button>
              </>
            )}
            {item.tracking === 'serial' && !item.archived_at && (
              <button onClick={() => setAddingUnits(true)} style={btnPrimary}><Plus size={15} /> {t('inv.addUnits')}</button>
            )}
          </div>

          {item.tracking === 'none' && (
            <div style={{ ...card, fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>
              {t('inv.notTracked')} <button onClick={() => setEditing(true)} style={{ ...small, marginLeft: '6px' }}><Pencil size={12} /> {t('inv.startTracking')}</button>
            </div>
          )}
          {item.tracking !== 'none' && inv.activeLocations.length === 0 && (
            <p style={{ fontSize: '13px', color: '#F59E0B', marginBottom: '10px' }}>
              {t('inv.noLocationsYet')} <Link to={`/org/${orgId}/inventory?tab=locations`} style={{ color: colors.accent }}>{t('inv.addLocation')}</Link>
            </p>
          )}

          {item.tracking === 'bulk' && (
            Object.keys(s?.byLocation || {}).length === 0 ? (
              <p style={{ fontSize: '13px', color: colors.muted }}>{t('inv.noStockYet')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(s.byLocation).map(([locId, qty]) => {
                  const loc = inv.locations.find(l => l.id === locId)
                  const Icon = LOCATION_ICONS[loc?.kind] || LOCATION_ICONS.other
                  return (
                    <div key={locId} style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <Icon size={16} color={colors.soft} />
                      <span style={{ flex: '1 1 140px', fontWeight: 600, fontSize: '14px' }}>{loc?.name || t('inv.noLocation')}{loc?.archived_at && <span style={{ color: colors.muted, fontWeight: 400 }}> · {t('inv.archived')}</span>}</span>
                      <strong style={{ fontSize: '16px', minWidth: '40px', textAlign: 'right' }}>{qty}</strong>
                      <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button onClick={() => setMovement({ mode: 'move', locationId: locId })} style={small}><ArrowRightLeft size={12} /> {t('inv.mode.move')}</button>
                        <button onClick={() => setMovement({ mode: 'remove', locationId: locId })} style={small}><PackageMinus size={12} /> {t('inv.mode.remove')}</button>
                        {!loc?.archived_at && <button onClick={() => setMovement({ mode: 'count', locationId: locId })} style={small}><ClipboardCheck size={12} /> {t('inv.mode.count')}</button>}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {units.map(u => {
                  const value = bookValue(u)
                  return (
                    <div key={u.id} style={{
                      ...card, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                      opacity: u.status === 'lost' || u.status === 'retired' ? 0.6 : 1,
                      borderColor: highlight === u.id ? colors.accent : colors.border,
                    }}>
                      <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} aria-label={t('inv.selectUnit', { code: u.code })} style={{ accentColor: colors.accent }} />
                      <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>{u.code}</span>
                        <span style={{ fontSize: '12px', color: colors.muted }}>{u.serial ? `${t('inv.serial')} ${u.serial}` : t('inv.noSerial')}</span>
                      </span>
                      <span style={{ fontSize: '13px', color: colors.soft, flex: '1 1 120px' }}>{inv.locationName(u.location_id) || t('inv.noLocation')}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLOR[u.status] }}>{t(`inv.unitStatus.${u.status}`)}</span>
                      {value != null && <span style={{ fontSize: '12px', color: colors.muted, whiteSpace: 'nowrap' }} title={t('inv.bookValueHint')}>{formatMoney(value, 'EUR', lang)}</span>}
                      <button onClick={() => setUnit(u)} aria-label={t('inv.editUnit', { code: u.code })} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </section>

        <section>
          <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>{t('inv.history')}</h2>
          <MovementList rows={history} locationName={id => inv.locationName(id) || '—'} nameOf={nameOf}
            unitCode={id => units.find(u => u.id === id)?.code || ''} />
        </section>
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
      {unit && <UnitModal unit={unit} locations={inv.locations.filter(l => !l.archived_at || l.id === unit.location_id)} onClose={() => setUnit(null)} onSaved={refresh} />}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </AppShell>
  )
}
