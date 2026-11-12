// Shared by the field-tools journeys (fieldtools.spec.js, fieldtools-power.spec.js; AT10).
import { expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { addGig } from './setup.js'
import { RUN } from './accounts.js'

export const TAG = '@fieldtools'
export const LOAD = { timeout: 45_000 }
export const uniq = () => `${RUN}-${Date.now().toString(36)}`
export const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// Notifications read, so the bell's "9+" never trips the accessibility check (issue #209)
export async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}
// Its own gig per test, with the tools given already added (Tools → Add a tool is clicked in T26)
export async function toolGig(world, label, tools = [], fields = {}) {
  const [admin, org] = await Promise.all([world.admin(), world.org()])
  const gig = await addGig(admin, org.id, { name: `E2E ${label} ${uniq()}`, ...fields })
  for (const tool of tools) ok(`Adding ${tool}`, await admin.client.from('gig_tools').insert({ gig_id: gig.id, tool }))
  return { admin, org, gig }
}
// A sample file in e2e/fixtures/ (made-up data)
export const fixtureFile = name => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))
export const openTool = (page, gig, tool) => page.goto(`${gig.path}?tab=tools&tool=${tool}`)

// Where a point of a drawing (in its own units, from getScreenCTM) is on the screen
export async function screenPoint(svg, x, y) {
  return svg.evaluate((el, [px, py]) => {
    const p = el.createSVGPoint()
    p.x = px; p.y = py
    const s = p.matrixTransform(el.getScreenCTM())
    return { x: s.x, y: s.y }
  }, [x, y])
}
// Drags with the mouse from one screen point to another, in small steps like a hand
export async function drag(page, from, to) {
  expect(Math.min(from.y, to.y), 'The drag starts or ends above the window').toBeGreaterThan(0)
  expect(Math.max(from.y, to.y), 'The drag starts or ends below the window').toBeLessThan(page.viewportSize().height)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  await page.mouse.up()
}
