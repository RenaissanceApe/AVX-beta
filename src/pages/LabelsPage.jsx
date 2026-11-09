import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/selectAll'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { scanUrl } from '../lib/inventory'
import { contentLines, groupUnits } from '../lib/labels'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import LabelSheet from '../components/labels/LabelSheet'

const ids = value => (value || '').split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500)
const chunks = (list, n = 200) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n))

// Printable QR labels for items, units and cases (U5: the shared sizes and templates).
// Each code opens /scan/<code>, which finds the item or unit.
//   /org/:orgId/inventory/labels                 every stock-tracked item
//   ?items=<id,…>&units=<id,…>                   just these
export default function LabelsPage() {
  const { orgId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { orgs } = useWorkspace()
  const [labels, setLabels] = useState(null)
  const orgName = orgs.find(o => o.id === orgId)?.name || ''
  const itemIds = ids(params.get('items'))
  const unitIds = ids(params.get('units'))
  const key = `${itemIds.join(',')}|${unitIds.join(',')}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      const everything = !itemIds.length && !unitIds.length
      const wantItems = everything || itemIds.length > 0
      const itemQuery = () => {
        const q = supabase.from('price_items').select('id, name, code, tracking, brand, model, category, kit_type').eq('org_id', orgId).neq('tracking', 'none').is('archived_at', null)
        return (everything ? q : q.in('id', itemIds)).order('name').order('id')
      }
      const [itemsRes, unitsRes, packedRes] = await Promise.all([
        wantItems ? selectAll(itemQuery) : Promise.resolve({ data: [] }),
        unitIds.length ? supabase.from('stock_units').select('id, code, serial, item_id, out_gig:gigs(name), price_items(name, category, kit_type)').eq('org_id', orgId).in('id', unitIds).order('code') : Promise.resolve({ data: [] }),
        // What's packed in the case units asked for
        unitIds.length ? supabase.from('stock_units').select('case_unit_id, price_items(name)').eq('org_id', orgId).in('case_unit_id', unitIds).neq('status', 'retired') : Promise.resolve({ data: [] }),
      ])
      if (itemsRes.error) logger.error('labels', itemsRes.error, { step: 'items' })
      if (unitsRes.error) logger.error('labels', unitsRes.error, { step: 'units' })
      if (packedRes.error) logger.warn('labels', packedRes.error, { step: 'packed' })
      const items = itemsRes.data || []
      const units = unitsRes.data || []

      // The contents of sets and cases (item_parts), with their items' names
      const kitIds = [...new Set([
        ...items.filter(i => i.kit_type).map(i => i.id),
        ...units.filter(u => u.price_items?.kit_type === 'case').map(u => u.item_id),
      ])]
      let parts = []
      for (const part of chunks(kitIds)) {
        const { data, error } = await supabase.from('item_parts').select('parent_id, child_id, quantity').eq('org_id', orgId).eq('kind', 'content').in('parent_id', part)
        if (error) { logger.warn('labels', error, { step: 'contents' }); break }
        parts = parts.concat(data || [])
      }
      const childIds = [...new Set(parts.map(p => p.child_id))]
      const children = {}
      for (const part of chunks(childIds)) {
        const { data, error } = await supabase.from('price_items').select('id, name, tracking').in('id', part)
        if (error) { logger.warn('labels', error, { step: 'content-names' }); break }
        for (const c of data || []) children[c.id] = c
      }
      const partsOf = (itemId, bulkOnly) => parts
        .filter(p => p.parent_id === itemId && children[p.child_id] && (!bulkOnly || children[p.child_id].tracking !== 'serial'))
        .map(p => ({ name: children[p.child_id].name, quantity: p.quantity }))

      const origin = window.location.origin
      const list = [
        ...items.filter(i => i.code).map(i => ({
          key: i.id, kind: i.kit_type === 'case' ? 'case' : 'item', code: i.code, qr: scanUrl(origin, i.code),
          name: i.name, sub: [i.brand, i.model].filter(Boolean).join(' '), department: i.category,
          contents: contentLines(partsOf(i.id, false)),
        })),
        ...units.map(u => {
          const isCase = u.price_items?.kit_type === 'case'
          const packed = groupUnits((packedRes.data || []).filter(p => p.case_unit_id === u.id).map(p => ({ name: p.price_items?.name })))
          return {
            key: u.id, kind: isCase ? 'case' : 'unit', code: u.code, qr: scanUrl(origin, u.code),
            name: u.price_items?.name || '', sub: u.serial ? `S/N ${u.serial}` : '', department: u.price_items?.category,
            gig: u.out_gig?.name || '',
            // A case unit: the units packed in it, plus its item's bulk contents
            contents: isCase ? contentLines([...packed, ...partsOf(u.item_id, true)]) : [],
          }
        }),
      ]
      if (!cancelled) setLabels(list)
    }
    load()
    return () => { cancelled = true }
  }, [orgId, key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LabelSheet
      labels={labels}
      orgId={orgId}
      orgName={orgName}
      sizeKey="avx.labels.size.inventory"
      onBack={() => navigate(-1)}
      backLabel={t('common.back')}
      onPrint={() => track('inventory:labels-printed')}
      empty={t('inv.noLabels')}
    />
  )
}
