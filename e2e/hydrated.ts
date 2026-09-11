import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Navigate, then wait until React has actually attached.
 *
 * Always use this instead of a bare `page.goto()` before clicking anything.
 * `goto()` resolves on `load`, which is *before* hydration, and a click on an
 * un-hydrated node still succeeds — the DOM element is there, it just has no
 * handler yet — so Playwright never retries and the assertion after it fails
 * for a reason that looks nothing like a race.
 *
 * The marker is React's own `__reactFiber$…` expando, which only appears on a
 * node once it has been hydrated.
 */
export async function gotoHydrated(page: Page, path = '/'): Promise<void> {
  await page.goto(path)

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.body
          const walk = (el: Element): boolean =>
            Object.keys(el).some((k) => k.startsWith('__reactFiber$')) ||
            Array.from(el.children).some(walk)
          return walk(root)
        }),
      {
        message: 'React never attached — see playwright.config.ts on why this suite avoids `next dev`',
        timeout: 15_000,
      }
    )
    .toBe(true)
}
