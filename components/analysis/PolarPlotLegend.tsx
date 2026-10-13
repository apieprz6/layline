/**
 * The **Polar Plot**'s legend: one quiet line under the chart, and the method one tap down.
 *
 * The owner rejected standing paragraphs twice (ADR 0040), and `Explainer`'s own header is the
 * argument: a paragraph every reader scrolls past every visit is lost as thoroughly as one never
 * written. So the obligation splits the way `TrackHeatmapLegend`'s does — a swatch and a word for
 * anything the picture draws differently, and the reasoning, with how much sailing is *not* drawn
 * and why, inside a single collapsed disclosure.
 *
 * It never says "row" (ADR 0037). Where the method needs an amount, it is time.
 *
 * No hook and no handler, so it renders on either side of the wire.
 */

import type { ReactElement, ReactNode } from 'react'
import { NOTE_STYLE } from '@/components/analysis/chrome'
import Explainer from '@/components/common/Explainer'
import { FILLER_DASH } from '@/components/race/track-ink'
import { describeDuration } from '@/services/recordings/coverage'
import type { PolarPlotUndrawn, PolarPlotUndrawnReason } from '@/types'

/** Each reason a stretch is drawn nowhere, as a sailor would say it. */
const WHY: Record<PolarPlotUndrawnReason, string> = {
  not_countable: 'frozen, low-speed or mid-manoeuvre',
  no_polar: 'in a race that records no Polar',
  no_reading: 'with no speed or wind reading',
  off_the_certificate: 'at an angle or wind speed the certificate does not reach',
}

export default function PolarPlotLegend({
  form,
  undrawn,
}: {
  /** Patches on the season screen, dots on one Race. */
  form: 'patches' | 'dots'
  /** How much of what the picture is of is drawn nowhere. */
  undrawn: PolarPlotUndrawn
}): ReactElement {
  return (
    <div data-testid="polar-plot-legend" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...NOTE_STYLE, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        <Key swatch="certificate">certificate</Key>
        <Key swatch="filler">not measured</Key>
        {form === 'dots' && <Key swatch="season">season</Key>}
      </div>

      <Explainer summary="How is this drawn?" testId="polar-plot-explainer">
        {form === 'dots'
          ? 'Each dot is one moment of the recording, at the angle and speed the boat held, coloured by how it compared with its own target at its own wind, and sized by how long it lasted.'
          : 'Each patch is 5° by half a knot of the picture, inside the wind window above it. Its colour is how the sailing in it compared with target, weighted by time; how solid it is, is how much time is behind it.'}{' '}
        The grey lines are the boat&rsquo;s certificate at the wind speeds that sailing was scored
        against. Where they turn to a dashed amber line, the certificate was ramped up from zero
        rather than measured. Sailing compared against those cells keeps its colour and gets an
        amber stitched outline, as it does on the track: treat a high percentage there with
        suspicion, because the target it was divided by is weak, not because the boat was fast.
        {form === 'dots' && ' The dotted blue line is the whole season, for comparison.'} Only one
        side is drawn: the certificate does not tell port from starboard, so neither does this.
        {undrawn.seconds > 0 && (
          <>
            {' '}
            {describeDuration(undrawn.seconds)} of this sailing is not drawn:{' '}
            {undrawn.parts
              .map((part) => `${describeDuration(part.seconds)} ${WHY[part.reason]}`)
              .join(', ')}
            .
          </>
        )}
      </Explainer>
    </div>
  )
}

/** One entry: the mark as the picture draws it, and a word. */
function Key({
  swatch,
  children,
}: {
  swatch: 'certificate' | 'filler' | 'season'
  children: ReactNode
}): ReactElement {
  const ink = {
    certificate: { stroke: 'var(--text-muted)', dash: undefined, opacity: 1 },
    filler: { stroke: 'var(--state-warning)', dash: FILLER_DASH, opacity: 1 },
    season: { stroke: 'var(--text-accent)', dash: '2 3', opacity: 0.6 },
  }[swatch]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <svg width={18} height={8} aria-hidden style={{ flexShrink: 0 }}>
        <line
          x1={1}
          y1={4}
          x2={17}
          y2={4}
          stroke={ink.stroke}
          strokeWidth={1.3}
          strokeDasharray={ink.dash}
          opacity={ink.opacity}
        />
      </svg>
      {children}
    </span>
  )
}
