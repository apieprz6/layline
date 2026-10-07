// PROTOTYPE — LAY-149. Drives variant D's interactions at 390px against `next start -p 4149` and
// shoots each state into /tmp. A click on an unhydrated node succeeds silently, so every step
// asserts the readout actually changed.
import { chromium } from '@playwright/test'

const base = `http://localhost:${process.env.PORT ?? 4149}/boat-performance/instrument-tuning-charts-prototype?variant=D`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

async function open(channel) {
  await page.goto(`${base}&open=${channel}`, { waitUntil: 'networkidle' })
  await page.locator('[role="dialog"]').waitFor({ state: 'visible' })
}

async function shot(name) {
  const sheet = page.locator('[role="dialog"]')
  await sheet.evaluate((node) => {
    node.style.maxHeight = 'none'
    node.style.position = 'absolute'
    node.style.top = '0'
    node.style.bottom = 'auto'
  })
  await page.screenshot({ path: `/tmp/lay149-D2-${name}.png`, fullPage: true })
  await sheet.evaluate((node) => {
    node.style.maxHeight = ''
    node.style.position = 'fixed'
    node.style.top = ''
    node.style.bottom = '0'
  })
}

const readout = () => page.locator('[aria-live="polite"]').innerText()

async function tapSvg(svg, fx, fy) {
  const box = await svg.boundingBox()
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
}

async function expectChange(before, label) {
  const after = await readout()
  console.log(label, after === before ? 'UNCHANGED ✗' : 'changed ✓', '|', after.split('\n')[0])
}

// Compass
await open('hdg')
await shot('hdg-strip')
let before = await readout()
await tapSvg(page.locator('[role="dialog"] svg[role="img"]').first(), 0.12, 0.3)
await expectChange(before, 'hdg tap strip')
await shot('hdg-strip-bin')
await page.getByRole('radio', { name: 'Rose' }).click()
await shot('hdg-rose-bin')
before = await readout()
await tapSvg(page.locator('[role="dialog"] svg[role="img"]').first(), 0.2, 0.62)
await expectChange(before, 'hdg tap rose')
await page.getByRole('button', { name: '+ 22 Aug' }).click()
await shot('hdg-rose-race')

// Wind
await open('awa')
await shot('awa-season')
before = await readout()
await page.getByRole('button', { name: /^22 Aug/ }).first().click()
await expectChange(before, 'awa race chip')
await shot('awa-race')
before = await readout()
await page.locator('details button').first().click()
await expectChange(before, 'awa pair tap')
await shot('awa-pair')
await page.getByRole('button', { name: /^Before 4 Jul/ }).click()
await shot('awa-before')

// Speed
await open('stw')
await shot('stw-scatter')
before = await readout()
await tapSvg(page.locator('[role="dialog"] svg[role="img"]').first(), 0.75, 0.5)
await expectChange(before, 'stw tap band')
await page.getByRole('radio', { name: 'Gap by speed' }).click()
await shot('stw-gap-band')
before = await readout()
await page.getByRole('radio', { name: 'SOG on STW' }).click()
await expectChange(before, 'stw fit method')
await shot('stw-gap-ols')
await page.getByRole('button', { name: '22 Aug' }).click()
await shot('stw-gap-race')

console.log('h-overflow', await page.evaluate(() => document.documentElement.scrollWidth > 390))
await browser.close()
