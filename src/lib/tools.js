// Field tools (docs/FIELD_TOOLS.md): optional tools for the technical side of a gig, listed in
// the gig's Tools tab. Each one is a module; an organisation chooses which it uses.

// Every tool AVX knows, in the order they're offered. ready: built so far (the rest are planned).
export const TOOLS = [
  { id: 'input_list', icon: 'listOrdered', ready: true },
  { id: 'stage_plot', icon: 'layoutGrid', ready: false },
]
export const ALL_TOOL_IDS = ['stage_plot', 'input_list', 'patch', 'dmx_patch', 'light_plot', 'system_calc']

export const readyTools = () => TOOLS.filter(t => t.ready)

// What "Add a tool" offers: ready tools the organisation uses (any, for a gig without one) that
// the gig doesn't have yet
export function toolsToAdd(orgTools, gigTools) {
  const have = new Set(gigTools || [])
  return readyTools().filter(t => (!orgTools || orgTools.includes(t.id)) && !have.has(t.id)).map(t => t.id)
}

// The first free channel after the last one used
export const nextChannel = inputs => Math.min(512, (inputs || []).reduce((max, i) => Math.max(max, i.channel), 0) + 1)

// A channel used twice can't happen in the database; a gap is fine but worth showing
export function channelGaps(inputs) {
  const used = new Set((inputs || []).map(i => i.channel))
  const top = Math.max(0, ...used)
  const gaps = []
  for (let ch = 1; ch < top; ch++) if (!used.has(ch)) gaps.push(ch)
  return gaps
}

// Inputs linked to catalogue items (the mic or DI on each channel) → what the gig's equipment
// needs: [{ item_id, needed, planned, add }] where add is how many more to plan
export function inputsToEquipment(inputs, lines) {
  const needed = {}
  for (const i of inputs || []) if (i.item_id) needed[i.item_id] = (needed[i.item_id] || 0) + 1
  const planned = Object.fromEntries((lines || []).map(l => [l.item_id, l.quantity]))
  return Object.entries(needed).map(([item_id, n]) => ({
    item_id, needed: n, planned: planned[item_id] || 0, add: Math.max(0, n - (planned[item_id] || 0)),
  }))
}

// "24 inputs · 6 with 48V"
export const inputCounts = inputs => ({
  total: (inputs || []).length,
  phantom: (inputs || []).filter(i => i.phantom).length,
  checked: (inputs || []).filter(i => i.checked).length,
})
