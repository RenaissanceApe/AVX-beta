// The stage plot (docs/FIELD_TOOLS.md, F1b): things placed on a stage in metres. x is from the
// left of the stage as the audience sees it, y from the front edge. Symbols that make sound bring
// their channels to the input list.

export const DEFAULT_STAGE = { width_m: 10, depth_m: 6 }
export const STEP_M = 0.25 // moves snap to 25 cm

// Every symbol: its size in metres, how it's drawn, and the channels it brings (source names are
// i18n keys under plot.src.*, translated when they're added to the input list)
export const SYMBOLS = {
  drum_kit: { w: 2, h: 2, shape: 'kit', inputs: [
    { src: 'kick', mic: 'Beta 52A' }, { src: 'snare', mic: 'SM57' }, { src: 'hihat', mic: 'KM184', phantom: true },
    { src: 'tom', mic: 'e604' }, { src: 'floor', mic: 'e604' },
    { src: 'ohL', mic: 'KM184', phantom: true }, { src: 'ohR', mic: 'KM184', phantom: true },
  ] },
  vocal_mic: { w: 0.5, h: 0.5, shape: 'circle', inputs: [{ src: 'vocal', mic: 'SM58', stand: 'boom' }] },
  guitar_amp: { w: 0.8, h: 0.5, shape: 'rect', inputs: [{ src: 'guitar', mic: 'SM57' }] },
  bass_amp: { w: 1, h: 0.6, shape: 'rect', inputs: [{ src: 'bass', mic: 'DI', phantom: true }] },
  keyboard: { w: 1.4, h: 0.5, shape: 'rect', inputs: [{ src: 'keysL', mic: 'DI', phantom: true }, { src: 'keysR', mic: 'DI', phantom: true }] },
  acoustic: { w: 0.6, h: 0.6, shape: 'circle', inputs: [{ src: 'acoustic', mic: 'DI', phantom: true }] },
  di_box: { w: 0.3, h: 0.3, shape: 'rect', inputs: [{ src: 'di', mic: 'DI', phantom: true }] },
  wedge: { w: 0.7, h: 0.5, shape: 'wedge', inputs: [] },
  musician: { w: 0.5, h: 0.5, shape: 'circle', inputs: [] },
  riser: { w: 2, h: 2, shape: 'riser', inputs: [] },
  power: { w: 0.3, h: 0.3, shape: 'power', inputs: [] },
  note: { w: 1.2, h: 0.4, shape: 'note', inputs: [] },
}
export const SYMBOL_ORDER = Object.keys(SYMBOLS)

export const snap = (v, step = STEP_M) => Math.round(v / step) * step
export const round2 = v => Math.round(v * 100) / 100

// The stage's size from the show model, with sensible limits (2–40 m wide, 2–30 m deep)
export function stageSize(stage) {
  const w = Number(stage?.width_m), d = Number(stage?.depth_m)
  return {
    width_m: Number.isFinite(w) && w >= 2 ? Math.min(40, w) : DEFAULT_STAGE.width_m,
    depth_m: Number.isFinite(d) && d >= 2 ? Math.min(30, d) : DEFAULT_STAGE.depth_m,
  }
}

// Keep a thing on the stage, snapped to the grid
export function place(x, y, stage) {
  const { width_m, depth_m } = stageSize(stage)
  return { x: round2(Math.min(width_m, Math.max(0, snap(x)))), y: round2(Math.min(depth_m, Math.max(0, snap(y)))) }
}

export const nextRotation = r => ((Number(r) || 0) + 90) % 360

// Where a new thing goes: the middle of the stage, a little to the side of the last one added
export function newSpot(items, stage) {
  const { width_m, depth_m } = stageSize(stage)
  const n = (items || []).length
  return place(width_m / 2 + ((n % 5) - 2) * 0.75, depth_m / 2, stage)
}

// The plot's channels that aren't in the input list yet, numbered after the last channel.
// Drums first, then the others in symbol order, left to right. tr(key) translates plot.src.*.
// Returns rows for gig_inputs (without gig_id).
export function plotToInputs(items, inputs, tr) {
  const have = new Set((inputs || []).map(i => i.plot_ref).filter(Boolean))
  let channel = (inputs || []).reduce((max, i) => Math.max(max, i.channel), 0)
  const sorted = [...(items || [])].sort((a, b) =>
    SYMBOL_ORDER.indexOf(a.kind) - SYMBOL_ORDER.indexOf(b.kind) || Number(a.x) - Number(b.x))
  const rows = []
  for (const item of sorted) {
    const symbol = SYMBOLS[item.kind]
    if (!symbol) continue
    symbol.inputs.forEach((input, n) => {
      const ref = `${item.id}:${n}`
      if (have.has(ref) || channel >= 512) return
      channel += 1
      const name = tr(`plot.src.${input.src}`)
      rows.push({
        channel, plot_ref: ref, source: item.label ? `${name} (${item.label})`.slice(0, 120) : name,
        mic: input.mic || null, phantom: !!input.phantom, stand: input.stand ? tr(`plot.stand.${input.stand}`) : null,
      })
    })
  }
  return rows
}

// The channels a plot makes in all
export const plotChannelCount = items => (items || []).reduce((n, i) => n + (SYMBOLS[i.kind]?.inputs.length || 0), 0)
