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
 * card actually needs its value. So does the Instrument tuning read. The slowest of the three sets
 * the time to everything painted, never their sum.
 *
 * ## One boundary per card, each the shape the page actually settles into
 *
 * Three `<Suspense>` boundaries, one per card, each with a skeleton of that card's own height —
 * what a sailor sees on first paint is the shape of the finished tab, not a placeholder standing in
 * for two cards at once. **Polar performance never waits on the Crossover Chart.** It depends only
 * on the ten-race read, so its boundary resolves the moment that read does, independently of
 * **Sail selection**, which needs the chart too and carries its own, separate boundary beside it.
 * **Instrument tuning** reads the whole archive on its own query and never touches the other two.
 *
 * ## Where the unreadable and empty states land
 *
 * **Per card**, honestly duplicated when it happens. Polar performance and Sail selection each
 * depend on the same ten-race read, and each decides for itself, inside its own boundary, whether
 * that read came back `null` (`ArchiveUnreadable`) or empty (`EmptyState`) — because giving every
 * card a boundary that matches its own eventual place rules out a single shared boundary that could
 * print the message once for both. A failed or empty read is rare, and the cost of that rarity is a
 * sentence that appears twice rather than a boundary shape that lies about what the tab becomes
 * once the archive is readable.
 *
 * Instrument tuning never joins that decision. Its read is a different query against the same
 * table, says its own `ok: false` honestly when it fails, and the one case the two reads must agree
 * on — no races at all — they already do, independently, because both ask the same database for the
 * same archive.
 */
export default async function OverallCards(): Promise<ReactElement> {
  const racesPromise = readRecentRaceRows(Math.max(TEASER_RACES, SAIL_SELECTION_TEASER_RACES))
  const chartPromise = readCrossoverChartScreen()
  const tuningPromise = readInstrumentTuning()

  return (
    <>
      <Suspense fallback={polarFallback()}>
        <PolarPerformanceCard racesPromise={racesPromise} />
      </Suspense>

      <Suspense fallback={rowFallback()}>
        <SailSelectionCard racesPromise={racesPromise} chartPromise={chartPromise} />
      </Suspense>

      <Suspense fallback={rowFallback()}>
        <InstrumentTuningCard tuningPromise={tuningPromise} />
      </Suspense>
    </>
  )
}

/**
 * The Polar performance card: the last five races, or the "unreadable"/"empty" state in its own
 * slot when the ten-race read it depends on did not come back with races to show — see "Where the
 * unreadable and empty states land" above on why that message is this card's own to print rather
 * than a sibling's.
 */
async function PolarPerformanceCard({
  racesPromise,
}: {
  racesPromise: Promise<RaceSet | null>
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
    <PolarPerformanceTeaser
      // What the figure is actually over, which on a young archive is fewer than five.
      races={polarRaces.length}
      efficiency={sumEfficiency(polarRows)}
      rows={polarRows}
      polars={recent.polars}
    />
  )
}

/**
 * The Sail selection card: the same ten-race read Polar performance reads, plus the Crossover
 * Chart, behind a boundary of its own so neither read ever holds back the Polar card beside it.
 */
async function SailSelectionCard({
  racesPromise,
  chartPromise,
}: {
  racesPromise: Promise<RaceSet | null>
  chartPromise: Promise<CrossoverChartScreen | null>
}): Promise<ReactElement> {
  const [recent, chart] = await Promise.all([racesPromise, chartPromise])

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
 * Its own read and its own boundary, never nested inside or gated on either read above it — see
 * "Where the unreadable and empty states land" on why its visibility never rides on a sibling's
 * read.
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
