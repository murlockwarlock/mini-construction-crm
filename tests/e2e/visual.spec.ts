import { expect, test } from '@playwright/test'
import { login, manager } from './helpers'

test('objects page visual reference', async ({ page }, testInfo) => {
  await login(page, manager)
  await expect(page.getByRole('heading', { name: 'Объекты' })).toBeVisible()
  const screenshotPath = testInfo.outputPath(`objects-page-${testInfo.project.name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  await testInfo.attach(`objects-page-${testInfo.project.name}`, {
    path: screenshotPath,
    contentType: 'image/png'
  })
})
