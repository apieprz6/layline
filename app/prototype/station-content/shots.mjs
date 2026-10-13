// PROTOTYPE — throwaway. Screenshots of every variant × station × width, plus the missing-reading state.
// node app/prototype/station-content/shots.mjs [baseURL] [outDir]
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://127.0.0.1:4269'
const out = process.argv[3] ?? '/tmp/lay169-shots'
const WIDTHS = [
  { name: 'phone', w: 390, h: 844 },
  { name: 'tablet', w: 820, h: 1180 },
  { name: 'desktop', w: 1280, h: 800 },
  { name: 'wide', w: 1536, h: 864 },
]
const CASES = [
  { name: 'chii2', q: 'buoy=CHII2' },
  { name: 'purdue', q: 'buoy=45198' },
  { name: 'purdue-missing', q: 'buoy=45198&missing=1' },
]

const browser = await chromium.launch()
for (const v of ['A', 'B', 'C']) {
  for (const c of CASES) {
    for (const { name, w, h } of WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      await page.goto(`${base}/prototype/station-content?variant=${v}&${c.q}`)
      await page.waitForSelector('svg')
      await page.waitForTimeout(900)
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      console.log(v, c.name, name, overflowX ? 'OVERFLOW-X' : 'ok')
      await page.screenshot({ path: `${out}/${v}-${c.name}-${name}.png`, fullPage: w < 768 })
      await page.close()
    }
  }
}
await browser.close()
