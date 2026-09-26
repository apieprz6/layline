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
