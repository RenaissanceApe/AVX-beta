import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Upload, QrCode, Search, Package, MapPin, History, ChevronRight, AlertTriangle, Pencil, Archive, ArchiveRestore, Warehouse, Truck, Building2, Box, Wrench, Handshake, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useInventory } from '../lib/useInventory'
import { isLowStock } from '../lib/inventory'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { ItemModal, LocationModal } from '../components/inventory/InventoryModals'
import { MaintenanceTab } from '../components/inventory/MaintenancePanels'
import { SubrentalsTab } from '../components/inventory/SubrentalPanels'
import { btn, btnPrimary, iconBtn, input, label, colors, AvxLoader, PageHeader, space } from '../components/ui'
import { FilterTabs, pageWrap, rowList, row, rowButton, rowName, rowMeta } from '../components/ListParts'
import EmptyState from '../components/EmptyState'
import { PageHelp, Hint } from '../components/help/HelpParts'

const TABS = ['catalogue', 'locations', 'movements', 'maintenance', 'subrentals', 'reports']
const TAB_ICONS = { catalogue: Package, locations: MapPin, movements: History, maintenance: Wrench, subrentals: Handshake, reports: BarChart3 }
export const LOCATION_ICONS = { warehouse: Warehouse, vehicle: Truck, site: Building2, other: Box }
const ghost = { ...btn, background: 'transparent', borderColor: 'var(--line-strong)', color: colors.soft }

// Inventory of one organisation: the catalogue with stock, locations and the stock ledger.
//   /org/:orgId/inventory (?tab=locations|movements|maintenance|subrentals|reports)
export default function InventoryPage() {
  const { orgId } = useParams()
  const [params, setParams] = useSearchParams()
  const inv = useInventory(orgId)
  const navigate = useNavigate()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'catalogue'
  const setTab = key => { const next = new URLSearchParams(params); if (key === 'catalogue') next.delete('tab'); else next.set('tab', key); setParams(next, { replace: true }) }

  if (inv.loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!inv.canManage) return (
    <AppShell>
      <p style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', color: colors.muted, fontSize: '14px', lineHeight: 1.6, padding: '0 16px' }}>{t('inv.noAccess')}</p>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={pageWrap}>
        <PageHeader title={t('inv.title')} help={<PageHelp page="inventory" />}
          secondary={[
            { label: t('inv.import'), icon: <Upload size={15} aria-hidden="true" />, onClick: () => navigate(`/org/${orgId}/inventory/import`) },
            { label: t('inv.labels'), icon: <QrCode size={15} aria-hidden="true" />, onClick: () => navigate(`/org/${orgId}/inventory/labels`) },
          ]} />
        <FilterTabs tabs label={t('inv.title')} value={tab} onChange={setTab} style={{ marginBottom: space[5] }}
          items={TABS.map(key => { const Icon = TAB_ICONS[key]; return { key, label: t(`inv.tab.${key}`), icon: <Icon size={15} aria-hidden="true" /> } })} />
        {tab === 'catalogue' && <Catalogue inv={inv} orgId={orgId} goLocations={() => setTab('locations')} />}
        {tab === 'locations' && <Locations inv={inv} orgId={orgId} />}
        {tab === 'movements' && <Movements inv={inv} orgId={orgId} />}
        {tab === 'maintenance' && <MaintenanceTab inv={inv} orgId={orgId} />}
        {tab === 'subrentals' && <SubrentalsTab inv={inv} orgId={orgId} />}
        {/* K5: Inventory → Reports is Reports → Equipment (one screen; I7's table is its "Use and value" view) */}
        {tab === 'reports' && <Navigate to={`/org/${orgId}/reports?tab=equipment`} replace />}
      </div>
    </AppShell>
  )
}

function Catalogue({ inv, orgId, goLocations }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | tracked | low | archived
  const [adding, setAdding] = useState(false)
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
        <div role="status" style={{ marginBottom: space[4], display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <MapPin size={16} color={colors.warn} aria-hidden="true" />
          <span style={{ flex: '1 1 220px', fontSize: '13px', color: colors.soft, lineHeight: 1.5 }}>{t('inv.noLocationsYet')}</span>
          <button onClick={goLocations} style={btn}><Plus size={15} aria-hidden="true" /> {t('inv.addLocation')}</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} color={colors.muted} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inv.search')} aria-label={t('inv.search')} style={{ ...input, paddingLeft: '32px' }} />
        </div>
        <button onClick={() => setAdding(true)} style={btnPrimary}><Plus size={16} aria-hidden="true" /> {t('inv.addItem')}</button>
      </div>
      <FilterTabs label={t('inv.filter')} value={filter} onChange={setFilter} style={{ marginBottom: space[5] }}
        items={['all', 'tracked', 'low', 'archived'].map(f => ({
          key: f, count: f === 'low' && lowCount ? lowCount : null,
          label: f === 'low' && lowCount ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}><AlertTriangle size={14} color={colors.warn} aria-hidden="true" />{t(`inv.filterOpt.${f}`)}</span> : t(`inv.filterOpt.${f}`),
        }))} />

      {inv.items.length === 0 ? (
        <EmptyState icon={<Package size={28} />} body={t('inv.empty')} action={t('inv.import')} actionIcon={<Upload size={14} />} onAction={() => navigate(`/org/${orgId}/inventory/import`)} guide="wh-import" />
      ) : visible.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: '13px', textAlign: 'center', padding: `${space[6]} ${space[4]}` }}>{t('inv.noMatch')}</p>
      ) : groups.map(([category, list], gi) => (
        <section key={category || '—'} aria-label={category || t('prices.noCategory')} style={{ marginTop: gi ? space[6] : 0 }}>
          <h2 style={{ ...label, marginBottom: space[2] }}>{category || t('prices.noCategory')}</h2>
          <ul style={rowList}>
            {list.map(item => {
              const s = inv.stock[item.id]
              const low = isLowStock(item, s?.total)
              return (
                <li key={item.id}>
                  <button onClick={() => navigate(`/org/${orgId}/inventory/${item.id}`)} style={rowButton}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...rowName, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{item.name}</span>
                      <span style={{ ...rowMeta, display: 'flex', gap: `${space[1]} ${space[3]}`, flexWrap: 'wrap' }}>
                        {item.code && <span style={{ fontFamily: 'var(--font-mono)' }}>{item.code}</span>}
                        {item.kit_type && <span style={{ color: colors.accentText }}>{t(`kit.typeOpt.${item.kit_type}`)}</span>}
                        {item.kit_type !== 'set' && <span>{t(`inv.trackingOpt.${item.tracking}`)}</span>}
                        {[item.brand, item.model].filter(Boolean).length > 0 && <span>{[item.brand, item.model].filter(Boolean).join(' ')}</span>}
                      </span>
                    </span>
                    {item.tracking !== 'none' && (
                      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: space[1], fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '16px', color: low ? colors.warn : colors.text, justifyContent: 'flex-end' }}>
                          {low && <AlertTriangle size={14} aria-label={t('inv.lowStock')} />}{s?.total || 0}
                        </span>
                        <span style={{ fontSize: '11px', color: colors.muted }}>
                          {s?.inRepair ? t('inv.inRepairCount', { count: s.inRepair }) : t('inv.inStock')}
                        </span>
                      </span>
                    )}
                    <ChevronRight size={16} color={colors.muted} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {adding && (
        <ItemModal orgId={orgId} userId={user.id} item={null} hasStock={false}
          categories={[...new Set(inv.items.map(i => i.category).filter(Boolean))]}
          onClose={() => setAdding(false)} onSaved={saved => { inv.reload(); navigate(`/org/${orgId}/inventory/${saved.id}`) }} />
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
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', justifyContent: 'flex-end', marginBottom: space[4] }}>
        <Hint text={t('inv.locationsIntro')} label={t('inv.tab.locations')} />
        <button onClick={() => setEditing('new')} style={btnPrimary}><Plus size={16} aria-hidden="true" /> {t('inv.addLocation')}</button>
      </div>
      {inv.locations.length === 0 ? (
        <EmptyState compact icon={<Warehouse size={24} />} body={t('inv.noLocationsYet')} action={t('inv.addLocation')} onAction={() => setEditing('new')} guide="wh-locations" />
      ) : (
        <ul style={rowList}>
          {list.map(loc => {
            const Icon = LOCATION_ICONS[loc.kind] || Box
            return (
              <li key={loc.id} style={{ ...row, color: loc.archived_at ? colors.muted : undefined }}>
                <Icon size={18} color={colors.soft} aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={rowName}>{loc.name}{loc.archived_at && <span style={{ fontSize: '11px', fontWeight: 400, color: colors.muted }}> · {t('inv.archived')}</span>}</span>
                  <span style={rowMeta}>{[t(`inv.locationKind.${loc.kind}`), loc.address].filter(Boolean).join(' · ')}</span>
                </div>
                <span style={{ fontSize: '13px', color: colors.soft, whiteSpace: 'nowrap' }}>{t('inv.itemsHere', { count: count(loc.id) })}</span>
                {!loc.archived_at && <button onClick={() => setEditing(loc)} aria-label={t('inv.editLocationNamed', { name: loc.name })} title={t('common.edit')} style={iconBtn}><Pencil size={16} /></button>}
                <button onClick={() => setArchived(loc, !loc.archived_at)} aria-label={loc.archived_at ? t('inv.restoreNamed', { name: loc.name }) : t('inv.archiveNamed', { name: loc.name })}
                  title={loc.archived_at ? t('inv.restore') : t('inv.archive')} style={iconBtn}>
                  {loc.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {inv.locations.some(l => l.archived_at) && (
        <button onClick={() => setShowArchived(s => !s)} style={{ ...ghost, marginTop: space[3] }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {rows.map(m => {
        const out = m.from_location_id && !m.to_location_id
        const where = [m.from_location_id && locationName(m.from_location_id), m.to_location_id && locationName(m.to_location_id)].filter(Boolean).join(' → ')
        return (
          <div key={m.id} style={{ display: 'flex', gap: '12px', padding: '8px 4px', borderBottom: `1px solid ${colors.border}`, fontSize: '13px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ color: colors.muted, fontSize: '13px', minWidth: '96px' }}>{fmt(m.created_at, 'd MMM yyyy HH:mm')}</span>
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>
              {itemName && <strong>{itemName(m.item_id)} · </strong>}
              {t(`inv.kind.${m.kind}`)}
              {m.unit_id && unitCode && <span style={{ fontFamily: 'var(--font-mono)', color: colors.soft }}> {unitCode(m.unit_id)}</span>}
              {where && <span style={{ color: colors.soft }}> · {where}</span>}
              {m.note && <span style={{ color: colors.muted }}> · {m.note}</span>}
            </span>
            {!m.unit_id && <strong style={{ color: out ? colors.danger : m.to_location_id && !m.from_location_id ? colors.accentText : 'var(--text)', whiteSpace: 'nowrap' }}>{out ? '−' : m.from_location_id ? '' : '+'}{m.quantity}</strong>}
            <span style={{ fontSize: '13px', color: colors.muted }}>{nameOf(m.created_by)}</span>
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
  if (!rows) return <AvxLoader size={20} color={colors.accentText} />
  const itemName = id => inv.items.find(i => i.id === id)?.name || '—'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: space[2] }}>
        <Hint text={t('inv.movementsIntro')} label={t('inv.tab.movements')} />
      </div>
      <MovementList rows={rows} itemName={itemName} locationName={id => inv.locationName(id) || '—'} nameOf={nameOf} />
    </div>
  )
}
