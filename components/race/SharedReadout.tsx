'use client'

/**
 * The one readout on the per-Race page: the shipped `TrackReadout`, for whichever picture was
 * tapped (ADR 0040).
 *
 * Two readouts describing one row in two places was the problem; a hand-rolled replacement lost
 * what `TrackReadout` already does per overlay. So this renders that component, unchanged.
 *
 * The one case it cannot serve is the first fix of a run of fixes: the map's strokes are keyed by
 * the row each one arrives at, so that moment has no stroke and no `TrackRowFacts`. The Polar Plot
 * answers for it in its own figures and says the map cannot — never by feeding `TrackReadout` a
 * row it was not given. A stretch the plot draws nothing for is visible as the plot ringing
 * nothing; the selection is never cleared, and never moved to a neighbour.
 *
 * The plot's own line beside the readout (how long the moment lasted) was cut on the owner's
 * review: it was not needed.
 */

import type { ReactElement } from 'react'
import { NOTE_STYLE } from '@/components/analysis/chrome'
import { spacing } from '@/lib/utils/design'
import type { PolarPlotMoment, RaceTrack, TrackOverlay, TrackRowFacts } from '@/types'

import TrackReadout from './TrackReadout'

const CARD = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 3,
  padding: `${spacing(2)} ${spacing(3)}`,
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-overlay)',
  backdropFilter: 'blur(6px)',
  boxShadow: 'var(--shadow-md)',
}

const EYEBROW = { ...NOTE_STYLE, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }

export default function SharedReadout({
  facts,
  moment,
  overlay,
  scoring,
  onClear,
}: {
  /** The map's own facts for the selected row, or null where the map has no stroke for it. */
  facts: TrackRowFacts | null
  /** The Polar Plot's dot for it, or null where it carries no figure. */
  moment: PolarPlotMoment | null
  overlay: TrackOverlay
  scoring: RaceTrack['scoring']
  onClear: () => void
}): ReactElement | null {
  if (facts !== null) {
    return (
      <div data-testid="shared-readout" className="flex">
        <TrackReadout row={facts} overlay={overlay} scoring={scoring} onDismiss={onClear} />
      </div>
    )
  }

  if (moment === null) return null

  return (
    <div data-testid="shared-readout" className="flex">
      <PlotOnly moment={moment} onClear={onClear} />
    </div>
  )
}

/**
 * The moment the Polar Plot holds and the map has no stroke for: the first of a run of fixes.
 *
 * In the Polar Plot's own figures, every one of which it was given by the server.
 */
function PlotOnly({ moment, onClear }: { moment: PolarPlotMoment; onClear: () => void }): ReactElement {
  return (
    <div data-testid="shared-readout-plot-only" role="status" aria-live="polite" style={{ ...CARD, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing(2) }}>
        <span style={EYEBROW}>Percent of target speed</span>
        <button
          type="button"
          aria-label="Close this readout"
          onClick={onClear}
          style={{
            width: 28,
            height: 28,
            marginTop: -6,
            marginRight: -6,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
        {Math.round(moment.polar_efficiency * 100)}% of target speed
      </span>
      <span style={{ ...NOTE_STYLE, fontFamily: 'var(--font-mono)' }}>
        {Math.round(Math.abs(moment.twa))}° {moment.twa < 0 ? 'port' : 'starboard'} · {moment.sog.toFixed(2)} kt (GPS)
        against {moment.target_knots.toFixed(2)} kt (Polar) in {moment.tws.toFixed(1)} kt of wind (computed)
      </span>
      <span style={NOTE_STYLE}>
        Not on the map: the track draws the stretches between fixes, and this is the first of a run.
      </span>
    </div>
  )
}
