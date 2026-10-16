/**
 * A race's track at thumbnail size: the Dashboard's **Most recent race** card (LAY-179).
 *
 * One ink, with no percent-of-target colour, legend, zoom or pan — and still every Dropout marked,
 * because ADR 0014's obligation is on every map and a small one is where a clean-looking track of
 * a dead feed is easiest to miss. The projection is `projectTrack` and the breaks are
 * `breakTrack`, the same two every other map reads, so this picture and the race's own page cannot
 * draw the same race as two shapes.
 *
 * **Assess whole, then clip** (ADR 0009): a dropout beginning before the gun still froze the
 * race's first rows, and clipping first would hand those rows nothing above them to repeat.
 */

import { channelValue } from '@/services/analysis/readable-rows'
import { breakTrack } from '@/services/recordings/track-breaks'
import {
  assessRowQuality,
  withinRaceWindow,
  type QualityAssessableRow,
  type RaceWindow,
} from '@/services/recordings/row-quality'
import { projectTrack, type TrackBox } from '@/services/recordings/track-projection'
import type { TrackThumbnail } from '@/types'

/**
 * The thumbnail's frame: landscape, a card's width at about half its height.
 *
 * Stable whatever the race's own shape, like the heatmap's (ADR 0033), so the card is one height
 * for every race and its skeleton can be that height too.
 */
export const THUMBNAIL_BOX: TrackBox = { width: 360, height: 180, pad: 14 }

/** `x,y` at the tenth of a unit a 360-unit frame can show, as the heatmap writes it. */
function pathPoint({ x, y }: { x: number; y: number }): string {
  return `${x.toFixed(1)},${y.toFixed(1)}`
}

/**
 * The window's track, or null where the window holds no position fix to draw.
 *
 * Hand this the **whole** Transcription; the window clip is done here, after Row Quality.
 */
export function trackThumbnail(
  rows: readonly QualityAssessableRow[],
  window: RaceWindow
): TrackThumbnail | null {
  const quality = assessRowQuality(rows)
  const inWindow = withinRaceWindow(quality, window).rows
  const byIndex = new Map(rows.map((row) => [row.row_index, row]))

  const drawn = inWindow.map((assessed) => {
    const row = byIndex.get(assessed.row_index) as QualityAssessableRow
    return {
      latitude: channelValue(row.latitude),
      longitude: channelValue(row.longitude),
      frozen: assessed.frozen,
      row_time: assessed.row_time,
    }
  })

  const projection = projectTrack(drawn, THUMBNAIL_BOX)
  if (projection === null) return null

  const { runs, bridges, rings } = breakTrack(drawn, projection)

  return {
    width: THUMBNAIL_BOX.width,
    height: THUMBNAIL_BOX.height,
    runs: runs.filter((run) => run.length > 1).map((run) => run.map(pathPoint).join(' ')),
    points: runs.filter((run) => run.length === 1).map(([fix]) => ({ x: fix.x, y: fix.y })),
    bridges,
    rings,
  }
}
