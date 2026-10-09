/**
 * PROTOTYPE (LAY-165) — THROWAWAY GENERATOR. Not production code, not run by the app.
 *
 * Writes `archive.json`: every in-window row of the owner's archive, scored against the boat's own
 * Polar, plus the Polar grid with each cell's origin. The variants draw that file, so they argue
 * over the real archive rather than an invented fixture.
 *
 *     npx jest components/analysis/prototype-lay165/generate
 *
 * It is a Jest "test" for one reason: Jest is the only runner here that maps `@/`, and this reads
 * the archive through **the repo's own shipped modules** rather than re-porting them —
 * `parseQtvlmRecording`, `assessRowQuality`, `detectManeuvers`, `analysisRows`, `polarTargets`,
 * `computeRowEfficiency`. LAY-146's and LAY-149's generators re-implemented the pipeline in Python,
 * which was fine for a compass offset; it is not fine here, where the whole question is how the
 * *ragged* trust boundary of the Polar's own grid should be drawn. A second implementation of
 * `polarTargets` would be a second opinion about exactly the thing being designed.
 *
 * Reads, from outside this repo:
 *
 *     ~/git/Handsome-Pete/raw-regatta-recordings/*.csv + metadata.yaml   (13 Races)
 *     ~/git/Handsome-Pete/polars/HandsomePete_2026_ORC_final.pol         (the certificate)
 *
 * The Race Windows and the sail / Sea State annotations come from `metadata.yaml`, standing in for
 * the Testimony the owner hand-enters through the UI (there is no seeding). The local Supabase has
 * one toy race in it, so `readAnalysisArchive` cannot be the source here.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { analysisRows, analysisRowsWithin, notCountableReason } from '@/services/analysis/countable'
import { computeRowEfficiency, rowIntervalSeconds } from '@/services/analysis/efficiency'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { polarTargets } from '@/services/analysis/polar-targets'
import { raceTrackHeatmap } from '@/services/analysis/track-heatmap'
import { parsePolarFile } from '@/services/boat/polarFile'
import { classifyPolarCells } from '@/services/boat/polarSyntheticRows'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { NotCountableReason } from '@/services/analysis/countable'
import type {
  AnalysisArchiveRace,
  MatchableRow,
  PolarCellOrigin,
  PolarPayload,
  RaceTrackHeatmap,
  RowSail,
  SeaState,
} from '@/types'

const PETE = join(homedir(), 'git', 'Handsome-Pete')
const RECORDINGS = join(PETE, 'raw-regatta-recordings')
const POLAR = join(PETE, 'polars', 'HandsomePete_2026_ORC_final.pol')
const OUT = join(__dirname, 'archive.json')

/**
 * A row, in **the shipped shape** — `MatchableRow` — plus why it is not Countable where it is not.
 *
 * Deliberately not a flattened chart-friendly record. A `MatchableRow` is what `matchRows`,
 * `coverageLedger` and `getPolarPerformanceData` already take, so the prototype's filter rail, its
 * Coverage Ledger and its headline figures are **the shipped ones, computing the shipped numbers**,
 * and the only new code is the drawing. A chart that disagreed with the figure printed above it
 * would be a prototype arguing with the screen it is a prototype of.
 */
type PrototypeRow = MatchableRow & {
  /** `frozen` | `low_speed` | `maneuver_window`, or null where the row is Countable. */
  excluded: NotCountableReason | null
}

interface MetadataAnnotation {
  time: string
  config?: string[]
  sea_state?: string
  label?: string
}

interface MetadataRace {
  start: string
  finish: string
  sails: MetadataAnnotation[]
  sea_state: MetadataAnnotation[]
}

/**
 * `metadata.yaml`, hand-parsed. No YAML library is a dependency here and this file's shape is
 * two levels of mapping with two lists in it — the same choice LAY-149's generator made.
 */
function readMetadata(): Record<string, MetadataRace> {
  const text = readFileSync(join(RECORDINGS, 'metadata.yaml'), 'utf8')
  const races: Record<string, MetadataRace> = {}

  let race: MetadataRace | null = null
  let list: MetadataAnnotation[] | null = null
  let entry: MetadataAnnotation | null = null

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue

    const indent = line.length - line.trimStart().length
    const trimmed = line.trim()

    if (indent === 0) {
      race = { start: '', finish: '', sails: [], sea_state: [] }
      races[trimmed.replace(/:$/, '')] = race
      list = null
      entry = null
      continue
    }
    if (race === null) continue

    const quoted = (value: string): string => value.trim().replace(/^'|'$/g, '')

    if (trimmed.startsWith('start:')) race.start = quoted(trimmed.slice(6))
    else if (trimmed.startsWith('finish:')) race.finish = quoted(trimmed.slice(7))
    else if (trimmed.startsWith('sails:')) list = race.sails
    else if (trimmed.startsWith('sea_state:') && indent === 2) list = race.sea_state
    else if (trimmed.startsWith('- time:')) {
      entry = { time: quoted(trimmed.slice(7)) }
      list?.push(entry)
    } else if (entry !== null) {
      if (trimmed.startsWith('- ')) entry.config = [...(entry.config ?? []), quoted(trimmed.slice(2))]
      else if (trimmed.startsWith('sea_state:')) entry.sea_state = quoted(trimmed.slice(10))
      else if (trimmed.startsWith('label:')) entry.label = quoted(trimmed.slice(6))
      else if (trimmed === 'config:') entry.config = []
    }
  }

  return races
}

/** The annotation in force at `at`: the latest one not after it, or null (`annotationInForce`). */
function inForce(entries: readonly MetadataAnnotation[], at: string): MetadataAnnotation | null {
  let found: MetadataAnnotation | null = null
  for (const candidate of entries) if (candidate.time <= at) found = candidate
  return found
}

/** ADR 0029's three states for the `sail used` dimension, read off one resolved annotation. */
function sailInForce(race: MetadataRace, at: string): RowSail {
  const entry = inForce(race.sails, at)
  if (entry === null) return { recorded: 'not-recorded' }
  if (entry.config === undefined || entry.config.length === 0) return { recorded: 'note-only' }
  return { recorded: 'definition', label: entry.config.join(' + ') }
}

describe('LAY-165 prototype data', () => {
  it('writes archive.json from the owner archive', () => {
    const parsed = parsePolarFile(readFileSync(POLAR, 'utf8'))
    if (!parsed.ok) throw new Error(`the certificate did not parse: ${parsed.message}`)

    const payload: PolarPayload = parsed.payload
    const targets = polarTargets(payload)
    const origins: PolarCellOrigin[][] = classifyPolarCells(payload)

    const metadata = readMetadata()
    const rows: PrototypeRow[] = []
    const races: AnalysisArchiveRace[] = []

    /**
     * The three Races whose real **Race Track Heatmap** is emitted, so the per-Race view can mount
     * the *shipped* map beside the prototype's chart instead of a synthetic one. Chosen for shape:
     * the overnight distance race, the race LAY-148 measured as mostly-unscoreable, and the
     * thinnest race in the archive.
     */
    const TRACKED = ['06-26-26-chi-mi-chi', '08-26-26-beer-can', '09-02-2026-beer-can']
    const tracks: Record<string, RaceTrackHeatmap | null> = {}

    for (const [name, race] of Object.entries(metadata)) {
      const outcome = parseQtvlmRecording(readFileSync(join(RECORDINGS, `${name}.csv`), 'utf8'))
      if (!outcome.ok) throw new Error(`${name} did not transcribe: ${outcome.message}`)

      const transcription = outcome.transcription.rows

      // Over the whole Transcription, then clipped — in that order, always (ADR 0009).
      const quality = assessRowQuality(transcription)
      const verdicts = analysisRows(quality, detectManeuvers(transcription, quality))

      // The whole verdict is carried, not only `countable`: `raceTrackHeatmap` takes a
      // `TrackHeatmapRow`, which is an `AnalysisRow` (quality and Maneuver Window and all) plus the
      // channels — so the same join feeds the chart's rows and the shipped map's.
      const joined = transcription.map((row, index) => ({
        ...row,
        ...verdicts[index],
        excluded: notCountableReason(verdicts[index]),
      }))

      const inWindow = analysisRowsWithin(joined, {
        window_start: race.start,
        window_finish: race.finish,
      })
      const intervals = rowIntervalSeconds(inWindow)

      let seconds = 0

      inWindow.forEach((row, index) => {
        const interval = intervals[index]
        seconds += interval ?? 0

        rows.push({
          race_id: name,
          row_index: row.row_index,
          day: row.row_time.slice(0, 10),
          day_seconds:
            Number(row.row_time.slice(11, 13)) * 3600 +
            Number(row.row_time.slice(14, 16)) * 60 +
            Number(row.row_time.slice(17, 19)),
          tws: row.tws === null ? null : Number(row.tws),
          twa: row.twa === null ? null : Number(row.twa),
          sea_state: (inForce(race.sea_state, row.row_time)?.sea_state as SeaState) ?? null,
          sail: sailInForce(race, row.row_time),
          countable: row.countable,
          interval_seconds: interval,
          sog: row.sog === null ? null : Number(row.sog),
          efficiency: computeRowEfficiency(row, targets),
          excluded: row.excluded,
        })
      })

      // `AnalysisArchiveRace`, as `readRaceSet` builds it. The title is the file's own name here;
      // in Layline it is whatever the sailor typed, and may be null.
      races.push({ id: name, title: name, day: race.start.slice(0, 10), seconds })

      // The real thing, from the real function (`app/dev/race-track` does the same with a fixture).
      // No sail verdict: the Crossover Chart lives in the database, so the prototype's map offers
      // five overlays rather than six, and says so.
      if (TRACKED.includes(name)) {
        tracks[name] = raceTrackHeatmap(inWindow, targets)
      }
    }

    writeFileSync(
      OUT,
      JSON.stringify(
        {
          generated_by: 'components/analysis/prototype-lay165/generate.test.ts',
          polar: {
            twa_axis: payload.twa_axis,
            tws_axis: payload.tws_axis,
            boat_speed: payload.boat_speed,
            origins,
          },
          races,
          // What `analysisDimensions` needs to build the real rail's chips. The sails are the
          // archive's own labels: the Crossover Chart Version that would add the three sails this
          // boat owns and has never raced lives in the database, so the prototype's `sail` chip is
          // narrower than the screen's will be, and the README says so.
          vocabulary: {
            sails: [
              ...new Set(
                rows.flatMap((row) =>
                  row.sail.recorded === 'definition' ? [row.sail.label] : []
                )
              ),
            ].sort(),
            months: [...new Set(rows.map((row) => row.day.slice(0, 7)))].sort(),
          },
          tracks,
          rows,
        },
        null,
        0
      )
    )

    // Printed rather than asserted: this is a generator, and the numbers are the finding.
    const countable = rows.filter((row) => row.countable)
    const scored = countable.filter((row) => row.efficiency.polar_efficiency !== null)

    console.log(
      [
        `races ${races.length}`,
        `in-window rows ${rows.length}`,
        `countable ${countable.length}`,
        `scored ${scored.length}`,
        `filler-anchored ${scored.filter((row) => row.efficiency.target_speed?.filler_anchored).length}`,
        `no target ${countable.filter((row) => row.efficiency.target_speed === null).length}`,
      ].join(' · ')
    )

    expect(races).toHaveLength(13)
  })
})
