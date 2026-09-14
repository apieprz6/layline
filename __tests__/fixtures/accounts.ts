import type { Account } from '@/types'

/**
 * A signed-in sailor, for the suites that only need the **Account** to be
 * something rather than `null`.
 *
 * One fixture rather than one per suite, so that a change to the shape of an
 * **Account** breaks compilation in a single place. The **Role** is `viewer`
 * deliberately: every signed-in sailor reads everything, and a fixture that was
 * `admin` by default would let a screen accidentally gate on the wrong thing and
 * still pass (ADR 0017).
 */
export const CREW: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  displayName: 'Jamie Torres',
  role: 'viewer',
}
