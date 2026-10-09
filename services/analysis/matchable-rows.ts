/**
 * One Race's **Recording Rows** turned into the rows an analysis screen matches and sums.
 *
 * The pure half of `readArchive.ts`: given a **Transcription**, the Race's **Race Window** and
 * **Testimony**, and the **Polar** the Race was sailed under, this does Row Quality, Maneuvers,
 * **Countable**, the window clip, the interval measurement and the scoring, in the order ADR 0009
 * fixes. `readArchive` keeps the reads and the all-or-nothing refusal; everything that is a *rule*
 * about a row is here.
 *
 * Split out so it can be run **without a database**. The suites that hold these figures to the
 * owner's own thirteen recordings have the files and no Supabase, and a suite that re-implemented
 * this pipeline beside it would stop being evidence the moment one of the two drifted — which is
 * the whole point of pinning archive counts (`archive-sail-selection.test.ts`).
 *
 * ## The order, which is load-bearing
 *
 * Row Quality and Maneuvers are computed over the **whole Transcription** and only then clipped to
 * the window (ADR 0009): a dropout beginning before the gun still froze the race's first rows, and
 * clipping first cannot see the flip that says so. The **intervals**, by contrast, are measured
 * over the in-window rows alone, which is what makes an excluded row's time fall out of the sums
 * rather than land on a neighbour.
 */

import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { computeRowEfficiency, rowIntervalSeconds } from '@/services/analysis/efficiency'
import { detectManeuvers, sameRowOrder } from '@/services/analysis/maneuvers'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { channelValue } from '@/services/analysis/readable-rows'
import { annotationInForce } from '@/services/races/annotations'
import type { QualityAssessableRow, RaceWindow } from '@/services/recordings/row-quality'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { MatchableRow, RaceAnnotations, RowEfficiency, RowSail } from '@/types'

/**
 * What building a row reads of a Transcription row: Row Quality's own channels, plus the wind.
 *
 * A narrow port, like `ScorableRow` next door and for the same reason — so this module cannot
 * quietly grow a dependency on a channel it has no rule about. The position and speed channels
 * come in because **Row Quality** compares them verbatim to find a dropout, which is upstream of
 * every verdict here. A `RecordedRow` read back from the database and a `TranscriptionRow` straight
 * off a file both satisfy it, which is how one pipeline serves the app and the suites that read the
 * owner's own files.
 */
export interface MatchableSource extends QualityAssessableRow {
  tws: string | null
  /** Signed, −180..180, positive = starboard (ADR 0008). */
  twa: string | null
}

/**
 * The Race a row belongs to, as building one reads it.
 *
 * `crossover_chart_version_id` is the vocabulary its **Sail Configurations** are written in, and
 * travels onto every row because agreement is an integer comparison valid only inside one Version
 * (ADR 0038, ADR 0023). Optional, because a caller with no Boat Setup in hand — a suite reading
 * the owner's files, a Race that records none — is the ordinary case rather than an error.
 */
export interface BuildableRace {
  id: string
  window: RaceWindow
  crossover_chart_version_id?: string | null
}

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

  // Both halves travel, and they are read for different things: the **number** is what agreement
  // is compared on (ADR 0038) and the **label** is what a filter chip groups on and a screen
  // prints. A Configuration naming a Definition always has both — the database holds it to the
  // Version's own definitions — so a missing number is the note-only state and not a half-entry.
  return entry.label === null || entry.definition_number === null
    ? { recorded: 'note-only' }
    : {
        recorded: 'definition',
        definition_number: entry.definition_number,
        label: entry.label,
      }
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
 * One Race's in-window rows, scored and annotated.
 *
 * `targets` is the Polar the Race itself points at, already resolved, or null where it points at
 * none. Null is not a failure: the oldest races predate every Boat Setup artifact the boat has,
 * nothing backdates one onto them (ADR 0012), and a row with no Target Speed is reported missing
 * rather than compared against today's grid.
 *
 * Throws where the Transcription and the verdicts derived from it are not the same rows. That is
 * the belt rather than the braces — `analysisRows` already refuses to join two misaligned row
 * lists — and what it protects against is one row's channels wearing its neighbour's verdict.
 */
export function buildMatchableRows<Row extends MatchableSource>(
  transcription: readonly Row[],
  race: BuildableRace,
  annotations: RaceAnnotations,
  targets: PolarTargets | null
): MatchableRow[] {
  // Assessed over the whole Transcription, then clipped — in that order, always (ADR 0009).
  const quality = assessRowQuality(transcription)
  const maneuvers = detectManeuvers(transcription, quality)
  const verdicts = analysisRows(quality, maneuvers)

  if (!sameRowOrder(transcription, verdicts)) {
    throw new Error(`the Transcription and its Countable verdicts are not the same rows: ${race.id}`)
  }

  const joined = transcription.map((row, index) => ({
    ...row,
    countable: verdicts[index].countable,
  }))

  const inWindow = analysisRowsWithin(joined, race.window)
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
    crossover_chart_version_id: race.crossover_chart_version_id ?? null,
  }))
}
