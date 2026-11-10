import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useGigLabels } from '../lib/gigLabels'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { btnPrimary, colors, AvxLoader, PageHeader, space, usePhone } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import { OverviewTiles, useOverview } from '../components/reports/OverviewTiles'
import RevenueReport from '../components/reports/RevenueReport'
import GigMarginsReport from '../components/reports/GigMarginsReport'
import MoneyReport from '../components/reports/MoneyReport'
import SalesReport from '../components/reports/SalesReport'
import EquipmentReport from '../components/reports/EquipmentReport'
import OperationsReport from '../components/reports/OperationsReport'
import WarehouseReport from '../components/reports/WarehouseReport'
import { PrintStyles } from '../components/reports/ReportParts'
import { SaveViewButton, SavedViewsSection, useSavedViews } from '../components/reports/SavedViews'
import ManagementPack from '../components/reports/ManagementPack'
import AccountantLinks from '../components/reports/AccountantLinks'

// Later K steps add their tabs here (and their tiles in src/lib/analytics/tiles.js)
export const REPORT_TABS = ['overview', 'revenue', 'money', 'margins', 'sales', 'equipment', 'warehouse', 'operations']

// Reports (step K1) at /org/:orgId/reports?tab=…, for those who see money (admins and members,
// private.can_see_finance). Everything is counted in the database (docs/ANALYTICS.md).
export default function ReportsPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { t } = useI18n()
  const phone = usePhone()
  const { roleIn, loading, setWorkspace, orgs } = useWorkspace()
  const role = roleIn(orgId)
  const canSee = role === 'admin' || role === 'member'
  const tab = REPORT_TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
  const org = orgs.find(o => o.id === orgId)
  const labels = useGigLabels(canSee ? orgId : null)
  const overview = useOverview(orgId, canSee && tab === 'overview')
  const saved = useSavedViews(orgId, canSee)
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])
  useEffect(() => { if (canSee) track(`view:reports:${tab}`) }, [canSee, tab])

  const setParam = (key, value) => setParams(p => {
    const next = new URLSearchParams(p)
    if (value == null || value === '') next.delete(key); else next.set(key, value)
    return next
  }, { replace: true })
  const setTab = v => setParams(v === 'overview' ? {} : { tab: v }, { replace: true })

  const title = t('reports.pageTitle')
  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!canSee) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: space[2] }}>{title}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('reports.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <PrintStyles />
      <style>{TABS_CSS}</style>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: `${space[5]} var(--gutter) ${space[7]}`, display: 'flex', flexDirection: 'column', gap: space[4] }}>
        {/* The page header (DESIGN.md rule 4): the title, one short line, the ⓘ; K9's Save view on the right */}
        <PageHeader className="rp-head" title={title}
          help={<span className="no-print"><PageHelp page="org-reports" /></span>}
          line={phone || !org?.name ? t('reports.intro') : `${org.name} · ${t('reports.intro')}`}
          primary={tab !== 'overview' && <span className="no-print"><SaveViewButton orgId={orgId} tab={tab} params={params} onSaved={saved.add} /></span>} />

        {/* The report tabs: the chosen one is the text colour with a 2px accent bar, not a fill (rule 3) */}
        <nav className="no-print rp-tabs" aria-label={t('reports.tabs')}>
          {REPORT_TABS.map(v => (
            <button key={v} type="button" onClick={() => setTab(v)} aria-current={tab === v ? 'page' : undefined} className="rp-tab">
              {t(`reports.tab.${v}`)}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.section, marginTop: space[3] }}>
            {overview.loading || (!overview.data && !overview.error)
              ? <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
              : overview.error
                ? <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
                : (
                  <section aria-labelledby="rp-overview" style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
                    <h2 id="rp-overview" style={sectionTitle}>{t('reports.keyNumbers')}</h2>
                    <OverviewTiles orgId={orgId} overview={overview.data} failed={overview.failed} />
                    <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('reports.overviewNote')}</p>
                  </section>
                )}
            {/* K9: saved views, the monthly pack and (admins) the accountant's links */}
            <SavedViewsSection orgId={orgId} saved={saved} />
            <ManagementPack orgId={orgId} orgName={org?.name} timeZone={org?.time_zone} />
            {role === 'admin' && <AccountantLinks orgId={orgId} timeZone={org?.time_zone} />}
          </div>
        )}
        {tab === 'revenue' && <RevenueReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'money' && <MoneyReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'sales' && <SalesReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'operations' && <OperationsReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} isAdmin={role === 'admin'} />}
        {tab === 'margins' && <GigMarginsReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'equipment' && <EquipmentReport orgId={orgId} timeZone={org?.time_zone} params={params} setParam={setParam} />}
        {tab === 'warehouse' && <WarehouseReport orgId={orgId} timeZone={org?.time_zone} params={params} setParam={setParam} />}
      </div>
    </AppShell>
  )
}

// The section heading (DESIGN.md "Typography": 16px Space Mono 700)
const sectionTitle = { font: '700 16px/24px var(--font-mono)', margin: 0 }

// Report tabs: one row that scrolls sideways on a phone, a 2px accent bar under the chosen one
const TABS_CSS = `
  .rp-head { margin-bottom: 0; }
  .rp-tabs { display: flex; gap: var(--space-1); overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line);
    margin: 0 calc(-1 * var(--gutter)); padding: 0 var(--gutter); }
  .rp-tabs::-webkit-scrollbar { display: none; }
  .rp-tab { flex: 0 0 auto; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer;
    padding: var(--space-3) var(--space-3); min-height: 44px; font: 500 14px/20px var(--font-ui); color: var(--muted); white-space: nowrap; }
  .rp-tab:hover { color: var(--text); }
  .rp-tab[aria-current="page"] { color: var(--text); font-weight: 700; border-bottom-color: var(--accent); }
`
