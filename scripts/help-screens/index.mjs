// Screenshots for the how-to guides (docs/HELP.md, H2): npm run help:screens
//
// Builds the app against a pretend Supabase address, answers every database call with the
// sample data in sample-data.mjs, opens each screen on a phone-sized browser, outlines the
// thing to tap and saves a JPEG per language in public/help/shots/<lang>/<shot>.jpg.
// Run it after changing a screen that a guide shows; commit the pictures with the change.
//
//   npm run help:screens               every picture, both languages
//   npm run help:screens -- call-time,push  only the pictures whose names contain these words
//   HELP_THEME=light HELP_OUT=/tmp/x npm run help:screens   another theme, saved elsewhere (to check it)
//
// Needs Chromium for Playwright (in CI images it is at /opt/pw-browsers/chromium; set
// PW_CHROMIUM_PATH to use another).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview, createServer } from 'vite'
import { chromium } from '@playwright/test'
import { SB, sampleData, applyFilters, ids } from './sample-data.mjs'
import en from '../../src/i18n/en.js'
import pt from '../../src/i18n/pt.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.join(root, 'node_modules/.help-screens')
const PORT = 4179
const STRINGS = { en, pt }
const only = (process.argv[2] || '').split(',')
const THEME = process.env.HELP_THEME || 'dark'
const SHOTS = process.env.HELP_OUT ? path.resolve(process.env.HELP_OUT) : null

// The label the app shows, so the script finds buttons the way a person would
const label = (lang, key, vars = {}) => {
  const s = STRINGS[lang][key] ?? STRINGS[lang][`${key}.other`]
  if (s == null) throw new Error(`No string ${key}`)
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}

// Each picture: who is signed in, where, what to do first, and what to outline
const SCENES = {
  welcome: { persona: 'new', url: '/welcome', async run(page, L) {
    await page.getByPlaceholder(L('welcome.namePlaceholder')).fill('Carla Mendes')
    await page.locator('input[type=password]').first().fill('palco-2026!')
    return page.locator('form').first()
  } },
  'gig-list': { persona: 'crew', url: '/me', async run(page) {
    // Crew-only people get simple mode: the next gig is the big card at the top
    return page.locator('section[aria-labelledby="next-gig"]')
  } },
  'call-time': { persona: 'crew', url: `/gig/${ids.gig}`, async run(page, L) {
    return page.getByText(L('crew.call', { time: '08:00' }), { exact: true }).first().locator('xpath=..')
  } },
  'schedule-callsheet': { persona: 'crew', url: `/gig/${ids.gig}?tab=schedule`, async run(page, L) {
    return page.getByRole('button', { name: L('schedule.callSheet') })
  } },
  'call-sheet': { persona: 'crew', url: `/gig/${ids.gig}/callsheet`, async run(page, L) {
    await page.getByText(L('callsheet.print')).waitFor()
    return null
  } },
  'call-sheet-send': { persona: 'pm', url: `/gig/${ids.gig}/callsheet`, async run(page, L) {
    return page.getByRole('button', { name: L('callsheet.publish') })
  } },
  'more-availability': { persona: 'crew', url: '/me', async run(page, L) {
    await page.locator('.shell-tabs').getByRole('button', { name: L('nav.more') }).click()
    return page.getByRole('dialog').getByRole('link', { name: new RegExp(L('nav.availability')) })
  } },
  unavailable: { persona: 'crew', url: '/me?panel=account', async run(page, L) {
    await page.getByLabel(L('availability.from'), { exact: true }).fill(dayFromNow(60))
    return page.getByText(L('availability.title'), { exact: true }).locator('xpath=..')
  } },
  push: { persona: 'crew', url: '/me?panel=account', async run(page, L) {
    return page.getByText(L('push.title'), { exact: true }).first().locator('xpath=ancestor::div[1]')
  } },
  requests: { persona: 'crew', url: '/me', async run(page, L) {
    return page.getByText(L('requests.title.one', { count: 1 })).locator('xpath=..')
  } },
  appearance: { persona: 'crew', url: '/me?panel=account', async run(page, L) {
    return page.getByText(L('appearance.title'), { exact: true }).locator('xpath=..')
  } },
  'chat-availability': { persona: 'crew', url: `/messages/${ids.direct}`, async run(page, L) {
    return page.getByRole('button', { name: L('requests.available'), exact: true }).last().locator('xpath=ancestor::div[2]')
  } },
  inbox: { persona: 'crew', url: '/messages', async run(page, L) {
    return page.getByRole('link', { name: new RegExp(`^${L('chat.title')}`) }).first()
  } },
  'chat-compose': { persona: 'crew', url: `/messages/${ids.gigChat}`, async run(page, L) {
    const box = page.getByPlaceholder(L('chat.placeholder'))
    await box.fill(page.lang === 'pt' ? 'Chego às 08:00 👍' : 'I’ll be there at 08:00 👍')
    return box.locator('xpath=ancestor::form[1]')
  } },
  'equipment-report': { persona: 'crew', url: `/gig/${ids.gig}?tab=equipment`, async run(page, L) {
    return page.getByRole('button', { name: L('report.title') })
  } },
  'damage-form': { persona: 'crew', url: `/gig/${ids.gig}?tab=equipment`, async run(page, L) {
    await page.getByRole('button', { name: L('report.title') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#rd-item').selectOption({ index: 1 }).catch(() => {})
    await dialog.locator('#rd-problem').fill(page.lang === 'pt' ? 'Grelha amolgada depois da carga.' : 'Grille dented during the load-out.')
    return null
  } },
  'files-offline': { persona: 'crew', url: `/gig/${ids.gig}?tab=assets`, async run(page, L) {
    return page.getByRole('button', { name: L('offline.saveAll') })
  } },
  'offline-banner': { persona: 'crew', url: `/gig/${ids.gig}`, async run(page, L, ctx) {
    await ctx.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    return page.getByText(L('offline.banner')).first()
  } },
  'gig-form': { persona: 'pm', url: `/org/${ids.org}?new=gig`, async run(page, L) {
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(L('gigForm.name'), { exact: false }).fill('Marcolino — Natal')
    await dialog.getByLabel(L('gigForm.venue')).fill('Coliseu dos Recreios, Lisboa')
    await dialog.getByLabel(L('gigForm.start')).fill(dayFromNow(24))
    await dialog.getByLabel(L('gigForm.end')).fill(dayFromNow(25))
    return dialog.getByRole('button', { name: L('dash.createGig') })
  } },
  'crew-invite': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    return page.getByRole('button', { name: L('crew.invite') }).first()
  } },
  'invite-form': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    await page.getByRole('button', { name: L('crew.invite') }).first().click()
    const dialog = page.getByRole('dialog')
    const search = dialog.getByRole('searchbox').or(dialog.getByPlaceholder(L('network.search'))).first()
    await search.fill('Ana').catch(() => {})
    await page.waitForTimeout(600)
    return search
  } },
  'schedule-add': { persona: 'pm', url: `/gig/${ids.gig}?tab=schedule`, async run(page, L) {
    return page.getByRole('button', { name: L('schedule.add') })
  } },
  'schedule-form': { persona: 'pm', url: `/gig/${ids.gig}?tab=schedule`, async run(page, L) {
    await page.getByRole('button', { name: L('schedule.add') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(L('schedule.what')).fill(page.lang === 'pt' ? 'Ensaio geral' : 'Rehearsal')
    await dialog.getByLabel(L('schedule.start')).fill('18:00')
    await dialog.getByLabel(L('schedule.end')).fill('19:30')
    await dialog.getByLabel(L('schedule.where')).fill(page.lang === 'pt' ? 'Palco principal' : 'Main stage')
    return null
  } },
  'crew-clash': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page) {
    return page.getByRole('status').filter({ hasText: 'Duarte' }).first()
  } },
  'ask-form': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    await page.getByRole('button', { name: L('ask.button') }).first().click()
    await page.getByRole('dialog').locator('textarea, input').first().fill(L('ask.messagePlaceholder').replace(/^(e\.g\.|ex\.:?|p\. ?ex\.:?)\s*/i, ''))
    return page.getByRole('dialog').getByRole('button', { name: L('ask.send') })
  } },
  'equipment-add': { persona: 'pm', url: `/gig/${ids.gig}?tab=equipment`, async run(page, L) {
    return page.getByRole('button', { name: L('equip.add') }).first()
  } },
  'equipment-picker': { persona: 'pm', url: `/gig/${ids.gig}?tab=equipment`, async run(page, L) {
    await page.getByRole('button', { name: L('equip.add') }).first().click()
    const dialog = page.getByRole('dialog')
    const row = dialog.locator('label').filter({ hasText: 'Powercon' }).first()
    await row.locator('input[type=checkbox]').check()
    return row
  } },

  // Warehouse
  'inv-import': { persona: 'pm', url: `/org/${ids.org}/inventory`, async run(page, L) {
    await page.getByRole('button', { name: L('inv.import'), exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('textarea').first().fill(L('inv.importExample'))
    await page.waitForTimeout(300)
    return dialog.getByRole('button', { name: new RegExp(`^${L('inv.import')} `) })
  } },
  'inv-locations': { persona: 'pm', url: `/org/${ids.org}/inventory?tab=locations`, async run(page, L) {
    return page.getByRole('button', { name: L('inv.addLocation') }).first()
  } },
  'item-units': { persona: 'pm', url: `/org/${ids.org}/inventory/${ids.speaker}`, async run(page, L) {
    return page.getByRole('button', { name: L('inv.addUnits') }).first()
  } },
  labels: { persona: 'pm', url: `/org/${ids.org}/inventory/labels`, async run(page, L) {
    return page.getByRole('button', { name: L('inv.print') }).first()
  } },
  'dispatch-out': { persona: 'pm', url: `/gig/${ids.gig}/scan`, async run(page, L) {
    await page.getByPlaceholder(L('dispatch.codePlaceholder')).fill('U-7KQ2M9XG')
    return page.getByPlaceholder(L('dispatch.codePlaceholder')).locator('xpath=ancestor::form[1]')
  } },
  'dispatch-in': { persona: 'pm', url: `/gig/${ids.gig}/scan`, async run(page, L) {
    await page.getByRole('radio', { name: L('dispatch.dir.in') }).click()
    return page.getByText(L('dispatch.damaged')).first()
  } },
  maintenance: { persona: 'pm', url: `/org/${ids.org}/inventory?tab=maintenance`, async run(page, L) {
    return page.getByRole('button', { name: L('repair.new') }).first()
  } },
  'sub-form': { persona: 'pm', url: `/org/${ids.org}/inventory?tab=subrentals`, async run(page, L) {
    await page.getByRole('button', { name: L('sub.new') }).first().click()
    await page.waitForTimeout(400)
    return null
  } },
  reports: { persona: 'pm', url: `/org/${ids.org}/inventory?tab=reports`, async run(page, L) {
    return page.getByRole('button', { name: L('report.csv') }).first()
  } },

  // Office
  'company-details': { persona: 'pm', url: `/org/${ids.org}/quotes?company=1`, async run() {
    await page_wait()
    return null
  } },
  'price-list': { persona: 'pm', url: `/org/${ids.org}/quotes?tab=prices`, async run(page, L) {
    return page.getByRole('button', { name: L('prices.add') }).first()
  } },
  'quote-phases': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    return page.getByRole('button', { name: L('quote.addPhase') }).first()
  } },
  'quote-versions': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('button', { name: L('quoteVersions.button') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder(L('quoteVersions.notePlaceholder')).fill(page.lang === 'pt' ? 'Antes de mudar o som' : 'Before changing the audio')
    return dialog.getByRole('button', { name: L('quoteVersions.save') })
  } },
  'send-quote': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('button', { name: L('send.button') }).first().click()
    return page.getByRole('dialog').getByRole('button', { name: L('send.sendEmail') })
  } },
  'quote-gig': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('button', { name: L('plan.button') }).first().click()
    await page.waitForTimeout(500)
    return page.getByRole('dialog').getByRole('button', { name: /^\S/ }).last()
  } },

  // Admins
  members: { persona: 'pm', url: `/org/${ids.org}?panel=members`, async run(page, L) {
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(L('common.email'), { exact: true }).fill('marco@example.com')
    return dialog.getByRole('button', { name: L('common.invite'), exact: true }).locator('xpath=..')
  } },
  'orgs-mute': { persona: 'pm', url: '/orgs', async run(page, L) {
    return page.getByRole('button', { name: L('mute.muteNamed', { name: 'Lumen and Pixel' }) }).first()
  } },
  'gig-danger': { persona: 'pm', url: `/gig/${ids.gig}`, async run(page, L) {
    await page.getByRole('button', { name: L('gig.edit') }).first().click()
    const dialog = page.getByRole('dialog')
    const zone = dialog.getByRole('button', { name: new RegExp(L('danger.zone')) })
    await zone.click()
    return dialog.getByRole('button', { name: L('danger.deleteGig') })
  } },
  'export-account': { persona: 'pm', url: '/me?panel=account', async run(page, L) {
    return page.getByRole('button', { name: L('account.export') }).first()
  } },
}

async function page_wait() { await new Promise(r => setTimeout(r, 400)) }

function dayFromNow(n) { return new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10) }

const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

async function newPhone(browser, persona, lang) {
  const data = sampleData(persona, lang)
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    locale: lang === 'pt' ? 'pt-PT' : 'en-GB', timezoneId: 'Europe/Lisbon',
  })
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: data.me, exp: 4102444800, role: 'authenticated' })}.sig`
  await ctx.addInitScript(([token, user, l, key, theme]) => {
    localStorage.setItem('avx.lang', l)
    localStorage.setItem('avx.appearance', JSON.stringify({ theme }))
    // The first-steps card would sit above everything in every picture: hide it
    for (const scope of ['me', '22222222-2222-4222-8222-222222222222']) localStorage.setItem(`avx.firstSteps.${user.id}.${scope}`, '1')
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }))
  }, [jwt, data.user, lang, `sb-${new URL(SB).hostname.split('.')[0]}-auth-token`, THEME])
  await ctx.route(`${SB}/**`, route => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' })
    if (p.startsWith('/auth/v1/user')) return respond(route, data.user)
    if (p.startsWith('/auth/v1/')) return respond(route, {})
    if (p.startsWith('/storage/')) return respond(route, { signedURL: '/x' })
    if (p.startsWith('/functions/')) return respond(route, {})
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*', 'content-range': '0-0/0' }, body: '' })
    if (req.method() !== 'GET' && !p.startsWith('/rest/v1/rpc/')) return respond(route, single ? {} : [])
    if (p.startsWith('/rest/v1/rpc/')) return respond(route, data.rpc[p.slice('/rest/v1/rpc/'.length)] ?? [])
    let rows = applyFilters(data.tables[p.slice('/rest/v1/'.length)] || [], url.searchParams)
    if (p === '/rest/v1/messages') rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)) // newest first, as the app asks
    return respond(route, single ? rows[0] ?? null : rows)
  })
  return { ctx, data }
}

async function outline(page, target) {
  await target.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const box = await target.boundingBox()
  if (!box) throw new Error('Nothing to outline')
  await page.evaluate(b => {
    const d = document.createElement('div')
    Object.assign(d.style, {
      position: 'fixed', left: `${b.x - 5}px`, top: `${b.y - 5}px`, width: `${b.width + 10}px`, height: `${b.height + 10}px`,
      border: '3px solid #FFD60A', borderRadius: '12px', boxShadow: '0 0 0 4px rgba(255,214,10,0.25)', zIndex: 2147483647, pointerEvents: 'none',
    })
    document.body.appendChild(d)
  }, box)
}

// Only the pictures some guide uses (the guide list is read through Vite, as the app reads it)
const loader = await createServer({ root, logLevel: 'warn', server: { middlewareMode: true }, appType: 'custom' })
const { GUIDES } = await loader.ssrLoadModule('/src/help/index.js')
await loader.close()
const wanted = [...new Set(Object.values(GUIDES).flatMap(g => g.shots).filter(Boolean))].filter(s => only.some(o => s.includes(o)))
const unknown = wanted.filter(s => !SCENES[s])
if (unknown.length) throw new Error(`No scene for: ${unknown.join(', ')}`)

process.env.VITE_SUPABASE_URL = SB
process.env.VITE_SUPABASE_ANON_KEY = 'help-screens'
process.env.VITE_SENTRY_DSN = ''
console.log('Building the app with sample data…')
await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } })
const server = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { port: PORT, strictPort: true } })
const executablePath = process.env.PW_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const failed = []
fs.rmSync(path.join(root, 'node_modules/.help-screens-failed'), { recursive: true, force: true })
for (const lang of ['pt', 'en']) {
  // Date and time fields follow the browser's language, not the page's, so one browser per language
  const locale = lang === 'pt' ? 'pt_PT' : 'en_GB'
  const browser = await chromium.launch({ executablePath, args: [`--lang=${locale.replace('_', '-')}`], env: { ...process.env, LANG: `${locale}.UTF-8`, LANGUAGE: locale } })
  try {
    fs.mkdirSync(path.join(SHOTS || path.join(root, 'public/help/shots'), lang), { recursive: true })
    for (const shot of wanted) {
      const scene = SCENES[shot]
      const { ctx } = await newPhone(browser, scene.persona, lang)
      const page = await ctx.newPage()
      page.lang = lang
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      try {
        await page.goto(`http://localhost:${PORT}${scene.url}`)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)
        const target = await scene.run(page, (k, v) => label(lang, k, v), ctx)
        if (target) await outline(page, target)
        await page.waitForTimeout(200)
        await page.screenshot({ path: path.join(SHOTS || path.join(root, 'public/help/shots'), lang, `${shot}.jpg`), type: 'jpeg', quality: 72 })
        console.log(`  ${lang}/${shot}.jpg${errors.length ? `  (page errors: ${errors.join(' | ')})` : ''}`)
      } catch (err) {
        // What the screen looked like when it failed, to see why
        const seen = path.join(root, 'node_modules/.help-screens-failed', `${lang}-${shot}.png`)
        await page.screenshot({ path: seen }).catch(() => {})
        failed.push(`${lang}/${shot}: ${err.message.split('\n')[0]} (screen: ${path.relative(root, seen)})${errors.length ? ` page errors: ${errors.join(' | ')}` : ''}`)
      } finally {
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
  }
}
await new Promise(resolve => server.httpServer.close(resolve))
if (failed.length) {
  console.error(`\n${failed.length} picture(s) failed:\n  ${failed.join('\n  ')}`)
  process.exit(1)
}
console.log('Done.')
