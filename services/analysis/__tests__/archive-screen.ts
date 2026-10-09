/**
 * The owner's whole archive as an analysis screen reads it, for the suites that pin it.
 *
 * Built through `buildMatchableRows` — the app's own pipeline with the database lifted out — so a
 * suite reading this is evidence about what a screen will show rather than about a second
 * implementation of the rules. Two suites share it: the counts in
 * `archive-sail-selection.test.ts`, and the render in
 * `components/analysis/__tests__/archive-sail-selection-grid.test.tsx`.
 *
 * Needs the owner's recordings *and* his two Boat Setup artifacts, so it offers `describeArchiveScreen`
 * and skips loudly without either.
 *
 * 🚨 **Everything here is read through `once()`, which means inside a test body.** Jest executes a
 * `describe.skip` callback at collection time and skips only the `it`s inside it, so a read at
 * describe scope takes the whole suite down on a machine without the files instead of skipping it.
 *
 * Not a `.test.ts`, so Jest collects the suites and not this.
 */

import { archiveAnnotations } from '@/services/analysis/__tests__/archive-annotations'
import {
  describeBoatSetup,
  ownCrossoverChart,
  ownPolar,
} from '@/services/analysis/__tests__/boat-setup'
import { buildMatchableRows } from '@/services/analysis/matchable-rows'
import { polarDomain, polarTargets, type PolarDomain } from '@/services/analysis/polar-targets'
import {
  archiveFilenames,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import type { CrossoverChartPayload, MatchableRow } from '@/types'

/** `describe` where the recordings *and* the artifacts are to hand, `describe.skip` otherwise. */
export const describeArchiveScreen = archiveFilenames.length > 0 ? describeBoatSetup : describe.skip

/**
 * The one **Crossover Chart Version** this archive's **Sail Configurations** are numbered in.
 *
 * The boat owns one chart, every annotated Race points at it, and a Configuration cannot exist
 * without one (ADR 0023) — so a single id across every Race is what the database actually holds.
 * It has to be *stated*, because agreement is an integer comparison valid only inside one Version
 * (ADR 0038), and leaving it null would make the `other-version` tally read empty for no reason.
 */
export const ARCHIVE_CHART_VERSION = 'handsome-pete-2026-sailselect'

/** Deferred until first asked for, then kept: thirteen files parsed, assessed, joined and scored. */
export function once<T>(build: () => T): () => T {
  let cached: { value: T } | null = null
  return () => (cached ??= { value: build() }).value
}

/**
 * Every in-window row of all thirteen races, scored and annotated.
 *
 * Every race is scored against the boat's **current** Polar, which is a fixture's licence and not
 * the app's behaviour: in the app a Race points at the Version it was sailed under and nine of
 * these races point at none at all (ADR 0012). There is one certificate in this archive, so the
 * figures agree with what a screen shows for the races that *do* point at it; what these suites
 * pin is the geometry and the arithmetic, not any one race's percentage.
 */
export const archiveRows = once((): MatchableRow[] => {
  const targets = polarTargets(ownPolar())

  return archiveFilenames.flatMap((filename) => {
    const stem = filename.replace(/\.csv$/, '')
    const { transcription } = transcribe(filename)

    return buildMatchableRows(
      transcription.rows,
      { id: stem, window: raceWindowFor(filename), crossover_chart_version_id: ARCHIVE_CHART_VERSION },
      archiveAnnotations(filename),
      targets
    )
  })
})

/** The boat's own Crossover Chart: 26 angles × 13 wind speeds, 338 cells. */
export const archiveChart = once((): CrossoverChartPayload => ownCrossoverChart())

/** The boat's own certificate's domain, which stops at 24 knots (Rule 402.2). */
export const archiveDomain = once((): PolarDomain | null => polarDomain(ownPolar()))

/** Every `YYYY-MM` the archive's rows fall in, as `readAnalysisArchive` derives it. */
export const archiveMonths = once((): string[] =>
  [...new Set(archiveRows().map((row) => row.day.slice(0, 7)))].sort()
)
