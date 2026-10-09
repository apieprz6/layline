import { expect, test } from '@playwright/test'

import { gotoHydrated } from '../hydrated'
import { FIXTURE_HDG_ACT_DATE, FIXTURE_STW_ACT_DATE } from '../fixtures/synthetic-race'

/**
 * The three Instrument Tuning charts, in a real browser, over the Race `e2e/archive.setup.ts` wrote.
 *
 * What is here is only what a browser can answer. The arithmetic is Jest's, the charts' own rules
 * are Jest's (`components/boat/instrument-tuning/__tests__/`), and what they say about the owner's
 * real season is Jest's too — `archive-charts.test.tsx`, over the owner's recordings. Three things
 * are left, and all three need hydration and a 390px viewport:
 *
 * - **A tap on a nine-pixel heading bin reaches a handler.** ADR 0034 made these charts hit-test
 *   the tap position themselves precisely because no finger lands on a 10° bin at 390px, and
 *   `svgPoint` needs `getScreenCTM`, which jsdom does not implement. A tap on an un-hydrated node
 *   *succeeds* and changes nothing, so every assertion below is on the readout rather than on the
 *   click — see `docs/testing/README.md`.
 * - **Both toggles, and the state they share.** That the selection survives Strip → Rose is the
 *   whole reason ADR 0034 chose a toggle over two stacked charts.
 * - **That a chart fits 390px.** A chart wider than the screen is not a chart.
 */

const ROUTE = '/boat-performance/instrument-tuning'

test.describe('the Instrument Tuning charts, to an admin', () => {
  test('taps a heading bin, and the readout says which heading', async ({ page }) => {
    await gotoHydrated(page, ROUTE)

    const strip = page.getByTestId('compass-strip')
    await expect(strip).toBeVisible()

    const readout = page.getByTestId('compass-chart').getByTestId('chart-readout')
    // With nothing picked, the readout leads with the curve's extremes rather than a mean.
    await expect(readout).toContainText('Swings')

    // The first 10° bin. Measured off the rendered box rather than hard-coded, because the SVG is
    // fixed-viewBox and fluid-width: `LINEAR.axisLeft` is 28 units of gutter and a bin is
    // 304 / 36 ≈ 8.4 units, so the middle of bin 0 sits at 32/340 of whatever width it was laid
    // out at.
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    await strip.click({ position: { x: box!.width * (32 / 340), y: box!.height * 0.35 } })

    await expect(readout).toContainText('0°–10° · N')
  })

  test('carries the tapped heading across the Strip | Rose toggle', async ({ page }) => {
    await gotoHydrated(page, ROUTE)

    const strip = page.getByTestId('compass-strip')
    const box = await strip.boundingBox()
    expect(box).not.toBeNull()
    await strip.click({ position: { x: box!.width * (32 / 340), y: box!.height * 0.35 } })

    const readout = page.getByTestId('compass-chart').getByTestId('chart-readout')
    await expect(readout).toContainText('0°–10° · N')

    await page.getByRole('radio', { name: 'Rose' }).click()

    // One drawing replaced by the other, and the sailor's place kept.
    await expect(page.getByTestId('compass-rose')).toBeVisible()
    await expect(page.getByTestId('compass-strip')).toHaveCount(0)
    await expect(readout).toContainText('0°–10° · N')
  })

  test('steps the selection with the arrow keys, on all three charts', async ({ page }) => {
    await gotoHydrated(page, ROUTE)

    // ADR 0034: "each chart responds to touch and to the arrow keys". The keyboard is also the only
    // way to reach a nine-pixel bin precisely, so it is not a lesser path here — and a key handler
    // on an un-hydrated node is as silent as a click on one.
    const compass = page.getByTestId('compass-strip')
    await compass.focus()
    await compass.press('ArrowRight')
    await expect(page.getByTestId('compass-chart').getByTestId('chart-readout')).toContainText(
      '0°–10° · N'
    )

    const dial = page.getByTestId('tack-dial-svg')
    await dial.focus()
    await dial.press('ArrowRight')
    await expect(page.getByTestId('tack-dial').getByTestId('chart-readout')).toContainText('wider')

    const scatter = page.getByTestId('speed-scatter')
    await scatter.focus()
    await scatter.press('ArrowLeft')
    await expect(
      page.getByTestId('speed-check-chart').getByTestId('chart-readout')
    ).toContainText('9–10 kt')
  })

  test('toggles the STW chart between Scatter and Gap by speed, keeping the band', async ({
    page,
  }) => {
    await gotoHydrated(page, ROUTE)

    const chart = page.getByTestId('speed-check-chart')
    const scatter = page.getByTestId('speed-scatter')
    await expect(scatter).toBeVisible()

    // The 4–5 kt band: 30 units of gutter and a 264-unit square plot over a 10 kt axis, so 26.4
    // units per knot, in the shared 340-unit viewBox.
    const box = await scatter.boundingBox()
    expect(box).not.toBeNull()
    await scatter.click({
      position: { x: box!.width * ((30 + 4.5 * 26.4) / 340), y: box!.height * 0.5 },
    })

    const readout = chart.getByTestId('chart-readout')
    await expect(readout).toContainText('4–5 kt')

    await chart.getByRole('radio', { name: 'Gap by speed' }).click()

    await expect(page.getByTestId('speed-gap')).toBeVisible()
    await expect(page.getByTestId('speed-scatter')).toHaveCount(0)
    await expect(readout).toContainText('4–5 kt')
  })

  test('moves the fitted line when the fit method changes, and prints no coefficient', async ({
    page,
  }) => {
    await gotoHydrated(page, ROUTE)

    const chart = page.getByTestId('speed-check-chart')
    await expect(chart).toContainText('Fitted treating both instruments as noisy')

    await chart.getByRole('radio', { name: 'SOG on STW' }).click()

    await expect(chart).toContainText('noise in STW flattens this line')
    // A slope or an intercept is a drafted correction however it is labelled (ADR 0027).
    await expect(chart).not.toContainText(/slope|intercept/i)
    await expect(page.getByTestId('fitted-line').first()).toBeVisible()
  })

  test('taps a Tack Pair dot, and the readout names that pair', async ({ page }) => {
    await gotoHydrated(page, ROUTE)

    const dial = page.getByTestId('tack-dial')
    const readout = dial.getByTestId('chart-readout')
    await expect(readout).toContainText('Upwind · AWA < 50°')

    await dial.getByTestId('tack-pair-dot').first().click()

    // A pair, not a season: its two held angles, and which tack read wider — by a real number.
    // "0.0° wider" would satisfy a looser assertion, and did, until the fixture was fixed.
    await expect(readout).toContainText('starboard 40.0° · port 46.0° · port 6.0° wider')
  })

  test('marks the Calibration Log’s dates as dashed rules on every chart', async ({ page }) => {
    await gotoHydrated(page, ROUTE)

    const hdg = page.getByTestId('calibration-rail-HDG')
    const awa = page.getByTestId('calibration-rail-AWA')
    const stw = page.getByTestId('calibration-rail-STW')

    // Each channel's own act, dashed and labelled with its day.
    await expect(hdg.getByTestId('calibration-mark')).toHaveCount(1)
    await expect(hdg.locator('[data-testid="calibration-mark"] line')).toHaveAttribute(
      'stroke-dasharray',
      /\d/
    )
    await expect(hdg).toContainText('1 Aug · swung')
    await expect(stw).toContainText('2 Aug · other')

    // And the one cross-channel mark: the Asymmetry chart carries both, the borrowed one muted and
    // named for the channel it belongs to, since compass deviation leaks into the recomputed wind.
    await expect(awa.getByTestId('calibration-mark')).toHaveCount(1)
    await expect(awa).toContainText(`${day(FIXTURE_HDG_ACT_DATE)} · HDG swung`)
    await expect(
      awa.locator('[data-testid="calibration-mark"] line')
    ).toHaveAttribute('stroke', 'var(--text-muted)')
    // The paddlewheel's act is not on it: no other channel's history bears on the masthead either.
    await expect(awa).not.toContainText(day(FIXTURE_STW_ACT_DATE))
  })

  test('never blows a chart up to fill a wide window', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1200 })
    await gotoHydrated(page, ROUTE)

    // The bug this is here for: with nothing capping the column, `width: 100%` drew each chart
    // 1,216px across on a 1280px desktop — a 3.6x magnification of a box designed at 390px, with
    // 32-pixel axis labels. An ultrawide window made it worse, and ran the page three screens long.
    for (const id of ['compass-strip', 'tack-dial-svg', 'speed-scatter']) {
      const chart = page.getByTestId(id)
      await chart.scrollIntoViewIfNeeded()
      const box = await chart.boundingBox()
      expect(box, `${id} has no box`).not.toBeNull()
      expect(box!.width, `${id} is magnified`).toBeLessThanOrEqual(460)
    }

    // And the three sit side by side rather than stacked, so the page is one screen rather than
    // three. Measured on the cards and not on the charts inside them: the Tack Dial has no view
    // toggle above it, so its own chart legitimately starts higher than the other two.
    const cards = page.locator('section[aria-labelledby]')
    await expect(cards).toHaveCount(3)

    const tops = await cards.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().top))
    )
    expect(new Set(tops).size).toBe(1)
  })

  test('folds the prose away, and keeps the figures and the caveat one tap from the chart', async ({
    page,
  }) => {
    await gotoHydrated(page, ROUTE)

    const compass = page.getByTestId('compass-chart')

    // Closed by default: a legend is read once and a caveat when it is doubted, and neither is the
    // answer the screen exists to give.
    const legend = compass.getByText('The error at each 10° of heading', { exact: false })
    await expect(legend).toBeHidden()

    await compass.getByText('How to read it').click()
    await expect(legend).toBeVisible()

    // The caveat travels with the figure, which on a 390px screen has to mean one tap and not
    // three lines of italic prose under every chart.
    await compass.getByText('Caveat').click()
    await expect(compass.getByText('CTW = HDG + leeway', { exact: false })).toBeVisible()
  })

  test('fits every chart across the screen, without a sideways scroll', async ({ page }) => {
    await gotoHydrated(page, ROUTE)

    // The viewport's own width, not a literal 390: this spec runs on `mobile-390-auth` and on
    // `desktop-auth`, and on the desktop a chart filling 1214px is correct rather than broken.
    // The claim is the same on both — nothing is off the side — and `mobile-390-auth` is the
    // project that makes it about 390px.
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    for (const id of ['compass-strip', 'tack-dial-svg', 'speed-scatter']) {
      const chart = page.getByTestId(id)

      // Three charts stacked are taller than one screen, which is fine and expected; the question
      // is whether each one fits *across* it once it is on screen. So scroll to it first —
      // `toBeInViewport` never scrolls, and asserting it cold would only be asking about the fold.
      await chart.scrollIntoViewIfNeeded()
      await expect(chart).toBeInViewport()

      const box = await chart.boundingBox()
      expect(box, `${id} has no box`).not.toBeNull()
      // A chart wider than the viewport is a chart with a column off the side of it.
      expect(box!.width).toBeLessThanOrEqual(viewport!.width)
    }
  })
})

/** `2026-08-01` → `1 Aug`, the way the rails label a rule. */
function day(date: string): string {
  const [, month, dayOfMonth] = date.split('-')
  const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(dayOfMonth)} ${names[Number(month)]}`
}
