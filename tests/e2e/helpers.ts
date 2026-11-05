import { expect, type Page } from '@playwright/test'

const password = process.env.TEST_PASSWORD
if (!password) throw new Error('TEST_PASSWORD is required for browser E2E')
export const manager = { email: 'ci.manager1@example.test', password }
export const executor = { email: 'ci.executor1@example.test', password }

export function uniqueLabel(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Пароль').fill(user.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/objects/)
}

export async function logout(page: Page) {
  const menuButton = page.getByRole('button', { name: 'Открыть меню' })
  if (await menuButton.isVisible()) await menuButton.click()
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page).toHaveURL(/\/login/)
}

export async function openNavigation(page: Page) {
  const menuButton = page.getByRole('button', { name: /Открыть меню|Закрыть меню/ })
  if (await menuButton.isVisible() && (await menuButton.getAttribute('aria-expanded')) !== 'true') await menuButton.click()
}
