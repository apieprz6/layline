import { test, expect, type Page } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The Boat performance Overall cards on the **Dashboard**, where a real browser puts them.
 *
 * Which cards a sailor gets, and that a Guest gets none, is Jest's (`(dashboard)/__tests__`). What
 * only a browser can see is the arrangement: the three below the live wind card, stacked on a
 * phone, and side by side in one row on a desktop and an ultrawide — neither crushed under the
 * 360px the teasers were drawn for, nor stretched past the 760px the season rail stops at.
 *
 * The archive project's synthetic race is what guarantees each card has something to draw.
 */

type Box = { x: number; y: number; width: number; height: number }

const CARD_HREFS = [
  '/boat-performance/polar',
  '/boat-performance/sail-selection',
  '/boat-performance/instrument-tuning',
]

async function measure(page: Page): Promise<{ wind: Box; cards: Box[] }> {
  const wind = page.getByText('Live Wind', { exact: true })
  const boat = page.getByRole('region', { name: 'Boat performance' })
  await expect(boat).toBeVisible()

  const cards: Box[] = []
  for (const href of CARD_HREFS) {
    const card = boat.locator(`a[href="${href}"]`)
    await expect(card).toBeVisible()
    cards.push((await card.boundingBox())!)
  }

  return { wind: (await wind.boundingBox())!, cards }
}

test.describe('The Dashboard, to a signed-in sailor', () => {
  test('puts the three Overall cards below the live wind, stacked on a phone and in a row on a desktop', async ({
    page,
  }) => {
    await gotoHydrated(page, '/')
    const { wind, cards } = await measure(page)
    const viewport = page.viewportSize()!

    for (const card of cards) expect(card.y).toBeGreaterThan(wind.y + wind.height)

    if (viewport.width < 1280) {
      // Stacked, in order, each the full width of the column.
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].y).toBeGreaterThanOrEqual(cards[i - 1].y + cards[i - 1].height)
        expect(Math.abs(cards[i].x - cards[0].x)).toBeLessThanOrEqual(1)
      }
      expect(cards[0].x + cards[0].width).toBeLessThanOrEqual(viewport.width)
    } else {
      expectOneRow(cards)
    }
  })

  test('keeps the row of three on an ultrawide, none stretched past what it was drawn for', async ({
    page,
  }) => {
    test.skip(page.viewportSize()!.width < 1280, 'An ultrawide is a desktop question.')

    await page.setViewportSize({ width: 2560, height: 1080 })
    await gotoHydrated(page, '/')
    const { cards } = await measure(page)

    expectOneRow(cards)
    for (const card of cards) expect(card.width).toBeLessThanOrEqual(760)
  })
})

/** Same top, left to right in order without overlapping, and none under the teasers' 360px. */
function expectOneRow(cards: Box[]): void {
  for (let i = 0; i < cards.length; i++) {
    expect(Math.abs(cards[i].y - cards[0].y)).toBeLessThanOrEqual(1)
    expect(cards[i].width).toBeGreaterThanOrEqual(360)
    if (i > 0) expect(cards[i].x).toBeGreaterThanOrEqual(cards[i - 1].x + cards[i - 1].width)
  }
}
