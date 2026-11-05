import { expect, type Page } from '@playwright/test'
import { admin, deleteUser, sql } from '../tests/rls/helpers'

export interface E2EUser { id: string; email: string; password: string }

export async function createUser(label: string): Promise<E2EUser> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@e2e.local`
  const password = 'Passw0rd!e2e'
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'E2E' } })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  return { id: data.user.id, email, password }
}

export async function login(page: Page, u: E2EUser) {
  await page.goto('/')
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Password').fill(u.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

export { deleteUser, sql }

/** Today's date (yyyy-MM-dd) exactly as the app computes it: in the user's profile timezone. */
export async function appToday(userId: string): Promise<string> {
  const tz = (await sql(`select timezone from profiles where id = $1`, [userId])).rows[0]?.timezone ?? 'UTC'
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export const shiftDate = (d: string, days: number): string => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}
