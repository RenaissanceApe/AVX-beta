import { Link } from 'react-router-dom'
import { Clock, FileText, Flag, Footprints, ListOrdered, ScanLine, FolderOpen, MessageCircle, Users, X, LayoutList, ListTodo } from 'lucide-react'
import { todaysSchedule, localDay } from '../../lib/onSite'
import { dueState, sortTasks } from '../../lib/tasks'
import { t, fmt } from '../../i18n'
import { btn, card, colors, tint } from '../ui'

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
    canScan && { key: 'scan', icon: ScanLine, to: `/gig/${gig.id}/scan` },
    { key: 'tasks', icon: ListTodo, tab: 'tasks' },
    { key: 'files', icon: FolderOpen, tab: 'assets' },
    { key: 'chat', icon: MessageCircle, tab: 'chat' },
    { key: 'crew', icon: Users, tab: 'crew' },
  ].filter(Boolean)
  const tileStyle = {
    ...card, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
    minHeight: '96px', padding: '16px', color: 'var(--text)', textDecoration: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: '16px', fontWeight: 700,
  }

  return (
    <section aria-labelledby="onsite-title" style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <h2 id="onsite-title" style={{ fontSize: '20px', fontWeight: 800 }}>{t('onsite.title')}</h2>
          <p style={{ fontSize: '13px', color: colors.muted }}>{fmt(today, 'EEEE d MMMM')}{gig.venue ? ` · ${gig.venue}` : ''}</p>
        </div>
        <button type="button" onClick={onLeave} style={{ ...btn, background: 'transparent' }}><LayoutList size={14} /> {t('onsite.leave')}</button>
      </div>

      {why === 'auto' && !noteSeen && (
        <div role="note" style={{ ...card, display: 'flex', gap: '10px', alignItems: 'flex-start', borderColor: tint(colors.accent, 40) }}>
          <p style={{ flex: 1, fontSize: '13px', lineHeight: 1.5 }}>
            {t('onsite.autoNote')} <Link to="/settings/preferences" style={{ color: colors.accentText }}>{t('onsite.autoNoteLink')}</Link>
          </p>
          <button type="button" onClick={onDismissNote} aria-label={t('onsite.dismissNote')} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
        </div>
      )}

      {myMembership?.call_time && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Clock size={28} color={colors.accentText} aria-hidden="true" />
          <div>
            <div style={{ fontSize: '13px', color: colors.muted }}>{t('onsite.yourCall')}{myMembership.function_title ? ` · ${myMembership.function_title}` : ''}</div>
            <div style={{ fontSize: '34px', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>{shortTime(myMembership.call_time)}</div>
          </div>
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>{t('onsite.today')}</h3>
        {items.length === 0 ? <p style={{ fontSize: '14px', color: colors.muted }}>{t('onsite.nothingToday')}</p> : (
          <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map(s => (
              <li key={s.id} style={{ display: 'flex', gap: '12px', alignItems: 'baseline', padding: '8px 10px', borderRadius: '10px', background: s.now ? tint(colors.accent, 16) : 'transparent', border: s.next ? `1px dashed ${colors.border}` : '1px solid transparent' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '17px', minWidth: '4.5em' }}>{shortTime(s.start_time)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '15px' }}>
                  <strong>{s.title}</strong>{s.location ? <span style={{ color: colors.muted }}> · {s.location}</span> : null}
                  {s.now && <span style={{ display: 'block', fontSize: '12px', color: colors.accentText, fontWeight: 700 }}>{t('onsite.now')}</span>}
                  {s.next && <span style={{ display: 'block', fontSize: '12px', color: colors.muted, fontWeight: 700 }}>{t('onsite.next')}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {mine.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>{t('onsite.myTasks', { count: mine.length })}</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {mine.slice(0, 5).map(task => {
              const state = dueState(task, today)
              return (
                <li key={task.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '15px' }}>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{task.title}</span>
                  {state && <span style={{ fontSize: '12px', fontWeight: 700, color: state === 'overdue' ? 'var(--danger)' : state === 'today' ? 'var(--warn)' : colors.accentText }}>
                    {t(`tasks.due.${state}`, { date: fmt(task.due_on, 'd MMM') })}</span>}
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => setTab('tasks')} style={{ ...btn, marginTop: '10px' }}><ListTodo size={14} /> {t('onsite.openTasks')}</button>
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
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
