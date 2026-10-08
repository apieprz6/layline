/**
 * The **Race Track Heatmap** section: the first thing below the Transcription boundary.
 *
 * ADR 0033 makes the map the opening of the per-Race breakdown, and this is where that lands on
 * the page the archive already has. It sits *below* the Testimony/Transcription line rather than at
 * the very top, because the track is not something the sailor said — it is the recording, drawn,
 * and everything derived from the recording belongs under the line ADR 0010 draws (the same reason
 * Coverage and the Row Quality notes sit there). It opens that half of the page: the tiles that
 * follow are the same numbers the map is made of, which reads as a summary of what was just seen
 * rather than a preamble to it.
 *
 * A Server Component. It computes and draws; the client owns only the camera, and the legend
 * beneath is a client component solely because the theme is resolved in the browser.
 *
 * A recording with no position fixes says so, in words, where the map would be. It is a real case
 * in the archive and an empty frame explains nothing.
 */

import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import type { RaceTrack } from '@/types'

import TrackHeatmapFrame from './TrackHeatmapFrame'
import TrackHeatmapLegend from './TrackHeatmapLegend'

const SECTION_HEADING = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
}

/** What the map is, for a reader who cannot see it. Said once, here, and passed in. */
const LABEL =
  'The race track, with each stretch coloured by how the boat compared with its target speed ' +
  'there. Zoomable and pannable.'

export default function RaceTrackSection({ track }: { track: RaceTrack }): ReactElement {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
      <h2 style={SECTION_HEADING}>Race track</h2>

      {track.heatmap === null ? (
        <p
          data-testid="track-no-fixes"
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          This recording logged no position anywhere in the race window, so there is no track to
          draw. Everything else on this page still describes it.
        </p>
      ) : (
        <>
          <TrackHeatmapFrame heatmap={track.heatmap} label={LABEL} />
          <TrackHeatmapLegend counts={track.heatmap.counts} scoring={track.scoring} />
        </>
      )}
    </section>
  )
}
