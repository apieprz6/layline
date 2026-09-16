import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The `loading.tsx` skeletons, in a browser, for the two questions jsdom cannot be
 * asked.
 *
 * The first is **position**: a skeleton exists to be seen in the instant after a tap,
 * so `toBeInViewport()` is the only honest assertion about it — per
 * `docs/testing/README.md`, `toBeVisible()` would pass on a skeleton parked off-canvas.
 *
 * The second is **layout shift**, which is what the ticket is actually about and is a
 * question about measured boxes: a piece of chrome is measured while the skeleton holds
 * the screen and again once the real content has replaced it, and the two numbers have
 * to agree.
 *
 * Making a skeleton stand still long enough to measure takes some care, because the
 * fallback is server-rendered: it reaches the browser inside the response for the route
 * it stands in for. Blocking that response outright shows nothing at all — the router
 * simply stays where it is. So a client navigation is held open the way Next actually
 * loads a dynamic route: the link's *prefetch* is let through, which is the request that
 * carries the fallback and nothing else, and the navigation that follows it is held. A
 * hard load can't be held that way, so it is watched instead, by a MutationObserver
 * installed before the first byte.
 *
 * `/settings` is absent on purpose: it is prerendered (`○` in the build output), so its
 * prefetch carries the whole page and the fallback never gets a turn. It exists to keep
 * `/settings` from inheriting the dashboard's skeleton, which is a question about which
 * file wins and is settled in `__tests__/app/loading-skeletons.test.tsx`.
 */

declare global {
  interface Window {
    /** Written by the observer below; read once the real screen has arrived. */
    __skeletonWatch?: { seen: boolean; headerHeight: number | null }
  }
}

/**
 * Hold a client navigation to `pathname` open until the returned function is called,
 * while letting the route's prefetch through.
 *
 * The prefetch of a dynamic route is answered with the segment down to its `loading.tsx`
 * and no further, so letting it through is what puts the skeleton in the router's hands;
 * holding the navigation is what keeps it on screen.
 */
async function holdNavigation(page: Page, pathname: string | RegExp): Promise<() => void> {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })

  await page.route(
    (url) => (typeof pathname === 'string' ? url.pathname === pathname : pathname.test(url.pathname)),
    async (route) => {
      if (route.request().headers()['next-router-prefetch'] === '1') {
        await route.continue()
        return
      }
      await held
      await route.continue()
    }
  )

  return release
}

/**
 * Open the drawer and tap a section, once that section's prefetch has landed.
 *
 * The wait reads the page's own resource timings rather than listening for the response,
 * because *when* a link prefetches is not ours to decide: at 1280px the drawer's links
 * are prefetched while the page is still loading, before a listener could be attached,
 * and at 390px they wait until the drawer slides them on screen. A timing entry answers
 * both — it is there whether the request has just been made or was made before this test
 * looked. The held navigation cannot be mistaken for it: an entry appears when a request
 * finishes, and that one never does.
 */
async function tapSection(page: Page, label: RegExp, pathname: string): Promise<void> {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()

  await expect
    .poll(() =>
      page.evaluate(
        (target) =>
          performance.getEntriesByType('resource').filter((entry) => {
            const url = new URL(entry.name, location.href)
            return url.pathname === target && url.searchParams.has('_rsc')
          }).length,
        pathname
      )
    )
    .toBeGreaterThan(0)

  await page.getByRole('link', { name: label }).click()
}

const skeletonOf = (page: Page) => page.getByTestId('skeleton-screen')

test.describe('the loading skeletons', () => {
  test('answers a tap on Wind Data at once, and hands over without moving', async ({ page }) => {
    await gotoHydrated(page)

    const release = await holdNavigation(page, '/wind-data')
    await tapSection(page, /Wind Data/, '/wind-data')

    // On screen, not merely mounted: the whole point is that the sailor sees something
    // in the instant after the tap.
    await expect(skeletonOf(page)).toBeInViewport()
    const heading = page.getByRole('heading', { name: 'Wind Data' })
    await expect(heading).toBeInViewport()
    const headingBefore = await heading.boundingBox()
    // The header carries the tab strip too, and everything on the screen is stacked
    // under it — so its height is where a mismatch would show up as the cards jumping.
    const headerBefore = await page.getByTestId('section-header').boundingBox()

    release()

    // The real section has a tablist; the skeleton's tab labels deliberately do not.
    await expect(page.getByRole('tab', { name: 'Live & Historical' })).toBeInViewport()
    await expect(skeletonOf(page)).toHaveCount(0)

    const after = await page.getByRole('heading', { name: 'Wind Data' }).boundingBox()
    expect(after?.x).toBeCloseTo(headingBefore?.x ?? -1, 0)
    expect(after?.y).toBeCloseTo(headingBefore?.y ?? -1, 0)
    expect(after?.height).toBeCloseTo(headingBefore?.height ?? -1, 0)

    const headerAfter = await page.getByTestId('section-header').boundingBox()
    expect(headerAfter?.height).toBeCloseTo(headerBefore?.height ?? -1, 0)
  })

  test('shows the dashboard skeleton rather than a blank screen', async ({ page }) => {
    // From Settings back to `/`, since a skeleton is only ever seen on the way *into* a
    // route.
    await gotoHydrated(page, '/settings')

    const release = await holdNavigation(page, '/')
    await tapSection(page, /Dashboard/, '/')

    await expect(skeletonOf(page)).toBeInViewport()
    // The card's own label is real text, so the screen says what is coming rather than
    // showing a field of grey bars.
    await expect(page.getByText('Live Wind')).toBeInViewport()
    // And it says so to a screen reader too, which a blank hold cannot.
    await expect(page.getByText('Loading current conditions')).toHaveCount(1)

    release()
    await expect(skeletonOf(page)).toHaveCount(0)
  })

  test("holds a station's header at exactly the height the real one takes", async ({ page }) => {
    // A station is reached by `router.push` from a row, not a `Link`, so there is no
    // prefetch to let through and nothing to hold: the fallback arrives at the head of
    // the streamed document and is gone as soon as 72 hours of history have been read.
    // So it is watched rather than paused — the observer records the header's height on
    // every mutation while the skeleton is up, and the last reading is its settled one.
    await page.addInitScript(() => {
      window.__skeletonWatch = { seen: false, headerHeight: null }
      const record = (): void => {
        const watch = window.__skeletonWatch
        if (!watch || !document.querySelector('[data-testid="skeleton-screen"]')) return
        watch.seen = true
        const header = document.querySelector('[data-testid="station-header"]')
        if (header) watch.headerHeight = header.getBoundingClientRect().height
      }
      new MutationObserver(record).observe(document, { childList: true, subtree: true })
      record()
    })

    await gotoHydrated(page, '/station/CHII2')

    const watch = await page.evaluate(() => window.__skeletonWatch)
    expect(watch?.seen).toBe(true)

    // The real screen, once the fallback has been replaced by it.
    await expect(skeletonOf(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Go back' })).toBeInViewport()

    const real = await page.getByTestId('station-header').boundingBox()
    // The sticky header is what everything below it is measured from, so a pixel of
    // difference here is a pixel of jump on every card on the screen.
    expect(real?.height).toBeCloseTo(watch?.headerHeight ?? -1, 0)
  })
})
