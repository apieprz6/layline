/**
 * PROTOTYPE — Variant B: the numbers lead, the ramp is sequential, 100% is a landmark not a hue.
 *
 * The bet: **percent-of-target is a magnitude, and "on target" is a landmark on it.** One hue,
 * light to dark, so the ramp reads as an amount even to someone who cannot separate two hues at
 * all — and, critically, so it survives `.theme-nightvision`, which collapses every hue in Layline
 * to a single red lightness ramp on purpose ("a hue that is not red defeats the whole point of this
 * theme"). A *diverging* scale cannot survive that: after dark, 85% and 115% both darken away from
 * the middle and become the same colour. A sequential ramp loses nothing.
 *
 * 100% then has to be marked some other way, so it is marked the way a chart marks a baseline: an
 * annotation. The legend carries a tick at the target step, and the track carries a caret at each
 * crossing — the moment the boat went from under to over, or back.
 *
 * Structurally the screen is inverted from Variant A: the ledger of worst patches is the content,
 * the map is the evidence beside it, and the perf tiles *are* the legend — the same numbers the
 * colours encode, so there is no second vocabulary to learn.
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
import { Tiles, percent } from './VariantA'

/** Smaller than A's: here the map is evidence beside the ledger, not the thing itself. */
const MAP_HEIGHT = 340

/**
 * One hue, five steps, light to dark. Validated with `--ordinal` against `#F0EDE6`: monotone
 * lightness, adjacent ΔL ≥ 0.06, light end 2.1:1. Compressed into the darker half of the blue ramp
 * because the sand surface is pale enough that a true 100-step reads as paper.
 */
const RAMP = [
  token('proto-seq-1'),
  token('proto-seq-2'),
  token('proto-seq-3'),
  token('proto-seq-4'),
  token('proto-seq-5'),
] as const

/** The steps, and which one the landmark sits on. Equal 10-point bands so the ramp reads evenly. */
const STEPS = [
  { max: 0.85, colour: RAMP[0], label: '< 85' },
  { max: 0.95, colour: RAMP[1], label: '85–95' },
  { max: 1.05, colour: RAMP[2], label: '95–105' },
  { max: 1.15, colour: RAMP[3], label: '105–115' },
  { max: Infinity, colour: RAMP[4], label: '115+' },
] as const

const TARGET_STEP = 2

function stepColour(ratio: number): string {
  return (STEPS.find((step) => ratio < step.max) ?? STEPS[STEPS.length - 1]).colour
}

interface Patch {
  rank: number
  from: number
  to: number
  ratio: number
  rows: number
  /** Mid-patch, so the number on the map lands on the water the patch actually covers. */
  anchor: TrackPoint
}

/**
 * The five slowest stretches, each a run of consecutive scored rows under target.
 *
 * A run rather than a row, because one bad fix is noise and forty seconds of bad VMG is a mistake.
 * Runs are cut by any unscored row: the ledger only ever quotes rows a metric is allowed to read.
 */
function slowPatches(points: readonly TrackPoint[]): Patch[] {
  const runs: { from: number; to: number; total: number; rows: number; anchor: TrackPoint }[] = []
  let open: (typeof runs)[number] | null = null

  for (const point of points) {
    const under = point.state === 'measured' && point.ratio !== null && point.ratio < 0.95

    if (!under) {
      open = null
      continue
    }

    if (!open) {
      open = { from: point.seconds, to: point.seconds, total: 0, rows: 0, anchor: point }
      runs.push(open)
    }

    open.to = point.seconds
    open.total += point.ratio ?? 0
    open.rows += 1
    if (open.rows % 2 === 1) open.anchor = point
  }

  return runs
    .filter((run) => run.rows >= 3)
    .sort((a, b) => a.total / a.rows - b.total / b.rows)
    .slice(0, 5)
    .map((run, at) => ({
      rank: at + 1,
      from: run.from,
      to: run.to,
      ratio: run.total / run.rows,
      rows: run.rows,
      anchor: run.anchor,
    }))
}

/** Where the boat crossed target — the landmark, as events rather than as a colour. */
function crossings(points: readonly TrackPoint[]): TrackPoint[] {
  const out: TrackPoint[] = []
  let above: boolean | null = null

  for (const point of points) {
    if (point.state !== 'measured' || point.ratio === null) continue
    const nowAbove = point.ratio >= 1
    if (above !== null && nowAbove !== above) out.push(point)
    above = nowAbove
  }

  return out
}

export default function VariantB({ race }: { race: PrototypeRace }): ReactElement {
  const projection = project(race.points, MAP_HEIGHT)
  const patches = slowPatches(race.points)

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

      {/* The tiles come first and double as the legend: the colour on the track is the same
          percent the tile states, so there is one vocabulary on the screen, not two. */}
      <section style={{ marginBottom: spacing(5) }}>
        <Tiles
          tiles={[
            { label: 'Upwind of target', value: percent(race.upwind.ratio) },
            { label: 'Downwind of target', value: percent(race.downwind.ratio) },
            { label: 'Rows scored', value: String(race.counts.measured) },
            { label: 'Rows excluded', value: String(race.points.length - race.counts.measured) },
          ]}
        />
      </section>

      <section style={{ marginBottom: spacing(5) }}>
        {projection ? (
          <svg
            viewBox={`0 0 ${projection.width} ${projection.height}`}
            role="img"
            aria-label="The race track shaded by percent of target speed, with the five slowest stretches numbered."
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

            {segments(race.points, projection, (point) => point.state === 'frozen').map(
              (segment, at) => {
                const { state, ratio } = segment.point

                // Unscored rows get width and texture, never a step of the ramp — a ramp step is a
                // measurement and these are the rows that have none.
                if (state !== 'measured' || ratio === null) {
                  return (
                    <polyline
                      key={`u-${at}`}
                      points={segment.points}
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="1.2"
                      opacity="0.45"
                      strokeDasharray={state === 'suppressed' ? '1 2' : '3 2'}
                    />
                  )
                }

                return (
                  <polyline
                    key={`m-${at}`}
                    points={segment.points}
                    fill="none"
                    stroke={stepColour(ratio)}
                    strokeWidth="3.4"
                    strokeLinecap="round"
                  />
                )
              }
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

            {/* The landmark: every crossing of target, as a tick across the track. Not a colour,
                so it still reads when the theme has taken every hue away. */}
            {crossings(race.points).map((point, at) =>
              point.latitude === null || point.longitude === null ? null : (
                <circle
                  key={`x-${at}`}
                  cx={projection.x(point.longitude)}
                  cy={projection.y(point.latitude)}
                  r="1.6"
                  fill="var(--surface-elevated)"
                  stroke="var(--text-primary)"
                  strokeWidth="0.8"
                />
              )
            )}

            {/* Direct labels on the five that matter, so the ledger and the water share an index. */}
            {patches.map((patch) =>
              patch.anchor.latitude === null || patch.anchor.longitude === null ? null : (
                <g key={patch.rank}>
                  <circle
                    cx={projection.x(patch.anchor.longitude)}
                    cy={projection.y(patch.anchor.latitude)}
                    r="7"
                    fill="var(--surface-raised)"
                    stroke="var(--text-primary)"
                    strokeWidth="1.1"
                  />
                  <text
                    x={projection.x(patch.anchor.longitude)}
                    y={projection.y(patch.anchor.latitude) + 2.8}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="700"
                    fontFamily="var(--font-mono)"
                    fill="var(--text-primary)"
                  >
                    {patch.rank}
                  </text>
                </g>
              )
            )}

            <ScaleBar projection={projection} />
          </svg>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            This recording has no position fixes anywhere, so there is no track to draw.
          </p>
        )}

        <Ramp floor={race.suppressionFloor} />
      </section>

      <section style={{ marginBottom: spacing(6) }}>
        <h2 style={LEDGER_HEADING}>Slowest stretches</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {patches.map((patch) => (
            <li
              key={patch.rank}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing(3),
                padding: `${spacing(3)} 0`,
                borderBottom: '1px solid var(--surface-divider)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  width: 18,
                  height: 18,
                  lineHeight: '18px',
                  textAlign: 'center',
                  border: '1px solid var(--text-primary)',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              >
                {patch.rank}
              </span>
              <span style={{ width: 14, height: 14, borderRadius: 2, background: stepColour(patch.ratio), flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                {patch.rows} rows · {Math.round(patch.to - patch.from)}s
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-accent)',
                }}
              >
                {percent(patch.ratio)}
              </span>
            </li>
          ))}
          {patches.length === 0 && (
            <li style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No stretch of three or more scored rows sat under 95% of target.
            </li>
          )}
        </ul>
      </section>

      <section style={{ marginBottom: spacing(6) }}>
        <h2 style={LEDGER_HEADING}>Sail selection vs. chart</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          (unchanged from the mockup — stubbed here)
        </p>
      </section>

      <section>
        <h2 style={LEDGER_HEADING}>Instrument calibration check</h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          (unchanged from the mockup — stubbed here)
        </p>
      </section>
    </div>
  )
}

const LEDGER_HEADING = {
  fontFamily: 'var(--font-body)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
  margin: `0 0 ${spacing(3)}`,
}

function Ramp({ floor }: { floor: number }): ReactElement {
  return (
    <div style={{ marginTop: spacing(3) }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {STEPS.map((step, at) => (
          <div key={step.label} style={{ flex: 1 }}>
            <div style={{ height: 8, background: step.colour, borderRadius: 1 }} />
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-muted)',
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              {step.label}
            </div>
            {/* The landmark, on the step that contains it — an annotation, not a hue. */}
            {at === TARGET_STEP && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  textAlign: 'center',
                }}
              >
                ▲ 100
              </div>
            )}
          </div>
        ))}
      </div>
      <p
        style={{
          margin: `${spacing(3)} 0 0`,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        Percent of target speed. A dot on the track is a crossing of target. A dashed hairline is a
        row no metric may read — parked, mid-manoeuvre, or inside {floor}° of the wind, which is the
        lowest angle this boat’s polar carries a measured row for. A red ring is a frozen feed: the
        boat’s last position, repeated.
      </p>
    </div>
  )
}
