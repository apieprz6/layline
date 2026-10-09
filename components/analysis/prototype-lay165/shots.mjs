/**
 * PROTOTYPE (LAY-165) — THROWAWAY. Shoots every variant × view at 390px and at a desktop width.
 *
 *     LAYLINE_LAY165=1 npx next start -p 4165 &
 *     node components/analysis/prototype-lay165/shots.mjs
 *
 * Writes /tmp/lay165-<view>-<variant>-<width>.png. A real browser against `next start`, never
 * `next dev`: in this environment `next dev` never hydrates (AGENTS.md).
 */

import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:4165/dev/polar-picture'
const VARIANTS = ['A', 'B', 'C']
const VIEWS = ['season', 'race', 'teaser']
const WIDTHS = [390, 1280]

const browser = await chromium.launch()

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 1200 : 1100 } })

  for (const view of VIEWS) {
    for (const variant of VARIANTS) {
      if (view === 'teaser' && width === 1280) continue

      const url = `${BASE}?view=${view}&variant=${variant}`
      await page.goto(url, { waitUntil: 'networkidle' })
      // Hydration, properly: the switcher is a Client Component, so a responsive button means the
      // tree is live. A click on an un-hydrated node succeeds and proves nothing.
      await page.waitForSelector('[data-testid="prototype-switcher"]')
      await page.waitForTimeout(250)

      const file = `/tmp/lay165-${view}-${variant}-${width}.png`
      await page.screenshot({ path: file, fullPage: view !== 'teaser' })
      console.log(file)
    }
  }

  await page.close()
}

await browser.close()
