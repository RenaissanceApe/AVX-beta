import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListOrdered, LayoutGrid, Cable, Lightbulb, LampCeiling, Speaker, Plug, Plus, ChevronRight, ArrowLeft, Wrench, Flag, Anchor } from 'lucide-react'
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
import LightPlotTool from '../tools/LightPlotTool'
import SystemCalcTool from '../tools/SystemCalcTool'
import RehearsalTool from '../tools/RehearsalTool'
import PowerTool from '../power/PowerTool'
import RiggingTool from '../tools/RiggingTool'
import { looksLikeHoist } from '../../lib/rigging'

export const TOOL_ICONS = { listOrdered: ListOrdered, layoutGrid: LayoutGrid, cable: Cable, lightbulb: Lightbulb, lampCeiling: LampCeiling, speaker: Speaker, plug: Plug, anchor: Anchor }
const iconOf = id => TOOL_ICONS[TOOLS.find(x => x.id === id)?.icon] || Wrench

// A gig's Tools tab (docs/FIELD_TOOLS.md, docs/TOOLS_PLAN.md §1), in two groups:
// - Plan: only the tools this gig uses, plus "Add a tool" for the people who edit them;
// - On site: tools for the day itself, there on every gig (the rehearsal companion).
// ?tool=input_list opens one.
export default function ToolsTab({ gig, tools, canEdit, canPlanEquipment, orgTools, offline, onChanged, members, nameOf, userId, canNote, canManage }) {
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

  // Hoists in the gig's equipment: suggest the rigging tool (docs/TOOLS_PLAN.md §5)
  const [hoists, setHoists] = useState(false)
  const canSuggestRigging = canEdit && !offline && available.includes('rigging')
  useEffect(() => {
    if (!canSuggestRigging) return
    supabase.from('gig_equipment').select('item_name').eq('gig_id', gig.id).limit(500)
      .then(({ data, error }) => {
        if (error) logger.warn('tools', error, { step: 'hoists' })
        setHoists((data || []).some(l => looksLikeHoist(l.item_name)))
      })
  }, [canSuggestRigging, gig.id])

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

  if (open === 'rehearsal') return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {!params.get('session') && (
        <button type="button" onClick={() => setOpen(null)} style={{ ...btn, background: 'transparent', color: colors.soft, padding: '6px 10px', marginBottom: '14px' }}>
          <ArrowLeft size={14} /> {t('gig.tab.tools')}
        </button>
      )}
      <RehearsalTool gig={gig} members={members} nameOf={nameOf} userId={userId} canNote={canNote} canManage={canManage} offline={offline} />
    </div>
  )

  if (open && tools.includes(open)) return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <button type="button" onClick={() => setOpen(null)} style={{ ...btn, background: 'transparent', color: colors.soft, padding: '6px 10px', marginBottom: '14px' }}>
        <ArrowLeft size={14} /> {t('gig.tab.tools')}
      </button>
      {open === 'input_list' && <InputListTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline} onToolsChanged={onChanged} />}
      {open === 'stage_plot' && (
        <StagePlotTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline}
          hasInputList={tools.includes('input_list')} onToolsChanged={onChanged} />
      )}
      {open === 'patch' && <PatchTool gig={gig} canEdit={canEdit && !offline} />}
      {open === 'dmx_patch' && <DmxPatchTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline} />}
      {open === 'light_plot' && <LightPlotTool gig={gig} canEdit={canEdit && !offline} hasDmxPatch={tools.includes('dmx_patch')} onToolsChanged={onChanged} />}
      {open === 'system_calc' && <SystemCalcTool gig={gig} canEdit={canEdit && !offline} />}
      {open === 'power' && <PowerTool gig={gig} canEdit={canEdit && !offline} />}
      {open === 'rigging' && <RiggingTool gig={gig} canEdit={canEdit && !offline} canPlanEquipment={canPlanEquipment && !offline} />}
      {canEdit && !offline && (
        <button type="button" onClick={() => remove(open)} style={{ ...btn, background: 'transparent', color: colors.muted, fontSize: '13px', marginTop: '24px' }}>
          {t('tools.removeFromGig')}
        </button>
      )}
    </div>
  )

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.tools')} hint={t('tools.subtitle')}
        action={canEdit && !offline && available.length > 0 && <button type="button" onClick={() => setAdding(true)} style={btnPrimary}><Plus size={14} /> {t('tools.add')}</button>} />

      <h3 style={groupHead}>{t('tools.group.onSite')}</h3>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
        <li>
          <ToolButton icon={Flag} name={t('tools.name.rehearsal')} about={t('tools.about.rehearsal')} onClick={() => setOpen('rehearsal')} />
        </li>
      </ul>

      <h3 style={groupHead}>{t('tools.group.plan')}</h3>
      {canSuggestRigging && hoists && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px', borderColor: 'var(--accent)' }}>
          <Anchor size={20} color={colors.accentText} aria-hidden="true" />
          <span style={{ flex: '1 1 200px', fontSize: '13px', lineHeight: 1.5 }}>{t('tools.suggestRigging')}</span>
          <button type="button" onClick={() => add('rigging')} style={btn}><Plus size={14} /> {t('tools.addRigging')}</button>
        </div>
      )}
      {tools.length === 0 ? (
        <EmptyState icon={<Wrench size={28} />} title={t('tools.emptyTitle')} body={canEdit ? t('tools.emptyEditor') : t('tools.emptyReader')}
          action={canEdit && !offline && available.length > 0 ? t('tools.add') : null} onAction={() => setAdding(true)} guide={canEdit ? 'pm-input-list' : null} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {TOOLS.filter(x => tools.includes(x.id)).map(x => {
            const Icon = iconOf(x.id)
            return (
              <li key={x.id}>
                <ToolButton icon={Icon} name={t(`tools.name.${x.id}`)} about={t(`tools.about.${x.id}`)} onClick={() => setOpen(x.id)} />
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
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '12px' }}>{t('tools.more')}</p>
        </Modal>
      )}
    </div>
  )
}

const groupHead = { fontSize: '13px', fontWeight: 700, color: colors.muted, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }

function ToolButton({ icon, name, about, onClick }) {
  const Icon = icon
  return (
    <button type="button" onClick={onClick} style={{ ...card, width: '100%', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', font: 'inherit', minHeight: '64px' }}>
      <Icon size={22} color={colors.accentText} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '16px' }}>{name}</strong>
        <span style={{ fontSize: '13px', color: colors.muted }}>{about}</span>
      </span>
      <ChevronRight size={18} color={colors.muted} aria-hidden="true" />
    </button>
  )
}
