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
