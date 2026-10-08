import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The **Race Track Heatmap**'s camera, in a real browser, at the viewport it was designed for.
 *
 * ADR 0033 is explicit about why this cannot be a Jest test and cannot assert a click: in this
 * environment `next dev` never hydrates, and a Playwright click on an un-hydrated node *succeeds*
 * — so "the zoom button was pressed" proves nothing. What is asserted here is the attribute the
 * map actually carries. Everything about the drawing itself — which legs are coloured, what the
 * legend says, what the counts add up to — is jsdom's, in
 * `components/race/__tests__/RaceTrackSection.test.tsx`.
 *
 * It runs against `/dev/race-track`, a harness route that is off unless the server was started
 * with `LAYLINE_TRACK_HARNESS=1` (`playwright.config.ts` sets it). There is no race in any local
 * database to open instead: the archive is hand-entered through the finished UI, so nothing seeds
 * a recording. The harness mounts the same component over the same drawing function the race page
 * uses, so there is no second renderer to drift.
 */

/** `scale(…)` off the camera group, which is the one number the gesture is about. */
async function zoomOf(page: Page): Promise<number> {
  const transform = await page.getByTestId('track-camera').getAttribute('transform')
  return Number(/scale\(([\d.]+)\)/.exec(transform ?? '')?.[1])
}

/** `translate(x y)` off the same group. */
async function panOf(page: Page): Promise<[number, number]> {
  const transform = await page.getByTestId('track-camera').getAttribute('transform')
  const match = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(transform ?? '')
  return [Number(match?.[1]), Number(match?.[2])]
}

test.describe('the race track, zoomed and panned at 390px', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHydrated(page, '/dev/race-track')
    // A 404 here means the server was started without the harness flag — see this file's header —
    // which is a missing harness and not a broken map.
    await expect(page.getByTestId('track-camera')).toBeVisible()
  })

  test('opens on the whole track, with nothing to pan to and the page still owning touch', async ({
    page,
  }) => {
    expect(await zoomOf(page)).toBe(1)
    expect(await panOf(page)).toEqual([0, 0])

    await expect(page.getByLabel('Zoom out')).toBeDisabled()
    await expect(page.getByLabel('Whole track')).toBeDisabled()

    // A 440-unit-tall map would otherwise swallow every attempt to scroll past it, and at 1× there
    // is nothing to pan to — so the vertical gesture belongs to the page until the sailor zooms in.
    const svg = page.locator('svg[role="img"]')
    await expect(svg).toHaveCSS('touch-action', 'pan-y')
  })

  test('zooms in on the + knob, and the scale bar re-reads its own distance', async ({ page }) => {
    const bar = page.getByTestId('track-scale-bar')
    /**
     * The bar's stated distance in metres, and null where it is stating nautical miles.
     *
     * Unit-checked rather than just number-scraped: `1.0 nm` is a *longer* distance than `500 m`
     * and a bare numeric comparison across the two would read the right behaviour as wrong (or,
     * worse, the wrong behaviour as right).
     */
    const metres = async (): Promise<number | null> => {
      const label = (await bar.textContent())?.trim() ?? ''
      const match = /^([\d.]+) m$/.exec(label)
      return match === null ? null : Number(match[1])
    }

    const whole = await metres()
    expect(whole).not.toBeNull()

    await page.getByLabel('Zoom in').click()
    expect(await zoomOf(page)).toBeCloseTo(1.6, 2)

    // And the gesture is the map's now that there is something to pan to.
    await expect(page.locator('svg[role="img"]')).toHaveCSS('touch-action', 'none')

    await page.getByLabel('Zoom in').click()
    await page.getByLabel('Zoom in').click()

    // The bar is pinned chrome drawn outside the camera, which is the whole reason zoom is a
    // transform on an inner group: it re-reads its own distance instead of travelling with the pan
    // and lying about it. Four times the zoom is a fraction of the water across the same bar.
    // 1-2-5 rounding is coarse enough that one step may land on the same label, so the claim is
    // made across four of them.
    expect(await metres()).toBeLessThan(whole as number)

    await page.getByLabel('Whole track').click()
    expect(await metres()).toBe(whole)
  })

  test('pans with a drag once there is something to pan to, and comes home again', async ({
    page,
  }) => {
    await page.getByLabel('Zoom in').click()
    await page.getByLabel('Zoom in').click()

    const box = await page.locator('svg[role="img"]').boundingBox()
    expect(box).not.toBeNull()
    const centre = { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 }

    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down()
    await page.mouse.move(centre.x - 60, centre.y - 40, { steps: 8 })
    await page.mouse.up()

    const [x, y] = await panOf(page)
    // Dragging up and left moves the camera that way: the track's box is kept covering the frame,
    // so a pan can never lose the race off the edge of the world.
    expect(x).toBeLessThan(0)
    expect(y).toBeLessThan(0)
    // The zoom is untouched by a pan.
    expect(await zoomOf(page)).toBeCloseTo(2.56, 2)

    await page.getByLabel('Whole track').click()

    expect(await zoomOf(page)).toBe(1)
    expect(await panOf(page)).toEqual([0, 0])
    await expect(page.getByLabel('Whole track')).toBeDisabled()
  })

  test('stops at 12×, which is about a quarter-mile of a 25nm race on this screen', async ({
    page,
  }) => {
    const zoomIn = page.getByLabel('Zoom in')

    // 1.6× a step: six presses pass 12 and the seventh has nowhere to go.
    for (let press = 0; press < 8; press += 1) {
      if (await zoomIn.isDisabled()) break
      await zoomIn.click()
    }

    expect(await zoomOf(page)).toBe(12)
    await expect(zoomIn).toBeDisabled()
    await expect(page.getByTestId('track-zoom-readout')).toContainText('12.0×')
  })
})
