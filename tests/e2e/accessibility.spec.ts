import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, manager } from './helpers'

test('objects page has no serious accessibility violations', async ({ page }) => {
  await login(page, manager)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([])
})
