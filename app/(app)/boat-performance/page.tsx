import type { ReactElement } from 'react'
import BoatPerformanceContent from '@/components/boat/BoatPerformanceContent'
import LockedBoatScreen from '@/components/boat/LockedBoatScreen'
import { resolveAccount } from '@/lib/account/resolveAccount'

export const dynamic = 'force-dynamic'

/**
 * **Boat performance** — locked for a **Guest**, open for a signed-in sailor.
 *
 * Same shape as `/boat-management`, and see that page for why the **Account** is
 * resolved a second time here rather than reaching this page as a prop.
 */
export default async function BoatPerformancePage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) {
    return (
      <LockedBoatScreen
        title="Boat performance"
        invitation="Sign in to read this boat's race archive."
      />
    )
  }

  return <BoatPerformanceContent />
}
