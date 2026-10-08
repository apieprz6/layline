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
import { detectManeuvers, sameRowOrder } from '@/services/analysis/maneuvers'
import { polarTargets } from '@/services/analysis/polar-targets'
import { raceTrackHeatmap, type TrackHeatmapRow } from '@/services/analysis/track-heatmap'
import { readPolarVersion } from '@/services/boat/readPolarVersions'
import type { RecordedRow } from '@/services/races/recording-rows'
import type { RaceWindow } from '@/services/recordings/row-quality'
import type { RaceTrack, TranscriptionQuality } from '@/types'

/**
 * The rows the map draws, with their verdicts: the whole recording joined, then clipped.
 *
 * Joined by position after `sameRowOrder`, never by index alone, for the reason `readableRows`
 * refuses to: a misaligned join hands one row's position to another row's verdict, and the result
 * is a map that is subtly wrong forever with nothing failing anywhere.
 */
function trackRows(
  rows: readonly RecordedRow[],
  quality: TranscriptionQuality,
  window: RaceWindow
): TrackHeatmapRow[] {
  const assessed = analysisRows(quality, detectManeuvers(rows, quality))

  if (!sameRowOrder(rows, assessed)) {
    throw new Error('the Transcription and its Countable verdicts are not the same rows')
  }

  const joined = assessed.map((row, index) => ({
    ...row,
    latitude: rows[index].latitude,
    longitude: rows[index].longitude,
    sog: rows[index].sog,
    tws: rows[index].tws,
    twa: rows[index].twa,
  }))

  return analysisRowsWithin(joined, window)
}

export async function readRaceTrack(
  rows: readonly RecordedRow[],
  quality: TranscriptionQuality,
  window: RaceWindow,
  /** The **Polar Version** the Race holds. Null is a legitimate answer, and nine races give it. */
  polarVersionId: string | null
): Promise<RaceTrack> {
  const drawable = trackRows(rows, quality, window)

  if (polarVersionId === null) {
    // Every row still drawn, none of them coloured. The track is where the boat went, which is
    // true whether or not anything exists to compare it against (ADR 0012).
    return { heatmap: raceTrackHeatmap(drawable, null), scoring: 'no-polar-version' }
  }

  const polar = await readPolarVersion(polarVersionId)

  if (polar === null) {
    // Logged by the reader. Not a 404 for the whole page: the track, the coverage and the Row
    // Quality notes are all still true, and "the comparison could not be read" is a different
    // sentence from "no Polar was recorded" — which is why `scoring` carries three states and not
    // a boolean.
    console.error(`Race: the Polar Version ${polarVersionId} this race names could not be read`)
    return { heatmap: raceTrackHeatmap(drawable, null), scoring: 'polar-unreadable' }
  }

  return {
    heatmap: raceTrackHeatmap(drawable, polarTargets(polar.payload)),
    scoring: 'polar',
  }
}
