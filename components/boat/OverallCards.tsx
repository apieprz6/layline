import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import InstrumentTuningTeaser from '@/components/analysis/InstrumentTuningTeaser'
import PolarPerformanceTeaser, { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import SailSelectionTeaser, {
  SAIL_SELECTION_TEASER_RACES,
} from '@/components/analysis/SailSelectionTeaser'
import EmptyState from '@/components/common/EmptyState'
import Skeleton from '@/components/common/Skeleton'
import { sumEfficiency } from '@/services/analysis/efficiency'
import { EMPTY_FILTER } from '@/services/analysis/filter'
import { readRecentRaceRows, type RaceSet } from '@/services/analysis/readArchive'
import { readInstrumentTuning } from '@/services/analysis/readInstrumentTuning'
import { chartAgreement, getSailSelectionData } from '@/services/analysis/sail-selection'
import { readCrossoverChartScreen } from '@/services/boat/readCrossoverChartVersions'
import type { CrossoverChartScreen } from '@/types'

/**
 * The Boat performance **Overall tab**'s three cards — Polar performance, Sail selection,
 * Instrument tuning — as one piece any screen can drop in. The Boat performance page is its first
 * caller; the Dashboard is the reason it is a piece and not a page.
 *
 * ## Three reads, started together
 *
 * The ten-race read and the Crossover Chart read go out the moment this is called, before either
 * is awaited — a plain function call starts a `Promise`, and nothing here `await`s one until a
 * card actually needs its value. So does the Instrument tuning read, a sibling of the other two
 * rather than something kicked off only once they have settled. The slowest of the three sets the
 * time to everything painted, never their sum.
 *
 * ## One boundary per dependency, not per card
 *
 * **Polar performance never waits on the Crossover Chart.** Its only dependency is the ten-race
 * read, so its `<Suspense>` is the same boundary that decides whether there is a race window to
 * show at all (`RaceWindowCards`, below) — once that resolves, the Polar card paints inline, with
 * nothing further to wait on. **Sail selection** needs the chart too, so it carries a second,
 * nested boundary of its own that the Polar card never sits behind. **Instrument tuning** reads the
 * whole archive on its own query, so it is a sibling boundary at the top of this piece, never
 * nested inside the race window's.
 *
 * ## Where the unreadable and empty states land
 *
 * They replace **the pair that shares the ten-race read**, not all three cards. `RaceWindowCards`
 * decides this off the one read both Polar performance and Sail selection depend on, before either
 * card exists, so a failed or empty read is one `ArchiveUnreadable` or one "nothing to summarise"
 * in the place both cards would have taken — never the same card's-width message printed twice.
 *
 * Instrument tuning is deliberately not folded into that decision, even though today's single
 * `Promise.all` happened to hide it whenever the ten-race read failed. That was the sequential
 * code's accident, not a rule: its read is a different query against the same table, says its own
 * `ok: false` honestly when it fails, and the one case the two reads must agree on — no races at
 * all — they already do, independently, because both ask the same database for the same archive.
 * Coupling its visibility to a sibling's read would be withholding a card over a failure that was
 * never its own.
 */
export default async function OverallCards(): Promise<ReactElement> {
  const racesPromise = readRecentRaceRows(Math.max(TEASER_RACES, SAIL_SELECTION_TEASER_RACES))
  const chartPromise = readCrossoverChartScreen()
  const tuningPromise = readInstrumentTuning()

  return (
    <>
      <Suspense fallback={polarFallback()}>
        <RaceWindowCards racesPromise={racesPromise} chartPromise={chartPromise} />
      </Suspense>

      <Suspense fallback={rowFallback()}>
        <InstrumentTuningCard tuningPromise={tuningPromise} />
      </Suspense>
    </>
  )
}

/**
 * The Polar performance card, and the Sail selection card behind its own nested boundary — both
 * gated on the one read they share.
 *
 * A failed or empty read is reported here, once, in the place the two cards would have taken: see
 * the "Where the unreadable and empty states land" section above.
 *
 * Exported only so `OverallCards.test.tsx` can call it directly with a races read that resolves
 * and a chart read that never does, which is how that suite proves Polar performance paints
 * without the Crossover Chart. Resolving the whole piece the way `resolveServerTree` normally
 * does would also try to resolve the Sail selection card nested below it — and hang forever on
 * the chart promise the test deliberately never settles.
 */
export async function RaceWindowCards({
  racesPromise,
  chartPromise,
}: {
  racesPromise: Promise<RaceSet | null>
  chartPromise: Promise<CrossoverChartScreen | null>
}): Promise<ReactElement> {
  const recent = await racesPromise

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

  // The Polar card's own five, out of the ten read for the card below it. Taken by **Race** and
  // then by row, never as the first N rows: a race is thousands of rows and the count differs
  // wildly between them, so slicing rows would put some fraction of a sixth race in the figure.
  const polarRaces = recent.races.slice(0, TEASER_RACES)
  const polarRaceIds = new Set(polarRaces.map((race) => race.id))
  const polarRows = recent.rows.filter((row) => polarRaceIds.has(row.race_id))

  return (
    <>
      <PolarPerformanceTeaser
        // What the figure is actually over, which on a young archive is fewer than five.
        races={polarRaces.length}
        efficiency={sumEfficiency(polarRows)}
        rows={polarRows}
        polars={recent.polars}
      />

      <Suspense fallback={rowFallback()}>
        <SailSelectionCard recent={recent} chartPromise={chartPromise} />
      </Suspense>
    </>
  )
}

/**
 * The Sail selection card, behind its own boundary so the Crossover Chart read never holds back
 * the Polar card beside it.
 */
async function SailSelectionCard({
  recent,
  chartPromise,
}: {
  recent: RaceSet
  chartPromise: Promise<CrossoverChartScreen | null>
}): Promise<ReactElement> {
  const chart = await chartPromise
  const payload = chart?.current?.payload ?? null

  return (
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
  )
}

/**
 * The **Instrument tuning** card: the worst of the three channels' coverage words, as a door.
 *
 * Its own read and its own boundary, a sibling of the race window's rather than something nested
 * inside it — see "Where the unreadable and empty states land" on why its visibility never rides
 * on that other read's outcome.
 *
 * The whole-archive read this card is built on was measured at 9.12s against a hosted database on
 * LAY-155 (`services/analysis/readInstrumentTuning` says why it costs that much), which is the
 * entire reason it gets a boundary rather than joining the others in a shared wait.
 *
 * The read is all-or-nothing, and the card says which of its three states it is in; nothing is
 * unwrapped here, because a piece choosing the words would be a second place they could drift.
 */
async function InstrumentTuningCard({
  tuningPromise,
}: {
  tuningPromise: ReturnType<typeof readInstrumentTuning>
}): Promise<ReactElement> {
  return <InstrumentTuningTeaser read={await tuningPromise} />
}

/**
 * What a boundary holds the place of: one card's own height.
 *
 * Sail selection and Instrument tuning are a plain row — a line of eyebrow text, a figure, a
 * caption — so one height serves both. Polar performance's own fallback is taller: it carries the
 * same row of text, plus the small Polar Plot under its figure — about 150px wide and, at the
 * half-disc's 206:384 ratio, close to 280px tall on its own. 320px is the only honest kind of
 * guess available before the read says whether the card has a plot to draw at all.
 */
function rowFallback(): ReactElement {
  return <Skeleton height="92px" radius="var(--radius-md)" />
}

function polarFallback(): ReactElement {
  return <Skeleton height="320px" radius="var(--radius-md)" />
}
