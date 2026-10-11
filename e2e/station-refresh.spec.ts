import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydrated'

/**
 * The refresh control on a station screen, exercised as a real click in a real
 * browser.
 *
 * This is here because the first version of the control passed every unit test and
 * did nothing at all in production: the response it asked for was being served by a
 * cache in front of the handler, so the tap never reached the code under test. What
 * has to be true is a sequence of requests, which is not a thing jsdom can observe.
 */

/** Requests the screen makes to the buoy API, in the order it makes them. */
function watchBuoyCalls(page: Parameters<typeof gotoHydrated>[0]): string[] {
  const calls: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/weather/buoys')) {
      calls.push(`${request.method()} ${url.pathname}${url.search}`)
    }
  })
  return calls
}

const HISTORY_READ = 'GET /api/weather/buoys/history'
const PURGE = 'POST /api/weather/buoys/refresh?buoyId=CHII2'

test.describe('the refresh control on a station screen', () => {
  test('reads again on arrival without being asked', async ({ page }) => {
    // The server render is a seed, not the last word — it can be most of a freshness
    // window old by the time it is looked at.
    const calls = watchBuoyCalls(page)

    await gotoHydrated(page, '/station/CHII2')

    await expect
      .poll(() => calls.filter((call) => call === HISTORY_READ).length)
      .toBeGreaterThan(0)
  })

  test('expires the stored reading before reading again', async ({ page }) => {
    const calls = watchBuoyCalls(page)

    await gotoHydrated(page, '/station/CHII2')

    const refresh = page.getByRole('button', { name: 'Refresh this reading' })
    await expect(refresh).toBeVisible()

    await expect.poll(() => calls.length).toBeGreaterThan(0)
    const before = calls.length

    await refresh.click()

    // Reading alone is answered from inside the window with the same reading and the
    // same `fetchedAt`, so the screen would not change and the fetch age in the
    // header would carry on climbing. The purge has to come first.
    await expect.poll(() => calls.slice(before)).toContain(PURGE)
    await expect.poll(() => calls.slice(before)).toContain(HISTORY_READ)

    const after = calls.slice(before)
    expect(after.indexOf(PURGE)).toBeLessThan(after.indexOf(HISTORY_READ))
  })

  test('is not offered by the skeleton header, which has nothing to ask again', async ({
    page,
  }) => {
    await gotoHydrated(page, '/station/CHII2')

    // One control, on the real header — the skeleton's copy of the header holds the
    // shape and takes no taps.
    await expect(page.getByRole('button', { name: /refresh/i })).toHaveCount(1)
  })
})
