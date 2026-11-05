import { expect, test } from '@playwright/test'
import { login, manager } from './helpers'

test('objects page does not issue one data request per card', async ({ page }) => {
  await login(page, manager)
  let objectRequests = 0
  let taskRequests = 0
  page.on('request', request => {
    if (request.url().includes('/rest/v1/objects')) objectRequests += 1
    if (request.url().includes('/rest/v1/tasks')) taskRequests += 1
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Объекты' })).toBeVisible()
  expect(objectRequests).toBeLessThanOrEqual(1)
  expect(taskRequests).toBe(0)
})
