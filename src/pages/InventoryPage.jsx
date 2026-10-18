import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Upload, QrCode, Search, Loader2, Package, MapPin, History, ChevronRight, AlertTriangle, Pencil, Archive, ArchiveRestore, Warehouse, Truck, Building2, Box, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useInventory } from '../lib/useInventory'
import { isLowStock } from '../lib/inventory'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { ItemModal, LocationModal, ImportStockModal } from '../components/inventory/InventoryModals'
import { MaintenanceTab } from '../components/inventory/MaintenancePanels'
import { btn, btnPrimary, iconBtn, input, card, colors } from '../components/ui'

const TABS = ['catalogue', 'locations', 'movements', 'maintenance']
const TAB_ICONS = { catalogue: Package, locations: MapPin, movements: History, maintenance: Wrench }
export const LOCATION_ICONS = { warehouse: Warehouse, vehicle: Truck, site: Building2, other: Box }
const ghost = { ...btn, background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: colors.soft }

// Inventory of one organisation: the catalogue with stock, locations and the stock ledger.
//   /org/:orgId/inventory (?tab=locations|movements|maintenance)
export default function InventoryPage() {
  const { orgId } = useParams()
  const [params, setParams] = useSearchParams()
  const inv = useInventory(orgId)
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'catalogue'
  const setTab = key => { const next = new URLSearchParams(params); if (key === 'catalogue') next.delete('tab'); else next.set('tab', key); setParams(next, { replace: true }) }

  if (inv.loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!inv.canManage) return (
    <AppShell>
      <p style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', color: colors.muted, fontSize: '14px', lineHeight: 1.6, padding: '0 16px' }}>{t('inv.noAccess')}</p>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>{inv.org?.name}</div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('inv.title')}</h1>
          </div>
          <Link to={`/org/${orgId}/inventory/labels`} style={{ ...ghost, textDecoration: 'none' }}><QrCode size={14} /> {t('inv.labels')}</Link>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `1px solid ${colors.border}`, overflowX: 'auto' }}>
          {TABS.map(key => { const Icon = TAB_ICONS[key]; return (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} style={{
              padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
              color: tab === key ? colors.accent : colors.muted, borderBottom: tab === key ? `2px solid ${colors.accent}` : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}><Icon size={14} /> {t(`inv.tab.${key}`)}</button>
          ) })}
        </div>
        {tab === 'catalogue' && <Catalogue inv={inv} orgId={orgId} goLocations={() => setTab('locations')} />}
        {tab === 'locations' && <Locations inv={inv} orgId={orgId} />}
        {tab === 'movements' && <Movements inv={inv} orgId={orgId} />}
        {tab === 'maintenance' && <MaintenanceTab inv={inv} orgId={orgId} />}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </AppShell>
  )
}

function Catalogue({ inv, orgId, goLocations }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | tracked | low | archived
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const q = search.trim().toLowerCase()
  const visible = useMemo(() => inv.items.filter(i => {
    if (filter === 'archived' ? !i.archived_at : i.archived_at) return false
    if (filter === 'tracked' && i.tracking === 'none' && !i.kit_type) return false
    if (filter === 'low' && !isLowStock(i, inv.stock[i.id]?.total)) return false
    return !q || [i.name, i.code, i.category, i.brand, i.model].some(v => (v || '').toLowerCase().includes(q))
  }), [inv.items, inv.stock, filter, q])
  const groups = useMemo(() => {
    const map = new Map()
    for (const i of visible) { const k = i.category || ''; if (!map.has(k)) map.set(k, []); map.get(k).push(i) }
    return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  }, [visible])
  const lowCount = inv.items.filter(i => !i.archived_at && isLowStock(i, inv.stock[i.id]?.total)).length

  return (
    <div>
      {inv.activeLocations.length === 0 && (
        <div style={{ ...card, borderColor: 'rgba(245,158,11,0.35)', marginBottom: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <MapPin size={16} color="#F59E0B" />
          <span style={{ flex: '1 1 220px', fontSize: '13px', color: colors.soft, lineHeight: 1.5 }}>{t('inv.noLocationsYet')}</span>
          <button onClick={goLocations} style={btn}><Plus size={14} /> {t('inv.addLocation')}</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inv.search')} aria-label={t('inv.search')} style={{ ...input, paddingLeft: '32px' }} />
        </div>
        <button onClick={() => setImporting(true)} style={ghost}><Upload size={14} /> {t('inv.import')}</button>
        <button onClick={() => setAdding(true)} style={btnPrimary}><Plus size={15} /> {t('inv.addItem')}</button>
      </div>
      <div role="group" aria-label={t('inv.filter')} style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {['all', 'tracked', 'low', 'archived'].map(f => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} style={{
            padding: '5px 11px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${filter === f ? 'rgba(30,200,120,0.4)' : colors.border}`,
            background: filter === f ? 'rgba(30,200,120,0.12)' : 'transparent', color: filter === f ? colors.accent : f === 'low' && lowCount ? '#F59E0B' : colors.soft,
          }}>{t(`inv.filterOpt.${f}`)}{f === 'low' && lowCount ? ` · ${lowCount}` : ''}</button>
        ))}
      </div>

      {inv.items.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px', textAlign: 'center', padding: '40px 20px', lineHeight: 1.6 }}>{t('inv.empty')}</p>
      ) : visible.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px', textAlign: 'center', padding: '30px 20px' }}>{t('inv.noMatch')}</p>
      ) : groups.map(([category, list]) => (
        <section key={category || '—'} style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: colors.muted, marginBottom: '6px' }}>{category || t('prices.noCategory')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {list.map(item => {
              const s = inv.stock[item.id]
              const low = isLowStock(item, s?.total)
              return (
                <button key={item.id} onClick={() => navigate(`/org/${orgId}/inventory/${item.id}`)} style={{
                  ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left', color: '#fff', font: 'inherit', width: '100%',
                }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', overflowWrap: 'anywhere' }}>{item.name}</span>
                    <span style={{ fontSize: '12px', color: colors.muted, display: 'flex', gap: '4px 10px', flexWrap: 'wrap' }}>
                      {item.code && <span style={{ fontFamily: 'monospace' }}>{item.code}</span>}
                      {item.kit_type && <span style={{ color: colors.accent }}>{t(`kit.typeOpt.${item.kit_type}`)}</span>}
                      {item.kit_type !== 'set' && <span>{t(`inv.trackingOpt.${item.tracking}`)}</span>}
                      {[item.brand, item.model].filter(Boolean).length > 0 && <span>{[item.brand, item.model].filter(Boolean).join(' ')}</span>}
                    </span>
                  </span>
                  {item.tracking !== 'none' && (
                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800, fontSize: '16px', color: low ? '#F59E0B' : '#fff', justifyContent: 'flex-end' }}>
                        {low && <AlertTriangle size={13} aria-label={t('inv.lowStock')} />}{s?.total || 0}
                      </span>
                      <span style={{ fontSize: '11px', color: colors.muted }}>
                        {s?.inRepair ? t('inv.inRepairCount', { count: s.inRepair }) : t('inv.inStock')}
                      </span>
                    </span>
                  )}
                  <ChevronRight size={16} color={colors.muted} />
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {adding && (
        <ItemModal orgId={orgId} userId={user.id} item={null} hasStock={false}
          categories={[...new Set(inv.items.map(i => i.category).filter(Boolean))]}
          onClose={() => setAdding(false)} onSaved={saved => { inv.reload(); navigate(`/org/${orgId}/inventory/${saved.id}`) }} />
      )}
      {importing && (
        <ImportStockModal orgId={orgId} userId={user.id} items={inv.items} locations={inv.activeLocations}
          onClose={() => setImporting(false)} onImported={inv.reload} />
      )}
    </div>
  )
}

function Locations({ inv, orgId }) {
  const { notify } = useToast()
  const [editing, setEditing] = useState(null) // location | 'new'
  const [showArchived, setShowArchived] = useState(false)
  const count = id => Object.values(inv.stock).reduce((sum, s) => sum + (s.byLocation[id] || 0), 0)
  const list = inv.locations.filter(l => showArchived || !l.archived_at)

  async function setArchived(loc, archived) {
    if (archived && count(loc.id) > 0 && !window.confirm(t('inv.archiveWithStock', { name: loc.name, count: count(loc.id) }))) return
    const { error } = await supabase.from('stock_locations').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', loc.id)
    if (error) return notify(userMessage(error), 'error')
    inv.reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <p style={{ flex: '1 1 260px', fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('inv.locationsIntro')}</p>
        <button onClick={() => setEditing('new')} style={btnPrimary}><Plus size={15} /> {t('inv.addLocation')}</button>
      </div>
      {inv.locations.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px', textAlign: 'center', padding: '30px 20px' }}>{t('inv.noLocations')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {list.map(loc => {
            const Icon = LOCATION_ICONS[loc.kind] || Box
            return (
              <div key={loc.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', opacity: loc.archived_at ? 0.55 : 1 }}>
                <Icon size={18} color={colors.soft} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{loc.name}{loc.archived_at && <span style={{ fontSize: '11px', color: colors.muted }}> · {t('inv.archived')}</span>}</div>
                  <div style={{ fontSize: '12px', color: colors.muted }}>{[t(`inv.locationKind.${loc.kind}`), loc.address].filter(Boolean).join(' · ')}</div>
                </div>
                <span style={{ fontSize: '13px', color: colors.soft, whiteSpace: 'nowrap' }}>{t('inv.itemsHere', { count: count(loc.id) })}</span>
                {!loc.archived_at && <button onClick={() => setEditing(loc)} aria-label={t('inv.editLocationNamed', { name: loc.name })} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>}
                <button onClick={() => setArchived(loc, !loc.archived_at)} aria-label={loc.archived_at ? t('inv.restoreNamed', { name: loc.name }) : t('inv.archiveNamed', { name: loc.name })}
                  title={loc.archived_at ? t('inv.restore') : t('inv.archive')} style={iconBtn}>
                  {loc.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {inv.locations.some(l => l.archived_at) && (
        <button onClick={() => setShowArchived(s => !s)} style={{ ...ghost, marginTop: '12px', padding: '6px 10px', fontSize: '12px' }}>
          {showArchived ? t('inv.hideArchived') : t('inv.showArchived')}
        </button>
      )}
      {editing && <LocationModal orgId={orgId} location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={inv.reload} />}
    </div>
  )
}

// The stock ledger, newest first
export function MovementList({ rows, itemName, locationName, nameOf, unitCode }) {
  const { fmt } = useI18n()
  if (!rows.length) return <p style={{ color: colors.muted, fontSize: '13px', padding: '20px 0' }}>{t('inv.noMovements')}</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {rows.map(m => {
        const out = m.from_location_id && !m.to_location_id
        const where = [m.from_location_id && locationName(m.from_location_id), m.to_location_id && locationName(m.to_location_id)].filter(Boolean).join(' → ')
        return (
          <div key={m.id} style={{ display: 'flex', gap: '10px', padding: '8px 4px', borderBottom: `1px solid ${colors.border}`, fontSize: '13px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ color: colors.muted, fontSize: '12px', minWidth: '96px' }}>{fmt(m.created_at, 'd MMM yyyy HH:mm')}</span>
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>
              {itemName && <strong>{itemName(m.item_id)} · </strong>}
              {t(`inv.kind.${m.kind}`)}
              {m.unit_id && unitCode && <span style={{ fontFamily: 'monospace', color: colors.soft }}> {unitCode(m.unit_id)}</span>}
              {where && <span style={{ color: colors.soft }}> · {where}</span>}
              {m.note && <span style={{ color: colors.muted }}> · {m.note}</span>}
            </span>
            {!m.unit_id && <strong style={{ color: out ? colors.danger : m.to_location_id && !m.from_location_id ? colors.accent : '#fff', whiteSpace: 'nowrap' }}>{out ? '−' : m.from_location_id ? '' : '+'}{m.quantity}</strong>}
            <span style={{ fontSize: '12px', color: colors.muted }}>{nameOf(m.created_by)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function useNames(ids) {
  const [names, setNames] = useState({})
  const key = [...new Set(ids.filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (!key) return
    supabase.from('profiles').select('id, full_name').in('id', key.split(','))
      .then(({ data }) => setNames(Object.fromEntries((data || []).map(p => [p.id, p.full_name]))))
  }, [key])
  return id => (id ? names[id] || t('common.someone') : '')
}

function Movements({ inv, orgId }) {
  const [rows, setRows] = useState(null)
  const nameOf = useNames((rows || []).map(r => r.created_by))
  useEffect(() => {
    supabase.from('stock_movements').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) logger.error('inventory', error, { step: 'movements' }); setRows(data || []) })
  }, [orgId])
  if (!rows) return <Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
  const itemName = id => inv.items.find(i => i.id === id)?.name || '—'
  return (
    <div>
      <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '10px', lineHeight: 1.5 }}>{t('inv.movementsIntro')}</p>
      <MovementList rows={rows} itemName={itemName} locationName={id => inv.locationName(id) || '—'} nameOf={nameOf} />
    </div>
  )
}
