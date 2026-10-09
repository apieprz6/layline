'use client'

/**
 * The legend directly beneath the map: the scale the sailor is looking at, and the count of what it
 * could not colour.
 *
 * A Client Component for one reason: **the legend is theme-aware**, and the theme is only resolved
 * in the browser (`lib/theme/store.ts` — the server snapshot is always `solar`, because the server
 * has no way to know what time it is where the sailor is).
 *
 * That obligation is ADR 0033's, and it is the price of keeping colour as the encoding at all.
 * After dark `.theme-nightvision` collapses every hue to a red lightness ramp, so each scale loses
 * something different: a diverging ramp loses which side of target a stretch was on, a tack scale
 * loses which tack, a quadrant scale keeps its four steps. Every scale therefore carries its own
 * after-dark sentence, and the one thing none of them may do is keep the daylight words — that,
 * and not the collapsed hue, is the defect.
 *
 * The count is stated in words rather than left to be inferred from how much grey is on screen: a
 * quarter of one of this archive's races carries no percent of target, and that proportion is not
 * something a sailor should have to estimate by eye. It is per overlay, because the overlays do not
 * agree about which rows they can colour.
 */

import type { ReactElement, ReactNode } from 'react'
import { useTheme } from '@/lib/hooks/useTheme'
import { spacing } from '@/lib/utils/design'
import { TRACK_SCALES, isRatioOverlay, overlayColour } from '@/services/analysis/track-overlays'
import type { RaceTrack, TrackHeatmapCounts, TrackOverlay } from '@/types'

import Explainer from '@/components/common/Explainer'

import { DROPOUT, FILLER_DASH, HAIRLINE, TESTIMONY, TRACK_STROKE, testimonyGlyph } from './track-ink'

export default function TrackHeatmapLegend({
  overlay,
  counts,
  scoring,
  /** How many pieces of Testimony the map placed, which is what draws that row of the legend. */
  annotations,
}: {
  overlay: TrackOverlay
  counts: TrackHeatmapCounts
  scoring: RaceTrack['scoring']
  annotations: number
}): ReactElement {
  const { theme } = useTheme()
  const afterDark = theme === 'nightvision'
  const scale = TRACK_SCALES[overlay]
  const tallies = counts.overlays[overlay]
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
            {afterDark ? scale.night : scale.day}
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
        <SwatchRow label={`Drawn, not coloured — ${counts.rows - counts.overlays[overlay].scored} rows`}>
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
          <SwatchRow label={`Filler-anchored — ${tallies.flagged} rows`}>
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
              counts.annotations_not_placed > 0 ? `, ${counts.annotations_not_placed} unplaceable` : ''
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

        <SwatchRow label={`Frozen feed — ${counts.frozen} rows`}>
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
        {headlineCount(overlay, counts, scoring)}
      </p>

      {/* The reasoning, one tap down. ADR 0033 requires the proportion to be *stated* rather than
          inferred from how much grey is on screen — which the line above does. Why each row is grey
          is the argument behind that claim, and five lines of it under every map is five lines
          nobody reads twice. */}
      <Explainer summary="What isn’t coloured, and why?" testId="track-counts-why">
        {countDetail(overlay, counts, scoring)}
      </Explainer>
    </div>
  )
}

/**
 * The one line the legend owes: how much of the race this overlay could not colour.
 *
 * ADR 0033 requires the proportion to be *stated* rather than inferred from how much grey is on
 * screen, and this is that claim — short enough that it is read every time, with the reasoning
 * behind it in `countDetail` one tap down.
 */
function headlineCount(
  overlay: TrackOverlay,
  counts: TrackHeatmapCounts,
  scoring: RaceTrack['scoring']
): string {
  const { rows, with_fix } = counts
  const { scored } = counts.overlays[overlay]

  if (isRatioOverlay(overlay) && scoring !== 'polar') {
    return scoring === 'no-polar-version'
      ? 'This race records no Polar Version — nothing on the track is a comparison.'
      : 'This race’s Polar Version could not be read — the comparison is missing.'
  }

  // "Drawn but not coloured" only where every row is in fact drawn, which is every race in this
  // archive. A row that logged no position is in the count and in no part of the picture, and
  // `countDetail` says so rather than this line quietly including it.
  return with_fix === rows
    ? `${rows - scored} of ${rows} rows are drawn but not coloured.`
    : `${rows - scored} of ${rows} rows carry no figure on this overlay.`
}

/**
 * Why each of those rows is not coloured, by reason — the argument behind the line above.
 *
 * Three different sentences, because the overlays do not exclude the same rows: a ratio and sail
 * agreement are claims about how the boat was sailed and carry ADR 0025 whole, while a reading
 * excludes only the dead feed, since a parked boat's speed over the ground is simply what the GPS
 * recorded (ADR 0038).
 */
function countDetail(
  overlay: TrackOverlay,
  counts: TrackHeatmapCounts,
  scoring: RaceTrack['scoring']
): string {
  const { rows, frozen, low_speed, maneuver_window, with_fix } = counts
  const { without_value } = counts.overlays[overlay]
  const parked = low_speed + maneuver_window
  const noFix = rows - with_fix

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
      `No Polar Version is recorded for this race, so none of its ${rows} rows carries a percent ` +
        'of target. The track is still where the boat went.'
    )
  } else if (isRatioOverlay(overlay) && scoring === 'polar-unreadable') {
    sentences.push(
      'The Polar Version this race points at could not be read. The track is still what the ' +
        'recording says; only the comparison is missing.'
    )
  } else if (isRatioOverlay(overlay)) {
    sentences.push(
      `${frozen} rows sat inside a dropout, ${parked} were parked or mid-manoeuvre — neither reads ` +
        `in a performance figure (ADR 0025) — and ${without_value} are in range of nothing the ` +
        'Polar can answer.'
    )
  } else if (overlay === 'sail') {
    sentences.push(
      `${frozen} rows sat inside a dropout and ${parked} were parked or mid-manoeuvre, where a ` +
        `wind angle sweeping through head to wind makes the chart’s answer meaningless. ` +
        `${without_value} have nothing to compare: no chart recorded, no sail written down, a sail ` +
        'the chart does not name, or an angle below its own axes.'
    )
  } else {
    sentences.push(
      `${frozen} rows sat inside a dropout, where every value is a copy of the row above, and ` +
        `${without_value} left this channel blank. A parked or mid-manoeuvre row keeps its colour ` +
        'here: its speed over the ground is simply what the GPS recorded.'
    )
  }

  if (noFix > 0) {
    sentences.push(
      `${noFix} logged no position at all, so they are in no part of this picture — only in the ` +
        'counts.'
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
