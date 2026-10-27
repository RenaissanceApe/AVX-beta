// DMX calculator (docs/TOOLS_PLAN.md §3, D1): dipswitches, absolute addresses, block addressing
// and value conversions. Pure functions; the pocket tool and the DMX patch both use them.

import { UNIVERSE_SIZE } from './dmx'

// How a fixture's dipswitches are laid out. Fixtures disagree, so each person picks what their
// fixture shows: 9 or 10 switches (the 10th is often a function switch), switch 1 worth 1 (LSB
// first, the usual) or worth 256 (MSB first), ON up or down, switch 1 on the left or the right.
export const DIP_DEFAULTS = { switches: 9, msbFirst: false, onUp: true, firstLeft: true }

// The value each switch adds, switch 1 first
export function switchValues({ switches = 9, msbFirst = false } = {}) {
  const bits = Math.min(switches, 9)
  const values = Array.from({ length: bits }, (_, i) => 2 ** i)
  if (msbFirst) values.reverse()
  return switches > 9 ? [...values, 0] : values // a 10th switch carries no address
}

// Address (1–511 on 9 switches) → which switches are ON, switch 1 first
export function addressToSwitches(address, opts = DIP_DEFAULTS) {
  const a = Math.max(0, Math.min(511, Math.round(Number(address) || 0)))
  return switchValues(opts).map(v => v > 0 && (a & v) === v)
}

// Switches → address
export const switchesToAddress = (on, opts = DIP_DEFAULTS) =>
  switchValues(opts).reduce((sum, v, i) => sum + (on[i] ? v : 0), 0)

// "1, 3, 9 ON" style summary: the switch numbers that are ON
export const switchesOn = (address, opts = DIP_DEFAULTS) =>
  addressToSwitches(address, opts).map((on, i) => (on ? i + 1 : null)).filter(Boolean)

// Universe + address ↔ absolute channel. zeroBased: universes counted from 0 (as Art-Net and
// many consoles show them) instead of from 1.
export function toAbsolute(universe, address, { zeroBased = false } = {}) {
  const u = Number(universe), a = Number(address)
  if (!Number.isInteger(u) || !Number.isInteger(a) || a < 1 || a > UNIVERSE_SIZE || u < (zeroBased ? 0 : 1)) return null
  return (u - (zeroBased ? 0 : 1)) * UNIVERSE_SIZE + a
}
export function fromAbsolute(absolute, { zeroBased = false } = {}) {
  const n = Number(absolute)
  if (!Number.isInteger(n) || n < 1) return null
  return { universe: Math.floor((n - 1) / UNIVERSE_SIZE) + (zeroBased ? 0 : 1), address: ((n - 1) % UNIVERSE_SIZE) + 1 }
}

// N fixtures of `footprint` channels from a start address: each one's universe and address. A
// fixture never straddles two universes: one that wouldn't fit moves to the next universe's
// channel 1 (`jumped`).
export function blockAddresses({ count, footprint, universe = 1, start = 1 }) {
  const n = Math.max(0, Math.min(1024, Math.floor(Number(count) || 0)))
  const fp = Math.max(1, Math.min(UNIVERSE_SIZE, Math.floor(Number(footprint) || 1)))
  let u = Math.max(0, Math.floor(Number(universe) || 0)), at = Math.max(1, Math.min(UNIVERSE_SIZE, Math.floor(Number(start) || 1)))
  const rows = []
  for (let i = 0; i < n; i++) {
    let jumped = false
    if (at + fp - 1 > UNIVERSE_SIZE) { u += 1; at = 1; jumped = true }
    rows.push({ n: i + 1, universe: u, address: at, end: at + fp - 1, jumped })
    at += fp
  }
  return rows
}

// Values: 0–100 % ↔ 0–255, 16-bit value ↔ coarse/fine, hex
export const percentToDmx = p => Math.round((Math.max(0, Math.min(100, Number(p) || 0)) * 255) / 100)
export const dmxToPercent = v => Math.round((Math.max(0, Math.min(255, Number(v) || 0)) * 1000) / 255) / 10
export const toCoarseFine = v => { const x = Math.max(0, Math.min(65535, Math.round(Number(v) || 0))); return { coarse: x >> 8, fine: x & 255 } }
export const fromCoarseFine = (coarse, fine) => (Math.max(0, Math.min(255, Number(coarse) || 0)) << 8) + Math.max(0, Math.min(255, Number(fine) || 0))
export const toHex = v => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).toUpperCase().padStart(2, '0')
export function fromHex(text) {
  const s = String(text || '').trim().replace(/^0x/i, '')
  return /^[0-9a-f]{1,2}$/i.test(s) ? parseInt(s, 16) : null
}

// The person's dipswitch layout, kept on this device
const KEY = 'avx.dipLayout'
export function readDipLayout() {
  try { return { ...DIP_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DIP_DEFAULTS } }
}
export function saveDipLayout(layout) {
  try { localStorage.setItem(KEY, JSON.stringify(layout)) } catch { /* storage blocked */ }
}
