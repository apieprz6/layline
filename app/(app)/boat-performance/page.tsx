import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import InstrumentTuningTeaser from '@/components/analysis/InstrumentTuningTeaser'
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
import { readInstrumentTuning } from '@/services/analysis/readInstrumentTuning'
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
      // Its own boundary, inside this one. The Races tab is a single `races` read and the Overall
      // tab is the whole archive scored, so a shared `await` would make the list wait on the
      // figures behind a tab the sailor may never open.
      overall={
        <Suspense fallback={rowFallback()}>
          <OverallTab />
        </Suspense>
      }
    />
  )
}

/**
 * The Overall tab: the Polar performance teaser, how well the Sail selection chart matches what the
 * boat actually does, and how much of a season the instrument checks rest on.
 *
 * Three rows, which are a list of doors: each states one figure and taps through to the screen that
 * can be reasoned on. The third reads the whole archive and so has a boundary of its own, which the
 * first two share one `Promise.all` behind — see `InstrumentTuningRow`.
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

      {/*
        The third row, behind a boundary of its own — and not in the `Promise.all` above, for a
        reason that is about cost rather than tidiness. See `InstrumentTuningRow`.
      */}
      <Suspense fallback={rowFallback()}>
        <InstrumentTuningRow />
      </Suspense>
    </>
  )
}

/**
 * What a boundary holds the place of: one teaser row's own height.
 *
 * Both boundaries on this screen are waiting for a row of this shape — the tab's first one for
 * whichever row paints first, and the Instrument tuning row's for itself — so the placeholder is one
 * function rather than the same two numbers written twice.
 */
function rowFallback(): ReactElement {
  return <Skeleton height="92px" radius="var(--radius-md)" />
}

/**
 * The **Instrument tuning** row: the worst of the three channels' coverage words, as a door.
 *
 * Its own read and its own boundary. The two rows above it share a ten-Race window and a Crossover
 * Chart read; this one is the **whole archive** — every Race's whole Transcription, around 35,000
 * rows on the owner's season, assessed before it can be clipped and uncached by ADR 0009 (see
 * `readInstrumentTuning` on what that costs and why). LAY-155 measured a smaller read of the same
 * shape at 9.12 s against a hosted database, essentially all of it latency.
 *
 * So it is deliberately **not** awaited beside the other two. Put in that `Promise.all`, a tab a
 * sailor reads at a glance would hold its two measured rows back for seconds to print one word
 * whose only job is to say whether the screen behind it is worth opening. Behind this boundary, the
 * rows above paint and this one arrives when the archive has been read.
 *
 * The read is all-or-nothing, and the row says which of its three states it is in; nothing is
 * unwrapped here, because a page choosing the words would be a second place they could drift.
 */
async function InstrumentTuningRow(): Promise<ReactElement> {
  return <InstrumentTuningTeaser read={await readInstrumentTuning()} />
}
