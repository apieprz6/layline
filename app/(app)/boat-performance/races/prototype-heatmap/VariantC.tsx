/**
 * PROTOTYPE — Variant C: the track is not the measurement. It questions the premise.
 *
 * The bet: **a coloured track spends the wrong channel.** A track's shape is already carrying
 * information a sailor reads hard — where the laylines were, how wide the tacks were, where the
 * boat got parked — and re-painting that same line with a performance number makes two facts fight
 * over one mark. So here the track stays one neutral ink, and percent-of-target rides *on* it as
 * dots: **size is how far off target, and only the two poles carry a hue.**
 *
 * That inverts every "not meaningful" case for free. A row no metric may read simply has no dot —
 * absence is the honest encoding of *we have no number for this*, and it needs no texture, no gray
 * step, and no legend entry that has to explain why gray does not mean 100%. An on-target row also
 * has no dot, which is the one place this variant is sharper than both others: the eye goes to the
 * dots, and the dots are exactly the places worth looking at.
 *
 * And the map is not a section. It sits *inside* the "Boat performance vs. polars" card, as that
 * card's evidence — which is the layout claim: the map is not a fourth thing on the page, it is the
 * detail behind a number the page already states.
 */

import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import type { PrototypeRace, TrackPoint } from './prototype-data'
import { token } from './prototype-tokens'
import {
  DropoutBridges,
  ScaleBar,
  bridges,
  frozenRings,
  project,
  segments,
} from './prototype-geometry'
import { percent } from './VariantA'

/** Dots need room to be separable, so this one takes nearly as much height as A's. */
const MAP_HEIGHT = 420

/** The two poles, and nothing between them: there is no ramp here to be monotone. */
const SLOW = token('proto-slow')
const FAST = token('proto-fast')

/** Below this the deviation is inside the noise of a bilinear target and gets no dot. */
const DEADBAND = 0.03

/** A 30%-off row and a 300%-off row should not differ by 10× in radius. */
function radius(deviation: number): number {
  return Math.min(1.6 + Math.sqrt(deviation) * 9, 6.5)
}

export default function VariantC({ race }: { race: PrototypeRace }): ReactElement {
  const projection = project(race.points, MAP_HEIGHT)

  const dots = race.points.flatMap((point) => {
    if (point.state !== 'measured' || point.ratio === null) return []
    if (point.latitude === null || point.longitude === null) return []
    const deviation = Math.abs(point.ratio - 1)
    if (deviation < DEADBAND) return []
    return [{ point, deviation, slow: point.ratio < 1 }]
  })

  const unscored = race.points.length - race.counts.measured

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: spacing(4) }}>
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
        <p
          style={{
            margin: `${spacing(1)} 0 0`,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {race.file} · Lake Michigan
        </p>
      </header>

      {/* One card. The numbers, then the water they came off. */}
      <section
        style={{
          border: '1px solid var(--surface-border)',
          borderRadius: 8,
          background: 'var(--surface-raised)',
          padding: spacing(4),
          marginBottom: spacing(6),
        }}
      >
        <h2 style={HEADING}>Boat performance vs. polars</h2>

        <div style={{ display: 'flex', gap: spacing(4), marginBottom: spacing(4) }}>
          <Stat label="Upwind" value={percent(race.upwind.ratio)} rows={race.upwind.rows} />
          <Stat label="Downwind" value={percent(race.downwind.ratio)} rows={race.downwind.rows} />
        </div>

        {projection ? (
          <svg
            viewBox={`0 0 ${projection.width} ${projection.height}`}
            role="img"
            aria-label="The race track in neutral ink, with a dot wherever the boat was measurably off its target speed — bigger the further off, amber when slow and blue when fast."
            style={{ display: 'block', width: '100%', maxWidth: projection.width, height: 'auto', margin: '0 auto' }}
          >
            <rect
              x="0"
              y="0"
              width={projection.width}
              height={projection.height}
              rx="6"
              fill="var(--surface-elevated)"
            />

            {/* The path, in one ink, at one weight. It is where the boat went — geometry, and no
                claim about how well it was going. Still broken across Frozen runs, because a
                straight line through a dead feed is a claim the recording never made. */}
            {segments(race.points, projection, (point) => point.state === 'frozen').map(
              (segment, at) => (
                <polyline
                  key={`t-${at}`}
                  points={segment.points}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth="1.3"
                  opacity="0.55"
                  strokeLinecap="round"
                />
              )
            )}

            <DropoutBridges bridges={bridges(race.points, projection)} />

            {frozenRings(race.points, projection).map((ring, at) => (
              <circle
                key={`frozen-${at}`}
                cx={ring.cx}
                cy={ring.cy}
                r="3.4"
                fill="none"
                stroke="var(--wind-storm)"
                strokeWidth="1"
                opacity="0.6"
              />
            ))}

            {/* The measurement. A 2px surface ring keeps overlapping dots separable where the boat
                sailed over its own track. */}
            {dots.map(({ point, deviation, slow }) => (
              <circle
                key={`d-${point.index}`}
                cx={projection.x(point.longitude as number)}
                cy={projection.y(point.latitude as number)}
                r={radius(deviation)}
                fill={slow ? SLOW : FAST}
                fillOpacity="0.55"
                stroke="var(--surface-elevated)"
                strokeWidth="0.7"
              />
            ))}

            <ScaleBar projection={projection} />
          </svg>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            This recording has no position fixes anywhere, so there is no track to draw.
          </p>
        )}

        <DotLegend race={race} unscored={unscored} />
      </section>

      <section style={{ marginBottom: spacing(6) }}>
        <h2 style={HEADING}>Manoeuvre splits</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          (unchanged from the mockup — stubbed here)
        </p>
      </section>

      <section style={{ marginBottom: spacing(6) }}>
        <h2 style={HEADING}>Sail selection vs. chart</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          (unchanged from the mockup — stubbed here)
        </p>
      </section>

      <section>
        <h2 style={HEADING}>Instrument calibration check</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          (unchanged from the mockup — stubbed here)
        </p>
      </section>
    </div>
  )
}

const HEADING = {
  fontFamily: 'var(--font-body)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
  margin: `0 0 ${spacing(3)}`,
}

function Stat({ label, value, rows }: { label: string; value: string; rows: number }): ReactElement {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-accent)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', marginTop: spacing(1) }}>
        {label} of target
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{rows} rows scored</div>
    </div>
  )
}

function DotLegend({ race, unscored }: { race: PrototypeRace; unscored: number }): ReactElement {
  return (
    <div style={{ marginTop: spacing(3) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing(4) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}>
          <svg width="46" height="16" aria-hidden>
            <circle cx="6" cy="8" r="2.2" fill={SLOW} fillOpacity="0.55" />
            <circle cx="18" cy="8" r="3.8" fill={SLOW} fillOpacity="0.55" />
            <circle cx="33" cy="8" r="6" fill={SLOW} fillOpacity="0.55" />
          </svg>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>slow</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}>
          <svg width="46" height="16" aria-hidden>
            <circle cx="6" cy="8" r="2.2" fill={FAST} fillOpacity="0.55" />
            <circle cx="18" cy="8" r="3.8" fill={FAST} fillOpacity="0.55" />
            <circle cx="33" cy="8" r="6" fill={FAST} fillOpacity="0.55" />
          </svg>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>fast</span>
        </span>
      </div>

      <p
        style={{
          margin: `${spacing(3)} 0 0`,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        Bare track means on target, or a row no performance number may read — {unscored} of{' '}
        {race.points.length} rows here, of which {race.counts.suppressed} were inside{' '}
        {race.suppressionFloor}° of the wind — the lowest angle this boat’s polar carries a measured
        row for — and {race.counts.frozen} were a frozen feed (ringed in red: the boat’s last
        position, repeated).
      </p>
    </div>
  )
}
