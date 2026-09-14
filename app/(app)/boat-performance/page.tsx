import type { ReactElement } from 'react'
import BoatPerformanceContent from '@/components/boat/BoatPerformanceContent'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'

export const dynamic = 'force-dynamic'

/**
 * **Boat performance** — a signed-in screen, and only that.
 *
 * Same shape as `/boat-management`, and see that page for why the **Account** is
 * resolved a second time here rather than reaching this page as a prop.
 */
export default async function BoatPerformancePage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance')

  return <BoatPerformanceContent />
}
