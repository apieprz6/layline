import { chromium } from '@playwright/test'

const base = 'http://localhost:4111/boat-performance/instrument-tuning-prototype'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 900 } })

for (const v of ['A', 'B', 'C']) {
  for (const view of ['screen', 'overall']) {
    await page.goto(`${base}?variant=${v}&view=${view}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `/tmp/lay147-${v}-${view}.png`, fullPage: true })
    const h = await page.evaluate(() => document.body.scrollHeight)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > 390)
    console.log(v, view, 'height', h, 'h-overflow', overflow)
  }
}

// Variant A's cards open a drawer, so they only prove anything once clicked — and a click only
// lands on a hydrated node, which is why this runs against `next start` and never `next dev`.
await page.goto(`${base}?variant=A&view=screen`, { waitUntil: 'networkidle' })
const cards = page.locator('section[role="button"]')
const count = await cards.count()
for (let index = 0; index < count; index += 1) {
  await cards.nth(index).click()
  const drawer = page.locator('[role="dialog"]')
  await drawer.waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(250)
  const channel = ['hdg', 'awa', 'stw'][index]
  await page.screenshot({ path: `/tmp/lay147-drawer-${channel}.png` })
  const clipped = await drawer.evaluate((node) => node.scrollHeight > node.clientHeight)
  console.log('drawer', channel, 'scrolls', clipped)
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'detached', timeout: 5000 })
}

await browser.close()
