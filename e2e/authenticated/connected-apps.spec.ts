import { test, expect, type Page, type Route } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * Settings' **Connected Apps** list, signed in (LAY-192): confirming and revoking in a real
 * browser, and the list at 390px. What each state says is
 * `components/settings/__tests__/ConnectedApps.test.tsx`.
 *
 * Local GoTrue has no OAuth server (it answers the grants endpoint with a 404), so Supabase's two
 * calls are answered here instead, at the network. The calls themselves, their URL, method and
 * the signed-in user's token, are the real ones `@supabase/auth-js` makes from the browser.
 */

const GRANTS = '**/auth/v1/user/oauth/grants*'

const CLAUDE = {
  client: { id: 'c1a0de00-0000-4000-8000-000000000001', name: 'Claude', uri: '', logo_uri: '' },
  scopes: ['openid', 'email'],
  granted_at: '2026-10-17T21:04:00Z',
}
const CURSOR = {
  client: { id: 'c0750000-0000-4000-8000-000000000002', name: 'cursor-mcp (laptop)', uri: '', logo_uri: '' },
  scopes: ['openid'],
  granted_at: '2026-10-18T14:30:00Z',
}

/** Answers the list with both grants, and each revoke with `revokeStatus`; returns the revokes seen. */
async function stubGrants(page: Page, revokeStatus: number): Promise<URL[]> {
  const revokes: URL[] = []
  await page.route(GRANTS, async (route: Route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({ json: [CLAUDE, CURSOR] })
    }
    if (request.method() === 'DELETE') {
      expect(request.headers().authorization).toMatch(/^Bearer \S+/)
      revokes.push(new URL(request.url()))
      return revokeStatus < 300
        ? route.fulfill({ status: revokeStatus, body: '' })
        : route.fulfill({ status: revokeStatus, json: { code: 'unexpected_failure', msg: 'Revoke failed' } })
    }
    return route.continue()
  })
  return revokes
}

const list = (page: Page) => page.getByRole('list', { name: 'Connected apps' })
const claudeRow = (page: Page) => list(page).getByRole('listitem').filter({ hasText: 'Claude' }).first()

test.describe('the Connected Apps list', () => {
  test('revokes an app once confirmed, and removes its row', async ({ page }) => {
    const revokes = await stubGrants(page, 204)
    await gotoHydrated(page, '/settings')

    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    const row = claudeRow(page)
    await row.getByRole('button', { name: 'Revoke' }).click()
    await expect(row).toContainText('stops within the hour')
    expect(revokes).toHaveLength(0)

    await row.getByRole('button', { name: 'Revoke access' }).click()

    await expect(list(page).getByRole('listitem')).toHaveCount(1)
    await expect(list(page)).toContainText('cursor-mcp (laptop)')
    await expect(page.getByRole('status')).toContainText('Claude can no longer sign in as you.')
    expect(revokes).toHaveLength(1)
    expect(revokes[0].searchParams.get('client_id')).toBe(CLAUDE.client.id)
  })

  test('cancelling sends nothing', async ({ page }) => {
    const revokes = await stubGrants(page, 204)
    await gotoHydrated(page, '/settings')

    const row = claudeRow(page)
    await row.getByRole('button', { name: 'Revoke' }).click()
    await row.getByRole('button', { name: 'Cancel' }).click()

    await expect(row.getByRole('button', { name: 'Revoke' })).toBeVisible()
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    expect(revokes).toHaveLength(0)
  })

  test('keeps the row and says so when Supabase refuses the revoke', async ({ page }) => {
    const revokes = await stubGrants(page, 500)
    await gotoHydrated(page, '/settings')

    const row = claudeRow(page)
    await row.getByRole('button', { name: 'Revoke' }).click()
    await row.getByRole('button', { name: 'Revoke access' }).click()

    await expect(row.getByRole('alert')).toContainText('Couldn’t revoke Claude. It still has access.')
    await expect(list(page).getByRole('listitem')).toHaveCount(2)
    expect(revokes).toHaveLength(1)
  })

  test('shows an error, not an empty list, when the grants cannot be read', async ({ page }) => {
    await page.route(GRANTS, (route) => route.fulfill({ status: 500, json: { msg: 'boom' } }))
    await gotoHydrated(page, '/settings')

    await expect(page.getByText('Couldn’t load your connected apps.')).toBeVisible()
    await expect(page.getByText('No apps connected yet.')).toHaveCount(0)
  })

  test('fits a 390px screen with the confirmation open', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390-auth', 'a 390px question')

    await stubGrants(page, 204)
    await gotoHydrated(page, '/settings')

    const row = claudeRow(page)
    await row.getByRole('button', { name: 'Revoke' }).click()
    await expect(row.getByRole('button', { name: 'Revoke access' })).toBeVisible()

    for (const item of await list(page).getByRole('listitem').all()) {
      const box = (await item.boundingBox())!
      expect(box.x >= 0 && box.x + box.width <= 390).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true)
    for (const control of await row.getByRole('button').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  })
})
