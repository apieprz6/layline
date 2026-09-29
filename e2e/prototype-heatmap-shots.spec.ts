/**
 * PROTOTYPE — throwaway. Not a test: a camera.
 *
 * LAY-148 is a HITL prototype ticket and the sailor has to *see* the three variants to pick one.
 * `next dev` never hydrates in this environment, so the only way to get a real picture at 390px is
 * the production server Playwright already starts. It asserts nothing beyond "the page rendered" —
 * the judgement is the human's.
 *
 * Both themes, because one variant's whole argument is about what survives `.theme-nightvision`.
 */

import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydrated'

const ROUTE = '/boat-performance/races/prototype-heatmap'

const CASES = [
  { variant: 'a', race: 'chi-wauk', theme: 'day' },
  { variant: 'b', race: 'chi-wauk', theme: 'day' },
  { variant: 'c', race: 'chi-wauk', theme: 'day' },
  { variant: 'a', race: 'chi-wauk', theme: 'nightvision' },
  { variant: 'b', race: 'chi-wauk', theme: 'nightvision' },
  { variant: 'c', race: 'chi-wauk', theme: 'nightvision' },
  { variant: 'a', race: 'chi-stjoe', theme: 'day' },
  { variant: 'b', race: 'chi-stjoe', theme: 'day' },
  { variant: 'c', race: 'chi-stjoe', theme: 'day' },
] as const

for (const shot of CASES) {
  test(`variant ${shot.variant} · ${shot.race} · ${shot.theme}`, async ({ page }) => {
    await gotoHydrated(
      page,
      `${ROUTE}?variant=${shot.variant}&race=${shot.race}&theme=${shot.theme}`
    )

    // The theme is applied by an effect on the client, so wait for the class rather than the load.
    if (shot.theme === 'nightvision') {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('theme-nightvision')))
        .toBe(true)
    }

    await expect(page.locator('svg[role="img"]').first()).toBeVisible()

    // The switcher is `position: fixed`, so in a full-page capture it lands in the middle of the
    // page and hides the very sections the layout question is about.
    await page
      .locator('[data-prototype-switcher]')
      .evaluate((node: HTMLElement) => {
        node.style.display = 'none'
      })

    await page.screenshot({
      path: `e2e/.artifacts/lay148/${shot.variant}-${shot.race}-${shot.theme}.png`,
      fullPage: true,
    })
  })
}

/**
 * The one thing here that *is* a test, because it is the one thing a picture cannot show and a click
 * cannot be trusted to prove: a Playwright click on an un-hydrated node succeeds silently, so "the
 * zoom button was clicked" says nothing. The assertion is on the transform the map actually carries.
 */
test('variant a · the map zooms and pans', async ({ page }) => {
  await gotoHydrated(page, `${ROUTE}?variant=a&race=chi-wauk&theme=day`)

  const layer = page.locator('svg[role="img"] g[clip-path] > g')
  await expect(layer).toHaveAttribute('transform', 'translate(0 0) scale(1)')

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()

  const zoomedIn = await layer.getAttribute('transform')
  // Two 1.6× steps. Read the number rather than matching the string: 1.6 × 1.6 is 2.5600000000000005.
  expect(scaleOf(zoomedIn)).toBeCloseTo(2.56, 4)

  // Drag the track: at 2.56× there is somewhere to pan to, and the translate must move with the hand.
  const box = await page.locator('svg[role="img"]').boundingBox()
  if (!box) throw new Error('the map has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 60, { steps: 8 })
  await page.mouse.up()

  const panned = await layer.getAttribute('transform')
  expect(panned).not.toBe(zoomedIn)

  await page
    .locator('[data-prototype-switcher]')
    .evaluate((node: HTMLElement) => {
      node.style.display = 'none'
    })

  await page.screenshot({ path: 'e2e/.artifacts/lay148/a-chi-wauk-day-zoomed.png', fullPage: true })

  // And back: the whole track, which is the state every other capture is taken in.
  await page.getByRole('button', { name: 'Whole track' }).click()
  await expect(layer).toHaveAttribute('transform', 'translate(0 0) scale(1)')
})

function scaleOf(transform: string | null): number {
  const found = transform?.match(/scale\(([\d.]+)\)/)
  if (!found) throw new Error(`no scale in transform: ${transform}`)

  return Number(found[1])
}
