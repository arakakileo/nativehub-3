import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')

    // Check page title and form
    await expect(page.locator('h1, h2')).toContainText(/Sign in|Login|NativeHub/i)
  })

  test('page loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Filter out expected errors (auth checks, network when API not running)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('401') &&
        !e.includes('Unauthorized') &&
        !e.includes('ERR_CONNECTION_REFUSED') &&
        !e.includes('Failed to load resource')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('app has correct meta tags', async ({ page }) => {
    await page.goto('/login')

    // Check viewport meta
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
  })
})
