import { expect, test } from '@playwright/test'
import { login, manager } from './helpers'

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`objects layout fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await login(page, manager)
    const result = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
    expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth)
    const button = page.getByRole('button', { name: 'Создать объект' })
    if (width >= 768) await expect(button).toBeVisible()
    if (width < 768) {
      await page.getByRole('button', { name: 'Открыть меню' }).click()
      await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible()
    }
  })
}
