import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListOrdered, LayoutGrid, Cable, Lightbulb, Plus, ChevronRight, ArrowLeft, Wrench } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { TOOLS, toolsToAdd } from '../../lib/tools'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, card, colors } from '../ui'
import EmptyState from '../EmptyState'
import { TabHeader } from './parts'
import InputListTool from '../tools/InputListTool'
import StagePlotTool from '../tools/StagePlotTool'
import PatchTool from '../tools/PatchTool'
import DmxPatchTool from '../tools/DmxPatchTool'

export const TOOL_ICONS = { listOrdered: ListOrdered, layoutGrid: LayoutGrid, cable: Cable, lightbulb: Lightbulb }
const iconOf = id => TOOL_ICONS[TOOLS.find(x => x.id === id)?.icon] || Wrench

// A gig's Tools tab (docs/FIELD_TOOLS.md): only the tools this gig uses, plus "Add a tool" for
// the people who edit them. ?tool=input_list opens one.
export default function ToolsTab({ gig, tools, canEdit, canPlanEquipment, orgTools, offline, onChanged }) {
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const open = params.get('tool')
  const setOpen = id => setParams(p => {
    const next = new URLSearchParams(p)
    next.set('tab', 'tools')
    if (id) next.set('tool', id); else next.delete('tool')
    return next
  })
  const available = toolsToAdd(gig.org_id ? orgTools : null, tools)

  async function add(id) {
    const { error } = await supabase.from('gig_tools').insert({ gig_id: gig.id, tool: id })
    if (error) {
      logger.error('tools', error, { step: 'add', tool: id })
      return notify(userMessage(error), 'error')
    }
    track(`tools:add:${id}`)
    setAdding(false)
    onChanged()
    setOpen(id)
  }

  async function remove(id) {
    const { error } = await supabase.from('gig_tools').delete().eq('gig_id', gig.id).eq('tool', id)
    if (error) return notify(userMessage(error), 'error')
    notify(t('tools.removed', { tool: t(`tools.name.${id}`) }), 'success')
    setOpen(null)
    onChanged()
  }

  if (open && tools.includes(open)) return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <button type="button" onClick={() => setOpen(null)} style={{ ...btn, background: 'transparent', color: colors.soft, padding: '6px 10px', marginBottom: '14px' }}>
        <ArrowLeft size={14} /> {t('gig.tab.tools')}
      </button>
      {open === 'input_list' && <InputListTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline} />}
      {open === 'stage_plot' && (
        <StagePlotTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline}
          hasInputList={tools.includes('input_list')} onToolsChanged={onChanged} />
      )}
      {open === 'patch' && <PatchTool gig={gig} canEdit={canEdit && !offline} />}
      {open === 'dmx_patch' && <DmxPatchTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline} />}
      {canEdit && !offline && (
        <button type="button" onClick={() => remove(open)} style={{ ...btn, background: 'transparent', color: colors.muted, fontSize: '12px', marginTop: '24px' }}>
          {t('tools.removeFromGig')}
        </button>
      )}
    </div>
  )

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.tools')} subtitle={t('tools.subtitle')}
        action={canEdit && !offline && available.length > 0 && <button type="button" onClick={() => setAdding(true)} style={btnPrimary}><Plus size={14} /> {t('tools.add')}</button>} />

      {tools.length === 0 ? (
        <EmptyState icon={<Wrench size={28} />} title={t('tools.emptyTitle')} body={canEdit ? t('tools.emptyEditor') : t('tools.emptyReader')}
          action={canEdit && !offline && available.length > 0 ? t('tools.add') : null} onAction={() => setAdding(true)} guide={canEdit ? 'pm-input-list' : null} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {TOOLS.filter(x => tools.includes(x.id)).map(x => {
            const Icon = iconOf(x.id)
            return (
              <li key={x.id}>
                <button type="button" onClick={() => setOpen(x.id)} style={{ ...card, width: '100%', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', font: 'inherit', minHeight: '64px' }}>
                  <Icon size={22} color={colors.accentText} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '15px' }}>{t(`tools.name.${x.id}`)}</strong>
                    <span style={{ fontSize: '13px', color: colors.muted }}>{t(`tools.about.${x.id}`)}</span>
                  </span>
                  <ChevronRight size={18} color={colors.muted} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <Modal title={t('tools.add')} onClose={() => setAdding(false)}>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {available.map(id => {
              const Icon = iconOf(id)
              return (
                <li key={id}>
                  <button type="button" onClick={() => add(id)} style={{ ...card, width: '100%', display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', font: 'inherit' }}>
                    <Icon size={20} color={colors.accentText} aria-hidden="true" style={{ marginTop: '2px' }} />
                    <span>
                      <strong style={{ display: 'block' }}>{t(`tools.name.${id}`)}</strong>
                      <span style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t(`tools.about.${id}`)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '12px' }}>{t('tools.more')}</p>
        </Modal>
      )}
    </div>
  )
}
