import { Link } from 'react-router-dom'
import { Clock, FileText, Flag, Footprints, ListOrdered, ScanLine, FolderOpen, MessageCircle, Users, X, LayoutList, ListTodo, Plug } from 'lucide-react'
import { todaysSchedule, localDay } from '../../lib/onSite'
import { dueState, sortTasks } from '../../lib/tasks'
import { t, fmt } from '../../i18n'
import { btn, card, colors, space, Stack, Section } from '../ui'
import ClockInOut from '../hours/ClockInOut'

const shortTime = v => (v ? String(v).slice(0, 5) : '')

// On-site mode (docs/TOOLS_PLAN.md §1): what's needed on the day, in big buttons. It takes the
// place of the overview; every other tab is still there. The gig's offline copy covers it too.
export default function OnSiteView({ gig, schedule, tools, tasks = [], userId, myMembership, canScan, why, noteSeen, onDismissNote, onLeave, setTab }) {
  const today = localDay()
  const items = todaysSchedule(schedule, today)
  // My open tasks on this gig, most urgent first (the full list is on the Tasks tab)
  const mine = sortTasks(tasks.filter(x => x.assignee_id === userId && x.status === 'open'))
  const tiles = [
    { key: 'callsheet', icon: FileText, to: `/gig/${gig.id}/callsheet` },
    { key: 'rehearsal', icon: Flag, to: `/gig/${gig.id}?tab=tools&tool=rehearsal` },
    tools.includes('dmx_patch') && { key: 'dmxWalk', icon: Footprints, to: `/gig/${gig.id}/dmx/walk` },
    tools.includes('input_list') && { key: 'inputs', icon: ListOrdered, to: `/gig/${gig.id}?tab=tools&tool=input_list` },
    tools.includes('power') && { key: 'power', icon: Plug, to: `/gig/${gig.id}/power` },
    canScan && { key: 'scan', icon: ScanLine, to: `/gig/${gig.id}/scan` },
    { key: 'tasks', icon: ListTodo, tab: 'tasks' },
    { key: 'files', icon: FolderOpen, tab: 'assets' },
    { key: 'chat', icon: MessageCircle, tab: 'chat' },
    { key: 'crew', icon: Users, tab: 'crew' },
  ].filter(Boolean)
  const tileStyle = {
    ...card, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
    minHeight: '96px', padding: space[4], color: 'var(--text)', textDecoration: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: '16px', fontWeight: 700,
  }

  return (
    <section aria-labelledby="onsite-title" style={{ display: 'flex', flexDirection: 'column', gap: space.section, animation: 'fadeIn 0.3s ease' }}>
      <Stack gap={4}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3], flexWrap: 'wrap' }}>
        <div>
          <h2 id="onsite-title" style={{ fontSize: '20px', fontWeight: 700 }}>{t('onsite.title')}</h2>
          <p style={{ fontSize: '13px', color: colors.muted, marginTop: space[1] }}>{fmt(today, 'EEEE d MMMM')}{gig.venue ? ` · ${gig.venue}` : ''}</p>
        </div>
        <button type="button" onClick={onLeave} style={{ ...btn, background: 'transparent', minHeight: '44px' }}><LayoutList size={16} aria-hidden="true" /> {t('onsite.leave')}</button>
      </div>

      {why === 'auto' && !noteSeen && (
        <div role="note" style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', padding: `${space[3]} 0`, borderTop: `1px solid ${colors.line}`, borderBottom: `1px solid ${colors.line}` }}>
          <p style={{ flex: 1, fontSize: '14px', lineHeight: 1.5 }}>
            {t('onsite.autoNote')} <Link to="/settings/preferences" style={{ color: colors.accentText }}>{t('onsite.autoNoteLink')}</Link>
          </p>
          <button type="button" onClick={onDismissNote} aria-label={t('onsite.dismissNote')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `calc(-1 * ${space[3]}) calc(-1 * ${space[3]}) 0 0` }}><X size={16} aria-hidden="true" /></button>
        </div>
      )}

      {myMembership && <ClockInOut gig={gig} userId={userId} />}

      {myMembership?.call_time && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[4], padding: `${space[3]} ${space[4]}`, background: 'var(--selection)' }}>
          <Clock size={28} color={colors.accentText} aria-hidden="true" />
          <div>
            <div style={{ fontSize: '13px', color: colors.muted }}>{t('onsite.yourCall')}{myMembership.function_title ? ` · ${myMembership.function_title}` : ''}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>{shortTime(myMembership.call_time)}</div>
          </div>
        </div>
      )}
      </Stack>

      <Section id="onsite-today" level={3} title={t('onsite.today')}>
        {items.length === 0 ? <p style={{ fontSize: '14px', color: colors.muted }}>{t('onsite.nothingToday')}</p> : (
          <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: space[1] }}>
            {items.map(s => (
              <li key={s.id} style={{ display: 'flex', gap: '12px', alignItems: 'baseline', minHeight: '44px', padding: space[3], background: s.now ? 'var(--selection)' : 'transparent', border: s.next ? `1px dashed ${colors.border}` : '1px solid transparent' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '16px', minWidth: '4.5em' }}>{shortTime(s.start_time)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '16px' }}>
                  <strong>{s.title}</strong>{s.location ? <span style={{ color: colors.muted }}> · {s.location}</span> : null}
                  {s.now && <span style={{ display: 'block', fontSize: '13px', color: colors.accentText, fontWeight: 700 }}>{t('onsite.now')}</span>}
                  {s.next && <span style={{ display: 'block', fontSize: '13px', color: colors.muted, fontWeight: 700 }}>{t('onsite.next')}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {mine.length > 0 && (
        <Section id="onsite-tasks" level={3} title={t('onsite.myTasks', { count: mine.length })}>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: space[3] }}>
            {mine.slice(0, 5).map(task => {
              const state = dueState(task, today)
              return (
                <li key={task.id} style={{ display: 'flex', gap: '12px', alignItems: 'baseline', fontSize: '16px' }}>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{task.title}</span>
                  {state && <span style={{ fontSize: '13px', fontWeight: 700, color: state === 'overdue' ? 'var(--danger)' : state === 'today' ? 'var(--warn)' : colors.accentText }}>
                    {t(`tasks.due.${state}`, { date: fmt(task.due_on, 'd MMM') })}</span>}
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => setTab('tasks')} style={{ ...btn, marginTop: space[4], minHeight: '44px' }}><ListTodo size={16} aria-hidden="true" /> {t('onsite.openTasks')}</button>
        </Section>
      )}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
        {tiles.map(tile => {
          const Icon = tile.icon
          const inner = <><Icon size={26} color={colors.accentText} aria-hidden="true" /><span>{t(`onsite.tile.${tile.key}`)}</span></>
          return (
            <li key={tile.key}>
              {tile.to
                ? <Link to={tile.to} style={tileStyle}>{inner}</Link>
                : <button type="button" onClick={() => setTab(tile.tab)} style={{ ...tileStyle, width: '100%' }}>{inner}</button>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
