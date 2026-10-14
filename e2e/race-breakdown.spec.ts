import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The per-Race breakdown under the map and the Polar Plot, in a real browser (LAY-162).
 *
 * What each tile *says* — every figure, every reason a figure is missing — is Jest's, in
 * `components/race/__tests__/RaceBreakdown.test.tsx`. Here is what jsdom cannot answer: that the
 * three rows sit below both cards on the real page, in order, and that nothing in them runs off a
 * 390px screen — the calibration tile's three columns carry figures that must never wrap or clip.
 *
 * On `/dev/race-track`, the real race page over a synthetic race (see `polar-plot.spec.ts`), and on
 * `?breakdown=none`, the same race as one that produced no figure under the map at all.
 */

const TILES = ['race-performance', 'race-sail-chart', 'race-calibration'] as const

async function tops(page: Page): Promise<number[]> {
  return Promise.all(
    ['polar-plot-card', ...TILES].map(async (id) => {
      const box = await page.getByTestId(id).boundingBox()
      if (box === null) throw new Error(`${id} is not on the page`)
      return box.y
    })
  )
}

/** Whether anything inside a tile is wider than the tile's own box. */
async function overflows(page: Page, id: string): Promise<boolean> {
  return page.getByTestId(id).evaluate((tile) => {
    const right = tile.getBoundingClientRect().right
    return Array.from(tile.querySelectorAll('*')).some(
      (each) => each.getBoundingClientRect().right > right + 0.5
    )
  })
}

test.describe('a race with figures under the map', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHydrated(page, '/dev/race-track')
    // A 404 here is a server started without the harness flag, not a missing tile.
    await expect(page.getByTestId('race-performance')).toBeVisible()
  })

  test('runs the three tiles below both cards, in order', async ({ page }) => {
    const [plot, performance, sails, calibration] = await tops(page)

    expect(performance).toBeGreaterThan(plot)
    expect(sails).toBeGreaterThan(performance)
    expect(calibration).toBeGreaterThan(sails)
  })

  test('states the race’s figures in each tile, and none runs off the screen', async ({ page }) => {
    await expect(page.getByTestId('race-polar-efficiency')).toContainText('%')
    await expect(page.getByTestId('race-vmg-efficiency')).toContainText('%')
    await expect(page.getByTestId('race-sail-chart')).toContainText('Of this race’s sailing on the chart')
    await expect(page.getByTestId('race-calibration-figures')).toHaveCount(3)

    for (const id of TILES) expect(await overflows(page, id)).toBe(false)
  })

  test('opens the season screens the tiles summarise', async ({ page }) => {
    await expect(page.getByTestId('race-sail-chart').getByRole('link')).toHaveAttribute(
      'href',
      '/boat-performance/sail-selection'
    )
    await expect(page.getByTestId('race-calibration').getByRole('link')).toHaveAttribute(
      'href',
      '/boat-performance/instrument-tuning'
    )
  })
})

test.describe('a race that produced no figure under the map', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHydrated(page, '/dev/race-track?breakdown=none')
    await expect(page.getByTestId('race-performance')).toBeVisible()
  })

  test('says why in every tile, in words, with nothing standing in for a figure', async ({ page }) => {
    await expect(page.getByTestId('race-performance')).toContainText('records no Polar Version')
    await expect(page.getByTestId('race-polar-efficiency')).toHaveCount(0)

    await expect(page.getByTestId('race-sail-chart')).toContainText('No Crossover Chart')
    await expect(page.getByTestId('race-chart-agreement')).toHaveCount(0)

    const calibration = page.getByTestId('race-calibration')
    await expect(calibration).toContainText('No compass reading')
    await expect(calibration).toContainText('No Tack Pair')
    await expect(calibration).toContainText('No line')
    await expect(page.getByTestId('race-calibration-bar')).toHaveCount(0)

    for (const id of TILES) expect(await overflows(page, id)).toBe(false)
  })
})
