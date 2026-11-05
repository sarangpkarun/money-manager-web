import { expect, test, type Page } from '@playwright/test'
import { appToday, createUser, deleteUser, login, shiftDate, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('cal') })
test.afterEach(async () => { await deleteUser(user.id) })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
const monthIdx = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))

/** Moves the visible month to the one containing `date` (the month starts at today's month). */
async function showMonthOf(page: Page, today: string, date: string) {
  const diff = monthIdx(date) - monthIdx(today)
  for (let i = 0; i < Math.abs(diff); i++) await page.getByRole('button', { name: diff > 0 ? 'Next month' : 'Previous month' }).click()
}
const cell = (page: Page, date: string) => page.getByRole('button', { name: new RegExp(`^${short(date)}(,|$)`) })

async function borrow(page: Page, who: string, amount: string, months: string, first: string) {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Borrowed' }).click()
  await page.getByLabel('Amount').pressSequentially(amount)
  await page.getByLabel('Person').fill(who)
  await page.getByRole('button', { name: 'Repay in instalments' }).click()
  await page.getByLabel('Number of months').fill(months)
  await page.getByLabel('First instalment').fill(first)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: `in ${months} instalments` })).toBeVisible()
}

test('scenario B in the Calendar: #2 paid early shows a blue ✓ on its due date AND on the day it was paid', async ({ page }) => {
  const today = await appToday(user.id)
  await login(page, user)
  await borrow(page, 'Ravi', '50000', '10', shiftDate(today, 2))

  // pay #2 now (early)
  await page.getByRole('link', { name: 'Money' }).click()
  await page.getByRole('tab', { name: 'I owe' }).click()
  await page.getByRole('button', { name: /^Borrowed from Ravi/ }).click()
  await page.getByRole('button', { name: 'Pay instalment 2' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pay', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Instalments' })).toContainText('1 of 10 paid')
  const secondDue = (await page.getByRole('region', { name: 'Instalments' }).getByRole('listitem').nth(1).textContent()) ?? ''
  expect(secondDue).toMatch(/Paid early/)
  await page.getByRole('link', { name: '‹ Money' }).click()

  await page.getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  // the day it was paid (today): blue ✓
  await expect(cell(page, today)).toHaveAccessibleName(/1 paid early/)
  await expect(cell(page, today).locator('[data-marker="paid_early"]')).toHaveCount(1)
  // #1 is due in 2 days: amber dot
  const first = shiftDate(today, 2)
  await showMonthOf(page, today, first)
  await expect(cell(page, first)).toHaveAccessibleName(/1 due/)
  // the due date of #2, one month after #1: blue ✓ again
  const [y, m, d] = first.split('-').map(Number) as [number, number, number]
  const nextIdx = y * 12 + (m - 1) + 1
  const second = `${Math.floor(nextIdx / 12)}-${String((nextIdx % 12) + 1).padStart(2, '0')}-${String(Math.min(d, new Date(Date.UTC(Math.floor(nextIdx / 12), (nextIdx % 12) + 1, 0)).getUTCDate())).padStart(2, '0')}`
  await showMonthOf(page, first, second)
  await expect(cell(page, second)).toHaveAccessibleName(/1 paid early/)
  await expect(cell(page, second).locator('[data-marker="paid_early"]')).toHaveCount(1)

  // the day sheet explains it, from the cached payload
  await cell(page, second).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('region', { name: 'Paid' })).toContainText(/Paid early \(\d+ days\)/)
  await expect(sheet.getByRole('region', { name: 'Paid' })).toContainText(`paid ${short(today)}`)
})

test('scenario D in the Calendar: row 3 paid two days late shows an amber ✓ on both dates; unpaid earlier rows are red', async ({ page }) => {
  const today = await appToday(user.id)
  const first = shiftDate(today, -16)
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByRole('radio', { name: 'Lent' }).click()
  await page.getByLabel('Amount').pressSequentially('2000')
  await page.getByLabel('Person').fill('Asha')
  await page.getByLabel('Date', { exact: true }).fill(first)
  await page.getByRole('button', { name: 'Repay in instalments' }).click()
  await page.getByRole('button', { name: 'Weekly' }).click()
  await page.getByLabel('Number of weeks').fill('4')
  await page.getByLabel('First week').fill(first)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'in 4 instalments' })).toBeVisible()

  await page.getByRole('link', { name: 'Money' }).click()
  await page.getByRole('button', { name: /^Lent to Asha/ }).click()
  await page.getByRole('button', { name: 'Pay instalment 3' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Receive', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Instalments' })).toContainText('Paid late (2 days)')
  await page.getByRole('link', { name: '‹ Money' }).click()

  await page.getByRole('link', { name: 'Calendar' }).click()
  const due3 = shiftDate(today, -2)
  await showMonthOf(page, today, due3)
  await expect(cell(page, due3)).toHaveAccessibleName(/1 paid late/)
  await expect(cell(page, due3).locator('[data-marker="paid_late"]')).toHaveCount(1)
  await showMonthOf(page, due3, today)
  await expect(cell(page, today)).toHaveAccessibleName(/1 paid late/)
  const row1 = shiftDate(today, -16)
  await showMonthOf(page, today, row1)
  await expect(cell(page, row1)).toHaveAccessibleName(/1 overdue/)
  await expect(cell(page, row1).locator('[data-marker="overdue"]')).toHaveCount(1)
})

test('day sheet: add a transaction with the day pre-filled, and a repeating task that moves when ticked (Undo restores)', async ({ page }) => {
  const today = await appToday(user.id)
  const day = `${today.slice(0, 8)}${today.endsWith('-20') ? '21' : '20'}`
  await login(page, user)
  await page.getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()

  // add a transaction on that day
  await cell(page, day).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction' }).click()
  const qa = page.getByRole('dialog')
  await expect(qa.getByLabel('Date')).toHaveValue(day)
  await qa.getByLabel('Amount').pressSequentially('77')
  await qa.getByRole('button', { name: /Food/ }).click()
  await qa.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added ₹77' })).toBeVisible()
  await expect(cell(page, day)).toHaveAccessibleName(/spent ₹77/)

  // a weekly task on that day
  await cell(page, day).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add note / task' }).click()
  const note = page.getByRole('dialog', { name: 'Add note or task' })
  await note.getByLabel('Title').fill('Water plants')
  await note.getByRole('button', { name: 'Weekly' }).click()
  await note.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Task added' })).toBeVisible()
  const sheet = page.getByRole('dialog', { name: /20|21/ })
  await expect(sheet.getByRole('region', { name: 'Notes & tasks' })).toContainText('Water plants')

  // tick: it moves a week; the original day no longer carries it
  await sheet.getByRole('checkbox', { name: 'Mark done: Water plants' }).click()
  const next = shiftDate(day, 7)
  await expect(page.getByRole('status').filter({ hasText: `next ${short(next)}` })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(cell(page, day)).not.toHaveAccessibleName(/task/)
  if (next.slice(0, 7) === day.slice(0, 7)) await expect(cell(page, next)).toHaveAccessibleName(/1 task/)

  // Undo brings it back
  await page.getByRole('status').filter({ hasText: 'Water plants' }).getByRole('button', { name: 'Undo' }).click()
  await expect(cell(page, day)).toHaveAccessibleName(/1 task/)
})

test('Agenda lists dues and tasks from Today and opens an entry', async ({ page }) => {
  const today = await appToday(user.id)
  await login(page, user)
  await borrow(page, 'Meera', '3000', '3', shiftDate(today, 3))
  await page.getByRole('link', { name: 'Calendar' }).click()
  await page.getByRole('tab', { name: 'Agenda' }).click()
  const agenda = page.getByLabel('Agenda')
  await expect(agenda.getByRole('region', { name: 'Today' })).toBeVisible()
  const item = agenda.getByRole('button', { name: /^Borrowed from Meera, instalment 1/ })
  await expect(item).toBeVisible()
  await item.click()
  await expect(page).toHaveURL(/\/money\/entry\//)
})

test('the calendar paints from the persisted cache with one request', async ({ page }) => {
  await login(page, user)
  await page.getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByRole('region', { name: 'Month totals' })).toBeVisible()
  await page.waitForTimeout(2500) // the persister is throttled to 1 s

  let calls = 0
  await page.route('**/rest/v1/rpc/calendar_month', async (route) => {
    calls++
    await new Promise((r) => setTimeout(r, 4000)) // a slow network must not delay the first paint
    await route.continue()
  })
  const t0 = Date.now()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Month totals' }).getByText('Spent')).toBeVisible({ timeout: 3500 })
  await expect(page.getByRole('grid')).toBeVisible()
  console.log(`cached Calendar painted in ${Date.now() - t0} ms (network held for 4000 ms)`)
  await page.waitForTimeout(3000) // long enough for the idle prefetch to try, which must reuse the in-flight request
  expect(calls).toBe(1)
})
