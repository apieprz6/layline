/**
 * The legend directly beneath the map: the scale the sailor is looking at, and the count of what it
 * could not colour.
 *
 * One sentence serves both themes. `.theme-nightvision` redraws every scale with its daylight
 * meaning intact — the ratio ramp still diverges, the tacks are still two colours (ADR 0043) — so
 * the words under the swatches are as true after dark as by day, and name no hue for that reason.
 *
 * The count is stated in words rather than left to be inferred from how much grey is on screen: a
 * quarter of one of this archive's races carries no percent of target, and that proportion is not
 * something a sailor should have to estimate by eye. It is per overlay, because the overlays do not
 * agree about which rows they can colour.
 */

import type { ReactElement, ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'
import { TRACK_SCALES, isRatioOverlay, overlayColour } from '@/services/analysis/track-overlays'
import {
  TRACK_ABSENCES,
  WINDOW_EDGES,
  drawnNotColoured,
  uncolouredFor,
} from '@/services/analysis/track-time'
import { describeDuration } from '@/services/recordings/coverage'
import type { RaceTrack, TrackHeatmapTime, TrackOverlay, TrackOverlayTime } from '@/types'

import Explainer from '@/components/common/Explainer'

import { DROPOUT, FILLER_DASH, HAIRLINE, TESTIMONY, TRACK_STROKE, testimonyGlyph } from './track-ink'

export default function TrackHeatmapLegend({
  overlay,
  time,
  scoring,
  /** How many pieces of Testimony the map placed, which is what draws that row of the legend. */
  annotations,
  /** How many it could not place, which the legend states rather than drops. */
  unplaced,
}: {
  overlay: TrackOverlay
  /** The track's coverage in time — the figure the MCP's `race_track` states too (ADR 0037). */
  time: TrackHeatmapTime
  scoring: RaceTrack['scoring']
  annotations: number
  unplaced: number
}): ReactElement {
  const scale = TRACK_SCALES[overlay]
  const tallies = time.overlays[overlay]
  // A ratio overlay on a race that records no Polar has nothing to be a ratio of, so there is no
  // scale to draw — only the sentence saying why.
  const drawable = !isRatioOverlay(overlay) || scoring === 'polar'

  return (
    <div style={{ marginTop: spacing(3) }}>
      {drawable && (
        <>
          <div style={{ display: 'flex', alignItems: 'center' }} data-testid="track-ramp">
            {scale.bands.map((step, index) => (
              <div key={`${step.band}-${index}`} style={{ flex: 1 }}>
                <div
                  title={step.label}
                  style={{ height: 8, background: overlayColour(step.band), borderRadius: 1 }}
                />
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 7.5,
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                >
                  {step.tick}
                </div>
              </div>
            ))}
          </div>

          <p
            data-testid="track-ramp-wording"
            style={{
              margin: `${spacing(1)} 0 0`,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {scale.wording}
          </p>

          {scale.caveat && (
            <p
              data-testid="track-caveat"
              style={{
                margin: `${spacing(1)} 0 0`,
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              {scale.caveat}
            </p>
          )}
        </>
      )}

      <ul
        style={{
          listStyle: 'none',
          margin: `${spacing(3)} 0 0`,
          padding: 0,
          display: 'grid',
          gap: spacing(2),
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        <SwatchRow label={`Drawn, not coloured — ${describeDuration(drawnNotColoured(tallies))}`}>
          <svg width="26" height="10" aria-hidden>
            <line
              x1="1"
              y1="5"
              x2="25"
              y2="5"
              stroke={HAIRLINE.stroke}
              strokeWidth={HAIRLINE.width}
              opacity={HAIRLINE.opacity}
            />
          </svg>
        </SwatchRow>

        {drawable && isRatioOverlay(overlay) && (
          <SwatchRow label={`Filler-anchored — ${describeDuration(tallies.filler_anchored_seconds)}`}>
            <svg width="26" height="10" aria-hidden>
              <line
                x1="1"
                y1="5"
                x2="25"
                y2="5"
                stroke={overlayColour('track-at')}
                strokeWidth={TRACK_STROKE}
                strokeDasharray={FILLER_DASH}
              />
            </svg>
          </SwatchRow>
        )}

        {annotations > 0 && (
          <SwatchRow
            label={`What the sailor said — ${annotations} ${annotations === 1 ? 'note' : 'notes'}${
              unplaced > 0 ? `, ${unplaced} unplaceable` : ''
            }`}
          >
            <svg width="26" height="14" aria-hidden>
              {(['sail', 'sea'] as const).map((lane, index) => (
                <g key={lane}>
                  <circle
                    cx={7 + index * 12}
                    cy="7"
                    r={TESTIMONY.radius - 1}
                    fill={TESTIMONY.fill}
                    stroke={TESTIMONY.stroke}
                    strokeWidth={TESTIMONY.width}
                  />
                  <text
                    x={7 + index * 12}
                    y="10"
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="700"
                    fontFamily="var(--font-mono)"
                    fill={TESTIMONY.glyph}
                  >
                    {testimonyGlyph(lane)}
                  </text>
                </g>
              ))}
            </svg>
          </SwatchRow>
        )}

        <SwatchRow label={`Frozen feed — ${describeDuration(uncolouredFor(tallies, ['frozen']))}`}>
          <svg width="26" height="10" aria-hidden>
            <line
              x1="1"
              y1="5"
              x2="25"
              y2="5"
              stroke={DROPOUT.stroke}
              strokeWidth={DROPOUT.bridgeWidth}
              strokeDasharray={DROPOUT.bridgeDash}
              opacity={DROPOUT.bridgeOpacity}
            />
            {[8, 18].map((cx) => (
              <circle
                key={cx}
                cx={cx}
                cy="5"
                r={DROPOUT.ringRadius}
                fill="none"
                stroke={DROPOUT.stroke}
                strokeWidth={DROPOUT.ringWidth}
                opacity={DROPOUT.ringOpacity}
              />
            ))}
          </svg>
        </SwatchRow>
      </ul>

      <p
        data-testid="track-counts"
        style={{
          margin: `${spacing(3)} 0 0`,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}
      >
        {headlineCount(overlay, time, scoring)}
      </p>

      {/* The reasoning, one tap down. ADR 0033 requires the proportion to be *stated* rather than
          inferred from how much grey is on screen — which the line above does. Why each row is grey
          is the argument behind that claim, and five lines of it under every map is five lines
          nobody reads twice. */}
      <Explainer summary="What isn’t coloured, and why?" testId="track-counts-why">
        {countDetail(overlay, tallies, scoring)}
      </Explainer>
    </div>
  )
}

/**
 * The one line the legend owes: how much of the race this overlay could not colour.
 *
 * ADR 0033 requires the proportion to be *stated* rather than inferred from how much grey is on
 * screen, and this is that claim — short enough that it is read every time, with the reasoning
 * behind it in `countDetail` one tap down. In time, never rows (ADR 0037): the recording is
 * event-triggered, so a row is thirty seconds on a beat and minutes inside a dropout.
 */
function headlineCount(
  overlay: TrackOverlay,
  time: TrackHeatmapTime,
  scoring: RaceTrack['scoring']
): string {
  if (isRatioOverlay(overlay) && scoring !== 'polar') {
    return scoring === 'no-polar-version'
      ? 'This race records no Polar Version — nothing on the track is a comparison.'
      : 'This race’s Polar Version could not be read — the comparison is missing.'
  }

  return (
    `${describeDuration(time.overlays[overlay].uncoloured_seconds)} of the ` +
    `${describeDuration(time.window_seconds)} window carries no colour on this overlay.`
  )
}

/**
 * Why that time is not coloured, by reason — the argument behind the line above.
 *
 * Three different sentences, because the overlays do not exclude the same sailing: a ratio and
 * sail agreement are claims about how the boat was sailed and carry ADR 0025 whole, while a
 * reading excludes only the dead feed, since a parked boat's speed over the ground is simply what
 * the GPS recorded (ADR 0038).
 */
function countDetail(
  overlay: TrackOverlay,
  time: TrackOverlayTime,
  scoring: RaceTrack['scoring']
): string {
  const frozen = describeDuration(uncolouredFor(time, ['frozen']))
  const parked = describeDuration(uncolouredFor(time, ['low_speed', 'maneuver_window']))
  const withoutValue = describeDuration(uncolouredFor(time, TRACK_ABSENCES))
  const noFix = uncolouredFor(time, ['no_position'])
  const bridged = uncolouredFor(time, ['bridged'])
  const edges = uncolouredFor(time, WINDOW_EDGES)

  const sentences: string[] = []

  if (overlay === 'sail') {
    sentences.push(
      'Green is where what the sailor recorded as flying matches the chart’s own cell for that ' +
        'angle and wind speed, red where the two records differ — which is a difference and not a ' +
        'fault.'
    )
  }

  if (isRatioOverlay(overlay) && scoring === 'no-polar-version') {
    sentences.push(
      'No Polar Version is recorded for this race, so none of it carries a percent of target. The ' +
        'track is still where the boat went.'
    )
  } else if (isRatioOverlay(overlay) && scoring === 'polar-unreadable') {
    sentences.push(
      'The Polar Version this race points at could not be read. The track is still what the ' +
        'recording says; only the comparison is missing.'
    )
  } else if (isRatioOverlay(overlay)) {
    sentences.push(
      `${frozen} sat inside a dropout, ${parked} was parked or mid-manoeuvre — neither reads in a ` +
        `performance figure (ADR 0025) — and ${withoutValue} is in range of nothing the Polar can ` +
        'answer.'
    )
  } else if (overlay === 'sail') {
    sentences.push(
      `${frozen} sat inside a dropout and ${parked} was parked or mid-manoeuvre, where a wind ` +
        'angle sweeping through head to wind makes the chart’s answer meaningless. ' +
        `${withoutValue} has nothing to compare: no chart recorded, no sail written down, a sail ` +
        'the chart does not name, or an angle below its own axes.'
    )
  } else {
    sentences.push(
      `${frozen} sat inside a dropout, where every value is a copy of the reading before it, and ` +
        `${withoutValue} left this channel blank. Parked or mid-manoeuvre sailing keeps its colour ` +
        'here: its speed over the ground is simply what the GPS recorded.'
    )
  }

  if (noFix > 0) {
    sentences.push(
      `${describeDuration(noFix)} logged no position at all, so it is in no part of this picture — ` +
        'only in these figures.'
    )
  }

  if (bridged > 0) {
    sentences.push(
      `${describeDuration(bridged)} is the dashed bridge from each dropout back to the first live ` +
        'reading, which the map draws but does not colour.'
    )
  }

  if (edges > 0) {
    sentences.push(
      `${describeDuration(edges)} of the window lies outside the recording, before its first ` +
        'reading or after its last.'
    )
  }

  return sentences.join(' ')
}

function SwatchRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}>
      <span style={{ flexShrink: 0 }}>{children}</span>
      <span>{label}</span>
    </li>
  )
}
