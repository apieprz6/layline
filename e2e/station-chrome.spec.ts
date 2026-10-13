import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The station page's header and dock (LAY-172), measured: their heights, what each
 * shows at which width, and that the room `globals.css` reserves for them matches
 * what they actually take. jsdom has no layout, so none of this can be asked of Jest.
 */

type Box = { x: number; y: number; width: number; height: number }

const dock = (page: Page) => page.locator('.bottom-dock')
const header = (page: Page) => page.getByTestId('station-header')

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box, 'element has no layout box').not.toBeNull()
  return box!
}

async function openStation(page: Page, width: number, height: number, buoyId = 'CHII2') {
  await page.setViewportSize({ width, height })
  await gotoHydrated(page, `/station/${buoyId}`)
  await expect(page.getByRole('button', { name: 'Go back' })).toBeInViewport()
}

test.describe('the station page chrome', () => {
  test('takes about 164px at 390×844, header and dock together', async ({ page }) => {
    await openStation(page, 390, 844)

    expect((await boxOf(header(page))).height).toBeCloseTo(43, 0)
    expect((await boxOf(dock(page))).height).toBeCloseTo(121, 0)

    // From 768 the date-range caption joins the dock; the header stays one row.
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(page.locator('.bottom-dock__caption')).toBeVisible()
    expect((await boxOf(header(page))).height).toBeCloseTo(43, 0)
    expect((await boxOf(dock(page))).height).toBeCloseTo(137, 0)
  })

  test('shows the latest sample time and the date range only from 768px up', async ({ page }) => {
    await openStation(page, 390, 844)
    await expect(page.getByText(/· Latest \d\d:\d\d/)).toBeHidden()
    await expect(page.locator('.bottom-dock__caption')).toBeHidden()

    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(page.getByText(/· Latest \d\d:\d\d/)).toBeVisible()
  })

  test('carries no Jump to, Legend, fetch age or dock labels', async ({ page }) => {
    await openStation(page, 390, 844)

    for (const gone of [/^Jump to$/, /^Legend$/, /Fetched/, /^Scale$/, /^Time scrubber$/]) {
      await expect(page.getByText(gone)).toHaveCount(0)
    }
  })

  test('on a phone, the last panel scrolls clear of the dock', async ({ page }) => {
    await openStation(page, 390, 844)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    const stats = await boxOf(page.locator('.station-layout__stats'))
    const dockBox = await boxOf(dock(page))
    expect(stats.y + stats.height).toBeLessThanOrEqual(dockBox.y)
  })

  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ] as const) {
    test(`at ${width}px the grid fits between header and dock without scrolling`, async ({ page }) => {
      await openStation(page, width, height)

      const content = await boxOf(page.locator('.station-layout__content'))
      const headerBox = await boxOf(header(page))
      const dockBox = await boxOf(dock(page))
      expect(content.y).toBeGreaterThan(headerBox.y + headerBox.height)
      expect(content.y + content.height).toBeLessThanOrEqual(dockBox.y)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }

  for (const width of [390, 768, 1024, 1440, 2560]) {
    test(`does not scroll sideways at ${width}px`, async ({ page }) => {
      await openStation(page, width, 900)

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(sideways).toBe(0)
    })
  }

  test('explains the 85ft elevation on CHII2, and nothing of the kind on 45198', async ({ page }) => {
    await openStation(page, 390, 844, 'CHII2')
    const note = page.getByText(/Wind measured at 85ft/)
    await note.scrollIntoViewIfNeeded()
    await expect(note).toBeInViewport()

    await openStation(page, 390, 844, '45198')
    await expect(page.getByText(/85ft/)).toHaveCount(0)
  })
})
