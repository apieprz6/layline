import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * `/auth/callback`'s two rendered arms, in a browser, at the viewport AGENTS.md
 * designs for.
 *
 * What is here is only what jsdom cannot answer: that the **Refused Stranger**
 * fits a 390px screen without a sideways scroll, that its one exit is on screen
 * rather than below the fold, that the mark takes its colour from
 * `--state-warning` rather than a hardcoded hex, that no app chrome renders behind
 * it, and that the way out actually navigates. Which arm the route takes, what
 * each one says, and what stays in the log are Jest's, in
 * `app/auth/callback/__tests__/page.test.tsx`.
 *
 * **The OAuth hop itself is not here and cannot be.** Reaching this screen for
 * real needs Google to answer and Supabase to refuse a live address; these tests
 * arrive by typing the query string Supabase was observed to send (LAY-120). So
 * nothing below says the refusal ever happens — only what a sailor sees once it
 * has.
 */

const REFUSED =
  '/auth/callback?error=access_denied&error_code=signup_disabled' +
  '&error_description=Signups+not+allowed+for+this+instance'

test.describe('the Refused Stranger, on a 390px screen', () => {
  test('reads as a whole screen with one way out', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'a 390×844 question')

    await gotoHydrated(page, REFUSED)

    await expect(page.getByRole('heading', { name: 'You are not on the crew list yet' })).toBeInViewport()
    await expect(page.getByText(/Layline accounts are made by the boat's owner/)).toBeInViewport()

    // The only exit it has, and it has to be reachable without scrolling: this
    // screen has no navigation around it.
    const back = page.getByRole('link', { name: 'Back to the weather' })
    await expect(back).toBeInViewport()

    // No drawer and no dashboard behind it — the route sits outside the (app)
    // group, so the chrome is not merely hidden, it is not rendered.
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0)

    // Nothing hangs off the side of the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBe(0)
  })

  test('takes its mark from --state-warning, not a hex that survives a theme', async ({ page }) => {
    await gotoHydrated(page, REFUSED)

    const expected = await page.evaluate(() => {
      // Resolve the token the way the cascade would, so this passes in either
      // theme and fails if the colour is written into the component.
      const probe = document.createElement('span')
      probe.style.color = 'var(--state-warning)'
      document.body.appendChild(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      return resolved
    })

    const mark = page.getByTestId('callback-mark')
    await expect(mark).toBeVisible()
    expect(await mark.evaluate((el) => getComputedStyle(el).color)).toBe(expected)
  })

  test('names no address, and repeats nothing Supabase wrote', async ({ page }) => {
    await gotoHydrated(page, REFUSED)

    const onScreen = await page.locator('body').innerText()
    expect(onScreen).not.toContain('@')
    expect(onScreen).not.toContain('Signups not allowed')
    expect(onScreen).not.toContain('signup_disabled')
  })

  test('its one action really goes back to the weather', async ({ page }) => {
    await gotoHydrated(page, REFUSED)

    await page.getByRole('link', { name: 'Back to the weather' }).click()

    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/')
  })
})

test.describe('the other arms, in a browser', () => {
  test('Cancel on the consent screen puts the sailor back with nothing said', async ({ page }) => {
    // Google's Cancel: the same `access_denied`, no `error_code`. The server
    // redirects, so the sailor never sees a callback screen at all.
    await gotoHydrated(page, '/auth/callback?error=access_denied&next=%2Fwind-data')

    expect(new URL(page.url()).pathname).toBe('/wind-data')
    const onScreen = await page.locator('body').innerText()
    expect(onScreen).not.toMatch(/crew list|didn't finish/i)
  })

  test('a handshake that broke offers its retry above the fold', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'a 390×844 question')

    // Not clicked: it leaves for Google, which this environment cannot answer.
    await gotoHydrated(
      page,
      '/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Database+error'
    )

    await expect(page.getByRole('heading', { name: "Sign-in didn't finish" })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Try signing in again' })).toBeInViewport()
    await expect(page.getByRole('link', { name: 'Back to the weather' })).toBeInViewport()

    const onScreen = await page.locator('body').innerText()
    expect(onScreen).not.toMatch(/crew list/i)
    expect(onScreen).not.toContain('Database error')
  })
})
