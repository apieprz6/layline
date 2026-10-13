// PROTOTYPE — throwaway. Today's /station/CHII2 chrome, measured, for comparison with the variants.
// node app/prototype/station-chrome/shots-baseline.mjs [baseURL] [outDir]
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://127.0.0.1:4268'
const out = process.argv[3] ?? '/tmp/lay168-shots'
const browser = await chromium.launch()
for (const [name, w, h] of [['phone', 390, 844], ['desktop', 1280, 800], ['ultrawide', 2560, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(`${base}/station/CHII2`)
  await page.waitForSelector('svg')
  await page.waitForTimeout(800)
  const m = await page.evaluate(() => ({
    header: Math.round(document.querySelector('[data-testid=station-header]').getBoundingClientRect().height),
    dock: Math.round(document.querySelector('.bottom-dock').getBoundingClientRect().height),
  }))
  console.log('baseline', name, w, JSON.stringify(m))
  await page.screenshot({ path: `${out}/base-${name}.png` })
  await page.close()
}
await browser.close()
