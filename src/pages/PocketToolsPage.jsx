import { useState } from 'react'
import { useI18n } from '../i18n'
import { PageHeader, colors } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import DmxCalculator from '../components/tools/DmxCalculator'
import BridleCard from '../components/tools/BridleCard'

// Pocket tools (docs/TOOLS_PLAN.md §1): calculators a technician wants on the phone at any venue,
// with or without a gig in AVX. All of them work offline. The DMX calculator (D1) and the bridle
// calculator (RG2).
//   /tools
export default function PocketToolsPage() {
  const { t } = useI18n()
  const [bridle, setBridle] = useState({ mode: 'legs', span: 2, rise: 0, leg1: 1.5, leg2: 1.5, x: null, depth: null, load: 500, wll1: null, wll2: null })
  return (
    <AppShell>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px 48px' }}>
        <PageHeader title={t('pocket.title')} help={<PageHelp page="pocket-tools" />} line={t('pocket.intro')} />
        <DmxCalculator />
        <section aria-labelledby="pocket-bridle" style={{ marginTop: '24px' }}>
          <h2 id="pocket-bridle" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('bridle.pocketTitle')}</h2>
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('bridle.pocketIntro')}</p>
          <BridleCard value={bridle} idPrefix="pk-bridle" onChange={patch => setBridle(b => ({ ...b, ...patch }))} />
        </section>
      </div>
    </AppShell>
  )
}
