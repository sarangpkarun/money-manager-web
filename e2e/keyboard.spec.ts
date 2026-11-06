import { expect, test, type Locator, type Page } from '@playwright/test'
import { createUser, deleteUser, login, type E2EUser } from './helpers'

/**
 * Quick Add is a full-height form sheet. The keyboard never moves or resizes it; it covers the lower part, where Save lives.
 * A desktop browser cannot raise the iPhone keyboard, so these tests publish the same CSS variable the app does (--kb, see
 * lib/visualViewport.ts) and check the layout contract. The real keyboard is checked by hand on the phone.
 */
let user: E2EUser
test.beforeEach(async () => { user = await createUser('kb') })
test.afterEach(async () => { await deleteUser(user.id) })

const KEYBOARD = 336 // a typical iPhone number pad with its accessory bar
const VIEWPORT = 844

const raiseKeyboard = (page: Page) => page.evaluate((kb) => { document.documentElement.style.setProperty('--kb', `${kb}px`); document.documentElement.dataset.keyboard = 'open' }, KEYBOARD)
const lowerKeyboard = (page: Page) => page.evaluate(() => { document.documentElement.style.removeProperty('--kb'); delete document.documentElement.dataset.keyboard })

const sheetBox = async (page: Page) => (await page.getByRole('dialog').boundingBox())!
/** The sheet slides in with an animation: wait until its top edge has settled. */
async function openQuickAdd(page: Page) {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(async () => Math.round((await sheetBox(page)).y + (await sheetBox(page)).height)).toBe(VIEWPORT)
}
const bottomOf = async (l: Locator) => { const b = (await l.boundingBox())!; return Math.round(b.y + b.height) }

test('the form is full height and does not move or resize when the keyboard opens', async ({ page }) => {
  await login(page, user)
  await openQuickAdd(page)
  const before = await sheetBox(page)
  expect(before.y).toBeLessThan(40)                       // starts just below the status bar
  expect(Math.round(before.y + before.height)).toBe(VIEWPORT)
  expect(before.height).toBeGreaterThan(VIEWPORT - 60)    // almost the whole screen

  await raiseKeyboard(page)
  await page.waitForTimeout(150)
  const during = await sheetBox(page)
  expect(Math.round(during.y)).toBe(Math.round(before.y))
  expect(Math.round(during.height)).toBe(Math.round(before.height))
})

test('Save sits at the bottom of the screen (below the keyboard line), is not sticky, and shows when the keyboard goes away', async ({ page }) => {
  await login(page, user)
  await openQuickAdd(page)
  const save = page.getByRole('button', { name: 'Save', exact: true })
  const sheet = await sheetBox(page)

  // short form: Save is pinned to the bottom of the sheet
  expect(Math.abs((await bottomOf(save)) - (VIEWPORT - 16))).toBeLessThan(40)

  // with the keyboard up it is under the keyboard, exactly as the native flow works: tap ✓ and it is there
  await raiseKeyboard(page)
  expect((await save.boundingBox())!.y).toBeGreaterThan(VIEWPORT - KEYBOARD)
  await lowerKeyboard(page)
  expect(await bottomOf(save)).toBeLessThanOrEqual(VIEWPORT)
  expect((await save.boundingBox())!.y).toBeGreaterThan(sheet.y)

  // not sticky: it is the last item of the form, not a floating footer
  const position = await save.evaluate((el) => { let p = '', e: Element | null = el; while (e && !p.includes('sticky')) { p = window.getComputedStyle(e).position; e = e.parentElement } return p })
  expect(position).not.toBe('sticky')
})

test('with the keyboard up the form can be scrolled so any field, and Save, can be brought above the keyboard', async ({ page }) => {
  await login(page, user)
  await openQuickAdd(page)
  await page.getByRole('radio', { name: 'Lent' }).click() // the longest form
  await raiseKeyboard(page)
  const body = page.getByRole('dialog').locator('.sheet-body')
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight })
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect.poll(async () => bottomOf(save)).toBeLessThanOrEqual(VIEWPORT - KEYBOARD + 1)
  await lowerKeyboard(page)
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight })
  await expect(save).toBeVisible()
})

test('pulling the sheet down closes it, from the handle and from the content, and takes the keyboard away first', async ({ page }) => {
  await login(page, user)
  await openQuickAdd(page)
  await expect(page.getByLabel('Amount')).toBeFocused() // the keypad is up

  const drag = async (fromY: number) => {
    await page.mouse.move(195, fromY)
    await page.mouse.down()
    for (let y = fromY; y <= fromY + 420; y += 30) await page.mouse.move(195, y)
    await page.mouse.up()
  }
  // from the handle at the top
  const top = await sheetBox(page)
  await drag(top.y + 8)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // again, from the form content while it is scrolled to the top
  await openQuickAdd(page)
  const second = await sheetBox(page)
  await drag(second.y + 120)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the keyboard is dismissed as soon as a pull starts', async ({ page }) => {
  await login(page, user)
  await openQuickAdd(page)
  await expect(page.getByLabel('Amount')).toBeFocused()
  const top = await sheetBox(page)
  await page.mouse.move(195, top.y + 8)
  await page.mouse.down()
  await page.mouse.move(195, top.y + 40)
  await page.mouse.move(195, top.y + 80)
  await expect(page.getByLabel('Amount')).not.toBeFocused()
  await page.mouse.up()
})

test('a visible Close button does the same as pulling down', async ({ page }) => {
  await login(page, user)
  await openQuickAdd(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('detail sheets stay ordinary bottom sheets (no full-height, no close button)', async ({ page }) => {
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially('50')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added ₹50' })).toBeVisible()
  await page.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await page.getByRole('button', { name: /open details/ }).first().click()
  const d = page.getByRole('dialog')
  await expect(d).toHaveAttribute('data-size', 'auto')
  expect((await d.boundingBox())!.height).toBeLessThan(VIEWPORT * 0.92 + 1)
  await expect(d.getByRole('button', { name: 'Close' })).toHaveCount(0)
})
