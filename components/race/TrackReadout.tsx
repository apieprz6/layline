/**
 * One stretch of track, read out: what the row the sailor tapped actually holds.
 *
 * The map answers *where* without a number; this answers *what*, for one row, and it is the reason
 * the track is tappable at all — a sailor points at the place they remember being slow, not at a
 * moment on an axis.
 *
 * Three rules it keeps, all of them the repo's:
 *
 * **Provenance travels with every figure** (ADR 0008). `SOG` and `COG` are **Position-Derived** —
 * the GPS's own answer. Every wind figure is **Computed** by qtVlm from a solved current and an
 * instrument altitude that the export does not carry, so none of it is a masthead reading. The
 * **Target Speed** is read from the Polar, never from the recording. Saying so costs one line and
 * is the difference between a number and a number somebody can trust.
 *
 * **A missing figure says which kind of missing it is.** A row with no percent of target is never a
 * dash: it is either excluded by ADR 0025 (and says which of the three), or the Polar could not
 * answer, or the race records no Polar at all. The dash would make all four look like the same
 * shrug.
 *
 * **A flagged figure is shown flagged, not withheld** (ADR 0036). **Filler-Anchored** means the
 * comparison rested on a cell the certificate manufactured; the row is real, so the number is shown
 * with the doubt attached.
 *
 * A Server Component by accident rather than by rule — it holds no state, and its caller passes the
 * row. It renders inside a client island, which is fine: nothing here is interactive.
 */

import type { ReactElement, ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'
import { TRACK_SCALES, overlayPaint } from '@/services/analysis/track-overlays'
import { wallClockTime } from '@/services/recordings/wall-clock'
import type { RaceTrack, TrackOverlay, TrackRowFacts } from '@/types'

/** What each reason reads as in a sentence, in the second person a sailor would recognise. */
const WHY: Record<string, string> = {
  frozen: 'the feed was dead here — every value on this row is a copy of the row above',
  low_speed: 'the boat was below the speed gate, so no performance figure reads it (ADR 0025)',
  maneuver_window: 'this row sits inside a manoeuvre window, so no performance figure reads it',
  no_target: 'the Polar has no answer at this angle and wind speed',
  no_polar_version: 'this race records no Polar Version, so there is nothing to compare against',
  no_reading: 'the recording left this channel blank',
}

export default function TrackReadout({
  row,
  overlay,
  scoring,
}: {
  /** The stretch being read, or null when the sailor has not tapped one. */
  row: TrackRowFacts | null
  overlay: TrackOverlay
  scoring: RaceTrack['scoring']
}): ReactElement {
  if (row === null) {
    return (
      <p
        data-testid="track-readout-empty"
        style={{
          margin: `${spacing(3)} 0 0`,
          padding: spacing(3),
          border: '1px dashed var(--surface-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}
      >
        Tap a stretch of the track to read what the boat was doing there.
      </p>
    )
  }

  const paint = overlayPaint(overlay, row, scoring === 'polar')
  const headline = TRACK_SCALES[overlay]

  return (
    <div
      data-testid="track-readout"
      style={{
        margin: `${spacing(3)} 0 0`,
        padding: spacing(3),
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-elevated)',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {headline.title}
        </h3>
        {/* The recording's own clock, exactly as its instruments wrote it — no timezone was
            applied in either direction (ADR 0008). */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)',
          }}
        >
          {wallClockTime(row.row_time)}
        </span>
      </div>

      {paint.band === null ? (
        <p
          data-testid="track-readout-why"
          style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}
        >
          No figure here: {WHY[paint.not_scored ?? ''] ?? 'this overlay cannot read the row'}.
        </p>
      ) : (
        <p
          data-testid="track-readout-headline"
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {headlineValue(overlay, row)}
          {paint.flagged && (
            <span
              style={{
                marginLeft: spacing(2),
                fontSize: 'var(--text-xs)',
                fontWeight: 400,
                color: 'var(--state-warning)',
              }}
            >
              filler-anchored
            </span>
          )}
        </p>
      )}

      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
        <Fact label="Speed over ground (GPS)">{knots(row.sog)}</Fact>
        <Fact label="Target Speed (from the Polar)">{knots(row.target_speed)}</Fact>
        <Fact label="Percent of Target Speed">{percent(row.polar_efficiency)}</Fact>
        <Fact label="Target VMG (estimated)">{knots(row.target_vmg)}</Fact>
        <Fact label="Percent of Target VMG">{percent(row.vmg_efficiency)}</Fact>
        <Fact label="True wind speed (computed)">{knots(row.tws)}</Fact>
        <Fact label="True wind angle (computed)">{degrees(row.twa)}</Fact>
        <Fact label="Course over ground (GPS)">{degrees(row.cog)}</Fact>
      </dl>

      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Speed and course over the ground are the GPS’s own figures. Every wind figure was computed
        by qtVlm from the boat’s instruments rather than read off the masthead, and Target VMG is
        estimated from the Polar’s grid, not the certificate’s published optimum.
      </p>
    </div>
  )
}

/** The overlay's own number, in the unit its scale is written in. */
function headlineValue(overlay: TrackOverlay, row: TrackRowFacts): string {
  switch (overlay) {
    case 'target_speed':
      return `${percent(row.polar_efficiency)} of target speed`
    case 'target_vmg':
      return `${percent(row.vmg_efficiency)} of target VMG`
    case 'sog':
      return `${knots(row.sog)} over the ground`
    case 'tws':
      return `${knots(row.tws)} of true wind`
    case 'twa':
      return `${degrees(row.twa)} true wind angle, ${tackOf(row.twa)}`
    case 'cog':
      return `${degrees(row.cog)} over the ground`
  }
}

/** Which tack a signed `TWA` was on. Positive is starboard (ADR 0008). */
function tackOf(twa: number | null): string {
  if (twa === null) return 'tack not recorded'
  if (twa === 0) return 'head to wind'
  return twa > 0 ? 'starboard tack' : 'port tack'
}

/**
 * A figure, or the em dash that means *this row does not have one*.
 *
 * The dash is only ever absence of a value, never absence of a reason: where the *overlay* has
 * nothing to say the readout says which kind of nothing above, in words.
 */
function knots(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} kt`
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

function degrees(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°`
}

function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2) }}>
      <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flex: 1 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
        }}
      >
        {children}
      </dd>
    </div>
  )
}
