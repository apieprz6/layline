// PROTOTYPE — throwaway. Screenshots + chrome measurements for every variant at every width.
// node app/prototype/station-chrome/shots.mjs [baseURL] [outDir]
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://127.0.0.1:4268'
const out = process.argv[3] ?? '/tmp/lay168-shots'
const WIDTHS = [
  { name: 'phone', w: 390, h: 844 },
  { name: 'tablet', w: 820, h: 1180 },
  { name: 'desktop', w: 1280, h: 800 },
  { name: 'wide', w: 1536, h: 864 },
  { name: 'ultrawide', w: 2560, h: 1080 },
]

const browser = await chromium.launch()
for (const v of ['A', 'B', 'C']) {
  for (const { name, w, h } of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.goto(`${base}/prototype/station-chrome?variant=${v}`)
    await page.waitForSelector('svg')
    await page.waitForTimeout(800)
    const m = await page.evaluate(() => {
      const fixed = [...document.querySelectorAll('div')].filter((el) => {
        const s = getComputedStyle(el)
        return (s.position === 'fixed' || s.position === 'sticky') && el.offsetHeight > 0 && el.offsetHeight < 400
      })
      return {
        chrome: fixed.map((el) => `${getComputedStyle(el).position}:${Math.round(el.getBoundingClientRect().height)}`),
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    console.log(v, name, w, JSON.stringify(m))
    await page.screenshot({ path: `${out}/${v}-${name}.png` })
    await page.close()
  }
}
await browser.close()
