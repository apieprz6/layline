import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * Settings' Integrations sheets, signed in (LAY-191): opening one, stepping through it and
 * copying, which need a real clipboard and a laid-out sheet. What each step says is
 * `components/settings/__tests__/Integrations.test.tsx`; the Guest's rows are
 * `e2e/integrations.spec.ts`.
 */

async function openSheet(page: Page, title: string): Promise<Locator> {
  await gotoHydrated(page, '/settings')
  await page.getByRole('button', { name: new RegExp(`^${title.replace('?', '\\?')}`) }).click()
  const sheet = page.getByRole('dialog', { name: title })
  await expect(sheet).toBeInViewport()
  return sheet
}

const clipboard = (page: Page): Promise<string> => page.evaluate(() => navigator.clipboard.readText())

test.describe('the Integrations sheets', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('shows the address the protected-resource metadata names, and copies it', async ({ page }) => {
    const sheet = await openSheet(page, 'Connect Claude')

    const metadata = await page.request.get('/.well-known/oauth-protected-resource/api/mcp')
    const { resource } = (await metadata.json()) as { resource: string }
    expect(resource).toBe(`${new URL(page.url()).origin}/api/mcp`)
    await expect(sheet.getByText(resource, { exact: true })).toBeVisible()

    await sheet.getByRole('button', { name: 'Copy address' }).click()
    await expect(sheet.getByRole('button', { name: 'Copied ✓' })).toBeVisible()
    expect(await clipboard(page)).toBe(resource)
  })

  test('steps through to Done and closes', async ({ page }) => {
    const sheet = await openSheet(page, 'Connect ChatGPT')

    await expect(sheet).toContainText('Step 1 of 3')
    await sheet.getByRole('button', { name: 'Next' }).click()
    await expect(sheet.getByRole('heading', { name: 'Add it in ChatGPT' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Next' }).click()
    await expect(sheet.getByRole('heading', { name: 'Sign in and approve' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('copies the Claude Code command', async ({ page }) => {
    const sheet = await openSheet(page, 'Using another app?')
    await sheet.getByRole('button', { name: 'Next' }).click()

    const command = sheet.getByRole('button', { name: /claude mcp add/ })
    await command.click()

    await expect(command).toContainText('Copied ✓')
    expect(await clipboard(page)).toBe(
      `claude mcp add --transport http layline ${new URL(page.url()).origin}/api/mcp`
    )
  })

  test('fits a 390px screen: the address and command wrap, and every control is 36px or more', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390-auth', 'a 390px question')

    // A preview deployment's hostname is far longer than loopback's, so the test gives the
    // address and the command one: an unbroken 120 characters.
    const long = `https://${'layline-git-a-very-long-preview-branch-name'.repeat(2)}.vercel.app/api/mcp`
    const fits = async (sheet: Locator): Promise<void> => {
      const box = await sheet.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true)
      expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      for (const control of await sheet.locator('button, a').all()) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(36)
      }
    }

    await gotoHydrated(page, '/settings')
    for (const title of [/^Connect Claude/, /^Connect ChatGPT/, /^Using another app\?/]) {
      expect((await page.getByRole('button', { name: title }).boundingBox())!.height).toBeGreaterThanOrEqual(36)
    }

    const sheet = await openSheet(page, 'Using another app?')
    await sheet.getByText(/\/api\/mcp$/).evaluate((el, url) => (el.textContent = url), long)
    await fits(sheet)

    await sheet.getByRole('button', { name: 'Next' }).click()
    await sheet.locator('code', { hasText: 'claude mcp add' }).evaluate(
      (el, url) => (el.textContent = `claude mcp add --transport http layline ${url}`),
      long
    )
    await fits(sheet)

    await sheet.getByRole('button', { name: 'Next' }).click()
    await fits(sheet)
  })
})
