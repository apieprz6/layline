/**
 * The **Race Track Heatmap** and the **Polar Plot**: the first thing below the Transcription
 * boundary.
 *
 * ADR 0033 makes the map the opening of the per-Race breakdown, with "Boat performance vs. polars"
 * beside it, and ADR 0040 gives that section its form. Both sit *below* the Testimony/Transcription
 * line rather than at the very top, because neither is something the sailor said — they are the
 * recording, drawn twice: once where it happened on the water and once at the angles it was
 * sailed. Everything derived from the recording belongs under the line ADR 0010 draws.
 *
 * A Server Component. It computes nothing and holds nothing; the two pictures share a selection,
 * so the state lives in the one client component that holds both of them.
 */

import type { ReactElement } from 'react'
import type { PolarPlotTraceBin, RaceTrack } from '@/types'

import RaceTrackAndPolarPlot from './RaceTrackAndPolarPlot'

export default function RaceTrackSection({
  track,
  season,
}: {
  track: RaceTrack
  /** The whole archive behind this Race on the Polar Plot. Null where it could not be read. */
  season: PolarPlotTraceBin[] | null
}): ReactElement {
  return <RaceTrackAndPolarPlot track={track} season={season} />
}
