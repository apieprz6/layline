'use client'

/**
 * One stretch of track, read out **on the map**: what the row the sailor tapped actually holds.
 *
 * The map answers *where* without a number; this answers *what*, for one row, and it is the reason
 * the track is tappable at all — a sailor points at the place they remember being slow, not at a
 * moment on an axis.
 *
 * ## Why it is an overlay and not a card below
 *
 * It was a panel under the map first, and that was wrong for the only screen that matters: at 390px
 * the map is 440 units tall, so the answer to a tap landed below the fold and the sailor had to
 * scroll away from the thing they were pointing at to read about it. A readout you have to go and
 * find is not a readout.
 *
 * So it floats over the frame, and it moves: the card sits in the half of the frame the selection is
 * *not* in, which keeps the stretch being described visible while it is described. It also keeps
 * clear of the zoom knobs, which own the top-right corner.
 *
 * ## Compact, then everything
 *
 * A card that covers a third of the map cannot hold eight figures, so it opens with the overlay's
 * own headline and the four numbers a sailor reads beside any of them, and expands to the rest. What
 * is *not* deferred is honesty, which is the whole reason the panel exists:
 *
 * **Provenance travels with every figure** (ADR 0008). `SOG` and `COG` are **Position-Derived** —
 * the GPS's own answer. Every wind figure is **Computed** by qtVlm from a solved current and an
 * instrument altitude that the export does not carry, so none of it is a masthead reading. The
 * **Target Speed** is read from the Polar, never from the recording. Each label says so, in both
 * states, rather than leaving it to a paragraph the sailor may not open.
 *
 * **A missing figure says which kind of missing it is.** A row with no percent of target is never a
 * dash: it is either excluded by ADR 0025 (and says which of the three), or the Polar could not
 * answer, or the race records no Polar at all. The dash would make all four look like the same
 * shrug.
 *
 * **A flagged figure is shown flagged, not withheld** (ADR 0036). **Filler-Anchored** means the
 * comparison rested on a cell the certificate manufactured; the row is real, so the number is shown
 * with the doubt attached.
 */

import { useState, type ReactElement, type ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'
import { TRACK_SCALES, overlayPaint } from '@/services/analysis/track-overlays'
import { wallClockTime } from '@/services/recordings/wall-clock'
import type { RaceTrack, TrackOverlay, TrackRowFacts } from '@/types'

/** What each reason reads as in a sentence, in the words a sailor would recognise. */
const WHY: Record<string, string> = {
  frozen: 'the feed was dead here — every value on this row is a copy of the row above',
  low_speed: 'the boat was below the speed gate, so no performance figure reads it',
  maneuver_window: 'this row sits inside a manoeuvre window, so no performance figure reads it',
  no_target: 'the Polar has no answer at this angle and wind speed',
  no_polar_version: 'this race records no Polar Version, so there is nothing to compare against',
  no_reading: 'the recording left this channel blank',
}

export default function TrackReadout({
  row,
  overlay,
  scoring,
  onDismiss,
  /** Which half of the frame the selected stretch is in, so the card can sit in the other one. */
  selectionInTopHalf,
}: {
  row: TrackRowFacts
  overlay: TrackOverlay
  scoring: RaceTrack['scoring']
  onDismiss: () => void
  selectionInTopHalf: boolean
}): ReactElement {
  const [everything, setEverything] = useState(false)
  const paint = overlayPaint(overlay, row, scoring === 'polar')
  const headline = TRACK_SCALES[overlay]

  return (
    <div
      data-testid="track-readout"
      // Announced rather than silently appearing: a sailor using a screen reader taps the track and
      // is told what is there, in the same breath as the sighted one.
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        left: spacing(2),
        right: spacing(2),
        // The half the selection is not in. The top placement also clears the zoom knobs, which
        // sit in that corner and are 32 wide plus their own gutter.
        ...(selectionInTopHalf
          ? { bottom: spacing(2) }
          : { top: spacing(2), marginRight: 40 }),
        padding: spacing(3),
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-sm)',
        // The one token meant for exactly this: a surface that floats over content and stays
        // readable in both themes.
        background: 'var(--surface-overlay)',
        backdropFilter: 'blur(6px)',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing(2) }}>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          {headline.title}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2) }}>
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
          <button
            type="button"
            aria-label="Close this readout"
            onClick={onDismiss}
            style={{
              // 28px: a thumb target that does not crowd a card this size.
              width: 28,
              height: 28,
              marginTop: -6,
              marginRight: -6,
              display: 'grid',
              placeItems: 'center',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 16,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {paint.band === null ? (
        <p
          data-testid="track-readout-why"
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
            lineHeight: 1.4,
          }}
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
            lineHeight: 1.2,
          }}
        >
          {headlineValue(overlay, row)}
          {paint.flagged && (
            <span
              style={{
                display: 'block',
                marginTop: 2,
                fontSize: 'var(--text-xs)',
                fontWeight: 400,
                color: 'var(--state-warning)',
              }}
            >
              filler-anchored — the certificate’s own manufactured cell
            </span>
          )}
        </p>
      )}

      {/* One column, label left and value right, the way every other fact list on this page reads.
          Two columns fitted at a glance and then wrapped `TWS (computed)` onto two lines at 390px,
          which is the width that matters — and a label that wraps away from its number is worse
          than a taller card. */}
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* The four a sailor reads beside any of these, whichever overlay is chosen. Every label
            carries where the figure came from, because that is not an optional detail. */}
        <Fact label="SOG (GPS)">{knots(row.sog)}</Fact>
        <Fact label="Target (Polar)">{knots(row.target_speed)}</Fact>
        <Fact label="TWS (computed)">{knots(row.tws)}</Fact>
        <Fact label="TWA (computed)">{degrees(row.twa)}</Fact>

        {everything && (
          <>
            <Fact label="% of target">{percent(row.polar_efficiency)}</Fact>
            <Fact label="COG (GPS)">{degrees(row.cog)}</Fact>
            <Fact label="Target VMG (est.)">{knots(row.target_vmg)}</Fact>
            <Fact label="% of target VMG">{percent(row.vmg_efficiency)}</Fact>
          </>
        )}
      </dl>

      <button
        type="button"
        aria-expanded={everything}
        onClick={() => setEverything((open) => !open)}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 0',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-accent)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {everything ? 'Fewer figures' : 'All figures'}
      </button>

      {everything && (
        <p
          data-testid="track-readout-provenance"
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          Speed and course over the ground are the GPS’s own figures. Every wind figure was computed
          by qtVlm from the boat’s instruments rather than read off the masthead, and Target VMG is
          estimated from the Polar’s grid, not the certificate’s published optimum.
        </p>
      )}
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
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing(1) }}>
      <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</dt>
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
