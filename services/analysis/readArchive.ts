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
 * ## What is here, and what is next door
 *
 * The **reads** are here, with the all-or-nothing refusal that depends on them. Every *rule* about
 * a row — Row Quality and Maneuvers over the whole Transcription before the window clip (ADR
 * 0009), the intervals measured over the in-window rows alone, **Countable**, the scoring — is
 * `services/analysis/matchable-rows.ts`, which needs no database and so can be run against the
 * owner's own thirteen recordings by the suites that pin the archive's counts.
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
import type { AnalysisVocabulary } from '@/services/analysis/filter'
import { buildMatchableRows } from '@/services/analysis/matchable-rows'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { polarTargets } from '@/services/analysis/polar-targets'
import { readCrossoverChartScreen } from '@/services/boat/readCrossoverChartVersions'
import { readPolarVersion } from '@/services/boat/readPolarVersions'
import type { SailDefinitionLabels } from '@/services/races/readRace'
import { readRaceAnnotations, readSailDefinitions } from '@/services/races/readRace'
import { readRecordingRows } from '@/services/races/recording-rows'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { AnalysisArchiveRace, CrossoverChartScreen, MatchableRow } from '@/types'

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

/**
 * One Race's in-window rows, or null where the Race could not be read whole.
 *
 * The two reads, and then `buildMatchableRows` for every rule about a row. The split is what lets
 * the suites that pin these figures against the owner's own thirteen recordings run the same
 * pipeline with no database behind them (`services/analysis/matchable-rows.ts`).
 *
 * `targets` is the Polar the Race itself points at, already resolved, or null where it points at
 * none. Null is not a failure: the oldest races predate every Boat Setup artifact the boat has,
 * nothing backdates one onto them (ADR 0012), and a row with no Target Speed is reported missing
 * rather than compared against today's grid.
 */
async function raceRows(
  supabase: Supabase,
  race: RaceRow,
  targets: PolarTargets | null,
  labels: SailDefinitionLabels | null
): Promise<MatchableRow[] | null> {
  // Together, not one after the other: the Transcription and the Testimony are two different
  // tables and neither read's query depends on the other's answer.
  const [transcription, annotations] = await Promise.all([
    readRecordingRows(supabase, race.recordings.id, race.recordings.row_count),
    readRaceAnnotations(supabase, race.id, labels),
  ])

  if (transcription === null || annotations === null) return null

  return buildMatchableRows(
    transcription,
    // The chart Version travels onto every row because it is the vocabulary that Race's **Sail
    // Configurations** are numbered in, and agreement is an integer comparison valid only inside
    // one of them (ADR 0038, ADR 0023).
    {
      id: race.id,
      window: race,
      crossover_chart_version_id: race.crossover_chart_version_id,
    },
    annotations,
    targets
  )
}

/**
 * Every **Polar** the archive's Races point at, resolved once each.
 *
 * Once each because a Polar is a grid classified cell by cell on construction and a season is
 * thousands of rows against one of them (`polarTargets`). A Version the read could not return is
 * a broken `ON DELETE RESTRICT` rather than a state a screen should describe, so it fails the
 * whole archive rather than quietly scoring that Race against nothing.
 *
 * All of them in flight at once. There is one Version in this archive and the distinct count can
 * only ever be the number of Polars the boat has owned, so this is a short list by construction —
 * but a serial loop over it was still one more place a hosted database's latency multiplied.
 */
async function resolvePolars(
  versionIds: readonly string[]
): Promise<Map<string, PolarTargets> | null> {
  const wanted = [...new Set(versionIds)]
  const versions = await Promise.all(wanted.map((id) => readPolarVersion(id)))
  const resolved = new Map<string, PolarTargets>()

  for (const [index, version] of versions.entries()) {
    if (version === null) {
      console.error(`Analysis: the Polar Version a Race names did not come back: ${wanted[index]}`)
      return null
    }
    resolved.set(wanted[index], polarTargets(version.payload))
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
 *
 * `chart` is passed in because the read for it does not depend on a single row: the caller starts
 * it alongside the race reads and hands the answer here, rather than waiting for every row before
 * asking which sails the boat owns.
 */
function sailVocabulary(
  rows: readonly MatchableRow[],
  chart: CrossoverChartScreen | null
): string[] {
  const defined = (chart?.current?.payload.sail_definitions ?? [])
    .slice()
    .sort((left, right) => left.number - right.number)
    .map((definition) => definition.label)

  const used = rows.flatMap((row) =>
    row.sail.recorded === 'definition' && !defined.includes(row.sail.label) ? [row.sail.label] : []
  )

  return [...defined, ...[...new Set(used)].sort()]
}

/** The Races' rows and the Races themselves, with no vocabulary: what a teaser needs. */
export interface RaceSet {
  rows: MatchableRow[]
  races: AnalysisArchiveRace[]
}

/**
 * `limit` Races' rows, newest Race first, or null when they could not be read whole.
 *
 * ## The shape of the read, which is the whole of this module's cost
 *
 * Every figure here is cheap — 6,337 rows through Row Quality, Maneuvers and the scoring is single-
 * digit milliseconds. What is not cheap is a **round trip**: against a hosted database each one is
 * tens of milliseconds, and the first version of this function made about thirty-nine of them in
 * series, which measured 9.1 seconds on a preview deployment. So the arrangement below is
 * deliberate, and three things in it are load-bearing:
 *
 *   1. **The Races are read in one wave.** Every Race's two reads go out together rather than
 *      waiting for the Race before it, so the depth of the chain stops growing with the archive.
 *   2. **The Sail Definitions are read once**, not once per Race: thirteen Races point at one
 *      Crossover Chart Version, and asking each of them separately was thirteen round trips to
 *      learn one answer (`readSailDefinitions`).
 *   3. **The Polars and the current Crossover Chart are resolved alongside the Races**, because
 *      neither depends on a row.
 *
 * What remains serial is only what has to be: the Races have to come back before their rows can be
 * asked for, and a row cannot be scored before its Polar is in hand.
 *
 * The fan-out is unbounded, which is right for an archive of thirteen Races that grows by hand a
 * few times a season (ADR 0026) and would not be for one of hundreds. If it ever is, **this** is
 * where the bound goes, and the number wants measuring against the connection limit of whatever
 * tier the project is on rather than guessing.
 */
async function readRaceSet(supabase: Supabase, limit: number | null): Promise<RaceSet | null> {
  const query = supabase
    .from('races')
    .select(RACE_SELECT)
    .order('window_start', { ascending: false })

  const { data, error } = await (limit === null ? query : query.limit(limit)).returns<RaceRow[]>()

  if (error) {
    console.error('Analysis: race read failed:', error.message)
    return null
  }

  const races = data ?? []

  // Validated before anything is sliced from it: `window_start` is a `timestamp` column Layline
  // only ever writes whole naive seconds to, and `day` is sliced from it rather than parsed.
  for (const race of races) wallClockSeconds(race.window_start)

  const [polars, definitions] = await Promise.all([
    resolvePolars(
      races.flatMap((race) => (race.polar_version_id === null ? [] : [race.polar_version_id]))
    ),
    readSailDefinitions(
      supabase,
      races.map((race) => race.crossover_chart_version_id)
    ),
  ])

  if (polars === null || definitions === null) return null

  const perRace = await Promise.all(
    races.map((race) =>
      raceRows(
        supabase,
        race,
        race.polar_version_id === null ? null : polars.get(race.polar_version_id) ?? null,
        race.crossover_chart_version_id === null
          ? null
          : definitions.get(race.crossover_chart_version_id) ?? new Map()
      )
    )
  )

  // All-or-nothing, as ever: a Race silently missing from the set would make the **Coverage
  // Ledger** — the one thing that exists to say what the figures rest on — confidently wrong.
  if (perRace.some((rows) => rows === null)) return null

  const resolved = perRace as MatchableRow[][]

  return {
    // `Promise.all` keeps the order of its inputs, so this is still newest Race first with each
    // Race's rows in file order — which is what the teaser's recent-N and the row payload assume.
    rows: resolved.flat(),
    races: races.map((race, index) => ({
      id: race.id,
      title: race.title,
      day: race.window_start.slice(0, 10),
      seconds: resolved[index].reduce((total, row) => total + (row.interval_seconds ?? 0), 0),
    })),
  }
}

/**
 * The most recent `count` Races' rows, for the Overall tab's teaser.
 *
 * Its own function, and deliberately not the whole archive with a slice taken afterwards. The
 * teaser states a figure over five races; reading thirteen to show five was eight races' worth of
 * round trips spent on rows nobody would see. `limit` goes to the database, so the Races that are
 * not in the teaser are never read at all.
 *
 * It returns a `RaceSet` and **not** an `AnalysisArchive`, which is the point of the separate type:
 * a partial read has no business reaching a screen whose **Coverage Ledger** states what share of
 * the archive is on display, and a different type is a stronger guarantee of that than a comment.
 */
export async function readRecentRaceRows(count: number): Promise<RaceSet | null> {
  const supabase = await analysisClient()
  if (supabase === null) return null

  try {
    return await readRaceSet(supabase, count)
  } catch (thrown: unknown) {
    return unreadable(thrown)
  }
}

/**
 * The whole archive, or null when it could not be read whole.
 *
 * No Account is taken and no Role consulted, for the reason `readRaces` states: every table read
 * here has a SELECT policy for `authenticated` with no Role test, because Role governs writes only
 * (ADR 0019). The page turns a Guest away before calling this rather than relying on it to.
 */
export async function readAnalysisArchive(): Promise<AnalysisArchive | null> {
  const supabase = await analysisClient()
  if (supabase === null) return null

  try {
    // The chart read answers "which sails does this boat own", which no row has a say in — so it
    // goes out with the Races rather than after them.
    const [raceSet, chart] = await Promise.all([
      readRaceSet(supabase, null),
      readCrossoverChartScreen(),
    ])

    if (raceSet === null) return null

    return {
      ...raceSet,
      vocabulary: {
        sails: sailVocabulary(raceSet.rows, chart),
        // Derived from the rows and not from a calendar: a month with no row is not a month this
        // boat sailed, and a chip for it would be one the sailor could only ever find empty.
        months: [...new Set(raceSet.rows.map((row) => row.day.slice(0, 7)))].sort(),
      },
    }
  } catch (thrown: unknown) {
    return unreadable(thrown)
  }
}

/** The client, or null where there is none — a checkout with no `.env.local`, or missing keys. */
async function analysisClient(): Promise<Supabase | null> {
  try {
    return await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Analysis: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
}

/**
 * A stamp the wall clock refuses — a fractional second, or an offset, in a column Layline only ever
 * writes whole naive seconds to — or a join this module refused to make.
 */
function unreadable(thrown: unknown): null {
  console.error(
    'Analysis: the archive could not be read:',
    thrown instanceof Error ? thrown.message : thrown
  )
  return null
}
