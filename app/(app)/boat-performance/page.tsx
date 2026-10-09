import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import PolarPerformanceTeaser, { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import SailSelectionTeaser, {
  SAIL_SELECTION_TEASER_RACES,
} from '@/components/analysis/SailSelectionTeaser'
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
import { chartAgreement, getSailSelectionData } from '@/services/analysis/sail-selection'
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
 * The Overall tab: the Polar performance teaser, and how well the Sail selection chart matches
 * what the boat actually does.
 *
 * A failed read and an empty archive are different screens, for the reason
 * `/boat-performance/polar` gives: "no races" over a failed read would be Layline claiming the
 * sailor has sailed nothing.
 *
 * ## One read, two windows
 *
 * The two cards look back over **different numbers of races on purpose**, and the wider of the two
 * is what gets read. The Polar card's figure is a glance at recent form, which five races answer.
 * Agreement with the chart is only legible on a race that recorded which sails it carried, and on
 * this archive those are the seven most recent — so ten races hold every judgeable row there is
 * (`SAIL_SELECTION_TEASER_RACES`), where five would have cost the same to read and seen a third
 * fewer of them.
 *
 * So the ten are read once and the Polar card takes its own five out of them, rather than two
 * reads overlapping on five races. The Races are ordered by the **database** on `window_start`
 * descending — the date each race was *sailed* and never the date it was typed in, so an archive
 * backfilled in one afternoon still teases the races last sailed, and "the first five" is a
 * meaningful slice rather than an accident of insertion order.
 *
 * It is still a limit and not the whole archive, which is most of what this tab costs: the
 * remaining races' Transcriptions would be read, assessed and scored to produce rows nobody here
 * would ever see.
 *
 * ## What is not read
 *
 * The **Crossover Chart** read goes out alongside the rows rather than after them: which sails the
 * boat owns is a question no row has a say in. **No Polar is read**, and none is needed — each
 * row's own **Target Speed** came from the Polar its own Race was sailed under (ADR 0012) and
 * travels with it. The one thing a Polar would add is which region of the chart can never carry a
 * figure, which this card does not state and the screen itself does.
 */
async function OverallTab(): Promise<ReactElement> {
  const [recent, chart] = await Promise.all([
    readRecentRaceRows(Math.max(TEASER_RACES, SAIL_SELECTION_TEASER_RACES)),
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

  // The Polar card's own five, out of the ten read for the card below it. Taken by **Race** and
  // then by row, never as the first N rows: a race is thousands of rows and the count differs
  // wildly between them, so slicing rows would put some fraction of a sixth race in the figure.
  const polarRaces = recent.races.slice(0, TEASER_RACES)
  const polarRaceIds = new Set(polarRaces.map((race) => race.id))

  return (
    <>
      <PolarPerformanceTeaser
        // What the figure is actually over, which on a young archive is fewer than five.
        races={polarRaces.length}
        efficiency={sumEfficiency(recent.rows.filter((row) => polarRaceIds.has(row.race_id)))}
      />

      <SailSelectionTeaser
        races={recent.races.length}
        agreement={
          payload === null
            ? null
            : chartAgreement(
                getSailSelectionData(
                  recent.rows,
                  EMPTY_FILTER,
                  // No dimension registry is needed: nothing here is narrowed, and passing the
                  // screen's own would mean building a vocabulary this card never shows.
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
