import { ArrowUp, ArrowDown } from 'lucide-react'
import { useI18n } from '../i18n'
import { arrangeModules, moveModule, setModuleHidden, isStandard } from '../lib/homeLayout'
import { Modal, btn, btnPrimary, colors, iconBtn, space } from './ui'

// "Arrange home" (DESIGN.md "Home", DR1): each module of this workspace's home with ↑ / ↓, a show/hide
// switch and "Back to the standard". Changes apply at once; Dashboard saves them on this device.
//   layout: the saved layout ({ order, hidden }); modules: [{ id, name }] this home can show; onChange(layout)
export default function ArrangeHome({ layout, modules, onChange, onClose }) {
  const { t } = useI18n()
  const available = modules.map(m => m.id)
  const names = Object.fromEntries(modules.map(m => [m.id, m.name]))
  const list = arrangeModules(layout, available)
  return (
    <Modal title={t('home.arrange')} onClose={onClose} maxWidth={440}>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: space[4] }}>{t('home.arrangeIntro')}</p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {list.map((m, i) => {
          const name = names[m.id]
          return (
            <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], minHeight: '52px', borderTop: `1px solid ${colors.border}`, ...(i === list.length - 1 ? { borderBottom: `1px solid ${colors.border}` } : {}) }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600, color: m.hidden ? colors.muted : colors.text }}>{name}</span>
              <button type="button" onClick={() => onChange(moveModule(layout, available, m.id, -1))} disabled={i === 0}
                aria-label={t('home.moveUp', { name })} title={t('home.moveUp', { name })} style={{ ...iconBtn, padding: space[3], color: colors.text }}>
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => onChange(moveModule(layout, available, m.id, 1))} disabled={i === list.length - 1}
                aria-label={t('home.moveDown', { name })} title={t('home.moveDown', { name })} style={{ ...iconBtn, padding: space[3], color: colors.text }}>
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <Switch on={!m.hidden} label={t('home.show')} name={t('home.showModule', { name })} onChange={on => onChange(setModuleHidden(layout, m.id, !on))} />
            </li>
          )
        })}
      </ol>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', marginTop: space[5] }}>
        <button type="button" onClick={() => onChange(null)} disabled={isStandard(layout)} style={btn}>{t('home.backToStandard')}</button>
        <button type="button" onClick={onClose} style={btnPrimary}>{t('common.done')}</button>
      </div>
    </Modal>
  )
}

// A square on/off switch with its word ("Show"); the knob's side, not only its colour, shows the state.
function Switch({ on, label, name, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={name} onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], minHeight: '44px', padding: `0 ${space[1]}`, background: 'none', border: 'none', cursor: 'pointer', color: colors.text, fontSize: '13px' }}>
      <span aria-hidden="true">{label}</span>
      <span aria-hidden="true" style={{ position: 'relative', width: '36px', height: '20px', flexShrink: 0, border: `1px solid ${on ? colors.text : colors.lineStrong}`, background: on ? colors.text : 'transparent', transition: 'background-color .15s' }}>
        <span style={{ position: 'absolute', top: '3px', left: on ? '19px' : '3px', width: '12px', height: '12px', background: on ? colors.bg : colors.muted, transition: 'left .15s' }} />
      </span>
    </button>
  )
}
