/**
 * One race's **Race Track Heatmap**, assembled from the rows its page has already read.
 *
 * The composition seam, and the only place the map's three ingredients meet: the Transcription's
 * own rows, the **Countable** engine over them, and the **Polar Version** the Race points at. Every
 * rule it applies belongs to somebody else — `assessRowQuality` and `detectManeuvers` say what a
 * row was, `analysisRows` says whether it may be read, `polarTargets` says what it should have
 * been doing, and `raceTrackHeatmap` draws it. Nothing here re-decides any of them.
 *
 * It takes the rows rather than reading them. `readRace` already pages the whole Transcription out
 * of the database for Coverage and Row Quality, and a second read of a 1,743-row recording to draw
 * the same race would be a cost with nothing bought — and a chance for two reads to disagree.
 *
 * **Assess whole, then clip**, in that order, which is the order every figure in this app is
 * computed in (ADR 0009): a tack just before the gun still marks the rows it recovers into, and a
 * dropout beginning before the start still froze the race's first rows.
 *
 * The one thing it reads for itself is the Polar, by the id the Race holds — never the Polar in
 * force now, which is the whole of what ADR 0012 forbids. A race sailed under v2 is scored against
 * v2 forever, including after v5 lands.
 */

import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { polarTargets } from '@/services/analysis/polar-targets'
import { channelValue, readableRows } from '@/services/analysis/readable-rows'
import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import {
  compareSailToChart,
  type SailChartContext,
} from '@/services/analysis/sail-agreement'
import {
  raceTrackHeatmap,
  type TrackAnnotationInput,
  type TrackHeatmapRow,
} from '@/services/analysis/track-heatmap'
import { readCrossoverChartVersion } from '@/services/boat/readCrossoverChartVersions'
import { readPolarVersion } from '@/services/boat/readPolarVersions'
import type { RecordedRow } from '@/services/races/recording-rows'
import type { RaceWindow } from '@/services/recordings/row-quality'
import { noteText, sailWithNote, seaStateLabel } from '@/services/races/annotations'
import type { RaceAnnotations, RaceTrack, TranscriptionQuality } from '@/types'

/**
 * The rows the map draws, with their verdicts: the whole recording joined, then clipped.
 *
 * The join is `readableRows`, not a second one written here, because it carries the refusal to
 * line two misaligned row lists up by index — and a second copy of that guard would be a second
 * chance for this map to hand one row's position to another row's verdict and be subtly wrong
 * forever with nothing failing anywhere.
 */
function trackRows(
  rows: readonly RecordedRow[],
  quality: TranscriptionQuality,
  window: RaceWindow
): TrackHeatmapRow[] {
  const assessed = analysisRows(quality, detectManeuvers(rows, quality))

  return analysisRowsWithin(readableRows(rows, assessed), window)
}

/**
 * The Race's **Testimony**, as the map places it: one entry per thing the sailor said.
 *
 * In the words the Race itself holds — a **Sail Configuration**'s label comes from the **Crossover
 * Chart Version** the Race points at, already resolved (ADR 0012, ADR 0023), and this never looks
 * one up. An entry remembered only in a note reads as the note, because that is what was said.
 *
 * Both lists may be empty, and that is the ordinary state of this archive's older races. The page
 * says so in words above the Transcription boundary; the map simply has nothing to draw.
 */
function testimony(annotations: RaceAnnotations): TrackAnnotationInput[] {
  return [
    ...annotations.sails.map((entry) => ({
      at: entry.at,
      lane: 'sail' as const,
      label: entry.label === null ? noteText(entry.note) : sailWithNote(entry.label, noteText(entry.note)),
    })),
    ...annotations.sea_state.map((entry) => ({
      at: entry.at,
      lane: 'sea' as const,
      label: seaStateLabel(entry.sea_state),
    })),
  ]
}

/**
 * The chart's verdict on every row, attached to the rows themselves.
 *
 * Resolved here rather than in `services/analysis/track-heatmap.ts` because it reads two things
 * that belong to the **Race**: the **Crossover Chart Version** it points at, which owns the only
 * sail vocabulary either side may speak (ADR 0023), and the sailor's own **Sail Configurations**.
 * The rule for what counts as agreement is `compareSailToChart`'s; this only supplies it with the
 * two records.
 *
 * Null `chart` — a race that records no chart Version — is the ordinary state of this archive's
 * older races, and every row then carries `no_chart_version` rather than a false disagreement.
 */
function withSailAgreement(
  rows: readonly TrackHeatmapRow[],
  chart: SailChartContext | null
): TrackHeatmapRow[] {
  return rows.map((row) => ({
    ...row,
    sail: compareSailToChart(
      { row_time: row.row_time, twa: channelValue(row.twa), tws: channelValue(row.tws) },
      chart
    ),
  }))
}

/**
 * The Race's own Crossover Chart, with the Testimony to compare against it, or null.
 *
 * By the id the Race holds, like the Polar — never the chart in force now, which would re-score a
 * 2024 race against a vocabulary written after it (ADR 0012). A Version that cannot be read is
 * logged and treated as none: the track is still true, and the overlay says there is no verdict
 * rather than inventing one.
 */
async function sailChart(
  chartVersionId: string | null,
  annotations: RaceAnnotations
): Promise<SailChartContext | null> {
  if (chartVersionId === null) return null

  const chart = await readCrossoverChartVersion(chartVersionId)

  if (chart === null) {
    console.error(
      `Race: the Crossover Chart Version ${chartVersionId} this race names could not be read`
    )
    return null
  }

  return {
    lookup: crossoverLookup(chart.payload),
    entries: annotations.sails.map((entry) => ({
      at: entry.at,
      definition_number: entry.definition_number,
      label: entry.label,
    })),
  }
}

export async function readRaceTrack(
  rows: readonly RecordedRow[],
  quality: TranscriptionQuality,
  window: RaceWindow,
  /** The **Polar Version** the Race holds. Null is a legitimate answer, and nine races give it. */
  polarVersionId: string | null,
  /** What the sailor said, to be drawn where they said it happened and compared with the chart. */
  annotations: RaceAnnotations,
  /** The **Crossover Chart Version** the Race holds, which owns the one sail vocabulary. */
  crossoverChartVersionId: string | null
): Promise<RaceTrack> {
  const chart = await sailChart(crossoverChartVersionId, annotations)
  const drawable = withSailAgreement(trackRows(rows, quality, window), chart)
  const placed = { annotations: testimony(annotations) }

  if (polarVersionId === null) {
    // Every row still drawn, none of them coloured. The track is where the boat went, which is
    // true whether or not anything exists to compare it against (ADR 0012).
    return { heatmap: raceTrackHeatmap(drawable, null, placed), scoring: 'no-polar-version' }
  }

  const polar = await readPolarVersion(polarVersionId)

  if (polar === null) {
    // Logged by the reader. Not a 404 for the whole page: the track, the coverage and the Row
    // Quality notes are all still true, and "the comparison could not be read" is a different
    // sentence from "no Polar was recorded" — which is why `scoring` carries three states and not
    // a boolean.
    console.error(`Race: the Polar Version ${polarVersionId} this race names could not be read`)
    return { heatmap: raceTrackHeatmap(drawable, null, placed), scoring: 'polar-unreadable' }
  }

  return {
    heatmap: raceTrackHeatmap(drawable, polarTargets(polar.payload), placed),
    scoring: 'polar',
  }
}
