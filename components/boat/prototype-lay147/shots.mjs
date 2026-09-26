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

await browser.close()
