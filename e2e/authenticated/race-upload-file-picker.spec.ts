import { test, expect } from '@playwright/test'
import { gotoHydrated } from '../hydrated'

/**
 * The first spec run under the admin fixture `e2e/auth.setup.ts` bootstraps — and the reason
 * LAY-137 exists. LAY-134 drew the File step's "Choose File" control as a real card rather than a
 * bare `<input type="file">`, but its PR shipped with an unchecked test-plan item: no authenticated
 * Playwright harness existed to actually click it. This closes that.
 *
 * `e2e/race-routes.spec.ts` already covers the guest arm of this same route; a signed-in
 * non-admin's refusal is Jest's, in `app/(app)/boat-performance/upload/__tests__/page.test.tsx`.
 * What only a real browser can answer is the one this spec asks: does clicking anywhere on the
 * card actually focus the file input a browser's native picker attaches to.
 */

test.describe('the race upload FILE step, to an admin', () => {
  test('opens straight to the wizard, and the whole FilePicker card is one click target', async ({
    page,
  }) => {
    await gotoHydrated(page, '/boat-performance/upload')

    // Reaching the wizard at all is the admin assertion: a guest is bounced to the sheet
    // (e2e/race-routes.spec.ts) and a signed-in non-admin sees a refusal, never this route's URL.
    await expect(page).toHaveURL(/\/boat-performance\/upload$/)

    const card = page.locator('label[for="race-file"]')
    await expect(card).toBeVisible()
    await expect(card).toContainText('qtVlm CSV export')
    await expect(card).toContainText('No file chosen yet')

    const input = page.getByLabel('qtVlm CSV export')
    await expect(input).toHaveAttribute('type', 'file')

    // LAY-134's whole point: the click target is the entire card, not a compact button sized to
    // the "↑" glyph in its corner. A click far from that glyph still has to reach the real input.
    await card.click({ position: { x: 10, y: 10 } })
    await expect(input).toBeFocused()
  })
})
