import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import PolarPerformanceTeaser, { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import SailSelectionTeaser from '@/components/analysis/SailSelectionTeaser'
import BoatPerformanceContent from '@/components/boat/BoatPerformanceContent'
import BoatPerformanceSkeleton from '@/components/boat/BoatPerformanceSkeleton'
import EmptyState from '@/components/common/EmptyState'
import Skeleton from '@/components/common/Skeleton'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { sumEfficiency } from '@/services/analysis/efficiency'
import { EMPTY_FILTER } from '@/services/analysis/filter'
import { readRecentRaceRows } from '@/services/analysis/readArchive'
import { getSailSelectionData, gridCoverage } from '@/services/analysis/sail-selection'
import { readCrossoverChartScreen } from '@/services/boat/readCrossoverChartVersions'
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
 * The Overall tab: the Polar performance teaser, and the Sail selection chart's coverage, over the
 * last five races.
 *
 * A failed read and an empty archive are different screens, for the reason
 * `/boat-performance/polar` gives: "no races" over a failed read would be Layline claiming the
 * sailor has sailed nothing.
 *
 * The five most recent races are chosen by the **database**, ordered on `window_start` descending
 * — the date each race was *sailed* and never the date it was typed in, so an archive backfilled in
 * one afternoon still teases the five races last sailed. Reading only those five rather than the
 * whole archive is most of what this tab costs: the other eight races' Transcriptions were being
 * read, assessed and scored to produce rows nobody here would ever see.
 *
 * The **Crossover Chart** read goes out alongside the rows rather than after them: which sails the
 * boat owns is a question no row has a say in. No **Polar** is read for the sail-selection row,
 * because coverage is a question about cells reached and not about targets — so nothing here needs
 * to know which region of the chart can never carry a figure, and the screen itself says that.
 */
async function OverallTab(): Promise<ReactElement> {
  const [recent, chart] = await Promise.all([
    readRecentRaceRows(TEASER_RACES),
    readCrossoverChartScreen(),
  ])

  if (recent === null) return <ArchiveUnreadable />

  if (recent.races.length === 0) {
    return (
      <EmptyState
        mark="📈"
        title="Nothing to summarise yet"
        detail="Season figures appear here once a race has been uploaded."
      />
    )
  }

  const payload = chart?.current?.payload ?? null

  return (
    <>
      <PolarPerformanceTeaser
        // What the figure is actually over, which on a young archive is fewer than five.
        races={recent.races.length}
        efficiency={sumEfficiency(recent.rows)}
      />

      <SailSelectionTeaser
        races={recent.races.length}
        coverage={
          payload === null
            ? null
            : gridCoverage(
                getSailSelectionData(
                  recent.rows,
                  EMPTY_FILTER,
                  // No dimension registry is needed to count cells, and passing the screen's own
                  // would mean building a vocabulary this card never shows.
                  [],
                  payload,
                  null
                ).cells
              )
        }
      />
    </>
  )
}
