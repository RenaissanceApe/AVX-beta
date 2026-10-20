import { Moon, Sun, Contrast, MonitorSmartphone } from 'lucide-react'
import { useAppearance, THEME_CHOICES, SIZE_CHOICES, SIMPLE_CHOICES } from '../lib/appearance'
import { useSimpleMode } from '../lib/simpleMode'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { label, colors, tint } from './ui'

const THEME_ICONS = { dark: Moon, light: Sun, contrast: Contrast, system: MonitorSmartphone }

// Account → Appearance (docs/HELP.md, H3): theme, text size, comfortable mode and the readable
// font. Saved on this device only; changes show at once.
export default function AppearanceSettings() {
  const { t } = useI18n()
  const [a, set] = useAppearance()
  const { crewOnly, known } = useSimpleMode()
  const change = next => { set(next); track(`appearance:${Object.keys(next)[0]}`) }

  const choice = active => ({
    flex: '1 1 0', minWidth: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 6px',
    borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'center',
    border: `1px solid ${active ? colors.accent : colors.border}`, background: active ? tint(colors.accent, 12) : 'transparent',
    color: active ? colors.text : colors.soft,
  })
  const check = { display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px', lineHeight: 1.45 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <span style={{ ...label, marginBottom: 0 }}>{t('appearance.title')}</span>
      <div>
        <span id="appearance-theme" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>{t('appearance.theme')}</span>
        <div role="radiogroup" aria-labelledby="appearance-theme" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {THEME_CHOICES.map(v => {
            const Icon = THEME_ICONS[v]
            return (
              <button key={v} type="button" role="radio" aria-checked={a.theme === v} onClick={() => change({ theme: v })} style={choice(a.theme === v)}>
                <Icon size={18} aria-hidden="true" /> {t(`appearance.themeOpt.${v}`)}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <span id="appearance-size" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>{t('appearance.size')}</span>
        <div role="radiogroup" aria-labelledby="appearance-size" style={{ display: 'flex', gap: '6px' }}>
          {SIZE_CHOICES.map((v, i) => (
            <button key={v} type="button" role="radio" aria-checked={a.size === v} onClick={() => change({ size: v })} style={choice(a.size === v)}>
              <span aria-hidden="true" style={{ fontSize: `${15 + i * 4}px`, fontWeight: 800, lineHeight: 1 }}>A</span> {t(`appearance.sizeOpt.${v}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span id="appearance-simple" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>{t('appearance.simple')}</span>
        <div role="radiogroup" aria-labelledby="appearance-simple" style={{ display: 'flex', gap: '6px' }}>
          {SIMPLE_CHOICES.map(v => (
            <button key={v} type="button" role="radio" aria-checked={a.simple === v} onClick={() => change({ simple: v })} style={choice(a.simple === v)}>
              {t(`appearance.simpleOpt.${v}`)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '6px' }}>
          {t('appearance.simpleHint')}{a.simple === 'auto' && known ? ` ${t(crewOnly ? 'appearance.simpleAutoOn' : 'appearance.simpleAutoOff')}` : ''}
        </p>
      </div>
      <label style={check}>
        <input type="checkbox" checked={a.comfort} onChange={e => change({ comfort: e.target.checked })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
        <span><strong>{t('appearance.comfort')}</strong><span style={{ display: 'block', color: colors.muted, fontSize: '12px' }}>{t('appearance.comfortHint')}</span></span>
      </label>
      <label style={check}>
        <input type="checkbox" checked={a.font === 'readable'} onChange={e => change({ font: e.target.checked ? 'readable' : 'standard' })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
        <span><strong>{t('appearance.readable')}</strong><span style={{ display: 'block', color: colors.muted, fontSize: '12px' }}>{t('appearance.readableHint')}</span></span>
      </label>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5 }}>{t('appearance.thisDevice')}</p>
    </div>
  )
}

