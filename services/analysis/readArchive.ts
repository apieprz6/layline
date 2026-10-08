/**
 * The whole archive, as the analysis screens read it: every in-window row, scored and annotated.
 *
 * ADR 0029 moved aggregation into the browser, so the Server Component's job shrank to exactly
 * this: **read, resolve annotations onto rows, tag Countable, score, ship once.** Nothing here
 * matches, narrows or aggregates — that is `filter.ts` and the per-screen aggregation, running on
 * both sides of the wire from the same source.
 *
 * Read-time-computed and cached nowhere (ADR 0010, ADR 0026). Thirteen Races and roughly 4,000
 * in-window rows, hand-entered a few times a season; a cache keyed on `updated_at` that nothing
 * yet needs is a maintenance cost with no matching benefit.
 *
 * ## The order the figures are derived in, which is load-bearing
 *
 * Row Quality and Maneuvers are computed over the **whole Transcription** and only then clipped to
 * the Race Window (ADR 0009): a dropout beginning before the gun still froze the race's first
 * rows, and clipping first cannot see the flip that says so. The row **intervals**, by contrast,
 * are measured over the in-window rows alone, which is what `aggregateEfficiency` is handed and
 * what makes an excluded row's time fall out of the sums rather than land on a neighbour.
 *
 * ## Why each row carries its interval and its score
 *
 * Both are facts about the row *in its own race*, and neither can be re-derived from a filtered
 * set: the gap to the next matched row is not a span anything happened over, and a row's Target
 * Speed comes from the **Polar its own Race was sailed under** (ADR 0012) — a season spanning a
 * Polar update compares each Race to the grid in force when it was sailed, never to today's. So
 * both are computed here, once, where the Race's own pointers and whole row sequence are in hand.
 *
 * ## All-or-nothing
 *
 * A failed read is `null`, never a short archive. Every figure on these screens is a statement
 * about how much of the archive is behind it, and an archive silently missing a Race would make
 * the **Coverage Ledger** — the one thing that exists to say what the numbers rest on — the
 * confidently wrong part of the screen.
 */

import { createClient } from '@/lib/supabase/server'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { computeRowEfficiency, rowIntervalSeconds } from '@/services/analysis/efficiency'
import type { AnalysisVocabulary } from '@/services/analysis/filter'
import { detectManeuvers, sameRowOrder } from '@/services/analysis/maneuvers'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { polarTargets } from '@/services/analysis/polar-targets'
import { channelValue } from '@/services/analysis/readable-rows'
import { readCrossoverChartScreen } from '@/services/boat/readCrossoverChartVersions'
import { readPolarVersion } from '@/services/boat/readPolarVersions'
import { annotationInForce } from '@/services/races/annotations'
import { readRaceAnnotations } from '@/services/races/readRace'
import type { RecordedRow } from '@/services/races/recording-rows'
import { readRecordingRows } from '@/services/races/recording-rows'
import { assessRowQuality } from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  AnalysisArchiveRace,
  MatchableRow,
  RaceAnnotations,
  RowEfficiency,
  RowSail,
} from '@/types'

/** Everything an analysis screen is shipped. */
export interface AnalysisArchive {
  /**
   * Every in-window row of every Race, Races newest first and rows in file order within each.
   *
   * Not only the **Countable** ones. A screen states how much of its match is excluded and why
   * (ADR 0025), and the **Coverage Ledger** counts matched rows rather than counted ones — both
   * need the rows the figures leave out.
   */
  rows: MatchableRow[]
  /** The two derived dimensions' vocabulary. */
  vocabulary: AnalysisVocabulary
  /** Newest first, as `readRaces` orders them: the Race's own date, never the upload's. */
  races: AnalysisArchiveRace[]
}

/** What one Race's rows are built from. Mirrors `readRace`'s own select, minus what it alone needs. */
const RACE_SELECT =
  'id, title, window_start, window_finish, polar_version_id, crossover_chart_version_id, ' +
  'recordings!inner(id, row_count)'

interface RaceRow {
  id: string
  title: string | null
  window_start: string
  window_finish: string
  /** Null where the Race records no Polar, which is ordinary: nine races predate every artifact. */
  polar_version_id: string | null
  crossover_chart_version_id: string | null
  recordings: { id: string; row_count: number }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** An unscored row: what a Race with no **Polar** pointer, or a channel-less row, answers with. */
const NO_EFFICIENCY = (row_index: number): RowEfficiency => ({
  row_index,
  target_speed: null,
  polar_efficiency: null,
  vmg_zone: null,
  vmg: null,
  target_vmg: null,
  vmg_efficiency: null,
})

/**
 * What the record says about the sail in force on a row: a Definition, a note alone, or nothing.
 *
 * The three states ADR 0029 names, read off one resolved annotation. A Configuration with a label
 * names a **Sail Definition**; one without names none, which ADR 0023 makes a legitimate answer
 * rather than a defect; no Configuration at all is **Not recorded**.
 */
function sailInForce(annotations: RaceAnnotations, rowTime: string): RowSail {
  const entry = annotationInForce(annotations.sails, rowTime)
  if (entry === null) return { recorded: 'not-recorded' }

  return entry.label === null ? { recorded: 'note-only' } : { recorded: 'definition', label: entry.label }
}

/** Seconds past midnight in the recording's own frame, which is the `time` dimension's axis. */
function secondsIntoDay(rowTime: string): number {
  return (
    Number(rowTime.slice(11, 13)) * 3600 +
    Number(rowTime.slice(14, 16)) * 60 +
    Number(rowTime.slice(17, 19))
  )
}

/**
 * One Race's in-window rows, or null where the Race could not be read whole.
 *
 * `targets` is the Polar the Race itself points at, already resolved, or null where it points at
 * none. Null is not a failure: the oldest races predate every Boat Setup artifact the boat has,
 * nothing backdates one onto them (ADR 0012), and a row with no Target Speed is reported missing
 * rather than compared against today's grid.
 */
async function raceRows(
  supabase: Supabase,
  race: RaceRow,
  targets: PolarTargets | null
): Promise<MatchableRow[] | null> {
  const transcription = await readRecordingRows(supabase, race.recordings.id, race.recordings.row_count)
  if (transcription === null) return null

  const annotations = await readRaceAnnotations(supabase, race.id, race.crossover_chart_version_id)
  if (annotations === null) return null

  // Assessed over the whole Transcription, then clipped — in that order, always (ADR 0009).
  const quality = assessRowQuality(transcription)
  const maneuvers = detectManeuvers(transcription, quality)
  const verdicts = analysisRows(quality, maneuvers)

  // `analysisRows` already refuses to join two misaligned row lists, and both its arguments were
  // derived from `transcription` in order — so this is the belt rather than the braces. It is one
  // line, and what it protects against is one row's channels wearing its neighbour's verdict.
  if (!sameRowOrder(transcription, verdicts)) {
    throw new Error(`the Transcription and its Countable verdicts are not the same rows: ${race.id}`)
  }

  const joined: (RecordedRow & { countable: boolean })[] = transcription.map((row, index) => ({
    ...row,
    countable: verdicts[index].countable,
  }))

  const inWindow = analysisRowsWithin(joined, race)
  const intervals = rowIntervalSeconds(inWindow)

  return inWindow.map((row, index) => ({
    race_id: race.id,
    row_index: row.row_index,
    day: row.row_time.slice(0, 10),
    day_seconds: secondsIntoDay(row.row_time),
    tws: channelValue(row.tws),
    twa: channelValue(row.twa),
    sea_state: annotationInForce(annotations.sea_state, row.row_time)?.sea_state ?? null,
    sail: sailInForce(annotations, row.row_time),
    countable: row.countable,
    interval_seconds: intervals[index],
    sog: channelValue(row.sog),
    efficiency: targets === null ? NO_EFFICIENCY(row.row_index) : computeRowEfficiency(row, targets),
  }))
}

/**
 * Every **Polar** the archive's Races point at, resolved once each.
 *
 * Once each because a Polar is a grid classified cell by cell on construction and a season is
 * thousands of rows against one of them (`polarTargets`). A Version the read could not return is
 * a broken `ON DELETE RESTRICT` rather than a state a screen should describe, so it fails the
 * whole archive rather than quietly scoring that Race against nothing.
 */
async function resolvePolars(
  versionIds: readonly string[]
): Promise<Map<string, PolarTargets> | null> {
  const resolved = new Map<string, PolarTargets>()

  for (const id of new Set(versionIds)) {
    const version = await readPolarVersion(id)
    if (version === null) {
      console.error(`Analysis: the Polar Version a Race names did not come back: ${id}`)
      return null
    }
    resolved.set(id, polarTargets(version.payload))
  }

  return resolved
}

/**
 * The sail vocabulary the `sail` dimension's chips are drawn from.
 *
 * The boat's **current** Crossover Chart Version, in its own Definition order — which is what puts
 * the three sails this boat owns and has never raced on the rail, disabled, instead of leaving a
 * sailor unable to tell "never sailed" from "filtered away" (ADR 0014, ADR 0029).
 *
 * Plus any label the archive uses that the current Version does not define, appended. A Race holds
 * the Version it was sailed under (ADR 0012), so a sail renamed or dropped since is still what a
 * row says — and a row whose bucket had no chip would be a row the rail could not account for.
 *
 * A failed chart read is not a refusal. The chips then come from the archive alone, which is
 * narrower than the truth and says so by having fewer disabled entries; refusing the whole screen
 * because the *current* chart could not be read would withhold figures that do not depend on it.
 */
async function sailVocabulary(rows: readonly MatchableRow[]): Promise<string[]> {
  const chart = await readCrossoverChartScreen()
  const defined = (chart?.current?.payload.sail_definitions ?? [])
    .slice()
    .sort((left, right) => left.number - right.number)
    .map((definition) => definition.label)

  const used = rows.flatMap((row) =>
    row.sail.recorded === 'definition' && !defined.includes(row.sail.label) ? [row.sail.label] : []
  )

  return [...defined, ...[...new Set(used)].sort()]
}

/**
 * The archive, or null when it could not be read whole.
 *
 * No Account is taken and no Role consulted, for the reason `readRaces` states: every table read
 * here has a SELECT policy for `authenticated` with no Role test, because Role governs writes only
 * (ADR 0019). The page turns a Guest away before calling this rather than relying on it to.
 *
 * One Race at a time rather than thirteen reads in flight, because each Race is a paged read of a
 * whole Transcription and the archive grows by hand a few times a season: there is nothing here
 * worth the connection pressure of fanning out.
 */
export async function readAnalysisArchive(): Promise<AnalysisArchive | null> {
  let supabase: Supabase

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Analysis: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data, error } = await supabase
    .from('races')
    .select(RACE_SELECT)
    .order('window_start', { ascending: false })
    .returns<RaceRow[]>()

  if (error) {
    console.error('Analysis: race read failed:', error.message)
    return null
  }

  const races = data ?? []

  try {
    const polars = await resolvePolars(
      races.flatMap((race) => (race.polar_version_id === null ? [] : [race.polar_version_id]))
    )
    if (polars === null) return null

    const rows: MatchableRow[] = []
    const summaries: AnalysisArchiveRace[] = []

    for (const race of races) {
      // Validated here rather than trusted below: `window_start` is a `timestamp` column Layline
      // only ever writes whole naive seconds to, and `day` is sliced from it rather than parsed.
      wallClockSeconds(race.window_start)

      const theseRows = await raceRows(
        supabase,
        race,
        race.polar_version_id === null ? null : polars.get(race.polar_version_id) ?? null
      )
      if (theseRows === null) return null

      rows.push(...theseRows)
      summaries.push({
        id: race.id,
        title: race.title,
        day: race.window_start.slice(0, 10),
        rows: theseRows.length,
      })
    }

    return {
      rows,
      vocabulary: {
        sails: await sailVocabulary(rows),
        // Derived from the rows and not from a calendar: a month with no row is not a month this
        // boat sailed, and a chip for it would be one the sailor could only ever find empty.
        months: [...new Set(rows.map((row) => row.day.slice(0, 7)))].sort(),
      },
      races: summaries,
    }
  } catch (thrown: unknown) {
    // A stamp the wall clock refuses — a fractional second, or an offset, in a column Layline only
    // ever writes whole naive seconds to — or a join this module refused to make.
    console.error(
      'Analysis: the archive could not be read:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
}
