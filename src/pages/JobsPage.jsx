import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Send, Contact, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { CURRENCIES, jobError, money } from '../lib/jobs'
import { useI18n } from '../i18n'
import { Modal, btn, btnPrimary, input, label, card, colors, tint } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import JobCard from '../components/jobs/JobCard'

const TABS = ['forYou', 'all', 'mine']
const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const statusTone = { applied: colors.soft, shortlisted: 'var(--sky)', offered: colors.accentText, accepted: colors.accentText, declined: 'var(--warn)', withdrawn: colors.muted }

// The job board for freelancers (docs/CREW_NETWORK.md, N3): open positions matching their crew
// profile (or all of them), applying, and their own applications.
//   /jobs
export default function JobsPage() {
  const { t, lang, fmt } = useI18n()
  const { notify } = useToast()
  const [tab, setTab] = useState('forYou')
  const [board, setBoard] = useState(null) // { needs_profile, results, total, more }
  const [mine, setMine] = useState(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(null)

  const loadBoard = useCallback(async (offset = 0) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('list_jobs', { p_all: tab === 'all', p_function: null, p_offset: offset })
    setLoading(false)
    if (error) { logger.error('jobs', error, { step: 'list' }); return notify(userMessage(error), 'error') }
    setBoard(b => offset && b ? { ...data, results: [...b.results, ...data.results] } : data)
  }, [tab, notify])
  const loadMine = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_job_applications')
    if (error) { logger.error('jobs', error, { step: 'mine' }); return notify(userMessage(error), 'error') }
    setMine(data || [])
  }, [notify])
  useEffect(() => { if (tab === 'mine') loadMine(); else loadBoard() }, [tab, loadBoard, loadMine])

  async function withdraw(app) {
    if (!window.confirm(t('jobs.withdrawConfirm', { title: app.post.title }))) return
    const { error } = await supabase.rpc('withdraw_application', { p_application: app.id })
    if (error) { logger.error('jobs', error, { step: 'withdraw' }); return notify(userMessage(error), 'error') }
    notify(t('jobs.withdrawn'), 'success')
    loadMine()
  }

  const tabBtn = active => ({ ...btn, background: active ? tint(colors.accent, 22) : 'transparent', borderColor: active ? colors.accent : tint(colors.accent, 30) })
  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('jobs.boardTitle')}</h1>
            <PageHelp page="jobs" />
          </div>
          <p style={{ ...hint, fontSize: '13px', marginTop: '4px' }}>{t('jobs.boardIntro')}</p>
        </div>
        <div role="tablist" aria-label={t('jobs.boardTitle')} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TABS.map(k => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{t(`jobs.tab.${k}`)}</button>)}
        </div>

        {tab !== 'mine' && (board?.needs_profile ? (
          <div style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
            <p style={{ fontSize: '14px', lineHeight: 1.6 }}>{t('jobs.needsProfile')}</p>
            <Link to="/me/profile" style={{ ...btnPrimary, textDecoration: 'none' }}><Contact size={15} /> {t('crewProfile.open')}</Link>
          </div>
        ) : !board ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={22} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : (
          <section aria-labelledby="jobs-found" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 id="jobs-found" role="status" style={{ fontSize: '15px', fontWeight: 700 }}>{t('jobs.found', { count: board.total })}</h2>
            {board.total === 0 && <p style={hint}>{tab === 'forYou' ? t('jobs.noneForYou') : t('jobs.none')}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '12px' }}>
              {board.results.map(j => (
                <JobCard key={j.id} job={j}>
                  <div style={{ marginTop: '12px' }}>
                    {j.my_status ? (
                      <span role="status" style={{ fontSize: '13px', fontWeight: 600, color: statusTone[j.my_status] }}>{t(`jobs.myStatus.${j.my_status}`)}</span>
                    ) : (
                      <button type="button" onClick={() => setApplying(j)} style={btnPrimary} aria-label={t('jobs.applyFor', { title: j.title })}><Send size={14} /> {t('jobs.apply')}</button>
                    )}
                  </div>
                </JobCard>
              ))}
            </div>
            {board.more && <div><button type="button" onClick={() => loadBoard(board.results.length)} disabled={loading} style={btn}>{t('crewSearch.more')}</button></div>}
          </section>
        ))}

        {tab === 'mine' && (!mine ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={22} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : mine.length === 0 ? (
          <p style={hint}>{t('jobs.noApplications')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mine.map(a => (
              <li key={a.id} style={{ ...card, padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{a.post.title} · {a.post.org_name}</div>
                  <div style={hint}>{fmt(a.post.starts_on, 'd MMM yyyy')}{a.post.place && <> · {a.post.place}</>}{a.day_rate != null && <> · {t('jobs.yourRate', { rate: money(Number(a.day_rate), a.currency || 'EUR', lang) })}</>}</div>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: statusTone[a.status] }}>{t(`jobs.myStatus.${a.status}`)}</span>
                <Link to="/messages" style={{ ...btn, textDecoration: 'none' }}><MessageCircle size={14} /> {t('jobs.messages')}</Link>
                {['applied', 'shortlisted', 'offered'].includes(a.status) && (
                  <button type="button" onClick={() => withdraw(a)} style={{ ...btn, background: 'transparent' }}>{t('jobs.withdraw')}</button>
                )}
              </li>
            ))}
          </ul>
        ))}
      </div>
      {applying && <ApplyModal job={applying} onClose={() => setApplying(null)} onApplied={() => { setApplying(null); loadBoard() }} />}
    </AppShell>
  )
}

function ApplyModal({ job, onClose, onApplied }) {
  const { t, fmt } = useI18n()
  const { notify } = useToast()
  const [message, setMessage] = useState('')
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState(job.currency || 'EUR')
  const [free, setFree] = useState(false)
  const [sending, setSending] = useState(false)
  const needsRate = job.pay_mode !== 'fixed'
  const rateNum = rate === '' ? null : Number(String(rate).replace(',', '.'))
  const dates = job.ends_on && job.ends_on !== job.starts_on ? `${fmt(job.starts_on, 'd MMM')} – ${fmt(job.ends_on, 'd MMM yyyy')}` : fmt(job.starts_on, 'd MMM yyyy')

  async function send(e) {
    e.preventDefault()
    if (!free || (needsRate && !(rateNum >= 0))) return
    setSending(true)
    const { error } = await supabase.rpc('apply_job', { p_post: job.id, p_message: message.trim() || null, p_rate: Number.isFinite(rateNum) ? rateNum : null, p_currency: currency })
    setSending(false)
    if (error) {
      logger.error('jobs', error, { step: 'apply' })
      const key = jobError(error)
      return notify(key ? t(key) : userMessage(error), 'error')
    }
    notify(t('jobs.applied', { org: job.org_name }), 'success')
    track('jobs:applied')
    onApplied()
  }

  return (
    <Modal title={t('jobs.applyTitle', { title: job.title })} onClose={onClose}>
      <form onSubmit={send} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '14px' }}><strong>{job.org_name}</strong> · {dates}{job.place && <> · {job.place}</>}</p>
        <div>
          <label style={label} htmlFor="ap-message">{t('jobs.applyMessage')}</label>
          <textarea id="ap-message" rows={4} value={message} onChange={e => setMessage(e.target.value)} maxLength={1000} placeholder={t('jobs.applyPlaceholder')} style={{ ...input, resize: 'vertical' }} />
        </div>
        {needsRate && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '10px' }}>
            <div><label style={label} htmlFor="ap-rate">{t('jobs.dayRate')} *</label>
              <input id="ap-rate" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} style={input} /></div>
            <div><label style={label} htmlFor="ap-cur">{t('jobs.currency')}</label>
              <select id="ap-cur" value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
          <span>{t('jobs.confirmFree', { dates })}</span>
        </label>
        <p style={hint}>{needsRate ? t('jobs.ratePrivate') : t('jobs.applyHint')}</p>
        <button type="submit" disabled={sending || !free || (needsRate && !(rateNum >= 0))} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} {t('jobs.sendApplication')}
        </button>
      </form>
    </Modal>
  )
}
