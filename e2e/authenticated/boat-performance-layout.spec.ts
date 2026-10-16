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
 *   - **on a desktop the page never scrolls**: the race list scrolls inside its own box, under
 *     column headers that stay put;
 *   - **a race row fits a phone**, its three figures falling back to a card rather than three
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

  test('holds the page still on a desktop, and scrolls the race list under its headers instead', async ({
    page,
  }) => {
    test.skip(page.viewportSize()!.width < 1024, 'A phone keeps the ordinary page scroll.')

    // Short enough that a handful of races outruns the screen. The local archive's real races do;
    // a stack with only the synthetic fixture cannot, so the scroll itself is only asked of the list
    // when it has something to scroll — but the page holding still is asked of every stack.
    await page.setViewportSize({ width: 1280, height: 360 })
    await gotoHydrated(page, '/boat-performance')

    const races = page.getByRole('region', { name: /^Races/ })
    const list = races.getByRole('list')
    await expect(list).toBeVisible()
    await expect(page.getByTestId('instrument-tuning-teaser')).toBeVisible()

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight
    )
    expect(pageOverflow, 'the page scrolls, where only its columns should').toBeLessThanOrEqual(0)

    // The list stops at the bottom of the screen rather than running past it.
    const listBox = (await list.boundingBox())!
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(360)

    const { scrollable, headerBefore, headerAfter, scrolled } = await list.evaluate((node) => {
      const header = node.previousElementSibling as HTMLElement
      const headerBefore = header.getBoundingClientRect().y
      node.scrollTop = node.scrollHeight
      return {
        scrollable: node.scrollHeight > node.clientHeight,
        headerBefore,
        headerAfter: header.getBoundingClientRect().y,
        scrolled: node.scrollTop,
      }
    })
    if (scrollable) {
      expect(scrolled).toBeGreaterThan(0)
      // The column headers stay where they were while the rows move under them.
      expect(headerAfter).toBe(headerBefore)
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
