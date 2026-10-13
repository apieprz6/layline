import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * Gust, waves and the elevation note on the station page (LAY-171), in a real browser at the two
 * widths LAY-169 locked them at.
 *
 * Most of this runs on `/dev/station/[buoyId]`, the harness that mounts the real page client over
 * synthetic history (`LAYLINE_STATION_HARNESS=1`, set by `playwright.config.ts`): the real route's
 * readings are live NDBC data, so "measures waves, no current reading" exists there only by luck.
 * What doesn't depend on the readings, which station gets the chip and that nothing scrolls
 * sideways, is asked of the real route too.
 */

type Box = { x: number; y: number; width: number; height: number }

const WIDTHS = [
  [390, 844],
  [1280, 800],
] as const

const rose = (page: Page) => page.locator('.wind-rose-card')
const gust = (page: Page) => page.getByTestId('rose-gust')
const waves = (page: Page) => page.getByTestId('rose-waves')
const chip = (page: Page) => page.getByRole('button', { name: /Measured at 85 ft/ })

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box, 'element has no layout box').not.toBeNull()
  return box!
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function open(page: Page, path: string, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height })
  await gotoHydrated(page, path)
  // A 404 here is a server started without LAYLINE_STATION_HARNESS, not a broken page.
  await expect(page.getByRole('button', { name: 'Go back' }), `${path} has no station page`).toBeInViewport()
}

async function sideways(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
}

for (const [width, height] of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test('CHII2 shows gust and its 85 ft chip, and nothing wave-shaped anywhere', async ({ page }) => {
      await open(page, '/dev/station/CHII2', width, height)

      await expect(gust(page)).toHaveText(/^G\d+$/)
      await expect(page.getByText('Wind speed · gust')).toBeVisible()
      await expect(page.getByTestId('gust-band').first()).toBeAttached()
      await expect(chip(page)).toBeInViewport()

      await expect(waves(page)).toHaveCount(0)
      await expect(page.getByText(/waves?/i)).toHaveCount(0)
      expect(await sideways(page)).toBe(0)
    })

    test('45198 shows its waves in the rose corner, clear of the SW label, and no chip', async ({ page }) => {
      await open(page, '/dev/station/45198', width, height)

      await expect(waves(page)).toBeInViewport()
      await expect(waves(page)).toHaveText(/^Waves\d+\.\dft\d+sS?[NESW]{1,3}$/)
      await expect(gust(page)).toHaveText(/^G\d+$/)
      await expect(page.getByRole('button', { name: /Measured at/ })).toHaveCount(0)

      // LAY-169 left this to check: the corner sits near the rose's SW compass label.
      const sw = rose(page).locator('svg text', { hasText: /^SW$/ })
      expect(overlaps(await boxOf(waves(page)), await boxOf(sw))).toBe(false)
      expect(await sideways(page)).toBe(0)
    })

    test('a station that measures gust and waves but has no current reading says since when', async ({ page }) => {
      await open(page, '/dev/station/45198?missing=1', width, height)

      await expect(gust(page)).toHaveText('G—')
      await expect(waves(page)).toContainText('—')
      await expect(waves(page)).toContainText(/No reading since \d\d:\d\d/)
      await expect(waves(page)).not.toContainText('ft')
    })

    test('CHII2 with no current gust reads "G —", still with no wave readout', async ({ page }) => {
      await open(page, '/dev/station/CHII2?missing=1', width, height)

      await expect(gust(page)).toHaveText('G—')
      await expect(waves(page)).toHaveCount(0)
    })

    test('the 85 ft chip opens on a tap, on screen, and closes on Escape or a tap outside', async ({ page }) => {
      await open(page, '/dev/station/CHII2', width, height)

      await chip(page).click()
      const tooltip = page.getByRole('tooltip')
      await expect(tooltip).toHaveText(
        'Speed and gust measured 85 ft above the water. Wind at this height typically reads 20–30% higher than at the surface.'
      )
      const box = await boxOf(tooltip)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)

      await page.keyboard.press('Escape')
      await expect(tooltip).toHaveCount(0)

      await chip(page).click()
      await expect(tooltip).toBeInViewport()
      await page.locator('.station-layout__stats').click()
      await expect(tooltip).toHaveCount(0)
    })
  })
}

test('gust and waves follow a touched moment, not the latest reading', async ({ page }) => {
  await open(page, '/dev/station/45198?missing=1', 390, 844)
  await expect(gust(page)).toHaveText('G—')

  // Six hours back is well before the blanked 150 minutes.
  await page.getByRole('button', { name: '6h', exact: true }).click()
  const chart = await boxOf(page.locator('.station-layout__speed svg'))
  await page.mouse.move(chart.x + chart.width * 0.1, chart.y + chart.height / 2)
  await page.mouse.down()

  await expect(gust(page)).toHaveText(/^G\d+$/)
  await expect(waves(page)).toContainText('ft')
  await expect(waves(page)).not.toContainText('No reading')

  await page.mouse.up()
  await expect(gust(page)).toHaveText('G—')
})

test.describe('the real station route', () => {
  for (const [width, height] of WIDTHS) {
    test(`at ${width}px, CHII2 carries the chip and no waves; 45198 no chip; neither scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await gotoHydrated(page, '/station/CHII2')
      await expect(chip(page)).toBeInViewport()
      await expect(waves(page)).toHaveCount(0)
      expect(await sideways(page)).toBe(0)

      await gotoHydrated(page, '/station/45198')
      await expect(page.getByRole('button', { name: 'Go back' })).toBeInViewport()
      await expect(page.getByRole('button', { name: /Measured at/ })).toHaveCount(0)
      expect(await sideways(page)).toBe(0)
    })
  }
})
