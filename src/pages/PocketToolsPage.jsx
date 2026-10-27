import { useI18n } from '../i18n'
import { colors } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import DmxCalculator from '../components/tools/DmxCalculator'

// Pocket tools (docs/TOOLS_PLAN.md §1): calculators a technician wants on the phone at any venue,
// with or without a gig in AVX. All of them work offline. First: the DMX calculator (D1).
//   /tools
export default function PocketToolsPage() {
  const { t } = useI18n()
  return (
    <AppShell>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('pocket.title')}</h1>
            <PageHelp page="pocket-tools" />
          </div>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '4px' }}>{t('pocket.intro')}</p>
        </div>
        <DmxCalculator />
      </div>
    </AppShell>
  )
}
