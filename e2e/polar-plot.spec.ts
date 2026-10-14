import { test, expect, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The **Polar Plot** in a real browser (ADR 0040): what only a hydrated page can answer.
 *
 * What the plot draws — which patches, which certificate columns, what the card says, which dot
 * rings for a tapped row — is Jest's, in `components/analysis/__tests__/PolarPerformanceContent.test.tsx`
 * and `components/race/__tests__/RaceTrackAndPolarPlot.test.tsx`. Here is what jsdom cannot see:
 * a tap on the *map* reaching the plot (the map's hit test measures real rects), the slider moving
 * under a real thumb, the sticky readout and the nudge that keeps a tapped mark out from under it
 * at 390 × 844, and the two cards lining up at desktop.
 *
 * 🚨 Every step reads the DOM back. A click on an un-hydrated node *succeeds* in this environment,
 * so "the dot was clicked" proves nothing on its own — the other picture changing does.
 *
 * Both routes are test harnesses off unless `LAYLINE_TRACK_HARNESS=1`, which `playwright.config.ts`
 * sets: `/dev/polar-performance` mounts the real Polar performance screen over a synthetic season,
 * `/dev/race-track` the real race page over a synthetic race. There is no archive in any local
 * database to open the real routes over, and nothing seeds one.
 *
 * The prototype's `shots-cards.mjs`, `shots-link.mjs`, `shots-phone.mjs` and `shots-wind.mjs`
 * (`prototype/lay-165-polar-picture`) are the specification for these.
 */

/** The season screen's own Polar Plot, not the teaser's on the same harness page. */
function seasonPlot(page: Page): Locator {
  return page.getByTestId('polar-plot-card').getByTestId('polar-plot')
}

/** Tap a stretch of the track at its own midpoint, letting the frame's hit test find it. */
async function tapLeg(page: Page, leg: Locator): Promise<void> {
  await leg.scrollIntoViewIfNeeded()
  const box = await leg.boundingBox()
  if (box === null) throw new Error('the stretch to tap is not on the page')
  // A two-point polyline's box is centred on its midpoint, and `page.mouse` does not scroll.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

test.describe('the season: patches inside a uniform focus window', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHydrated(page, '/dev/polar-performance')
    // A 404 here is a server started without the harness flag, not a broken plot.
    await expect(seasonPlot(page)).toBeVisible()
  })

  test('the rail has handed `wind` over to the window', async ({ page }) => {
    const rail = page.getByTestId('analysis-filter-rail')
    await expect(rail.getByRole('button')).toHaveCount(5)
    await expect(page.getByTestId('filter-chip-wind')).toHaveCount(0)
  })

  test('keeps one width at every centre, and the width chips change it', async ({ page }) => {
    const slider = page.getByTestId('polar-plot-centre')
    const span = async (): Promise<number> => {
      const [low, high] = ((await page.getByTestId('polar-plot-window').textContent()) ?? '')
        .replace(' kt', '')
        .split('–')
        .map(Number)
      return high - low
    }

    const widths: number[] = []
    for (const centre of ['5', '9', '14', '19']) {
      await slider.fill(centre)
      widths.push(await span())
    }
    expect(new Set(widths)).toEqual(new Set([4]))

    const patches: number[] = []
    await slider.fill('10')
    for (const width of [2, 4, 6] as const) {
      await page.getByTestId(`polar-plot-width-${width}`).click()
      expect(await span()).toBe(width)
      patches.push(await seasonPlot(page).getByTestId('polar-plot-patch').count())
    }
    // A wider window draws more of the season, which is the window narrowing the picture.
    expect(patches[2]).toBeGreaterThan(patches[0])
  })

  test('narrows the picture and never the match', async ({ page }) => {
    const ledger = await page.getByTestId('coverage-ledger-headline').textContent()
    const figure = await page.getByTestId('polar-efficiency').textContent()

    await page.getByTestId('polar-plot-centre').fill('14')

    await expect(page.getByTestId('coverage-ledger-headline')).toHaveText(ledger ?? '')
    await expect(page.getByTestId('polar-efficiency')).toHaveText(figure ?? '')
  })

  test('reads a tapped patch out, wears a halo, and walks on with the arrow keys', async ({
    page,
  }) => {
    const patches = seasonPlot(page).getByTestId('polar-plot-patch')
    expect(await patches.count()).toBeGreaterThan(2)

    // `dispatchEvent` and not a coordinate click: a patch is a curved annular sector, so the
    // centre of its box can fall in the hollow and land on whatever is behind it. A thumb aims at
    // the ink; a test has to aim at the element.
    await patches.nth(1).dispatchEvent('click')
    const card = page.getByTestId('polar-plot-patch-card')
    await expect(card).toContainText('of target')
    await expect(card).not.toContainText(/\brows?\b/i)
    await expect(patches.nth(1)).toHaveAttribute('data-selected-mark', '')

    const first = await card.locator('strong').textContent()
    await seasonPlot(page).focus()
    await page.keyboard.press('ArrowRight')
    await expect(card.locator('strong')).not.toHaveText(first ?? '')
    await expect(patches.nth(2)).toHaveAttribute('data-selected-mark', '')
    await page.keyboard.press('ArrowLeft')
    await expect(card.locator('strong')).toHaveText(first ?? '')
  })
})

test.describe('one race: the plot and the track share one selection', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHydrated(page, '/dev/race-track')
    await expect(page.getByTestId('polar-plot')).toBeVisible()
  })

  const dots = (page: Page): Locator => page.getByTestId('polar-plot-dot')
  const readout = (page: Page): Locator => page.getByTestId('shared-readout')

  test('opens no readout until something is tapped', async ({ page }) => {
    await expect(readout(page)).toHaveCount(0)
  })

  test('a dot lights its stretch on the track, and the readout is the shipped one', async ({
    page,
  }) => {
    await dots(page).nth(8).dispatchEvent('click')

    await expect(page.getByTestId('polar-plot-selected')).toHaveCount(1)
    // `attached`: the halo is a thin `fill="none"` polyline that the visibility check can miss.
    await expect(page.getByTestId('track-selection')).toBeAttached()
    await expect(page.getByTestId('track-readout')).toHaveCount(1)
    await expect(readout(page).getByTestId('track-readout')).toContainText('Percent of Target Speed')
    // The shipped readout alone: the plot's side line was cut as not needed.
    await expect(readout(page).getByTestId('track-readout')).toBeVisible()
    await expect(readout(page)).not.toContainText('lasted')
    await expect(readout(page)).toBeInViewport()
  })

  test('the first fix of a run is answered by the plot, and says the map cannot', async ({
    page,
  }) => {
    // Row 0 opens the race: no stroke arrives at it, so the map has nothing to light.
    await page.locator('[data-testid="polar-plot-dot"][data-row="0"]').dispatchEvent('click')

    await expect(page.getByTestId('polar-plot-selected')).toHaveCount(1)
    await expect(page.getByTestId('track-selection')).toHaveCount(0)
    await expect(readout(page)).toContainText('Not on the map')
  })

  test('a stretch of track rings its dot, or says it has no figure — never a neighbour', async ({
    page,
  }) => {
    const camera = page.getByTestId('track-camera')

    await tapLeg(page, camera.locator('polyline[stroke^="var(--track-"]').nth(6))
    await expect(page.getByTestId('track-selection')).toBeAttached()
    expect(await page.getByTestId('polar-plot-selected').count()).toBeLessThanOrEqual(1)

    // A stretch the plot draws nothing for: the map keeps the selection, the plot rings nothing,
    // and the readout says why. Clearing, or ringing the nearest dot, would both be lies.
    await tapLeg(page, camera.locator('polyline[data-not-scored]').first())
    await expect(page.getByTestId('track-selection')).toBeAttached()
    await expect(page.getByTestId('polar-plot-selected')).toHaveCount(0)
    await expect(readout(page).getByTestId('track-readout-why')).toContainText('No figure')
  })

  test('the readout leads with whichever overlay the track is coloured by', async ({ page }) => {
    await dots(page).nth(8).dispatchEvent('click')

    const headlines: string[] = []
    for (const overlay of ['target_speed', 'sog', 'twa', 'tws']) {
      await page.locator(`[data-overlay="${overlay}"]`).click()
      await expect(page.locator(`[data-overlay="${overlay}"]`)).toHaveAttribute('aria-pressed', 'true')
      headlines.push(((await page.getByTestId('track-readout').innerText()).split('\n')[0] ?? '').trim())
    }

    expect(new Set(headlines).size).toBe(headlines.length)
  })

  test('lines the two cards up from xl, with the map’s column capped at 620px', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'a desktop layout, by definition')

    const map = await page.getByTestId('race-track-card').boundingBox()
    const plot = await page.getByTestId('polar-plot-card').boundingBox()
    if (map === null || plot === null) throw new Error('a card is missing')

    expect(Math.abs(map.y - plot.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(map.height - plot.height)).toBeLessThanOrEqual(2)
    expect(map.width).toBeLessThanOrEqual(621)
    expect(plot.x).toBeGreaterThan(map.x + map.width)
  })

  test('at 390 × 844, a tapped dot is never left under the readout', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'the phone is the case this exists for')

    // Put the dot near the bottom of the screen, where the readout is about to open over it.
    const dot = dots(page).nth(8)
    await dot.scrollIntoViewIfNeeded()
    const before = await dot.boundingBox()
    const viewport = page.viewportSize()
    if (before === null || viewport === null) throw new Error('no dot to tap')
    await page.evaluate((by) => window.scrollBy(0, by), before.y - (viewport.height - 40))

    await dot.dispatchEvent('click')
    await expect(readout(page)).toBeVisible()

    // The nudge is a smooth scroll: poll until it lands rather than guessing how long it takes.
    await expect
      .poll(async () => {
        const ring = await page.getByTestId('polar-plot-selected').boundingBox()
        const card = await readout(page).boundingBox()
        return ring !== null && card !== null && ring.y + ring.height <= card.y
      })
      .toBe(true)
  })
})
