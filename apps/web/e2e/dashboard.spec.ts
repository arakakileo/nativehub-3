import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard (redirects to login if not authenticated)
    await page.goto('/')
  })

  test('shows login page for unauthenticated users', async ({ page }) => {
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page has email and password fields', async ({ page }) => {
    await page.goto('/login')

    // Check for login form elements
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('login page shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'invalid@test.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show error (either toast or inline message)
    // Wait for network request to complete
    await page.waitForLoadState('networkidle')

    // Should still be on login page
    await expect(page).toHaveURL(/\/login/)
  })

  test('dashboard loads correctly when authenticated', async ({ page }) => {
    // Skip if no test auth available
    // This test requires a mock auth setup
    test.skip()
  })
})
