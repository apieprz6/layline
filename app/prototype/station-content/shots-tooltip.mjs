// PROTOTYPE — throwaway. Opens the elevation note in each variant and checks it doesn't push the page sideways.
// node app/prototype/station-content/shots-tooltip.mjs [baseURL] [outDir]
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://127.0.0.1:4269'
const out = process.argv[3] ?? '/tmp/lay169-shots'
const CASES = [
  ['A', 390, 844, 'buoy=CHII2'],
  ['B', 390, 844, 'buoy=CHII2'],
  ['C', 390, 844, 'buoy=CHII2'],
  ['C', 1280, 800, 'buoy=CHII2'],
  ['A', 390, 844, 'buoy=45198'],
  ['B', 820, 1180, 'buoy=45198&missing=1'],
]

const browser = await chromium.launch()
for (const [v, w, h, q] of CASES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(`${base}/prototype/station-content?variant=${v}&${q}`)
  await page.waitForTimeout(1500)
  const btn = page.getByRole('button', { name: /Measured at/ })
  const hasNote = (await btn.count()) > 0
  if (hasNote) {
    await btn.first().click()
    await page.waitForTimeout(300)
  }
  const tip = await page.getByRole('tooltip').count()
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  console.log(v, w, q, { hasNote, tip, overflowX })
  await page.screenshot({ path: `${out}/tip-${v}-${w}-${q.replace(/[=&]/g, '_')}.png` })
  await page.close()
}
await browser.close()
