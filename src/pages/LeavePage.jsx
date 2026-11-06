import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarOff, Plus, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { localToday } from '../lib/gigs'
import { awayByDay, monthBounds, leaveRange, removeLeave, addDays } from '../lib/leave'
import { useI18n, fmt } from '../i18n'
import { btn, btnPrimary, iconBtn, input, label, card, colors, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import { LeaveForm, TypeChip, LeaveStatusChip, daysText } from '../components/leave/LeaveParts'
import { LeaveRequests, LeaveBalances } from '../components/leave/LeaveAdmin'

const thisMonth = () => fmt(new Date(), 'yyyy-MM')
const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }
const h2 = { fontSize: '15px', fontWeight: 700, margin: 0 }

// Leave (step 9) at /org/:orgId/leave, for the organisation's staff (admins and members):
// who is away this month, your holiday balance and requests, and for admins the requests to
// decide, everyone's balances and working weeks.
export default function LeavePage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const { roleIn, loading, setWorkspace } = useWorkspace()
  const role = roleIn(orgId)
  const isStaff = role === 'admin' || role === 'member'
  const isAdmin = role === 'admin'
  const [month, setMonth] = useState(thisMonth())
  const [entries, setEntries] = useState(null)
  const [mine, setMine] = useState([])
  const [balance, setBalance] = useState(null)
  const [people, setPeople] = useState([])
  const [asking, setAsking] = useState(null) // 'me' | 'someone'
  const [version, setVersion] = useState(0) // bumps after any change, so every part reloads
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])
  const year = new Date().getFullYear()

  const load = useCallback(async () => {
    if (!isStaff) return
    const [from, to] = monthBounds(month)
    const today = localToday()
    const [cal, own, bal] = await Promise.all([
      supabase.rpc('org_leave_calendar', { p_org: orgId, p_from: from, p_to: to }),
      supabase.from('crew_unavailability').select('*').eq('org_id', orgId).eq('user_id', user.id).is('removed_at', null)
        .gte('end_date', addDays(today, -60)).order('start_date').limit(200),
      supabase.rpc('leave_balances', { p_org: orgId, p_year: year }),
    ])
    if (cal.error) logger.error('leave', cal.error, { step: 'calendar' })
    if (own.error) logger.error('leave', own.error, { step: 'mine' })
    if (bal.error) logger.error('leave', bal.error, { step: 'balance' })
    setEntries(cal.data || [])
    setMine((own.data || []).filter(l => l.status !== 'cancelled'))
    setBalance((bal.data || []).find(b => b.user_id === user.id) || null)
    setPeople(bal.data || [])
  }, [isStaff, orgId, month, user.id, year])
  useEffect(() => { load() }, [load, version])

  const days = useMemo(() => (entries ? Object.entries(awayByDay(entries, month)).filter(([, list]) => list.length) : []), [entries, month])
  const changed = () => setVersion(v => v + 1)

  async function cancel(l) {
    try {
      await removeLeave(l)
      notify(t('leave.removed'), 'success')
      changed()
    } catch (error) {
      logger.error('leave', error, { step: 'cancel' })
      notify(userMessage(error), 'error')
    }
  }

  const title = t('leave.pageTitle')
  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!isStaff) return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('leave.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{title}</h1>
              <PageHelp page="org-leave" />
            </div>
            <p style={{ fontSize: '13px', color: colors.muted, marginTop: '2px' }}>{isAdmin ? t('leave.introAdmin') : t('leave.intro')}</p>
          </div>
          <button type="button" onClick={() => setAsking('me')} style={btnPrimary}><Plus size={14} /> {t('leave.ask')}</button>
          {isAdmin && <button type="button" onClick={() => setAsking('someone')} style={btn}><UserPlus size={14} /> {t('leave.addFor')}</button>}
        </div>

        {balance && (
          <p style={{ ...card, padding: '12px 16px', fontSize: '14px', margin: 0, display: 'flex', gap: '6px 16px', flexWrap: 'wrap' }}>
            <span>{t('leave.yourBalance', { year })}: <strong>{t('leave.daysLeft', { count: Number(balance.left_days), days: daysText(balance.left_days, lang) })}</strong></span>
            <span style={{ color: colors.muted }}>{t('leave.allowance')} {daysText(balance.allowance, lang)}</span>
            {Number(balance.carried) > 0 && <span style={{ color: colors.muted }}>{t('leave.carried')} {daysText(balance.carried, lang)}</span>}
            <span style={{ color: colors.muted }}>{t('leave.used')} {daysText(balance.used, lang)}</span>
            {Number(balance.asked) > 0 && <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{t('leave.waitingDays', { days: daysText(balance.asked, lang) })}</span>}
          </p>
        )}

        {isAdmin && <LeaveRequests orgId={orgId} version={version} onChanged={changed} />}

        <section style={section} aria-labelledby="leave-away">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <h2 id="leave-away" style={{ ...h2, flex: '1 1 160px' }}>{t('leave.whoIsAway')}</h2>
            <div>
              <label htmlFor="leave-month" style={label}>{t('hours.month')}</label>
              <input id="leave-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={{ ...input, width: 'auto' }} />
            </div>
          </div>
          {!entries ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}><AvxLoader size={22} color={colors.accentText} /></div>
          ) : days.length === 0 ? (
            <EmptyState compact icon={<CalendarOff size={26} />} title={t('leave.nobodyAway')} body={t('leave.nobodyAwayBody')} guide="of-leave" />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
              {days.map(([day, list]) => (
                <li key={day} style={{ display: 'flex', gap: '4px 12px', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: '14px' }}>
                  <span style={{ fontWeight: 700, width: '92px', flexShrink: 0 }}>{fmt(new Date(`${day}T12:00:00`), 'EEE d MMM')}</span>
                  <span style={{ display: 'flex', gap: '6px 12px', flexWrap: 'wrap', flex: '1 1 180px', minWidth: 0 }}>
                    {list.map(e => (
                      <span key={e.id} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <span>{e.full_name || '—'}</span>
                        <TypeChip type={e.type} />
                        {((day === e.start_date && e.start_half) || (day === e.end_date && e.end_half)) && <span style={{ fontSize: '12px', color: colors.muted }}>{t('leave.halfDay')}</span>}
                        {e.status === 'requested' && <LeaveStatusChip status="requested" />}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={section} aria-labelledby="leave-mine">
          <h2 id="leave-mine" style={h2}>{t('leave.yours')}</h2>
          {mine.length === 0 ? (
            <EmptyState compact icon={<CalendarOff size={26} />} title={t('leave.noneYet')} body={t('leave.noneYetBody')} action={t('leave.ask')} onAction={() => setAsking('me')} />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
              {mine.map(l => (
                <li key={l.id} style={{ display: 'flex', gap: '6px 10px', alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: '14px' }}>
                  <span style={{ fontWeight: 600 }}>{leaveRange(l, t, fmt)}</span>
                  <TypeChip type={l.type} />
                  <span style={{ color: colors.muted }}>{t('leave.dayCount', { count: Number(l.days), days: daysText(l.days, lang) })}</span>
                  <LeaveStatusChip status={l.status} />
                  {l.status === 'refused' && l.decision_note && <span style={{ fontSize: '12px', color: colors.danger, flexBasis: '100%' }}>{t('leave.refusedNote', { note: l.decision_note })}</span>}
                  {l.status !== 'refused' && (
                    <button type="button" onClick={() => cancel(l)} aria-label={t('leave.cancelLabel', { range: leaveRange(l, t, fmt) })} style={{ ...iconBtn, marginLeft: 'auto' }}><X size={14} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin && <LeaveBalances orgId={orgId} version={version} onChanged={changed} />}
      </div>
      {asking && (
        <LeaveForm orgId={orgId} people={asking === 'someone' ? people : null} onSaved={changed} onClose={() => setAsking(null)} />
      )}
    </AppShell>
  )
}
