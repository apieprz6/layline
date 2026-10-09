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

import { DROPOUT, FILLER_DASH, HAIRLINE, TRACK_STROKE } from './track-ink'

export default function TrackHeatmapLegend({
  overlay,
  counts,
  scoring,
}: {
  overlay: TrackOverlay
  counts: TrackHeatmapCounts
  scoring: RaceTrack['scoring']
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
        <SwatchRow label="Drawn, not coloured — the boat was there; this overlay has nothing to say about the row.">
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
          <SwatchRow
            label={`Compared against the certificate's own filler — ${tallies.flagged} rows. The figure is shown; the yardstick is weak.`}
          >
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

        <SwatchRow
          label={`Frozen feed — ${counts.frozen} rows repeating one position, ringed, with the gap bridged and its duration on it.`}
        >
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
          lineHeight: 1.5,
        }}
      >
        {countSentence(overlay, counts, scoring)}
      </p>
    </div>
  )
}

/**
 * What this overlay is made of, as a sentence a sailor can check against the picture.
 *
 * Every row the window holds is accounted for: coloured, excluded by one of ADR 0025's three
 * reasons, left uncoloured for want of a value, or never positioned at all. A row that dropped out
 * of every tally would be exactly the silent omission ADR 0025 asks a coverage count to prevent.
 */
function countSentence(
  overlay: TrackOverlay,
  counts: TrackHeatmapCounts,
  scoring: RaceTrack['scoring']
): string {
  const { rows, frozen, low_speed, maneuver_window, with_fix } = counts
  const { scored, without_value } = counts.overlays[overlay]
  const parked = low_speed + maneuver_window
  const noFix = rows - with_fix
  const ratio = isRatioOverlay(overlay)

  const sentences: string[] = []

  if (ratio && scoring === 'no-polar-version') {
    sentences.push(
      `This race records no Polar Version, so none of its ${rows} rows carries a percent of ` +
        'target. The track is where the boat went; nothing on it is a comparison.'
    )
  } else if (ratio && scoring === 'polar-unreadable') {
    sentences.push(
      `The Polar Version this race points at could not be read, so none of its ${rows} rows is ` +
        'coloured. The track is still what the recording says; the comparison is missing.'
    )
  } else {
    // "Drawn but not coloured" only where every row is in fact drawn, which is every race in this
    // archive — a row that logged no position is in the count and in no part of the picture, and
    // the sentence below says so rather than quietly including it here.
    sentences.push(
      noFix === 0
        ? `${rows - scored} of ${rows} rows are drawn but not coloured.`
        : `${rows - scored} of ${rows} rows carry no ${TRACK_SCALES[overlay].title.toLowerCase()}.`
    )

    sentences.push(
      ratio
        ? `${frozen} sat inside a dropout, ${parked} were parked or mid-manoeuvre, and ` +
            `${without_value} are in range of nothing the Polar can answer.`
        : // A reading is not a performance metric, so only the dead feed is excluded here — a parked
          // boat's speed over the ground is simply what the GPS measured (ADR 0037).
          `${frozen} sat inside a dropout, where every value is a copy of the row above, and ` +
            `${without_value} left this channel blank.`
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
