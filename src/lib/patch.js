// The audio patch (docs/FIELD_TOOLS.md, F2): the gig's stage boxes and which socket each input
// line goes into. Boxes are kept in the show model (gig_show.audio.boxes); the socket is on the
// input line itself (gig_inputs.stage_box, e.g. "SB1-03").

export const MAX_BOX_INPUTS = 128

// "SB1-03" → { box: 'SB1', socket: 3 }; anything else → null
export function parseSocket(code) {
  const m = String(code || '').trim().match(/^(.+?)[-\s.:/]+(\d{1,3})$/)
  if (!m) return null
  const socket = Number(m[2])
  return socket >= 1 ? { box: m[1].trim(), socket } : null
}
export const socketCode = (box, socket) => `${box}-${String(socket).padStart(2, '0')}`

// The boxes from the show model, cleaned: names unique and short, 1–128 inputs each
export function boxesOf(audio) {
  const seen = new Set()
  return (Array.isArray(audio?.boxes) ? audio.boxes : [])
    .map(b => ({ name: String(b?.name || '').trim().slice(0, 12), inputs: Math.min(MAX_BOX_INPUTS, Math.max(1, Math.round(Number(b?.inputs) || 0))), split: !!b?.split }))
    .filter(b => b.name && !seen.has(b.name.toLowerCase()) && seen.add(b.name.toLowerCase()))
}

// A name for a new box: SB1, SB2… (the first not used)
export function nextBoxName(boxes) {
  const names = new Set((boxes || []).map(b => b.name.toLowerCase()))
  let n = 1
  while (names.has(`sb${n}`)) n++
  return `SB${n}`
}

// Each box with its sockets and the lines in them, plus the lines with no socket (or a socket
// that isn't on any box) and the sockets used twice.
export function patchView(boxes, inputs) {
  const byName = new Map(boxes.map(b => [b.name.toLowerCase(), { ...b, sockets: Array.from({ length: b.inputs }, (_, i) => ({ socket: i + 1, lines: [] })) }]))
  const loose = []
  for (const line of [...(inputs || [])].sort((a, b) => a.channel - b.channel)) {
    const s = parseSocket(line.stage_box)
    const box = s && byName.get(s.box.toLowerCase())
    if (box && s.socket <= box.inputs) box.sockets[s.socket - 1].lines.push(line)
    else loose.push(line)
  }
  const out = [...byName.values()]
  const clashes = out.flatMap(b => b.sockets.filter(s => s.lines.length > 1).map(s => socketCode(b.name, s.socket)))
  return { boxes: out, loose, clashes }
}

// Put the lines without a socket into the first free sockets, box by box, in channel order.
// Returns [{ id, stage_box }] to save.
export function autoAssign(boxes, inputs) {
  const { boxes: view, loose } = patchView(boxes, inputs)
  const free = view.flatMap(b => b.sockets.filter(s => s.lines.length === 0).map(s => socketCode(b.name, s.socket)))
  return loose.slice(0, free.length).map((line, i) => ({ id: line.id, stage_box: free[i] }))
}
