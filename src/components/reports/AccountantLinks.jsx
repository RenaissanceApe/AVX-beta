import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Plus, ShieldOff } from 'lucide-react'
import { LINK_PERIODS, LINK_DAYS, linkPeriod, linkStatus, reportLinkUrl, listLinks, createLink, revokeLink } from '../../lib/analytics/reportLinks'
import { todayIn } from '../../lib/analytics/periods'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { useI18n, fmt } from '../../i18n'
import { Hint } from '../help/HelpParts'
import EmptyState from '../EmptyState'
import { Modal, btn, btnPrimary, btnDanger, colors, input, label as labelStyle, StatusBadge, AvxLoader } from '../ui'

// Reports → Overview, admins only: read-only links for the accountant (K9). A link shows one
// period's money and nothing else; it expires on its own and can be revoked at any time.
export default function AccountantLinks({ orgId, timeZone }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [links, setLinks] = useState(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const reload = useCallback(() => {
    listLinks(orgId).then(setLinks).catch(error => { logger.error('reports', error, { step: 'links' }); setLinks([]) })
  }, [orgId])
  useEffect(() => { reload() }, [reload])

  const revoke = async id => {
    setConfirm(null)
    try {
      await revokeLink(id)
      notify(t('reports.links.revoked'), 'success')
      reload()
    } catch (error) {
      logger.error('reports', error, { step: 'revokeLink' })
      notify(userMessage(error), 'error')
    }
  }

  const statusTone = { active: 'ok', expired: 'off', revoked: 'off' }
  const day = d => fmt(d, 'd MMM yyyy')

  return (
    <section aria-labelledby="rp-links" className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        <h2 id="rp-links" style={{ font: '700 16px/24px var(--font-mono)', margin: 0 }}>{t('reports.links.title')}</h2>
        <Hint id="accountant-link" label={t('reports.links.title')} />
        <button type="button" onClick={() => setCreating(true)} style={{ ...btn, padding: '6px 10px', fontSize: '13px', marginLeft: 'auto' }}>
          <Plus size={14} aria-hidden="true" /> {t('reports.links.new')}
        </button>
      </div>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('reports.links.intro')}</p>
      {links == null
        ? <AvxLoader size={18} color={colors.accentText} label={t('common.loading')} />
        : links.length === 0
          ? <EmptyState compact icon={<Link2 size={20} />} title={t('reports.links.emptyTitle')} body={t('reports.links.emptyBody')} />
          : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {links.map(l => {
                const status = linkStatus(l)
                return (
                  <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: `1px solid ${colors.line}`, padding: '6px 0' }}>
                    <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{l.label}</span>{' '}
                      <StatusBadge tone={statusTone[status]} small>{t(`reports.links.status.${status}`)}</StatusBadge>
                      <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>
                        {t('reports.links.period', { from: day(l.period_from), until: day(new Date(new Date(`${l.period_until}T00:00:00`).getTime() - 86400000)) })}
                        {' · '}{status === 'active' ? t('reports.links.expires', { date: day(l.expires_at) }) : status === 'expired' ? t('reports.links.expired', { date: day(l.expires_at) }) : t('reports.links.revokedOn', { date: day(l.revoked_at) })}
                        {' · '}{t('reports.links.views', { count: l.views || 0 })}
                      </span>
                    </span>
                    {status === 'active' && (confirm === l.id
                      ? <>
                        <button type="button" onClick={() => revoke(l.id)} aria-label={`${t('reports.links.confirmRevoke')}: ${l.label}`} style={{ ...btnDanger, padding: '6px 8px', fontSize: '12px' }}>{t('reports.links.confirmRevoke')}</button>
                        <button type="button" onClick={() => setConfirm(null)} style={{ ...btn, padding: '6px 8px', fontSize: '12px' }}>{t('common.cancel')}</button>
                      </>
                      : <button type="button" onClick={() => setConfirm(l.id)} aria-label={`${t('reports.links.revoke')}: ${l.label}`} style={{ ...btn, padding: '6px 8px', fontSize: '12px' }}>
                        <ShieldOff size={13} aria-hidden="true" /> {t('reports.links.revoke')}
                      </button>)}
                  </li>
                )
              })}
            </ul>
          )}
      {creating && <NewLink orgId={orgId} timeZone={timeZone} onClose={() => setCreating(false)} onCreated={reload} />}
    </section>
  )
}

function NewLink({ orgId, timeZone, onClose, onCreated }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [label, setLabel] = useState(t('reports.links.defaultLabel'))
  const [period, setPeriod] = useState('last_year')
  const [days, setDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [made, setMade] = useState(null)
  const today = todayIn(timeZone || 'UTC')

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const { from, until } = linkPeriod(period, today)
      const res = await createLink(orgId, { label: label.trim(), from, until, days })
      setMade(reportLinkUrl(res.token))
      track('create:reports:link')
      onCreated()
    } catch (error) {
      logger.error('reports', error, { step: 'createLink' })
      notify(userMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(made); notify(t('reports.links.copied'), 'success') } catch { /* the field can be copied by hand */ }
  }

  return (
    <Modal title={t('reports.links.new')} onClose={onClose}>
      {made ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontSize: '13px', lineHeight: 1.5, margin: 0 }}>{t('reports.links.madeIntro')}</p>
          <label htmlFor="link-url" style={labelStyle}>{t('reports.links.url')}</label>
          <input id="link-url" readOnly value={made} onFocus={e => e.target.select()} style={input} />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={copy} style={btnPrimary}><Copy size={14} aria-hidden="true" /> {t('reports.links.copy')}</button>
            <button type="button" onClick={onClose} style={btn}>{t('common.close')}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="link-label" style={labelStyle}>{t('reports.links.label')}</label>
            <input id="link-label" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} style={input} />
          </div>
          <div>
            <label htmlFor="link-period" style={labelStyle}>{t('reports.links.periodLabel')}</label>
            <select id="link-period" value={period} onChange={e => setPeriod(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {LINK_PERIODS.map(p => <option key={p} value={p}>{t(`reports.links.periodOption.${p}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="link-days" style={labelStyle}>{t('reports.links.expiresIn')}</label>
            <select id="link-days" value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
              {LINK_DAYS.map(d => <option key={d} value={d}>{t('reports.links.days', { count: d })}</option>)}
            </select>
          </div>
          <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('reports.links.warning')}</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btn}>{t('common.cancel')}</button>
            <button type="submit" disabled={saving || !label.trim()} style={btnPrimary}>{saving && <AvxLoader size={14} />} {t('reports.links.create')}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
