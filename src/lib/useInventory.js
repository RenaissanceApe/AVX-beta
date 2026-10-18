import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { logger } from './logger'
import { useWorkspace } from './WorkspaceContext'
import { levelsByItem } from './inventory'

// Everything the inventory screens of one organisation need: the catalogue (rental and
// sale items), locations and stock levels. Only admins and members can manage inventory.
export function useInventory(orgId) {
  const { orgs, roleIn, loading: loadingOrgs } = useWorkspace()
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const role = roleIn(orgId)
  const canManage = role === 'admin' || role === 'member'

  const reload = useCallback(async () => {
    if (!orgId) return
    const [itemsRes, locRes, levelRes] = await Promise.all([
      supabase.from('price_items').select('*').eq('org_id', orgId).in('kind', ['rental', 'sale']).order('name'),
      supabase.from('stock_locations').select('*').eq('org_id', orgId).order('name'),
      supabase.from('stock_levels').select('*').eq('org_id', orgId),
    ])
    for (const [step, res] of Object.entries({ itemsRes, locRes, levelRes })) {
      if (res.error) logger.error('inventory', res.error, { step })
    }
    setItems(itemsRes.data || [])
    setLocations(locRes.data || [])
    setLevels(levelRes.data || [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (loadingOrgs) return
    if (!canManage) { setLoading(false); return }
    setLoading(true)
    reload()
  }, [reload, canManage, loadingOrgs])

  const stock = useMemo(() => levelsByItem(levels), [levels])
  const activeLocations = useMemo(() => locations.filter(l => !l.archived_at), [locations])
  const locationName = useCallback(id => locations.find(l => l.id === id)?.name, [locations])

  return {
    org: orgs.find(o => o.id === orgId) || null, role, canManage, loading: loading || loadingOrgs,
    items, setItems, locations, activeLocations, locationName, stock, reload,
  }
}
