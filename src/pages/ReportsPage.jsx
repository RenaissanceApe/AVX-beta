import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useGigLabels } from '../lib/gigLabels'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { btn, btnPrimary, colors, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import { OverviewTiles, useOverview } from '../components/reports/OverviewTiles'
import RevenueReport from '../components/reports/RevenueReport'
import GigMarginsReport from '../components/reports/GigMarginsReport'
import MoneyReport from '../components/reports/MoneyReport'
import EquipmentReport from '../components/reports/EquipmentReport'
import { PrintStyles } from '../components/reports/ReportParts'

// Later K steps add their tabs here (and their tiles in src/lib/analytics/tiles.js)
export const REPORT_TABS = ['overview', 'revenue', 'money', 'margins', 'equipment']

// Reports (step K1) at /org/:orgId/reports?tab=…, for those who see money (admins and members,
// private.can_see_finance). Everything is counted in the database (docs/ANALYTICS.md).
export default function ReportsPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { t } = useI18n()
  const { roleIn, loading, setWorkspace, orgs } = useWorkspace()
  const role = roleIn(orgId)
  const canSee = role === 'admin' || role === 'member'
  const tab = REPORT_TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
  const org = orgs.find(o => o.id === orgId)
  const labels = useGigLabels(canSee ? orgId : null)
  const overview = useOverview(orgId, canSee && tab === 'overview')
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
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('reports.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <PrintStyles />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{title}</h1>
            <span className="no-print"><PageHelp page="org-reports" /></span>
          </div>
          <p style={{ fontSize: '13px', color: colors.muted, marginTop: '2px' }}>{org?.name ? `${org.name} · ` : ''}{t('reports.intro')}</p>
        </div>

        <nav className="no-print" aria-label={t('reports.tabs')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {REPORT_TABS.map(v => (
            <button key={v} type="button" onClick={() => setTab(v)} aria-current={tab === v ? 'page' : undefined}
              style={{ ...btn, padding: '7px 12px', ...(tab === v ? { background: colors.accent, color: colors.onAccent, borderColor: colors.accent } : {}) }}>
              {t(`reports.tab.${v}`)}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          overview.loading || (!overview.data && !overview.error)
            ? <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
            : overview.error
              ? <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
              : (
                <section aria-labelledby="rp-overview" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <h2 id="rp-overview" style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{t('reports.keyNumbers')}</h2>
                  <OverviewTiles orgId={orgId} overview={overview.data} />
                  <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('reports.overviewNote')}</p>
                </section>
              )
        )}
        {tab === 'revenue' && <RevenueReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'money' && <MoneyReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'margins' && <GigMarginsReport orgId={orgId} timeZone={org?.time_zone} labels={labels} params={params} setParam={setParam} />}
        {tab === 'equipment' && <EquipmentReport orgId={orgId} timeZone={org?.time_zone} params={params} setParam={setParam} />}
      </div>
    </AppShell>
  )
}
