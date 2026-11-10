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
//   HELP_WIDTH=320 HELP_OUT=/tmp/x npm run help:screens      a narrower phone, saved elsewhere (to check it)
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

// A Rentman-style equipment export (Dutch headings), with two rows that have problems
const IMPORT_SAMPLE = 'Naam;Code;Categorie;Verhuurprijs;Gewicht;Aantal;Magazijn\nMAC Aura XB;AURA;Licht;80;13,5;;\nRobe Pointe;POINTE;Licht;95;15,2;;\nXLR 10 m;XLR10;Kabels;2,50;0,6;120;\nDMX 5-pin 5 m;DMX5;Kabels;2;0,4;60;Opslag Oost\nShure SM58;SM58;Microfoons;8;0,3;;\nDI Radial J48;J48;Microfoons;6;1,1;;'
// The same rows with a title line above the headings and a column AVX doesn't import (IM2: the
// heading row is suggested on Choose, "Not imported" listed on Match)
const IMPORT_TITLED = `Voorraadlijst maart\n${IMPORT_SAMPLE.split('\n').map((l, i) => `${l};${i ? (i === 1 ? 'Nieuw' : '') : 'Opmerking'}`).join('\n')}`
// Upcoming jobs as Rentman exports them (dates are made relative to today when the script runs)
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const JOBS_SAMPLE = `Projectnummer;Projectnaam;Startdatum;Einddatum;Locatie;Status;Klant\nP-2101;Festival Lumière;${day(20)};${day(22)};Porto;Bevestigd;Festival Lumière\nP-2102;Gala Sintra;${day(35)};${day(35)};Sintra;Optie;Sintra Town Council\nP-1988;Congress 2025;2025-03-10;2025-03-12;Lisboa;Afgerond;\nP-2103;Product launch;${day(41)};${day(41)};Lisboa;Geannuleerd;`
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
    // The viewer's own call: the CallChip with the accent key cell, under their function in the gig header
    return page.getByTitle(L('crew.call', { time: '08:00' }), { exact: true }).first().locator('xpath=..')
  } },
  'schedule-callsheet': { persona: 'crew', url: `/gig/${ids.gig}?tab=schedule`, async run(page, L) {
    return page.getByRole('button', { name: L('schedule.callSheet') })
  } },
  'call-sheet': { persona: 'crew', url: `/gig/${ids.gig}/callsheet`, async run(page, L) {
    await page.getByText(L('callsheet.print')).waitFor()
    return null
  } },
  'call-sheet-large': { persona: 'crew', url: `/gig/${ids.gig}/callsheet`, async run(page, L) {
    await page.getByRole('button', { name: L('callsheet.large') }).click()
    return page.getByRole('button', { name: L('callsheet.large') })
  } },
  'call-sheet-send': { persona: 'pm', url: `/gig/${ids.gig}/callsheet`, async run(page, L) {
    return page.getByRole('button', { name: L('callsheet.publish') })
  } },
  'more-availability': { persona: 'crew', url: '/me', async run(page, L) {
    await page.locator('.shell-tabs').getByRole('button', { name: L('nav.more') }).click()
    return page.getByRole('dialog').getByRole('link', { name: new RegExp(L('nav.availability')) })
  } },
  unavailable: { persona: 'crew', url: '/settings/availability', async run(page, L) {
    await page.getByLabel(L('availability.from'), { exact: true }).fill(dayFromNow(60))
    return page.getByText(L('availability.title'), { exact: true }).locator('xpath=..')
  } },
  'calendar-feed': { persona: 'crew', url: '/settings/calendar', async run(page, L) {
    await page.getByRole('button', { name: L('calFeed.show') }).click()
    await page.getByRole('link', { name: L('calFeed.google') }).waitFor()
    return page.locator('#feed-title').locator('xpath=..')
  } },
  push: { persona: 'crew', url: '/settings/notifications', async run(page, L) {
    return page.getByText(L('push.title'), { exact: true }).first().locator('xpath=ancestor::div[1]')
  } },
  requests: { persona: 'crew', url: '/me', async run(page, L) {
    await page.getByText(L('requests.title.one', { count: 1 })).waitFor()
    return page.locator('section[aria-labelledby="requests-title"]')
  } },
  appearance: { persona: 'crew', url: '/settings/preferences', async run(page, L) {
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
    await dialog.getByLabel(L('gigForm.venue'), { exact: true }).fill('Coliseu dos Recreios, Lisboa')
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
  'imp-choose': { persona: 'pm', url: `/org/${ids.org}/inventory/import`, async run(page, L) {
    await page.locator('#imp-paste').fill(IMPORT_TITLED)
    // The title line is noticed: "The headings are on row 2", suggested
    await page.locator('#imp-header-hint').waitFor()
    await page.locator('#imp-paste').evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('#imp-header-at')
  } },
  'imp-match': { persona: 'pm', url: `/org/${ids.org}/inventory/import`, async run(page, L) {
    await page.locator('#imp-paste').fill(IMPORT_TITLED)
    await page.locator('#imp-header-hint').waitFor()
    await page.getByRole('button', { name: L('imp.next') }).click()
    // The columns that won't be imported are listed under the matching
    const unused = page.getByRole('status').filter({ hasText: L('imp.notImported', { columns: 'Opmerking' }) })
    await unused.waitFor()
    return unused
  } },
  'imp-check': { persona: 'pm', url: `/org/${ids.org}/inventory/import`, async run(page, L) {
    await page.locator('#imp-paste').fill(IMPORT_SAMPLE)
    await page.getByRole('button', { name: L('imp.next') }).click()
    await page.getByRole('button', { name: L('imp.next') }).click()
    // The group for the location the file names but AVX doesn't have, with its fixes
    const group = page.locator('section[aria-labelledby="imp-problems"] section').filter({ hasText: 'Opslag Oost' })
    await group.waitFor()
    return group
  } },
  'imp-jobs': { persona: 'pm', url: `/org/${ids.org}/inventory/import?kind=gigs`, async run(page, L) {
    await page.locator('#imp-paste').fill(JOBS_SAMPLE)
    await page.getByRole('button', { name: L('imp.next') }).click()
    await page.getByRole('button', { name: L('imp.next') }).click()
    await page.locator('#imp-purpose').waitFor()
    return page.locator('div[role=status]').first().locator('xpath=..')
  } },
  'inv-locations': { persona: 'pm', url: `/org/${ids.org}/inventory?tab=locations`, async run(page, L) {
    return page.getByRole('button', { name: L('inv.addLocation') }).first()
  } },
  'item-units': { persona: 'pm', url: `/org/${ids.org}/inventory/${ids.speaker}`, async run(page, L) {
    return page.getByRole('button', { name: L('inv.addUnits') }).first()
  } },
  // Four of the speaker's units on medium labels, with the template's fields open (U5)
  labels: { persona: 'pm', url: `/org/${ids.org}/inventory/labels?units=${[0, 1, 3, 4].map(i => `cccc0000-0000-4000-8000-00000000000${i}`).join(',')}`, async run(page, L) {
    await page.getByRole('button', { name: L('labels.fields') }).click()
    return page.getByRole('button', { name: L('inv.print') }).first()
  } },
  'dispatch-out': { persona: 'pm', url: `/gig/${ids.gig}/scan`, async run(page, L) {
    await page.getByPlaceholder(L('dispatch.codePlaceholder')).fill('U-7KQ2M9XG')
    return page.getByPlaceholder(L('dispatch.codePlaceholder')).locator('xpath=ancestor::form[1]')
  } },
  'scan-mode': { persona: 'pm', url: `/gig/${ids.gig}/scan?mode=scan`, async run(page, L) {
    await page.getByPlaceholder(L('scanMode.typeCode')).fill('U-7KQ2M9XG')
    await page.getByPlaceholder(L('scanMode.typeCode')).press('Enter')
    return page.locator('section[aria-live]')
  } },
  'patch-boxes': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=patch`, async run(page, L) {
    return page.locator('section[aria-labelledby="box-0"]')
  } },
  'patch-fill': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=patch`, async run(page, L) {
    return page.getByRole('button', { name: L('patch.fill') })
  } },
  'dmx-form': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=dmx_patch`, async run(page, L) {
    await page.getByRole('button', { name: L('dmx.add') }).first().click()
    return page.getByRole('dialog')
  } },
  'dmx-list': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=dmx_patch`, async run(page, L) {
    return page.locator('#universe-1').locator('..')
  } },
  'system-sources': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=system_calc`, async run(page, L) {
    const card = page.locator('section[aria-labelledby="sys-sources"] li').nth(3)
    await card.waitFor()
    return card
  } },
  'system-listeners': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=system_calc`, async run(page, L) {
    return page.locator('section[aria-labelledby="sys-listeners"]')
  } },
  'light-bar': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=light_plot`, async run(page, L) {
    await page.locator('#light-bars').locator('..').getByRole('button').first().click()
    return page.getByRole('group').filter({ has: page.locator('#bar-name') })
  } },
  'light-plot': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=light_plot`, async run(page, L) {
    const drawing = page.locator('section[aria-labelledby="light-plot-title"] svg[role="group"]')
    await drawing.waitFor()
    await drawing.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return drawing
  } },
  'light-power': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=light_plot`, async run(page, L) {
    return page.locator('section[aria-labelledby="light-power"]')
  } },
  'mvr-match': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=light_plot`, async run(page, L) {
    // The sample MVR made from the standard (scripts/mvr-samples.mjs)
    await page.getByRole('button', { name: L('mvr.import') }).click()
    await page.locator('#mvr-file').setInputFiles(path.join(root, 'docs/samples/mvr/vectorworks-style.mvr'))
    const match = page.locator('section[aria-labelledby="mvr-match"]')
    await match.waitFor()
    return match
  } },
  'plot-drawing': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=stage_plot`, async run(page, L) {
    const drawing = page.locator('section[aria-labelledby="stage-plot-title"] svg[role="group"]')
    await drawing.waitFor()
    await drawing.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return drawing
  } },
  'plot-list': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=stage_plot`, async run(page, L) {
    return page.locator('section[aria-labelledby="on-stage"]')
  } },
  'plot-to-inputs': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=stage_plot`, async run(page, L) {
    return page.getByRole('button', { name: L('plot.toInputs') })
  } },
  'tools-add': { persona: 'pm', url: `/gig/${ids.gig}`, async run(page, L) {
    return page.getByRole('tab', { name: L('gig.tab.tools') })
  } },
  'input-form': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=input_list`, async run(page, L) {
    await page.getByRole('button', { name: L('inputs.add') }).first().click()
    return page.getByRole('dialog')
  } },
  'input-list': { persona: 'pm', url: `/gig/${ids.gig}?tab=tools&tool=input_list`, async run(page, L) {
    await page.getByText('Beta 91A').first().waitFor()
    return page.locator('section[aria-labelledby="input-list-title"] ol > li').first()
  } },
  'step-picker': { persona: 'pm', url: `/gig/${ids.gig}/scan`, async run(page, L) {
    await page.getByRole('radio', { name: L('steps.name.prepped') }).click()
    return page.getByRole('radiogroup', { name: L('steps.picker') })
  } },
  'step-bars': { persona: 'pm', url: `/gig/${ids.gig}?tab=equipment`, async run(page, L) {
    await page.getByText(L('steps.name.checked_in')).first().waitFor()
    return page.locator('section[aria-labelledby="step-bars"]')
  } },
  'packing-steps': { persona: 'pm', url: `/gig/${ids.gig}/packing`, async run(page, L) {
    return page.getByRole('columnheader', { name: L('packing.step') }).first()
  } },
  'org-steps': { persona: 'pm', url: `/org/${ids.org}?panel=settings`, async run(page, L) {
    const section = page.locator('section[aria-labelledby="org-steps"]')
    await section.scrollIntoViewIfNeeded()
    return section
  } },
  'dispatch-in': { persona: 'pm', url: `/gig/${ids.gig}/scan`, async run(page, L) {
    await page.getByRole('radio', { name: L('steps.name.returned') }).click()
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
  reports: { persona: 'pm', url: `/org/${ids.org}/reports?tab=equipment&view=use`, async run(page, L) {
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
  contacts: { persona: 'pm', url: `/org/${ids.org}/contacts`, async run(page, L) {
    return page.getByRole('list').filter({ hasText: 'Marcolino' }).first()
  } },
  'quote-client': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('tab', { name: L('quote.tab.details') }).first().click()
    await page.locator('#qd-client').evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('fieldset').first()
  } },
  'quote-phases': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    return page.getByRole('button', { name: L('quote.addPhase') }).first()
  } },
  'quote-versions': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    // DR4: Versions is in the quote's ⋯ menu
    await page.getByRole('button', { name: L('common.moreActions'), exact: true }).click()
    await page.getByRole('menuitem', { name: L('quoteVersions.button') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder(L('quoteVersions.notePlaceholder')).fill(page.lang === 'pt' ? 'Antes de mudar o som' : 'Before changing the audio')
    return dialog.getByRole('button', { name: L('quoteVersions.save') })
  } },
  'send-quote': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('button', { name: L('send.button') }).first().click()
    return page.getByRole('dialog').getByRole('button', { name: L('send.sendEmail') })
  } },
  'quote-gig': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('button', { name: L('common.moreActions'), exact: true }).click()
    await page.getByRole('menuitem', { name: L('plan.button') }).click()
    await page.waitForTimeout(500)
    return page.getByRole('dialog').getByRole('button', { name: /^\S/ }).last()
  } },

  // Admins
  members: { persona: 'pm', url: `/org/${ids.org}?panel=members`, async run(page, L) {
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(L('common.email'), { exact: true }).fill('marco@example.com')
    return dialog.getByRole('button', { name: L('common.invite'), exact: true }).locator('xpath=..')
  } },
  'jobs-board': { persona: 'crew', url: '/jobs', async run(page, L) {
    const first = page.locator('#jobs-found ~ ul > li').first()
    await first.waitFor()
    await first.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return first
  } },
  'org-jobs': { persona: 'pm', url: `/org/${ids.org}/jobs`, async run(page, L) {
    await page.getByRole('button', { name: L('jobs.applicants') }).first().click()
    const list = page.getByRole('list', { name: L('jobs.applicants') })
    await list.waitFor()
    const first = list.locator('li').first()
    await first.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return first
  } },
  'org-labels': { persona: 'pm', url: `/org/${ids.org}?panel=settings`, async run(page) {
    const box = page.locator('section[aria-labelledby="org-labels"]')
    await box.waitFor()
    await box.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return null
  } },
  'org-rates': { persona: 'pm', url: `/org/${ids.org}?panel=settings`, async run(page) {
    const box = page.locator('section[aria-labelledby="org-rates"]')
    await box.waitFor()
    await box.locator('li').first().waitFor()
    await box.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return null
  } },
  'gig-labour': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page) {
    const box = page.locator('section[aria-labelledby="labour-title"]')
    await box.waitFor()
    await box.evaluate(el => window.scrollTo(0, document.documentElement.scrollHeight))
    return null
  } },
  'hours-log': { persona: 'crew', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    await page.getByRole('button', { name: L('hours.log') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#hours-start').waitFor()
    return dialog.locator('#hours-end')
  } },
  // K8: crew numbers (Carla)
  'my-numbers-tiles': { persona: 'crew', url: '/me', async run(page) {
    const box = page.locator('section[aria-labelledby="my-numbers-strip"]')
    await box.locator('li').first().waitFor()
    return box
  } },
  'my-numbers': { persona: 'crew', url: '/me/numbers', async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await page.locator('section[aria-labelledby="mn-companies"]').evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('section[aria-labelledby="mn-companies"]')
  } },
  'fee-paid': { persona: 'crew', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    const button = page.getByRole('button', { name: L('labour.markReceived') })
    await button.waitFor()
    await button.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return button
  } },
  'year-statement': { persona: 'crew', url: '/me/numbers/statement', async run(page) {
    const table = page.locator('table').first()
    await table.locator('tfoot').waitFor()
    return null
  } },
  'gig-hours': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    const box = page.locator('section[aria-labelledby="hours-title"]')
    await box.waitFor()
    const approve = box.getByRole('button', { name: L('hours.approve') }).first()
    await approve.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return approve
  } },
  'org-hours': { persona: 'pm', url: `/org/${ids.org}/hours`, async run(page) {
    const d = new Date(Date.now() + 24 * 86400000)
    await page.locator('#hours-month').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    const first = page.locator('li button[aria-expanded]').first()
    await first.waitFor()
    await first.click()
    return first
  } },
  'leave-ask': { persona: 'pm', url: `/org/${ids.org}/leave`, async run(page, L) {
    await page.getByRole('button', { name: L('leave.ask') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#leave-type').selectOption('holiday')
    await dialog.getByLabel(L('availability.from'), { exact: true }).fill(dayFromNow(40))
    await dialog.getByLabel(L('availability.to'), { exact: true }).fill(dayFromNow(44))
    return dialog.getByRole('button', { name: L('leave.send') })
  } },
  'leave-requests': { persona: 'pm', url: `/org/${ids.org}/leave`, async run(page, L) {
    const box = page.locator('section[aria-labelledby="leave-requests"]')
    await box.waitFor()
    return box.getByRole('button', { name: L('leave.approve') }).first()
  } },
  'leave-balances': { persona: 'pm', url: `/org/${ids.org}/leave`, async run(page) {
    const box = page.locator('section[aria-labelledby="leave-balances"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'start' }))
    return box
  } },
  'expenses-month': { persona: 'pm', url: `/org/${ids.org}/expenses`, async run(page, L) {
    await page.getByLabel(L('expenses.showDetails')).check()
    const box = page.locator('section[aria-labelledby="exp-list"]')
    await box.evaluate(el => el.scrollIntoView({ block: 'start' }))
    return box.locator('dl')
  } },
  'expense-add': { persona: 'pm', url: `/org/${ids.org}/expenses`, async run(page, L) {
    await page.getByRole('button', { name: L('expenses.add') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(L('expenses.description')).fill(page.lang === 'pt' ? 'Gasóleo da carrinha' : 'Diesel for the van')
    await dialog.getByLabel(L('expenses.supplierName')).fill('Galp')
    await dialog.getByLabel(L('expenses.totalWithVat')).fill('100')
    const receipt = dialog.getByText(L('expenses.addReceipt'))
    await receipt.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return receipt
  } },
  'expense-claim': { persona: 'crew', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    await page.getByRole('button', { name: L('expenses.newClaim') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(L('expenses.description')).fill(page.lang === 'pt' ? 'Estacionamento no Coliseu' : 'Parking at the venue')
    await dialog.getByLabel(L('expenses.totalWithVat')).fill('12')
    const send = dialog.getByRole('button', { name: L('expenses.sendClaim') })
    await send.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return send
  } },
  'expense-approve': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    const box = page.locator('section[aria-labelledby="gig-expenses"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'start' }))
    return box.getByRole('button', { name: L('expenses.approve') }).first()
  } },
  'expense-recurring': { persona: 'pm', url: `/org/${ids.org}/expenses?view=recurring`, async run(page) {
    const box = page.locator('section[aria-labelledby="exp-recurring"]')
    await box.waitFor()
    return box.locator('ul')
  } },
  'invoices-list': { persona: 'pm', url: `/org/${ids.org}/invoices?view=all`, async run(page) {
    const list = page.locator('main ul').first()
    await list.waitFor()
    return list
  } },
  'invoice-new': { persona: 'pm', url: `/org/${ids.org}/invoices`, async run(page, L) {
    await page.getByRole('button', { name: L('invoice.newFromQuote') }).first().click()
    await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Q0143' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText(L('invoice.scope.deposit')).click()
    return dialog.locator('fieldset')
  } },
  'invoice-send': { persona: 'pm', url: `/org/${ids.org}/invoices`, async run(page, L) {
    await page.getByRole('button').filter({ hasText: L('invoice.draftName', { n: 3 }) }).first().click()
    const send = page.getByRole('dialog').getByRole('button', { name: L('invoice.markSent') })
    await send.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return send
  } },
  'invoicing-program': { persona: 'pm', url: `/org/${ids.org}/invoices`, async run(page) {
    const box = page.locator('section[aria-labelledby="program-title"]')
    await box.waitFor()
    return box
  } },
  'invoice-paid': { persona: 'pm', url: `/org/${ids.org}/invoices?view=unpaid`, async run(page, L) {
    await page.getByRole('button').filter({ hasText: 'FT 2026/44' }).first().click()
    const box = page.getByRole('dialog').locator('section[aria-labelledby="pay-inv2"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'invoice-repairs': { persona: 'pm', url: `/org/${ids.org}/invoices`, async run(page, L) {
    await page.getByRole('button').filter({ hasText: L('invoice.draftName', { n: 3 }) }).first().click()
    const box = page.getByRole('dialog').locator('section[aria-labelledby="inv-repairs"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'quote-invoices': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('tab', { name: L('quote.tab.summary') }).click()
    const box = page.locator('section[aria-labelledby="qi-title"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'reports-overview': { persona: 'pm', url: `/org/${ids.org}/reports`, async run(page) {
    const box = page.locator('section[aria-labelledby="rp-overview"]')
    await box.waitFor()
    return box.locator('ul')
  } },
  // K9: saved views, the monthly pack, the accountant's links and page, the weekly email setting
  'views-save': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&period=this_year`, async run(page, L) {
    await page.getByRole('button', { name: L('reports.views.save') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    return dialog.locator('form')
  } },
  'views-pinned': { persona: 'pm', url: `/org/${ids.org}/reports`, async run(page) {
    const box = page.locator('section[aria-labelledby="rp-views"]')
    await box.locator('ul').waitFor()
    return box
  } },
  'reports-pack': { persona: 'pm', url: `/org/${ids.org}/reports`, async run(page) {
    const box = page.locator('section[aria-labelledby="rp-pack"]')
    await box.waitFor()
    return box
  } },
  'accountant-links': { persona: 'pm', url: `/org/${ids.org}/reports`, async run(page) {
    const box = page.locator('section[aria-labelledby="rp-links"]')
    await box.locator('ul').waitFor()
    return box
  } },
  'accountant-page': { persona: 'pm', url: '/r/sample-link-token-not-real-0000', async run(page) {
    const table = page.locator('table').first()
    await table.waitFor()
    return table
  } },
  'weekly-numbers': { persona: 'pm', url: '/settings/notifications', async run(page, L) {
    const box = page.getByText(L('account.weeklyNumbers'))
    await box.waitFor()
    return box.locator('xpath=ancestor::label')
  } },
  'reports-revenue': { persona: 'pm', url: `/org/${ids.org}/reports?tab=revenue&period=last_12_months`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return fig
  } },
  'reports-details': { persona: 'pm', url: `/org/${ids.org}/reports?tab=revenue&period=last_12_months`, async run(page, L) {
    await page.getByLabel(L('reports.showDetails')).check()
    await page.locator('#rp-group').selectOption('client')
    const table = page.locator('table').last()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'gig-finance': { persona: 'pm', url: `/gig/${ids.gig}`, async run(page) {
    const box = page.locator('section[aria-labelledby="finance-title"]')
    await box.locator('dl').first().waitFor()
    await box.evaluate(el => window.scrollTo(0, document.documentElement.scrollHeight))
    return box
  } },
  'reports-margins': { persona: 'pm', url: `/org/${ids.org}/reports?tab=margins&period=last_12_months`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return fig
  } },
  'money-results': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&period=this_quarter`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'money-details': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&period=this_quarter`, async run(page, L) {
    await page.getByLabel(L('reports.showDetails')).check()
    const table = page.locator('table').last()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'money-margins': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&view=margins&by=client&period=this_quarter`, async run(page) {
    const table = page.locator('table').last()
    await table.waitFor()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'money-labour': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&view=labour&period=this_quarter`, async run(page) {
    const table = page.locator('table').last()
    await table.waitFor()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  // K4: Reports → Sales and the client numbers card in Contacts
  'sales-waiting': { persona: 'pm', url: `/org/${ids.org}/reports?tab=sales`, async run(page) {
    const box = page.locator('section[aria-labelledby="sl-follow"]')
    await box.locator('ul').waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'sales-winrate': { persona: 'pm', url: `/org/${ids.org}/reports?tab=sales&view=winrate&period=last_12_months`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'sales-clients': { persona: 'pm', url: `/org/${ids.org}/reports?tab=sales&view=clients&period=this_year`, async run(page) {
    const table = page.locator('table').last()
    await table.waitFor()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'client-numbers': { persona: 'pm', url: `/org/${ids.org}/contacts`, async run(page) {
    await page.getByRole('button', { name: /Marcolino/ }).first().click()
    const box = page.locator('section[aria-labelledby="cl-numbers"]')
    await box.locator('dl').waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  // K5: Reports → Equipment and the item page's numbers card (guide warehouse-equipment-money)
  'equip-profit': { persona: 'pm', url: `/org/${ids.org}/reports?tab=equipment`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'equip-details': { persona: 'pm', url: `/org/${ids.org}/reports?tab=equipment&by=category`, async run(page, L) {
    await page.getByLabel(L('reports.showDetails')).check()
    const table = page.locator('table').last()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'equip-payback': { persona: 'pm', url: `/org/${ids.org}/reports?tab=equipment&view=payback`, async run(page) {
    const table = page.locator('table').last()
    await table.waitFor()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'equip-buy': { persona: 'pm', url: `/org/${ids.org}/reports?tab=equipment&view=buy`, async run(page) {
    const table = page.locator('table').last()
    await table.waitFor()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'item-money': { persona: 'pm', url: `/org/${ids.org}/inventory/${ids.speaker}`, async run(page) {
    const box = page.locator('section[aria-labelledby="item-money"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  // K7: Reports → Operations and the gig wrap-up
  'ops-activity': { persona: 'pm', url: `/org/${ids.org}/reports?tab=operations&period=last_12_months`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'ops-people': { persona: 'pm', url: `/org/${ids.org}/reports?tab=operations&view=people`, async run(page, L) {
    await page.getByLabel(L('reports.showDetails')).check()
    const table = page.locator('table').last()
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'ops-staffing': { persona: 'pm', url: `/org/${ids.org}/reports?tab=operations&view=staffing`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'gig-wrapup': { persona: 'pm', url: `/gig/${ids.gig}/wrapup`, async run(page) {
    const box = page.locator('section[aria-labelledby="wu-hours"]')
    await box.waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
    return box
  } },
  // K6: Reports → Warehouse (guide warehouse-numbers)
  'wh-demand': { persona: 'pm', url: `/org/${ids.org}/reports?tab=warehouse`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'wh-suppliers': { persona: 'pm', url: `/org/${ids.org}/reports?tab=warehouse&view=suppliers`, async run(page, L) {
    await page.getByLabel(L('reports.showDetails')).check()
    const table = page.locator('table', { hasText: L('wh.perSupplier') })
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  'wh-damage': { persona: 'pm', url: `/org/${ids.org}/reports?tab=warehouse&view=damage`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('main').locator('div', { has: fig }).last()
  } },
  'wh-dispatch': { persona: 'pm', url: `/org/${ids.org}/reports?tab=warehouse&view=dispatch`, async run(page, L) {
    await page.getByLabel(L('reports.showDetails')).check()
    const table = page.locator('table', { hasText: L('wh.perGig') })
    await table.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return table
  } },
  // K3: Reports → Money, Cash / Spending / Forecast
  'money-cash': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&view=cash&period=this_quarter`, async run(page) {
    const fig = page.locator('figure').first()
    await fig.waitFor()
    await fig.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return page.locator('section[aria-labelledby="cash-position"]')
  } },
  'money-cash-details': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&view=cash&period=this_quarter`, async run(page) {
    const box = page.locator('section[aria-labelledby="cash-overdue"]')
    await box.locator('figure').waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'money-spending': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&view=spending&period=this_quarter`, async run(page) {
    const box = page.locator('section[aria-labelledby="sp-changes"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'money-forecast': { persona: 'pm', url: `/org/${ids.org}/reports?tab=money&view=forecast&period=this_quarter`, async run(page) {
    const box = page.locator('section[aria-labelledby="targets"]')
    await box.locator('ul').waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box.locator('ul')
  } },
  'home-key-numbers': { persona: 'pm', url: `/org/${ids.org}`, async run(page) {
    const box = page.locator('section[aria-labelledby="key-numbers"]')
    await box.locator('ul').waitFor()
    return box
  } },
  'crewcall-fee': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    await page.getByRole('button', { name: L('crewCall.button') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#cc-title').fill(page.lang === 'pt' ? 'Técnica de som' : 'Sound technician')
    const fee = dialog.locator('fieldset').first()
    await fee.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return fee
  } },
  'job-pay': { persona: 'pm', url: `/gig/${ids.gig}?tab=crew`, async run(page, L) {
    // Post a job sits in the Crew tab's own ⋯ (the header's ⋯ comes first)
    await page.getByRole('button', { name: L('common.moreActions') }).last().click()
    await page.getByRole('menuitem', { name: L('jobs.postButton') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#pj-title').fill(page.lang === 'pt' ? 'Técnica de som' : 'Sound technician')
    const pay = dialog.locator('fieldset').last()
    await pay.locator('#pj-amount').waitFor()
    await pay.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return pay
  } },
  'quote-crew-margin': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('tab', { name: page.lang === 'pt' ? 'Montagem' : 'Load-in' }).first().click()
    const line = page.getByText(page.lang === 'pt' ? 'Custo pela tabela' : 'Rate card cost').first()
    await line.waitFor()
    await line.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return line
  } },
  'quote-crew-total': { persona: 'pm', url: '/quote/q1', async run(page, L) {
    await page.getByRole('tab', { name: L('quote.tab.summary') }).first().click()
    const box = page.locator('section[aria-labelledby="crew-margin-title"]')
    await box.waitFor()
    await box.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return box
  } },
  'org-fields': { persona: 'pm', url: `/org/${ids.org}?panel=settings`, async run(page) {
    const box = page.locator('section[aria-labelledby="org-fields"]')
    await box.waitFor()
    await box.locator('li').first().waitFor()
    await box.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return null
  } },
  'org-verify': { persona: 'pm', url: `/org/${ids.org}?panel=settings`, async run(page) {
    const box = page.locator('section[aria-labelledby="org-verify-title"]')
    await box.waitFor()
    await page.locator('#vies-number').fill('500 000 000')
    await box.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return box
  } },
  'crewsearch-offer': { persona: 'pm', url: `/org/${ids.org}/crew?gig=${ids.gig}`, async run(page, L) {
    await page.getByRole('button', { name: L('crewSearch.search'), exact: true }).click()
    await page.getByRole('button', { name: L('crewSearch.offerNamed', { name: 'Rui Teixeira' }) }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#cs-offer-title').fill(page.lang === 'pt' ? 'Técnica de som' : 'Sound technician')
    const fee = dialog.locator('fieldset').first()
    await fee.evaluate(el => el.scrollIntoView({ block: 'center' }))
    return fee
  } },
  'crew-search': { persona: 'pm', url: `/org/${ids.org}/crew?gig=${ids.gig}`, async run(page, L) {
    await page.getByRole('button', { name: L('crewSearch.search'), exact: true }).click()
    const first = page.locator('#cs-results').locator('xpath=following-sibling::div[1]/div[1]')
    await first.waitFor()
    await first.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return first
  } },
  'rehearsal': { persona: 'crew', url: `/gig/${ids.gig}?tab=tools&tool=rehearsal&session=rs1`, async run(page, L) {
    const mark = page.getByRole('button', { name: L('rehearsal.mark') })
    await mark.waitFor()
    await page.locator('[role="timer"]').evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -190) })
    return null
  } },
  'gig-tasks': { persona: 'pm', url: `/gig/${ids.gig}?tab=tasks`, async run(page, L) {
    const first = page.getByRole('button', { name: /Tape the stage|Fita nos cabos/ })
    await first.click()
    return null
  } },
  'org-task-templates': { persona: 'pm', url: `/org/${ids.org}/tasks`, async run(page, L) {
    await page.getByRole('button', { name: L('tasks.new') }).first().click()
    const pick = page.getByLabel(L('tasks.fromTemplate'))
    await pick.selectOption({ label: L('taskTpl.namePlaceholder') })
    return pick
  } },
  'onsite': { persona: 'crew', url: `/gig/${ids.gig}`, async run(page, L) {
    // The sample gig is 24 days away: set the clock to its afternoon, then open it again
    await page.clock.setFixedTime(new Date(`${day(24)}T16:20:00`))
    await page.reload()
    await page.getByRole('heading', { name: L('onsite.title') }).waitFor()
    await page.getByRole('heading', { name: L('onsite.title') }).evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70) })
    return null
  } },
  'dmx-calc': { persona: 'crew', url: '/tools', async run(page, L) {
    await page.locator('#calc-address').fill('97')
    const box = page.locator('section[aria-labelledby="calc-dip"]')
    await box.evaluate(el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80) })
    return null
  } },
  'dmx-walk': { persona: 'crew', url: `/gig/${ids.gig}/dmx/walk?n=2`, async run(page, L) {
    await page.getByRole('button', { name: L('dmxWalk.next') }).waitFor()
    return page.getByRole('button', { name: L('dmxWalk.next') })
  } },
  'crew-profile': { persona: 'crew', url: '/me/profile', async run(page, L) {
    const preview = page.locator('section[aria-labelledby="cp-preview"]')
    await preview.scrollIntoViewIfNeeded()
    return preview
  } },
  'org-export': { persona: 'pm', url: `/org/${ids.org}?panel=settings`, async run(page, L) {
    const section = page.locator('section[aria-labelledby="org-export-title"]')
    await section.scrollIntoViewIfNeeded()
    return section
  } },
  'held-invites': { persona: 'pm', url: `/org/${ids.org}?panel=members`, async run(page, L) {
    const box = page.locator('section[aria-labelledby="held-title"]')
    await box.getByRole('checkbox').first().check()
    return box
  } },
  'orgs-mute': { persona: 'pm', url: '/orgs', async run(page, L) {
    return page.getByRole('button', { name: L('mute.muteNamed', { name: 'Lumen and Pixel' }) }).first()
  } },
  'gig-danger': { persona: 'pm', url: `/gig/${ids.gig}`, async run(page, L) {
    // On a phone Edit gig sits in the header's ⋯ menu
    await page.getByRole('button', { name: L('common.moreActions') }).first().click()
    await page.getByRole('menuitem', { name: L('gig.edit') }).click()
    const dialog = page.getByRole('dialog')
    const zone = dialog.getByRole('button', { name: new RegExp(L('danger.zone')) })
    await zone.click()
    return dialog.getByRole('button', { name: L('danger.deleteGig') })
  } },
  'export-account': { persona: 'pm', url: '/settings/data', async run(page, L) {
    return page.getByRole('button', { name: L('account.export') }).first()
  } },
}

async function page_wait() { await new Promise(r => setTimeout(r, 400)) }

function dayFromNow(n) { return new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10) }

const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

async function newPhone(browser, persona, lang) {
  const data = sampleData(persona, lang)
  const ctx = await browser.newContext({
    viewport: { width: Number(process.env.HELP_WIDTH) || 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
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
    if (p.startsWith('/functions/')) return respond(route, data.functions?.[p.split('/').pop()] ?? {})
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*', 'content-range': '0-0/0' }, body: '' })
    if (req.method() !== 'GET' && !p.startsWith('/rest/v1/rpc/')) return respond(route, single ? {} : [])
    if (p.startsWith('/rest/v1/rpc/')) {
      // A sample answer, or a function of the call's arguments (K2: finance_results by p_group)
      const answer = data.rpc[p.slice('/rest/v1/rpc/'.length)]
      let args = {}
      try { args = JSON.parse(req.postData() || '{}') } catch { /* no body */ }
      return respond(route, typeof answer === 'function' ? answer(args) : answer ?? [])
    }
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
