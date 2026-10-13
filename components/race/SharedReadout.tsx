'use client'

/**
 * The one readout on the per-Race page: the shipped `TrackReadout`, and the one line only the
 * **Polar Plot** can add (ADR 0040).
 *
 * Two readouts describing one row in two places was the problem; a hand-rolled replacement lost
 * what `TrackReadout` already does per overlay. So this renders that component, unchanged, and
 * adds only what the map cannot know: how long the moment lasted, which is the Polar Plot's own
 * weighting and not a channel on the row.
 *
 * ## Two asymmetries, stated rather than smoothed over
 *
 * - **The map draws transitions; the Polar Plot draws moments.** A stroke is keyed by the row it
 *   arrives at, so the first moment of a run of fixes has no stroke and no `TrackRowFacts`. The
 *   Polar Plot answers for it in its own words, and says the map cannot — never by feeding
 *   `TrackReadout` a row it was not given.
 * - **The map draws every recorded moment; the Polar Plot only the scored ones.** Tapping one of
 *   the others says there is no figure for it. The selection is never cleared, and never moved to
 *   a neighbour that does have one.
 */

import type { ReactElement } from 'react'
import { NOTE_STYLE } from '@/components/analysis/chrome'
import { spacing } from '@/lib/utils/design'
import { describeDuration } from '@/services/recordings/coverage'
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
  hasPlot,
  overlay,
  scoring,
  onClear,
}: {
  /** The map's own facts for the selected row, or null where the map has no stroke for it. */
  facts: TrackRowFacts | null
  /** The Polar Plot's dot for it, or null where it carries no figure. */
  moment: PolarPlotMoment | null
  /** Whether a Polar Plot is drawn beside the map at all. Without one it has nothing to add. */
  hasPlot: boolean
  overlay: TrackOverlay
  scoring: RaceTrack['scoring']
  onClear: () => void
}): ReactElement | null {
  if (facts === null && moment === null) return null

  return (
    // Stacked on a phone, so the sticky card stays short enough not to cover what was tapped;
    // side by side from `sm`.
    <div
      data-testid="shared-readout"
      className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-2.5"
    >
      {facts !== null ? (
        <TrackReadout row={facts} overlay={overlay} scoring={scoring} onDismiss={onClear} />
      ) : (
        moment !== null && <PlotOnly moment={moment} onClear={onClear} />
      )}

      {hasPlot && (
        <div
          data-testid="shared-readout-plot"
          className="flex flex-row flex-wrap items-baseline gap-x-2 sm:w-36 sm:shrink-0 sm:flex-col sm:gap-1"
          style={CARD}
        >
          <span style={EYEBROW}>Polar Plot</span>
          {moment === null ? (
            <span style={{ ...NOTE_STYLE, fontStyle: 'italic' }}>no figure for this moment</span>
          ) : (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                lasted {describeDuration(moment.seconds)}
              </span>
              {moment.filler_anchored && (
                <span style={{ ...NOTE_STYLE, color: 'var(--state-warning)' }}>not measured</span>
              )}
              {facts === null && <span style={NOTE_STYLE}>not on the map</span>}
            </>
          )}
        </div>
      )}
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
    </div>
  )
}
