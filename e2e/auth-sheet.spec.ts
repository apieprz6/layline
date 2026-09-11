import { test, expect } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The **Auth Sheet**'s geometry, which is the whole browser-only question about
 * it: ADR 0021 sized it to its contents and edge-anchored it, against the
 * superseded mockup's 82% (~692px). Here it measures **180px** on a 390×844
 * screen — the ADR's own estimate was ~250px, and this file is where that number
 * came from. A jsdom render cannot measure any of it, because nothing in jsdom
 * lays anything out.
 *
 * What the sheet *says*, and that it holds one button and no fields, is covered in
 * `components/auth/__tests__/AuthSheet.test.tsx`. Nothing here taps Continue with
 * Google: that leaves for Google, which this environment has no way to answer.
 */

test.describe('the Auth Sheet, measured', () => {
  test('opens from the drawer over the screen the sailor is on', async ({ page }) => {
    await gotoHydrated(page)

    const sheet = page.getByTestId('auth-sheet')
    await expect(sheet).toHaveCount(0)

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    await expect(sheet).toBeInViewport()

    // The drawer got out of the way, and the dashboard is still behind the sheet
    // rather than replaced by a route (ADR 0004's pattern, ADR 0016's mount point).
    const panel = page.locator('nav').filter({ hasText: 'Wind Data' }).first()
    await expect(panel).not.toBeInViewport()
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeAttached()

    await expect(sheet.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('is anchored to the bottom edge, full width, and 180px tall', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'the size ADR 0021 chose is a 390×844 figure')

    await gotoHydrated(page)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    const sheet = page.getByTestId('auth-sheet')
    const box = await sheet.boundingBox()
    const viewport = page.viewportSize()
    if (!box || !viewport) throw new Error('the sheet was never laid out')

    expect(box.x).toBe(0)
    expect(box.width).toBe(viewport.width)
    // Anchored, not floating: its bottom edge is the viewport's.
    expect(Math.round(box.y + box.height)).toBe(viewport.height)

    // 180px measured; ADR 0021's ~250px was arithmetic on a prototype nobody had
    // a browser for, and its LAY-126 amendment records why nothing was padded to
    // reach it. The band is wide because the decision was about proportion: it
    // fails if the sheet grows back towards the mockup's 692px, or collapses
    // because its contents did not render.
    expect(box.height).toBeGreaterThan(150)
    expect(box.height).toBeLessThan(280)

    const radius = await sheet.evaluate((el) => getComputedStyle(el).borderRadius)
    expect(radius).toMatch(/^16px 16px 0(px)? 0(px)?$/)
  })

  test('closes on Escape and on the dim behind it, leaving the sailor where they were', async ({
    page,
  }) => {
    await gotoHydrated(page, '/wind-data')

    const sheet = page.getByTestId('auth-sheet')

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(sheet).toBeInViewport()

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    // The dim covers the whole screen and the sheet sits above it, so a tap near
    // the top lands on the dim rather than on the sheet.
    await page.getByTestId('auth-sheet-dim').click({ position: { x: 10, y: 10 } })
    await expect(sheet).toHaveCount(0)

    // No navigation happened at any point: the sheet is a layer, not a route.
    expect(new URL(page.url()).pathname).toBe('/wind-data')
  })
})
