'use client'

/**
 * The **Race Track Heatmap** as one interactive thing: the overlay chips, the map, the readout and
 * the legend.
 *
 * This is where the two pieces of state live, and they live here rather than in the map because
 * three things read each of them. Which overlay is painted decides the track's colours, the ramp
 * under it and the sentence beside that ramp; which stretch is selected decides the halo on the map
 * and everything the readout says. Two copies of either would be two chances for the picture and
 * the words beneath it to describe different things.
 *
 * It is the only Client Component on this screen that holds state — the frame owns the camera, and
 * the legend reads the theme, which is the one fact the server cannot know (ADR 0033).
 *
 * The overlay chips offer only what this race can actually colour: a race with no **Polar Version**
 * has no percent of target to show, and a chip that painted a uniformly grey track would be an
 * invitation to read "no comparison recorded" as "slow everywhere".
 */

import { useState, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { TRACK_OVERLAYS, TRACK_SCALES, isRatioOverlay } from '@/services/analysis/track-overlays'
import type { RaceTrack, RaceTrackHeatmap, TrackOverlay, TrackRowFacts } from '@/types'

import TrackHeatmapFrame from './TrackHeatmapFrame'
import TrackHeatmapLegend from './TrackHeatmapLegend'
import TrackReadout from './TrackReadout'

/** What the map is, for a reader who cannot see it. */
const LABEL =
  'The race track, with each stretch coloured by the chosen measurement. Zoomable, pannable, and ' +
  'tap a stretch to read it.'

export default function TrackHeatmap({
  heatmap,
  scoring,
}: {
  heatmap: RaceTrackHeatmap
  scoring: RaceTrack['scoring']
}): ReactElement {
  const hasPolar = scoring === 'polar'
  const [overlay, setOverlay] = useState<TrackOverlay>(
    // Percent of target is the screen's opening claim where the race can make it; a race with no
    // Polar opens on what it does have, which is what the boat was doing.
    hasPolar ? 'target_speed' : 'sog'
  )
  const [selected, setSelected] = useState<TrackRowFacts | null>(null)

  /** A ratio overlay on a race with no Polar would be an all-grey track with no explanation. */
  const offered = TRACK_OVERLAYS.filter((each) => hasPolar || !isRatioOverlay(each))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
      <div
        data-testid="track-overlays"
        role="group"
        aria-label="What the track is coloured by"
        style={{ display: 'flex', flexWrap: 'wrap', gap: spacing(1) }}
      >
        {offered.map((each) => {
          const chosen = each === overlay

          return (
            <button
              key={each}
              type="button"
              aria-pressed={chosen}
              onClick={() => setOverlay(each)}
              style={{
                // 30px of height and the gutter below it: a thumb target in a row of six at 390px.
                padding: '7px 11px',
                borderRadius: 999,
                border: `1px solid ${chosen ? 'var(--text-accent)' : 'var(--surface-border)'}`,
                background: chosen ? 'var(--blue-muted)' : 'var(--surface-elevated)',
                color: chosen ? 'var(--text-accent)' : 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: chosen ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {TRACK_SCALES[each].chip}
            </button>
          )
        })}
      </div>

      <TrackHeatmapFrame
        heatmap={heatmap}
        label={LABEL}
        overlay={overlay}
        hasPolar={hasPolar}
        selected={selected?.row_index ?? null}
        onSelect={setSelected}
      />

      <TrackReadout row={selected} overlay={overlay} scoring={scoring} />

      <TrackHeatmapLegend overlay={overlay} counts={heatmap.counts} scoring={scoring} />
    </div>
  )
}
