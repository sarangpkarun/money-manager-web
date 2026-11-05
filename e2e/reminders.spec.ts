import { expect, test } from '@playwright/test'
import { appToday, createUser, deleteUser, login, sql, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('rem') })
test.afterEach(async () => { await deleteUser(user.id) })

test('Reminders settings: explain this device, save alarm time, quiet hours and a weekly summary', async ({ page }) => {
  await login(page, user)
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: /^Reminders/ }).click()
  await expect(page.getByRole('heading', { name: 'Reminders', exact: true })).toBeVisible()

  // a desktop test browser has no installed-app push: the screen says what is going on instead of failing
  const device = page.getByRole('region', { name: 'This device' })
  await expect(device).not.toContainText('Checking')
  await expect(device).toContainText(/Notifications are off|can't receive push|blocked/)

  await page.getByLabel('Reminder time').fill('07:30')
  await page.getByRole('switch', { name: 'Quiet hours' }).check()
  await page.getByLabel('From').fill('23:00')
  await page.getByLabel('Until').fill('06:00')
  await expect(page.getByRole('note')).toHaveCount(0) // 07:30 is outside quiet hours
  await page.getByRole('group', { name: 'Summary frequency' }).getByRole('button', { name: 'Weekly' }).click()
  await page.getByLabel('Day').selectOption('5')
  await page.getByLabel('Time', { exact: true }).fill('18:00')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Reminder settings saved' })).toBeVisible()

  const p = (await sql(`select alarm_time::text a, quiet_from::text qf, quiet_until::text qu, summary_mode m, summary_time::text t, summary_weekday d from profiles where id = $1`, [user.id])).rows[0]
  expect(p).toEqual({ a: '07:30:00', qf: '23:00:00', qu: '06:00:00', m: 'weekly', t: '18:00:00', d: 5 })

  // it comes back after a reload
  await page.reload()
  await expect(page.getByLabel('Reminder time')).toHaveValue('07:30')
  await expect(page.getByRole('switch', { name: 'Quiet hours' })).toBeChecked()
})

test('quiet hours that cannot work are refused, and an alarm inside them is explained', async ({ page }) => {
  await login(page, user)
  await page.goto('/settings/reminders')
  await page.getByLabel('Reminder time').fill('06:00')
  await page.getByRole('switch', { name: 'Quiet hours' }).check()
  await expect(page.getByRole('note')).toContainText('06:00 is inside quiet hours, so reminders will arrive at 07:00 instead.')
  await page.getByLabel('Until').fill('22:00')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Quiet hours need a start and an end that differ')).toBeVisible()
})

test('a notification link opens the day: /calendar?day=… shows that day\'s sheet', async ({ page }) => {
  const today = await appToday(user.id)
  await sql(`insert into notes (user_id, kind, title, date) values ($1, 'note', 'Bring documents', $2)`, [user.id, today])
  await login(page, user)
  await page.goto(`/calendar?day=${today}`)
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('region', { name: 'Notes & tasks' })).toContainText('Bring documents')
  await expect(page).toHaveURL(/\/calendar$/) // the parameter is consumed
})
