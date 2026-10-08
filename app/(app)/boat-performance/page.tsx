import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import PolarPerformanceTeaser, { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import BoatPerformanceContent from '@/components/boat/BoatPerformanceContent'
import BoatPerformanceSkeleton from '@/components/boat/BoatPerformanceSkeleton'
import EmptyState from '@/components/common/EmptyState'
import Skeleton from '@/components/common/Skeleton'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { sumEfficiency } from '@/services/analysis/efficiency'
import { recentRaceRows } from '@/services/analysis/polar-performance'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
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

  return (
    <BoatPerformanceContent
      races={races}
      canWrite={writable}
      // Its own boundary, inside this one. The Races tab is a single `races` read and the Overall
      // tab is the whole archive scored, so a shared `await` would make the list wait on the
      // figures behind a tab the sailor may never open.
      overall={
        <Suspense fallback={<Skeleton height="92px" radius="var(--radius-md)" />}>
          <OverallTab />
        </Suspense>
      }
    />
  )
}

/**
 * The Overall tab: the Polar performance teaser, over the last five races.
 *
 * A failed read and an empty archive are different screens, for the reason
 * `/boat-performance/polar` gives: "no races" over a failed read would be Layline claiming the
 * sailor has sailed nothing.
 *
 * The race order comes from `archive.races`, which is `window_start` descending — the date each
 * race was *sailed* and never the date it was typed in, so an archive backfilled in one afternoon
 * still teases the five most recent races.
 */
async function OverallTab(): Promise<ReactElement> {
  const archive = await readAnalysisArchive()

  if (archive === null) return <ArchiveUnreadable />

  if (archive.races.length === 0) {
    return (
      <EmptyState
        mark="📈"
        title="Nothing to summarise yet"
        detail="Season figures appear here once a race has been uploaded."
      />
    )
  }

  const raceIds = archive.races.map((race) => race.id)
  const recent = recentRaceRows(archive.rows, raceIds, TEASER_RACES)

  return (
    <PolarPerformanceTeaser
      races={Math.min(TEASER_RACES, raceIds.length)}
      efficiency={sumEfficiency(recent)}
    />
  )
}
