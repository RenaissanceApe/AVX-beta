// The home's modules and how each person arranges them (DESIGN.md "Home", DR1).
// First steps is not arranged: it stays on top until finished or closed. The rest follow the standard
// order unless the person moved or hid some with "Arrange home". Saved per person and per workspace on
// this device (like Appearance); no database.

export const HOME_MODULES = ['requests', 'numbers', 'events']

const key = (userId, scope) => `avx.home.layout.${userId}.${scope}`

const clean = saved => ({
  order: Array.isArray(saved?.order) ? saved.order.filter(id => HOME_MODULES.includes(id)) : [],
  hidden: Array.isArray(saved?.hidden) ? saved.hidden.filter(id => HOME_MODULES.includes(id)) : [],
})

// The modules in the person's order, each { id, hidden }. Only `available` ones (what this workspace
// shows this person). A module the saved order doesn't know yet joins at its standard place: right after
// the nearest module that comes before it in the standard order.
export function arrangeModules(saved, available = HOME_MODULES) {
  const { order, hidden } = clean(saved)
  const list = [...new Set(order)]
  for (const id of HOME_MODULES) {
    if (list.includes(id)) continue
    const before = HOME_MODULES.slice(0, HOME_MODULES.indexOf(id)).reverse().find(b => list.includes(b))
    list.splice(before ? list.indexOf(before) + 1 : 0, 0, id)
  }
  return list.filter(id => available.includes(id)).map(id => ({ id, hidden: hidden.includes(id) }))
}

// Moves a module one place up (-1) or down (+1) among the available ones; returns the new saved layout.
export function moveModule(saved, available, id, step) {
  const shown = arrangeModules(saved, available).map(m => m.id)
  const at = shown.indexOf(id)
  const to = at + step
  if (at < 0 || to < 0 || to >= shown.length) return clean(saved)
  ;[shown[at], shown[to]] = [shown[to], shown[at]]
  // Modules not available here keep their place in the full order
  const full = arrangeModules(saved).map(m => m.id)
  let i = 0
  const order = full.map(m => (available.includes(m) ? shown[i++] : m))
  return { order, hidden: clean(saved).hidden }
}

export function setModuleHidden(saved, id, hide) {
  const c = clean(saved)
  const hidden = hide ? [...new Set([...c.hidden, id])] : c.hidden.filter(h => h !== id)
  return { order: c.order.length ? c.order : arrangeModules(saved).map(m => m.id), hidden }
}

export const isStandard = saved => {
  const c = clean(saved)
  return c.hidden.length === 0 && arrangeModules(c).every((m, i) => m.id === HOME_MODULES[i])
}

export function loadLayout(userId, scope) {
  try { return clean(JSON.parse(localStorage.getItem(key(userId, scope)) || 'null')) } catch { return clean(null) }
}

export function saveLayout(userId, scope, layout) {
  try {
    if (!layout || isStandard(layout)) localStorage.removeItem(key(userId, scope))
    else localStorage.setItem(key(userId, scope), JSON.stringify(clean(layout)))
  } catch { /* private window: this visit only */ }
}
