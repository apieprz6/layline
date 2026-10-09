/**
 * PROTOTYPE (LAY-165) — THROWAWAY. Drives variant A's interactions and asserts they did something.
 *
 *     LAYLINE_LAY165=1 npx next start -p 4165 &
 *     node components/analysis/prototype-lay165/shots-a.mjs
 *
 * A click on an un-hydrated node *succeeds* in this environment (AGENTS.md), so every step below
 * reads the DOM back rather than trusting the click: a tap must produce a readout, the arrow keys
 * must move it, and the radius toggle must survive it.
 */

import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:4165/dev/polar-picture'
const browser = await chromium.launch()

for (const [label, url, width] of [
  ['season', `${BASE}?variant=A&view=season`, 390],
  ['race', `${BASE}?variant=A&view=race`, 390],
  ['season-wide', `${BASE}?variant=A&view=season`, 1280],
]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 1300 : 1100 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="rose"]')

  // Nothing selected yet.
  if ((await page.locator('[data-testid="bin-detail"]').count()) !== 0) {
    throw new Error(`${label}: a bin was selected before anything was tapped`)
  }

  // Tap the 50–60° sector, which every race in this archive has sailed.
  await page.locator('[data-testid="bin-50"]').click()
  const first = await page.locator('[data-testid="bin-detail"]').innerText()
  if (!first.includes('50–60°')) throw new Error(`${label}: tapped 50° and read "${first}"`)

  await page.screenshot({ path: `/tmp/lay165-A-${label}-selected.png`, fullPage: true })

  // ←/→ belong to the chart once it has focus, and must not reach the switcher.
  await page.locator('[data-testid="rose"]').focus()
  await page.keyboard.press('ArrowRight')
  const second = await page.locator('[data-testid="bin-detail"]').innerText()
  if (second === first) throw new Error(`${label}: ArrowRight did not move the selection`)
  const stillA = await page.locator('[data-testid="prototype-switcher"]').innerText()
  if (!stillA.includes('A ·')) throw new Error(`${label}: ArrowRight changed variant to "${stillA}"`)

  // The radius toggle is a second reading of one state: the selection survives it.
  await page.locator('[data-testid="radius-pct"]').click()
  await page.waitForSelector('[data-testid="on-target"]')
  const third = await page.locator('[data-testid="bin-detail"]').innerText()
  if (third.split('°')[0] !== second.split('°')[0]) {
    throw new Error(`${label}: the selection did not survive the radius toggle`)
  }

  await page.screenshot({ path: `/tmp/lay165-A-${label}-pct.png`, fullPage: true })
  console.log(`${label}: tap, keys and toggle all hold`)
  await page.close()
}

await browser.close()
