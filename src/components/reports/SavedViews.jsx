import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, BookmarkPlus, Pin, PinOff, Trash2 } from 'lucide-react'
import { listViews, saveView, updateView, removeView, viewHref, viewQuery, cleanViewName, sortViews, VIEW_NAME_MAX } from '../../lib/analytics/reportViews'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { Hint } from '../help/HelpParts'
import EmptyState from '../EmptyState'
import { Modal, btn, btnPrimary, card, colors, input, label as labelStyle, AvxLoader } from '../ui'

// Saved views (K9): a report with its filters, saved per person and pinned to the Overview.

export function useSavedViews(orgId, enabled = true) {
  const [state, setState] = useState({ views: [], loading: !!enabled, error: null })
  const reload = useCallback(() => {
    if (!orgId || !enabled) return
    listViews(orgId)
      .then(views => setState({ views, loading: false, error: null }))
      .catch(error => { logger.error('reports', error, { step: 'views' }); setState({ views: [], loading: false, error }) })
  }, [orgId, enabled])
  useEffect(() => { reload() }, [reload])
  const add = view => setState(s => ({ ...s, views: sortViews([...s.views, view]) }))
  const change = (id, changes) => setState(s => ({ ...s, views: sortViews(s.views.map(v => (v.id === id ? { ...v, ...changes } : v))) }))
  const drop = id => setState(s => ({ ...s, views: s.views.filter(v => v.id !== id) }))
  return { ...state, reload, add, change, drop }
}

// "Save this view" on a report tab
export function SaveViewButton({ orgId, tab, params, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pinned, setPinned] = useState(true)
  const [saving, setSaving] = useState(false)

  const submit = async e => {
    e.preventDefault()
    const clean = cleanViewName(name)
    if (!clean) return
    setSaving(true)
    try {
      const view = await saveView(orgId, { name: clean, tab, query: viewQuery(params), pinned })
      notify(t('reports.views.saved'), 'success')
      onSaved?.(view)
      setOpen(false)
      setName('')
    } catch (error) {
      logger.error('reports', error, { step: 'saveView' })
      notify(userMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className="no-print" onClick={() => { setName(t(`reports.tab.${tab}`)); setOpen(true) }} style={{ ...btn, padding: '7px 12px' }}>
        <BookmarkPlus size={14} aria-hidden="true" /> {t('reports.views.save')}
      </button>
      {open && (
        <Modal title={t('reports.views.saveTitle')} onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('reports.views.saveIntro')}</p>
            <div>
              <label htmlFor="view-name" style={labelStyle}>{t('reports.views.name')}</label>
              <input id="view-name" value={name} maxLength={VIEW_NAME_MAX} onChange={e => setName(e.target.value)} style={input} autoFocus />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              {t('reports.views.pinToOverview')}
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} style={btn}>{t('common.cancel')}</button>
              <button type="submit" disabled={saving || !cleanViewName(name)} style={btnPrimary}>{saving && <AvxLoader size={14} />} {t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

// On Reports → Overview: the pinned views as links, and every saved view to pin, unpin or remove
export function SavedViewsSection({ orgId, saved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [managing, setManaging] = useState(false)
  const pinned = saved.views.filter(v => v.pinned)

  const act = async (fn, step) => {
    try { await fn() } catch (error) { logger.error('reports', error, { step }); notify(userMessage(error), 'error'); saved.reload() }
  }
  const togglePin = v => { saved.change(v.id, { pinned: !v.pinned }); act(() => updateView(v.id, { pinned: !v.pinned }), 'pinView') }
  const remove = v => { saved.drop(v.id); act(() => removeView(v.id), 'removeView') }

  return (
    <section aria-labelledby="rp-views" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <h2 id="rp-views" style={{ font: '700 16px/24px var(--font-mono)', margin: 0 }}>
          {t('reports.views.title')}
        </h2>
        <Hint id="saved-view" label={t('reports.views.title')} />
        {saved.views.length > 0 && (
          <button type="button" className="no-print" onClick={() => setManaging(true)} style={{ ...btn, padding: '6px 10px', fontSize: '13px', marginLeft: 'auto' }}>
            {t('reports.views.manage', { count: saved.views.length })}
          </button>
        )}
      </div>
      {saved.loading
        ? <AvxLoader size={18} color={colors.accentText} label={t('common.loading')} />
        : pinned.length === 0
          ? <EmptyState compact icon={<Bookmark size={20} />} title={t('reports.views.emptyTitle')} body={t('reports.views.emptyBody')} />
          : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px' }}>
              {pinned.map(v => (
                <li key={v.id} style={{ minWidth: 0 }}>
                  <Link to={viewHref(orgId, v)} style={{ ...card, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '2px', height: '100%', boxSizing: 'border-box', color: 'var(--text)', textDecoration: 'none' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, overflowWrap: 'anywhere' }}>{v.name}</span>
                    <span style={{ fontSize: '11px', color: colors.muted }}>{t(`reports.tab.${v.tab}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      {managing && (
        <Modal title={t('reports.views.title')} onClose={() => setManaging(false)}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {saved.views.map(v => (
              <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${colors.line}`, padding: '6px 0' }}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <Link to={viewHref(orgId, v)} onClick={() => setManaging(false)} style={{ color: 'var(--text)', fontWeight: 600, overflowWrap: 'anywhere' }}>{v.name}</Link>
                  <span style={{ display: 'block', fontSize: '11px', color: colors.muted }}>
                    {t(`reports.tab.${v.tab}`)} · {v.pinned ? t('reports.views.pinned') : t('reports.views.notPinned')}
                  </span>
                </span>
                <button type="button" onClick={() => togglePin(v)} aria-label={`${v.pinned ? t('reports.views.unpin') : t('reports.views.pin')}: ${v.name}`} style={{ ...btn, padding: '6px 8px', fontSize: '12px' }}>
                  {v.pinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />} {v.pinned ? t('reports.views.unpin') : t('reports.views.pin')}
                </button>
                <button type="button" onClick={() => remove(v)} aria-label={`${t('reports.views.remove')}: ${v.name}`} style={{ ...btn, padding: '6px 8px', fontSize: '12px' }}>
                  <Trash2 size={13} aria-hidden="true" /> {t('reports.views.remove')}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  )
}
