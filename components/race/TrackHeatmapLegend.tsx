'use client'

/**
 * The legend directly beneath the map, and the count of what the map could not colour.
 *
 * A Client Component for one reason: **the legend is theme-aware**, and the theme is only resolved
 * in the browser (`lib/theme/store.ts` — the server snapshot is always `solar`, because the server
 * has no way to know what time it is where the sailor is).
 *
 * That obligation is ADR 0033's, and it is the price of keeping the diverging ramp. After dark
 * `.theme-nightvision` collapses every hue to a red lightness ramp, so both arms land on the same
 * ramp: 85% and 115% become the same colour and the brightest step is the midpoint. The ramp
 * cannot survive that and is not made to — but a legend that kept its daylight words would then be
 * stating a polarity the colours no longer carry, and *that* is the defect. So after dark the
 * sentence changes to depth-from-target in either direction, with the side coming from the
 * numbers below the map rather than from the colour.
 *
 * The count is stated in words rather than left to be inferred from how much grey is on screen: a
 * quarter of one of this archive's races is scoreable, and that proportion is not something a
 * sailor should have to estimate by eye.
 */

import type { ReactElement, ReactNode } from 'react'
import { useTheme } from '@/lib/hooks/useTheme'
import { spacing } from '@/lib/utils/design'
import { TRACK_BANDS, trackBandColour } from '@/services/analysis/track-heatmap'
import type { RaceTrack, TrackHeatmapCounts } from '@/types'

export default function TrackHeatmapLegend({
  counts,
  scoring,
}: {
  counts: TrackHeatmapCounts
  scoring: RaceTrack['scoring']
}): ReactElement {
  const { theme } = useTheme()
  const afterDark = theme === 'nightvision'
  const scored = scoring === 'polar'

  return (
    <div style={{ marginTop: spacing(3) }}>
      {scored && (
        <>
          <div style={{ display: 'flex', alignItems: 'center' }} data-testid="track-ramp">
            {TRACK_BANDS.map((band) => (
              <div key={band.band} style={{ flex: 1 }}>
                <div
                  title={band.label}
                  style={{ height: 8, background: trackBandColour(band.band), borderRadius: 1 }}
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
                  {band.tick}
                </div>
              </div>
            ))}
          </div>

          {afterDark ? (
            <p
              data-testid="track-ramp-wording"
              style={{
                margin: `${spacing(1)} 0 0`,
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              After dark this scale is depth, not side: the deeper the band, the further from
              target — in <em>either</em> direction. Which side a stretch was on comes from the
              figures under the map, not from the colour.
            </p>
          ) : (
            <div
              data-testid="track-ramp-wording"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: spacing(1),
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-muted)',
              }}
            >
              <span>slower than target</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>100%</span>
              <span>faster</span>
            </div>
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
        <SwatchRow
          label={`Drawn, not scored — ${counts.rows - counts.scored} of ${counts.rows} rows. The boat was there; the row supports no claim.`}
        >
          <svg width="26" height="10" aria-hidden>
            <line
              x1="1"
              y1="5"
              x2="25"
              y2="5"
              stroke="var(--text-muted)"
              strokeWidth="1"
              opacity="0.5"
            />
          </svg>
        </SwatchRow>

        {scored && (
          <SwatchRow
            label={`Compared against the certificate's own filler — ${counts.filler_anchored} rows. Its percent is shown; the yardstick is weak.`}
          >
            <svg width="26" height="10" aria-hidden>
              <line
                x1="1"
                y1="5"
                x2="25"
                y2="5"
                stroke={trackBandColour('at')}
                strokeWidth="3.2"
                strokeDasharray="2.5 2"
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
              stroke="var(--wind-storm)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <circle
              cx="8"
              cy="5"
              r="3.4"
              fill="none"
              stroke="var(--wind-storm)"
              strokeWidth="1"
              opacity="0.6"
            />
            <circle
              cx="18"
              cy="5"
              r="3.4"
              fill="none"
              stroke="var(--wind-storm)"
              strokeWidth="1"
              opacity="0.6"
            />
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
        {countSentence(counts, scoring)}
      </p>
    </div>
  )
}

/**
 * What the map is made of, as a sentence a sailor can check against the picture.
 *
 * Every row the window holds is accounted for: coloured, excluded by one of ADR 0025's three
 * reasons, left uncoloured for want of a target, or never positioned at all. A row that dropped
 * out of every tally would be exactly the silent omission ADR 0025 asks a coverage count to
 * prevent.
 */
function countSentence(counts: TrackHeatmapCounts, scoring: RaceTrack['scoring']): string {
  const { rows, scored, frozen, low_speed, maneuver_window, without_target, with_fix } = counts
  const parked = low_speed + maneuver_window
  const noFix = rows - with_fix

  const sentences: string[] = []

  if (scoring === 'no-polar-version') {
    sentences.push(
      `This race records no Polar Version, so none of its ${rows} rows carries a percent of ` +
        'target. The track is where the boat went; nothing on it is a comparison.'
    )
  } else if (scoring === 'polar-unreadable') {
    sentences.push(
      `The Polar Version this race points at could not be read, so none of its ${rows} rows is ` +
        'coloured. The track is still what the recording says; the comparison is missing.'
    )
  } else {
    sentences.push(`${rows - scored} of ${rows} rows are drawn but not scored.`)
    sentences.push(
      `${frozen} sat inside a dropout, ${parked} were parked or mid-manoeuvre, and ` +
        `${without_target} are in range of nothing the Polar can answer.`
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
