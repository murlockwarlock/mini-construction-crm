import { expect, test } from '@playwright/test'
import { login, manager } from './helpers'

test('objects page visual reference', async ({ page }, testInfo) => {
  await login(page, manager)
  await expect(page.getByRole('heading', { name: 'Объекты' })).toBeVisible()
  await testInfo.attach(`objects-page-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png'
  })
})
