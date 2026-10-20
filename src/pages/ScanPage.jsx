import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, ScanLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { btn, colors } from '../components/ui'

// Where a label's QR code leads: /scan/<code> finds the unit or item in your organisations
// and opens it. Codes that aren't yours (or don't exist) say so without revealing anything.
export default function ScanPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { setWorkspace, orgs } = useWorkspace()
  const [matches, setMatches] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('find_stock_code', { p_code: code }).then(({ data, error }) => {
      if (cancelled) return
      if (error) logger.error('scan', error, { step: 'find' })
      const rows = data || []
      if (rows.length === 1) {
        const r = rows[0]
        setWorkspace(r.org_id)
        return navigate(`/org/${r.org_id}/inventory/${r.item_id}${r.unit_id ? `?unit=${r.unit_id}` : ''}`, { replace: true })
      }
      setMatches(rows)
    })
    return () => { cancelled = true }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell>
      <div style={{ maxWidth: '440px', margin: '70px auto', padding: '0 16px', textAlign: 'center' }}>
        {!matches ? (
          <Loader2 size={26} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <>
            <ScanLine size={30} color={colors.soft} style={{ marginBottom: '12px' }} />
            <h1 style={{ fontSize: '19px', fontWeight: 800, marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>{code}</h1>
            {matches.length === 0 ? (
              <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6 }}>{t('inv.scanNotFound')}</p>
            ) : (
              <>
                <p style={{ color: colors.muted, fontSize: '14px', marginBottom: '12px' }}>{t('inv.scanSeveral')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {matches.map(r => (
                    <Link key={`${r.org_id}-${r.item_id}-${r.unit_id}`} to={`/org/${r.org_id}/inventory/${r.item_id}${r.unit_id ? `?unit=${r.unit_id}` : ''}`}
                      onClick={() => setWorkspace(r.org_id)} style={{ ...btn, textDecoration: 'none', justifyContent: 'center' }}>
                      {r.unit_id ? t('inv.unit') : t('inv.item')} · {orgs.find(o => o.id === r.org_id)?.name || '—'}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </AppShell>
  )
}
