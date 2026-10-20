import { Link } from 'react-router-dom'
import { Plus, BookOpen } from 'lucide-react'
import { guide as guideText } from '../help'
import { useI18n } from '../i18n'
import { btnPrimary, colors, tint } from './ui'

// A page or tab with nothing in it yet (docs/HELP.md, H4): what goes here, the first thing to do,
// and the guide that explains it. Every empty screen should teach, not just say "nothing".
//   <EmptyState icon={<Users size={28} />} title body action="Invite crew" onAction={…} guide="pm-invite-crew" />
// compact: a smaller version for a section inside a page
export default function EmptyState({ icon, title, body, action, onAction, actionIcon = <Plus size={15} />, guide, compact = false }) {
  const { t } = useI18n()
  const g = guide ? guideText(guide) : null
  return (
    <div style={{ textAlign: 'center', padding: compact ? '28px 16px' : '56px 24px' }}>
      {icon && (
        <div aria-hidden="true" style={{
          width: compact ? '48px' : '64px', height: compact ? '48px' : '64px', borderRadius: compact ? '14px' : '18px', color: colors.accentText,
          background: tint(colors.accent, 10), border: `1px solid ${tint(colors.accent, 20)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: `0 auto ${compact ? '12px' : '18px'}`,
        }}>{icon}</div>
      )}
      {title && <h3 style={{ fontSize: compact ? '16px' : '18px', fontWeight: 700, marginBottom: '8px' }}>{title}</h3>}
      {body && <p style={{ color: colors.muted, fontSize: '14px', maxWidth: '420px', margin: '0 auto 18px', lineHeight: 1.6 }}>{body}</p>}
      {action && <button type="button" onClick={onAction} style={btnPrimary}>{actionIcon} {action}</button>}
      {g && (
        <p style={{ marginTop: action ? '14px' : 0 }}>
          <Link to={`/help/guide/${guide}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: colors.accentText, fontSize: '13px', fontWeight: 600 }}>
            <BookOpen size={14} aria-hidden="true" /> {t('help.howTo', { title: g.title })}
          </Link>
        </p>
      )}
    </div>
  )
}
