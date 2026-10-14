import { test, expect } from '@playwright/test'
import { FIXTURE_RACE_TITLE } from '../fixtures/synthetic-race'
import { gotoHydrated } from '../hydrated'

/**
 * **Boat performance**'s arrangement in a real browser: the "This season" rail and the race table.
 *
 * What the screen *says* is Jest's (`BoatPerformanceContent.test.tsx`). What only a browser can see
 * is where the two sections land, which is the whole of what LAY-178 changed:
 *
 *   - **from 1024px the rail stands beside the table**, rather than behind a tab or above it;
 *   - **on a 390px phone it stacks above the table**, both the full width of the screen — the
 *     LAY-174 prototype's `flexWrap` left the stacked rail narrower than the table under it;
 *   - **a race row fits a phone**, its four figures falling back to a card rather than four
 *     columns running off the side.
 *
 * The archive project's synthetic race is what guarantees the table has a row to measure.
 */
test.describe('Boat performance, to an admin', () => {
  test('puts the season beside the races on a wide screen and above them on a phone', async ({
    page,
  }) => {
    await gotoHydrated(page, '/boat-performance')

    const season = page.getByRole('region', { name: 'This season' })
    const races = page.getByRole('region', { name: /^Races/ })
    await expect(season).toBeVisible()
    await expect(races).toBeVisible()

    const seasonBox = (await season.boundingBox())!
    const racesBox = (await races.boundingBox())!
    const viewport = page.viewportSize()!

    if (viewport.width >= 1024) {
      // Side by side: the same top, the rail to the left, and the table taking the rest.
      expect(Math.abs(seasonBox.y - racesBox.y)).toBeLessThanOrEqual(1)
      expect(seasonBox.x + seasonBox.width).toBeLessThanOrEqual(racesBox.x)
      expect(racesBox.width).toBeGreaterThan(seasonBox.width)
    } else {
      // Stacked: the rail first, and the two one column the same width.
      expect(seasonBox.y + seasonBox.height).toBeLessThanOrEqual(racesBox.y)
      expect(Math.abs(seasonBox.width - racesBox.width)).toBeLessThanOrEqual(1)
    }
  })

  test('fits a race row to the screen, with Upload in the races’ own toolbar', async ({ page }) => {
    await gotoHydrated(page, '/boat-performance')

    const races = page.getByRole('region', { name: /^Races/ })
    await expect(races.getByRole('link', { name: 'Upload a race' })).toBeVisible()

    const row = races.getByRole('link', { name: new RegExp(FIXTURE_RACE_TITLE) })
    await row.scrollIntoViewIfNeeded()
    await expect(row).toBeVisible()

    const viewport = page.viewportSize()!
    const box = (await row.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    const overflow = await row.evaluate((node) => node.scrollWidth - node.clientWidth)
    expect(overflow, 'a race row spills out of its own box').toBeLessThanOrEqual(1)

    // And the page as a whole, which is where a column too wide for a phone would show up.
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(pageOverflow).toBeLessThanOrEqual(0)
  })
})
