import type { ReactElement } from 'react'
import BoatPerformanceContent from '@/components/boat/BoatPerformanceContent'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readRaces } from '@/services/races/readRaces'

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

  // Read only after the Guest has been turned away, so a signed-out request reveals nothing about
  // the archive — not even whether it has anything in it.
  const races = await readRaces()

  return <BoatPerformanceContent races={races} canWrite={canWrite(account)} />
}
