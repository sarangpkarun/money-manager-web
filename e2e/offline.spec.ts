import { expect, test } from '@playwright/test'
import { createUser, deleteUser, login, sql, type E2EUser } from './helpers'

let user: E2EUser
test.beforeEach(async () => { user = await createUser('off') })
test.afterEach(async () => { await deleteUser(user.id) })

test('offline: a banner says so, saved data stays on screen, a failed save names the reason, and going back online clears it', async ({ page, context }) => {
  await login(page, user)
  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially('120')
  await page.getByRole('button', { name: /Food/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added ₹120' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹120')).toBeVisible()
  await expect(page.getByText("You're offline. Showing saved data.")).toHaveCount(0)

  await context.setOffline(true)
  await expect(page.getByText("You're offline. Showing saved data.")).toBeVisible()
  await expect(page.getByRole('region', { name: 'This month' }).getByLabel('Spent ₹120')).toBeVisible() // what is already loaded stays

  await page.getByRole('button', { name: 'Quick add' }).click()
  await page.getByLabel('Amount').pressSequentially('75')
  await page.getByRole('button', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: "Couldn't save: you're offline" })).toBeVisible()
  expect((await sql(`select count(*)::int n from transactions where user_id = $1`, [user.id])).rows[0]?.n).toBe(1) // nothing half-saved

  await context.setOffline(false)
  await expect(page.getByText("You're offline. Showing saved data.")).toHaveCount(0)
})
