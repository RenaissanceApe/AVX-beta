import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CalendarClock, Plus } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { MY_WORK } from '../lib/nav'
import { localToday } from '../lib/gigs'
import { addDays, orgAppointments, myAppointments, sortAppointments } from '../lib/appointments'
import { useI18n } from '../i18n'
import { btnPrimary, colors, AvxLoader, PageHeader, Section, space } from '../components/ui'
import { pageWrap, rowList } from '../components/ListParts'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import { AppointmentRow, AppointmentForm, AppointmentView } from '../components/appointments/AppointmentParts'

// Appointments (step 23, V2): site visits, meetings, warehouse days.
// /org/:orgId/appointments — the organisation's (planners see all, others the ones they're on).
// /me/appointments — every appointment you're invited to, in any organisation.
// ?a=<id> opens one (links from notifications and the calendar feed).
export default function AppointmentsPage() {
  const { orgId } = useParams()
  const mine = !orgId
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const { orgs, roleIn, loading, setWorkspace } = useWorkspace()
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null) // appointment | 'new'
  const [version, setVersion] = useState(0)
  useEffect(() => { setWorkspace(mine ? MY_WORK : orgId) }, [mine, orgId, setWorkspace])

  const zoneOf = useCallback(a => orgs.find(o => o.id === (a?.org_id || orgId))?.time_zone || a?.organisations?.time_zone || null, [orgs, orgId])
  const canPlanIn = useCallback(id => ['admin', 'member'].includes(roleIn(id)), [roleIn])
  const canPlan = !mine && canPlanIn(orgId)

  const load = useCallback(async () => {
    const since = addDays(localToday(), -60)
    try {
      setList(mine ? await myAppointments(user.id, since) : await orgAppointments(orgId, since))
    } catch (error) {
      logger.error('appointments', error, { step: 'list' })
      setList([])
    }
  }, [mine, orgId, user.id])
  useEffect(() => { load() }, [load, version])

  const { upcoming, past } = useMemo(() => sortAppointments(list || [], zoneOf), [list, zoneOf])
  const openId = params.get('a')
  const open = openId && list ? list.find(a => a.id === openId) : null
  const close = () => { if (openId) { const next = new URLSearchParams(params); next.delete('a'); setParams(next, { replace: true }) } setEditing(null) }
  const openOne = a => (canPlanIn(a.org_id) ? setEditing(a) : setParams({ a: a.id }))
  const current = editing || (open && canPlanIn(open.org_id) ? open : null)
  const orgName = a => (mine ? a.organisations?.name || orgs.find(o => o.id === a.org_id)?.name : null)

  const rows = items => (
    <ul style={rowList}>
      {items.map(a => <AppointmentRow key={a.id} appointment={a} timeZone={zoneOf(a)} org={orgName(a)} onOpen={openOne} />)}
    </ul>
  )

  if (loading || !list) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  return (
    <AppShell>
      <div style={pageWrap}>
        <PageHeader title={t('appointments.title')} line={mine ? t('appointments.lineMine') : t('appointments.lineOrg')} help={<PageHelp page="appointments" />}
          primary={canPlan ? <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={16} aria-hidden="true" /> {t('appointments.new')}</button> : null} />
        <Section id="appointments-upcoming" title={t('appointments.upcoming')}>
          {upcoming.length === 0 ? (
            <EmptyState compact icon={<CalendarClock size={26} />} title={t('appointments.none')}
              body={canPlan ? t('appointments.noneBodyPlanner') : t('appointments.noneBody')}
              action={canPlan ? t('appointments.new') : undefined} onAction={canPlan ? () => setEditing('new') : undefined} guide="pm-site-visit" />
          ) : rows(upcoming)}
        </Section>
        {past.length > 0 && (
          <Section id="appointments-past" title={t('appointments.past')}>
            <div style={{ opacity: 0.85, marginTop: space[1] }}>{rows(past)}</div>
          </Section>
        )}
      </div>
      {current && (
        <AppointmentForm orgId={current === 'new' ? orgId : current.org_id} timeZone={zoneOf(current === 'new' ? null : current)}
          appointment={current === 'new' ? null : current} onSaved={() => setVersion(v => v + 1)} onClose={close} />
      )}
      {open && !current && <AppointmentView appointment={open} timeZone={zoneOf(open)} onClose={close} />}
    </AppShell>
  )
}
