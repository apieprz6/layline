// PROTOTYPE — LAY-149. Shoots every variant's three sheets and its per-Race tile at 390px into /tmp.
// `npm run prototype:lay149` (or `next start -p 4149` after a build), then
// `node components/boat/prototype-lay149/shots.mjs`. Clicks the real cards, so it needs hydration —
// which is why it runs against `next start`, never `next dev`.
import { chromium } from '@playwright/test'

const base = `http://localhost:${process.env.PORT ?? 4149}/boat-performance/instrument-tuning-charts-prototype`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

for (const v of ['A', 'B', 'C', 'D']) {
  await page.goto(`${base}?variant=${v}`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `/tmp/lay149-${v}-screen.png`, fullPage: true })
  const cards = page.locator('section[role="button"]')
  for (const [index, channel] of ['hdg', 'awa', 'stw'].entries()) {
    await cards.nth(index).click()
    const sheet = page.locator('[role="dialog"]')
    await sheet.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(200)
    // Unroll the sheet so the whole chart is in one capture.
    await sheet.evaluate((node) => {
      node.style.maxHeight = 'none'
      node.style.position = 'absolute'
      node.style.top = '0'
      node.style.bottom = 'auto'
    })
    await page.screenshot({ path: `/tmp/lay149-${v}-${channel}.png`, fullPage: true })
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > 390)
    console.log(v, channel, 'h-overflow', wide)
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached', timeout: 5000 })
  }
  await page.goto(`${base}?variant=${v}&view=tile`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `/tmp/lay149-${v}-tile.png`, fullPage: true })
}
await browser.close()
