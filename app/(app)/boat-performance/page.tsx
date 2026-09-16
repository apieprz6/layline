import { Suspense, type ReactElement } from 'react'
import BoatPerformanceContent from '@/components/boat/BoatPerformanceContent'
import BoatPerformanceSkeleton from '@/components/boat/BoatPerformanceSkeleton'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readRaces } from '@/services/races/readRaces'

export const dynamic = 'force-dynamic'

/**
 * **Boat performance** — a signed-in screen, and only that.
 *
 * Same shape as `/boat-management`, and see that page for why the **Account** is
 * resolved a second time here rather than reaching this page as a prop, and for why the
 * skeleton is a boundary inside the page rather than a `loading.tsx` beside it.
 */
export default async function BoatPerformancePage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance')

  return (
    <Suspense fallback={<BoatPerformanceSkeleton />}>
      <RaceArchiveScreen canWrite={canWrite(account)} />
    </Suspense>
  )
}

/**
 * The read, behind the boundary.
 *
 * A guest never reaches this — it is rendered only after the guard above has let the
 * request through, so a signed-out request still reveals nothing about the archive, not
 * even whether it has anything in it.
 *
 * Named for the screen and not for the **Race Archive** itself, matching
 * `BoatSetupScreen` next door.
 */
async function RaceArchiveScreen({
  canWrite: writable,
}: {
  canWrite: boolean
}): Promise<ReactElement> {
  const races = await readRaces()

  return <BoatPerformanceContent races={races} canWrite={writable} />
}
