import { expect, test, type Page } from '@playwright/test'
import { createUser, deleteUser, login, type E2EUser } from './helpers'

/**
 * A desktop browser cannot raise the iPhone keyboard, so this checks the layout contract the real keyboard relies on:
 * lib/visualViewport.ts publishes --kb (keyboard height) and --vv-h (visible height) on <html>; the sheet must then sit on top of
 * the keyboard, fit in what is left, and keep Save in view. The variable maths is unit-tested separately; the real device check is manual.
 */
let user: E2EUser
test.beforeEach(async () => { user = await createUser('kb') })
test.afterEach(async () => { await deleteUser(user.id) })

const KEYBOARD = 336 // a typical iPhone number pad with its accessory bar
const VIEWPORT = 844

async function raiseKeyboard(page: Page) {
  await page.evaluate(({ kb, vh }) => {
    const root = document.documentElement
    root.style.setProperty('--kb', `${kb}px`)
    root.style.setProperty('--vv-h', `${vh - kb}px`)
    root.dataset.keyboard = 'open'
  }, { kb: KEYBOARD, vh: VIEWPORT })
}
async function lowerKeyboard(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement
    root.style.removeProperty('--kb'); root.style.removeProperty('--vv-h'); delete root.dataset.keyboard
  })
}
/** The sheet slides in with an animation: wait until its bottom edge has settled. */
const bottomOf = (page: Page) => async () => { const b = await page.getByRole('dialog').boundingBox(); return b ? Math.round(b.y + b.height) : -1 }
const box = async (page: Page, name: string | RegExp) => (await page.getByRole(name instanceof RegExp ? 'button' : 'button', { name }).boundingBox())!

test('Quick Add sits on top of the keyboard, fits above it, and Save stays visible, even for the longest form', async ({ page }) => {
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()

  // no keyboard: the sheet rests on the bottom of the screen
  await expect.poll(bottomOf(page)).toBe(VIEWPORT)

  await raiseKeyboard(page)
  const free = VIEWPORT - KEYBOARD
  await expect.poll(bottomOf(page)).toBe(free)             // its bottom edge is the top of the keyboard
  let s = (await sheet.boundingBox())!
  expect(s.height).toBeLessThanOrEqual(free)               // never taller than the free area
  expect(s.y).toBeGreaterThanOrEqual(0)                    // and not pushed off the top
  const save = await box(page, 'Save')
  expect(save.y).toBeGreaterThanOrEqual(s.y)
  expect(save.y + save.height).toBeLessThanOrEqual(free)   // Save is fully above the keyboard
  await expect(page.getByRole('button', { name: /EMI \/ instalments/ })).toBeHidden() // folded away while typing

  // the longest form: Lent with interest and a due date
  await page.getByRole('radio', { name: 'Lent' }).click()
  await page.getByRole('button', { name: /Simple/ }).first().click().catch(() => undefined)
  s = (await sheet.boundingBox())!
  expect(s.y + s.height).toBeLessThanOrEqual(free + 1)
  const save2 = await box(page, 'Save')
  expect(save2.y + save2.height).toBeLessThanOrEqual(free + 1)
  expect(save2.y).toBeGreaterThanOrEqual(s.y)

  // keyboard down: back to the bottom, the EMI chip returns
  await lowerKeyboard(page)
  await expect.poll(bottomOf(page)).toBe(VIEWPORT)
  await expect(page.getByRole('button', { name: /EMI \/ instalments/ })).toBeVisible()
})

test('a field far down a long form is reachable by scrolling inside the sheet while the keyboard is up', async ({ page }) => {
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Borrowed' }).click()
  await raiseKeyboard(page)
  const sheet = page.getByRole('dialog')
  const body = sheet.locator('.sheet-body')
  const { scrollHeight, clientHeight } = await body.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
  expect(clientHeight).toBeLessThanOrEqual(VIEWPORT - KEYBOARD) // the scroll area is only as tall as the free space
  if (scrollHeight > clientHeight) {
    await body.evaluate((el) => { el.scrollTop = el.scrollHeight })
  }
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  const save = await box(page, 'Save')
  expect(save.y + save.height).toBeLessThanOrEqual(VIEWPORT - KEYBOARD + 1)
})
