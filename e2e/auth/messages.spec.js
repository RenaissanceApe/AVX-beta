// Messages and notifications (AT2): mostly two accounts talking to each other. The owner's manual
// lines T2, T12–T15, T17 and T18 (docs/PENDING.md section 2); what still needs a person is listed
// in docs/notes/AT2.md. docs/TESTING.md, "Automated test suite".
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { RUN } from './accounts.js'

test.use({ area: 'messages' })

// Each test writes its own words, so a test run twice (or after another) finds only its own messages
const words = what => `${what} ${RUN} ${Date.now().toString(36)}`

const composer = page => page.getByRole('textbox', { name: 'Write a message…' })
const chatRow = (page, text) => page.locator('.chat-row', { hasText: text })

async function send(page, text) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chatRow(page, text)).toBeVisible({ timeout: 15_000 })
}

// The ⋯ menu of a message (its buttons are faint until hover, but always there)
async function menuOf(page, text) {
  const row = chatRow(page, text)
  await row.hover()
  await row.getByRole('button', { name: /^More for / }).click()
  return row.getByRole('menu')
}

// covers: T2
test('two people message each other directly, reply and mute', { tag: ['@smoke', '@messages'] }, async ({ adminWithOrg, member }) => {
  const { page } = adminWithOrg
  const hello = words('Hello from the admin')
  await page.goto(`/messages?to=${member.account.id}`)
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  const conversation = page.getByRole('region', { name: member.account.name })
  await expect(conversation).toBeVisible({ timeout: 15_000 })
  await send(page, hello)
  await expectAccessible(page)

  // The member finds it in Messages and answers with a reply to it
  const other = member.page
  await other.goto('/messages')
  await other.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(adminWithOrg.account.name) }).click()
  await expect(chatRow(other, hello)).toBeVisible({ timeout: 15_000 })
  await chatRow(other, hello).hover()
  await chatRow(other, hello).getByRole('button', { name: `Reply to ${adminWithOrg.account.name}` }).click()
  await expect(other.getByText(`Replying to ${adminWithOrg.account.name}`)).toBeVisible()
  const answer = words('Hello back from the member')
  await send(other, answer)
  // The reply quotes the message it answers
  await expect(chatRow(other, answer)).toContainText(hello)

  // It arrives on the admin's side (live, without reloading)
  await expect(chatRow(page, answer)).toBeVisible({ timeout: 20_000 })

  // Mute, and the list shows it's muted; unmute again
  await page.getByRole('button', { name: 'Mute this conversation' }).click()
  await expect(page.getByText("Muted. You won't be notified about new messages here.")).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(member.account.name) }).getByLabel('Muted')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Unmute this conversation' }).click()
  await expect(page.getByText("Unmuted. You'll be notified again.")).toBeVisible()
})

// covers: T2
test('the gig chat: crew and manager talk, and a venue change is posted in it', { tag: '@messages' }, async ({ adminWithOrg, crewOnGig }) => {
  const { page, account } = adminWithOrg
  const gig = crewOnGig.gig
  const fromPm = words('Load-in at nine')
  await page.goto(`${gig.path}?tab=chat`)
  await send(page, fromPm)
  await expectAccessible(page)

  const crew = crewOnGig.page
  await crew.goto(`${gig.path}?tab=chat`)
  await expect(chatRow(crew, fromPm)).toBeVisible({ timeout: 15_000 })
  const fromCrew = words('See you there')
  await send(crew, fromCrew)
  await expect(chatRow(page, fromCrew)).toBeVisible({ timeout: 20_000 })

  // The venue changes (as the gig's edit form saves it); the chat says so
  const venue = words('E2E Hall')
  const { error } = await account.client.from('gigs').update({ venue }).eq('id', gig.id)
  expect(error).toBeNull()
  await crew.reload()
  await expect(crew.getByText(`${account.name} changed the venue to ${venue}`)).toBeVisible({ timeout: 15_000 })
})
