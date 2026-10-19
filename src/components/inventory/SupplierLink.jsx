import { useEffect, useState } from 'react'
import { Link2, Copy, Mail, Loader2, Ban } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { useI18n, t } from '../../i18n'
import { btn, input, colors } from '../ui'

// The link a subrental's supplier uses to see the order and write to you, without an account
// (docs/MESSAGING.md, M4b). Only a hash of it is stored, so it's shown once, when made; making a
// new one turns the old one off.
export default function SupplierLink({ subrental }) {
  const { notify } = useToast()
  const { ago } = useI18n()
  const [link, setLink] = useState(undefined) // the working link's row, or null
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    Promise.all([
      supabase.from('supplier_links').select('id, created_at, last_seen_at').eq('subrental_id', subrental.id).is('revoked_at', null).maybeSingle(),
      supabase.from('suppliers').select('email').eq('id', subrental.supplier_id).maybeSingle(),
    ]).then(([{ data: row }, { data: sp }]) => {
      if (!on) return
      setLink(row || null)
      setEmail(sp?.email || '')
    })
    return () => { on = false }
  }, [subrental.id, subrental.supplier_id])

  async function make() {
    if (link && !window.confirm(t('supplierLink.replaceConfirm'))) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_supplier_link', { p_subrental: subrental.id })
    setBusy(false)
    if (error) { logger.error('supplier-link', error); return notify(userMessage(error), 'error') }
    track('subrental:link')
    setUrl(`${window.location.origin}/s/${data}`)
    setLink({ created_at: new Date().toISOString(), last_seen_at: null })
  }

  async function revoke() {
    if (!window.confirm(t('supplierLink.revokeConfirm'))) return
    setBusy(true)
    const { error } = await supabase.rpc('revoke_supplier_link', { p_subrental: subrental.id })
    setBusy(false)
    if (error) return notify(userMessage(error), 'error')
    setLink(null)
    setUrl('')
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); notify(t('supplierLink.copied'), 'success') } catch { /* the field can be copied by hand */ }
  }

  if (link === undefined) return <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
  const small = { ...btn, padding: '6px 10px', fontSize: '12px' }
  const mail = url && email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(t('supplierLink.mailSubject', { reference: subrental.reference || '' }))}&body=${encodeURIComponent(t('supplierLink.mailBody', { url }))}`
    : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>
        {link ? t('supplierLink.active', { when: ago(link.created_at) }) + (link.last_seen_at ? ` · ${t('supplierLink.seen', { when: ago(link.last_seen_at) })}` : ` · ${t('supplierLink.notSeen')}`) : t('supplierLink.none')}
      </p>
      {url && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <input readOnly value={url} onFocus={e => e.target.select()} aria-label={t('supplierLink.label')} style={{ ...input, flex: '1 1 220px', fontSize: '12px', padding: '7px 10px' }} />
          <button type="button" onClick={copy} style={small}><Copy size={13} /> {t('supplierLink.copy')}</button>
          {mail && <a href={mail} style={{ ...small, textDecoration: 'none' }}><Mail size={13} /> {t('supplierLink.email')}</a>}
        </div>
      )}
      {url && <p style={{ fontSize: '11px', color: colors.muted }}>{t('supplierLink.onlyNow')}</p>}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button type="button" onClick={make} disabled={busy} style={small}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={13} />} {link ? t('supplierLink.new') : t('supplierLink.make')}
        </button>
        {link && <button type="button" onClick={revoke} disabled={busy} style={{ ...small, color: colors.muted }}><Ban size={13} /> {t('supplierLink.revoke')}</button>}
      </div>
    </div>
  )
}
