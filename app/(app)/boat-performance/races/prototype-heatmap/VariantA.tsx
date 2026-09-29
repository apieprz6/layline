/**
 * PROTOTYPE — Variant A: the map is the screen, the ramp is diverging, the states are shapes.
 *
 * The bet: **percent-of-target is a polarity question**, so it gets a diverging ramp. A sailor does
 * not want to know "how fast was I" — the Polar already told them that — they want to know *which
 * side of target* each stretch of water sat on, and how far. 100% is the baseline, and the eye
 * should be able to find the slow bits without reading a number.
 *
 * Amber below / blue above rather than the conventional red/blue pair, because `TrackMap` already
 * rings Frozen points in `--wind-storm` red and a red arm would collide with it on this very map.
 * A neutral gray midpoint, per the diverging rule — never a hue at the middle.
 *
 * Every non-measurement state is therefore drawn in **shape and texture, not colour**: colour is
 * spent entirely on the measurement, so nothing that is *not* a measurement can borrow a step of
 * the ramp and lie.
 */

import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import type { PrototypeRace } from './prototype-data'
import { token } from './prototype-tokens'
import { MAP_WIDTH, bridges, frozenRings, project, segments } from './prototype-geometry'
import HeatmapMap, { type DrawnSegment } from './HeatmapMap'

/** The most vertical room a map may take on a 390px phone before it stops being glanceable. */
const MAP_HEIGHT = 440

/**
 * Two one-hue arms and a neutral middle, each arm validated on its own as an ordinal ramp against
 * the sand surface (`scripts/validate_palette.js --ordinal`): monotone lightness, adjacent ΔL ≥
 * 0.06, light end ≥ 2:1. The light ends are darker than a stock ramp's because `#F0EDE6` is a
 * lighter surface than the validator's reference.
 */
const BELOW = [token('proto-below-1'), token('proto-below-2'), token('proto-below-3')] as const
const AT_TARGET = token('proto-at')
const ABOVE = [token('proto-above-1'), token('proto-above-2'), token('proto-above-3')] as const

/** Equal steps per arm: ±5% is the first band, then ±15%, then everything beyond. */
const BANDS = [
  { max: 0.85, colour: BELOW[2], label: 'below 85%', tick: '<85' },
  { max: 0.95, colour: BELOW[1], label: '85–95%', tick: '85' },
  { max: 0.98, colour: BELOW[0], label: '95–98%', tick: '95' },
  { max: 1.02, colour: AT_TARGET, label: 'on target', tick: '98' },
  { max: 1.05, colour: ABOVE[0], label: '102–105%', tick: '102' },
  { max: 1.15, colour: ABOVE[1], label: '105–115%', tick: '105' },
  { max: Infinity, colour: ABOVE[2], label: 'above 115%', tick: '115+' },
] as const

function bandColour(ratio: number): string {
  return (BANDS.find((band) => ratio < band.max) ?? BANDS[BANDS.length - 1]).colour
}

export default function VariantA({ race }: { race: PrototypeRace }): ReactElement {
  // `false`: the frame stays 360×440 whatever shape the track is, and a thin track is dealt with by
  // zooming into it. The projection still fits the whole track at zoom 1, so nothing starts off-screen.
  const projection = project(race.points, MAP_HEIGHT, MAP_WIDTH, false)

  // The colour decision stays here, on the server, next to the bands that justify it. What crosses to
  // the client is drawn geometry — a path string and a colour — so the camera can move but nothing on
  // the other side can re-decide what a row meant.
  const drawn: DrawnSegment[] = projection
    ? segments(race.points, projection, (point) => point.state === 'frozen').map((segment) => ({
        points: segment.points,
        colour:
          segment.point.state === 'measured' && segment.point.ratio !== null
            ? bandColour(segment.point.ratio)
            : null,
        dotted: segment.point.state === 'suppressed',
      }))
    : []

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: spacing(4) }}>
      <Heading race={race} />

      <section style={{ marginBottom: spacing(6) }}>
        {projection ? (
          <HeatmapMap
            width={projection.width}
            height={projection.height}
            metresPerUnit={projection.metresPerUnit}
            label="The race track, coloured by how each stretch compared with the boat's target speed. Zoomable and pannable."
            segments={drawn}
            dropouts={bridges(race.points, projection)}
            rings={frozenRings(race.points, projection)}
          />
        ) : (
          <NoTrack />
        )}

        <Legend race={race} />
      </section>

      <PerfSection race={race} />
      <SailingSection race={race} />
      <SailChartSection />
      <CalibrationSection />
    </div>
  )
}

function Heading({ race }: { race: PrototypeRace }): ReactElement {
  return (
    <header style={{ marginBottom: spacing(5) }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          margin: 0,
          color: 'var(--text-primary)',
        }}
      >
        {race.label.split(' · ')[0]}
      </h1>
      <p style={{ margin: `${spacing(1)} 0 0`, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {race.file} · Lake Michigan
      </p>
    </header>
  )
}

function Legend({ race }: { race: PrototypeRace }): ReactElement {
  const excluded =
    race.counts.frozen + race.counts['low-speed'] + race.counts.maneuver + race.counts.suppressed

  return (
    <div style={{ marginTop: spacing(3) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {BANDS.map((band) => (
          <div key={band.label} style={{ flex: 1 }}>
            <div style={{ height: 8, background: band.colour, borderRadius: 1 }} />
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
      <div
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
        <SwatchRow label={`Parked or mid-manoeuvre — ${race.counts['low-speed'] + race.counts.maneuver} rows`}>
          <svg width="26" height="10" aria-hidden>
            <line x1="1" y1="5" x2="25" y2="5" stroke="var(--text-muted)" strokeWidth="1" opacity="0.5" />
          </svg>
        </SwatchRow>
        <SwatchRow
          label={`Inside ${race.suppressionFloor}° of the wind — the polar's lowest measured row (${race.counts.suppressed} rows)`}
        >
          <svg width="26" height="10" aria-hidden>
            <line
              x1="1"
              y1="5"
              x2="25"
              y2="5"
              stroke="var(--text-muted)"
              strokeWidth="1"
              strokeDasharray="1 2"
              opacity="0.5"
            />
          </svg>
        </SwatchRow>
        <SwatchRow label={`Frozen feed — the boat's position repeated (${race.counts.frozen} rows)`}>
          <svg width="26" height="10" aria-hidden>
            <circle cx="8" cy="5" r="3.4" fill="none" stroke="var(--wind-storm)" strokeWidth="1" opacity="0.6" />
            <circle cx="18" cy="5" r="3.4" fill="none" stroke="var(--wind-storm)" strokeWidth="1" opacity="0.6" />
          </svg>
        </SwatchRow>
      </ul>

      <p
        style={{
          margin: `${spacing(3)} 0 0`,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}
      >
        {excluded} of {race.points.length} rows are drawn but not scored.
      </p>
    </div>
  )
}

function SwatchRow({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}>
      <span style={{ flexShrink: 0 }}>{children}</span>
      <span>{label}</span>
    </li>
  )
}

function NoTrack(): ReactElement {
  return (
    <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
      This recording has no position fixes anywhere, so there is no track to draw.
    </div>
  )
}

// ---------------------------------------------------------------------------
// The sections the map now sits above. The AI summary card is gone; nothing
// replaces it, because the map is the thing that was worth looking at first.
// ---------------------------------------------------------------------------

const SECTION_HEADING = {
  fontFamily: 'var(--font-body)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
  margin: `0 0 ${spacing(3)}`,
}

export function Tiles({ tiles }: { tiles: readonly { label: string; value: string }[] }): ReactElement {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--surface-border)', borderRadius: 6 }}>
      {tiles.map((tile, at) => (
        <div
          key={tile.label}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: spacing(3),
            borderRight: at < tiles.length - 1 ? '1px solid var(--surface-divider)' : undefined,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-accent)',
            }}
          >
            {tile.value}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: spacing(1) }}>
            {tile.label}
          </div>
        </div>
      ))}
    </div>
  )
}

export function percent(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`
}

function PerfSection({ race }: { race: PrototypeRace }): ReactElement {
  return (
    <section style={{ marginBottom: spacing(6) }}>
      <h2 style={SECTION_HEADING}>Boat performance vs. polars</h2>
      <Tiles
        tiles={[
          { label: 'Upwind speed', value: percent(race.upwind.ratio) },
          { label: 'Downwind speed', value: percent(race.downwind.ratio) },
          { label: 'Upwind rows', value: String(race.upwind.rows) },
          { label: 'Downwind rows', value: String(race.downwind.rows) },
        ]}
      />
    </section>
  )
}

function SailingSection({ race }: { race: PrototypeRace }): ReactElement {
  return (
    <section style={{ marginBottom: spacing(6) }}>
      <h2 style={SECTION_HEADING}>Manoeuvre splits</h2>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
        {race.counts.maneuver} rows sit inside a manoeuvre window. They are on the track as a
        hairline and in no average.
      </p>
    </section>
  )
}

function SailChartSection(): ReactElement {
  return (
    <section style={{ marginBottom: spacing(6) }}>
      <h2 style={SECTION_HEADING}>Sail selection vs. chart</h2>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
        (unchanged from the mockup — stubbed here)
      </p>
    </section>
  )
}

function CalibrationSection(): ReactElement {
  return (
    <section>
      <h2 style={SECTION_HEADING}>Instrument calibration check</h2>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
        (unchanged from the mockup — stubbed here)
      </p>
    </section>
  )
}
