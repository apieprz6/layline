import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * Settings' Integrations rows, to a **Guest** (LAY-191): every row asks them to sign in, and a
 * tap opens the Auth Sheet over Settings rather than a steps sheet. The signed-in sheets are
 * `e2e/authenticated/integrations.spec.ts`.
 */
test.describe('the Integrations rows, signed out', () => {
  test('ask a Guest to sign in, and open the Auth Sheet over Settings', async ({ page }) => {
    await gotoHydrated(page, '/settings')

    const row = page.getByRole('button', { name: /^Connect Claude/ })
    await expect(row).toContainText('Sign in to connect')
    await row.click()

    await expect(page.getByTestId('auth-sheet')).toBeInViewport()
    await expect(page.getByRole('dialog', { name: 'Connect Claude' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeAttached()
    // No address anywhere in a Guest's page, rendered or not.
    expect(await page.content()).not.toContain('/api/mcp')
  })
})
