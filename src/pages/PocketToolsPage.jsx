import { useI18n } from '../i18n'
import { PageHeader } from '../components/ui'
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
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px 48px' }}>
        <PageHeader title={t('pocket.title')} help={<PageHelp page="pocket-tools" />} line={t('pocket.intro')} />
        <DmxCalculator />
      </div>
    </AppShell>
  )
}
