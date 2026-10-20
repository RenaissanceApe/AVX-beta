import { Link } from 'react-router-dom'
import { AlertTriangle, BookOpen } from 'lucide-react'
import { guide, term, shotUrl } from '../../help'
import { useI18n } from '../../i18n'
import { colors } from '../ui'

// One how-to guide (docs/HELP.md, H2): what it's for, numbered steps with a screenshot each
// (the button to tap is outlined in green), common mistakes and the words it uses.
// Shown on /help/guide/:id and inside the ? panel, so nobody has to leave the page they're on.
// The step text says everything; the picture only shows where, so it has no alt text.
export default function GuideView({ id, compact = false }) {
  const { t } = useI18n()
  const g = guide(id)
  if (!g) return <p style={{ fontSize: '15px' }}>{t('help.guideMissing')}</p>
  const H = compact ? 'h3' : 'h2'
  const imgWidth = compact ? 220 : 280
  return (
    <article aria-labelledby={`guide-${id}`}>
      {compact
        ? <h2 id={`guide-${id}`} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>{g.title}</h2>
        : <h1 id={`guide-${id}`} style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>{g.title}</h1>}
      <p style={{ fontSize: compact ? '14px' : '15px', lineHeight: 1.6, color: 'var(--text-2)' }}>{g.intro}</p>

      <ol style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {g.steps.map((text, i) => (
          <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{
                flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%', background: colors.accent, color: 'var(--on-accent)',
                fontWeight: 800, fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <p style={{ fontSize: compact ? '14px' : '15px', lineHeight: 1.6, color: 'var(--text-2)', paddingTop: '2px' }}>
                <span className="sr-only">{t('help.step', { n: i + 1 })} </span>{text}
              </p>
            </div>
            {g.shots[i] && (
              <img src={shotUrl(g.shots[i])} alt="" loading="lazy" width={imgWidth} height={Math.round(imgWidth * 844 / 390)}
                style={{ marginLeft: '36px', width: `${imgWidth}px`, maxWidth: 'calc(100% - 36px)', height: 'auto', borderRadius: '14px', border: `1px solid ${colors.border}`, background: 'var(--bg)' }} />
            )}
          </li>
        ))}
      </ol>

      {g.mistakes.length > 0 && (
        <section style={{ marginTop: '24px', padding: '14px 16px', borderRadius: '12px', background: 'color-mix(in srgb, var(--warn) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)' }}>
          <H style={{ fontSize: '15px', fontWeight: 700, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <AlertTriangle size={15} aria-hidden="true" /> {t('help.mistakes')}
          </H>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {g.mistakes.map((m, i) => <li key={i} style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--text-2)' }}>{m}</li>)}
          </ul>
        </section>
      )}

      {g.terms.length > 0 && (
        <section style={{ marginTop: '20px' }}>
          <H style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <BookOpen size={15} aria-hidden="true" /> {t('help.wordsUsed')}
          </H>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {g.terms.map(tid => (
              <li key={tid}>
                <Link to={`/help#${tid}`} style={{ display: 'inline-block', padding: '5px 10px', borderRadius: '999px', border: `1px solid ${colors.border}`, color: colors.accentText, fontSize: '13px', textDecoration: 'none' }}>
                  {term(tid)?.term}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
