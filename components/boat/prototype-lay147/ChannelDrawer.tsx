'use client'

import { useEffect, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import {
  AWA_PAIRS,
  BIN_SIZE,
  COVERAGE,
  DEVIATION_BINS,
  DOWNWIND_MIN_AWA,
  ERAS,
  HEADING_COVERAGE_PCT,
  MIN_POINTS_PER_BIN,
  STW_FIT,
  STW_POINTS,
  UPWIND_MAX_AWA,
  legMean,
  shortDate,
  signed,
  type ChannelMeta,
  type DeviationBin,
} from './fixture'

/**
 * PROTOTYPE ONLY — the drawer behind a channel card, and the three charts that actually prove
 * each channel's figure.
 *
 * These chart *forms* are LAY-149's question, not LAY-147's; what this settles is only that the
 * card opens a drawer rather than navigating to a route (LAY-149 Q5). Each chart is drawn from
 * the constants the closed tickets already fixed, so the shapes are arguable but the gates
 * underneath them are not.
 *
 * Deliberately shows the **current era only**. Whether the per-Race level and the older eras
 * overlay, toggle, or get their own charts is LAY-149 Q3, and drawing a guess at it here would
 * quietly answer a question that is still open.
 */
export default function ChannelDrawer({
  meta,
  onClose,
}: {
  meta: ChannelMeta
  onClose: () => void
}): ReactElement {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Stops the variant switcher's own arrow keys firing behind an open drawer, too.
      if (event.key === 'Escape') onClose()
      if (event.key.startsWith('Arrow')) event.stopPropagation()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const era = ERAS[meta.key][0]

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 190 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${meta.label} — the measurement behind the figure`}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 200,
          maxWidth: 430,
          margin: '0 auto',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface-raised)',
          borderTop: '1px solid var(--surface-border)',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
          padding: `10px ${spacing(4)} calc(${spacing(5)} + env(safe-area-inset-bottom))`,
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 'var(--radius-full)',
            background: 'var(--surface-border)',
            margin: '0 auto 14px',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {meta.label}
            </h2>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                color: meta.key === 'awa' ? 'var(--state-warning)' : 'var(--text-muted)',
                marginTop: 3,
              }}
            >
              {meta.term}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              alignSelf: 'flex-start',
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--surface-border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            fontSize: 10.5,
            color: 'var(--text-muted)',
            margin: `${spacing(2)} 0 ${spacing(3)}`,
          }}
        >
          Since <strong style={{ fontFamily: 'var(--font-mono)' }}>{shortDate(era.from)}</strong>
          {era.opener ? ` · ${era.opener.note}` : ' · the first race in the archive'} ·{' '}
          <strong style={{ fontFamily: 'var(--font-mono)' }}>
            {signed(era.value, meta.unit, meta.unit === 'kt' ? 2 : 1)}
          </strong>{' '}
          over {era.races} races
        </div>

        {meta.key === 'hdg' && <DeviationCurve />}
        {meta.key === 'awa' && <AsymmetrySplit />}
        {meta.key === 'stw' && <SpeedScatter />}

        <div
          style={{
            marginTop: spacing(3),
            paddingTop: spacing(3),
            borderTop: '1px solid var(--surface-divider)',
            fontSize: 10.5,
            lineHeight: 1.55,
            color: 'var(--text-muted)',
          }}
        >
          <em>{meta.caveat}</em>
        </div>

        <div
          style={{
            marginTop: spacing(3),
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-muted)',
          }}
        >
          Chart form is LAY-149’s question · per-Race and older eras not drawn here
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------- shared chart furniture */

function Caption({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <p style={{ margin: `${spacing(2)} 0 0`, fontSize: 10.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
      {children}
    </p>
  )
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

function LineKey({
  label,
  color,
  dashed = false,
}: {
  label: string
  color: string
  dashed?: boolean
}): ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <svg width="18" height="6" aria-hidden>
        <line
          x1="0"
          y1="3"
          x2="18"
          y2="3"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
        {label}
      </span>
    </span>
  )
}

function StatRow({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: spacing(4),
        flexWrap: 'wrap',
        marginTop: spacing(3),
        paddingTop: spacing(2),
        borderTop: '1px solid var(--surface-divider)',
      }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ 1. HDG deviation curve */

const CX = 150
const CY = 152
/** Radius of the zero-error ring. Error is drawn as displacement from it, in or out. */
const ZERO_R = 74
const DEG_PER_RING = 4
const PX_PER_DEG = 5.4

function radiusFor(errorDeg: number): number {
  return ZERO_R + errorDeg * PX_PER_DEG
}

function polar(headingDeg: number, radius: number): { x: number; y: number } {
  const radians = (headingDeg * Math.PI) / 180
  return { x: CX + radius * Math.sin(radians), y: CY - radius * Math.cos(radians) }
}

/**
 * Contiguous runs of bins that have a figure, wrapping 355°→5°. Each run is its own polyline, so
 * the curve is never drawn across a heading the boat did not sail — a gap is a gap, not a
 * straight line between the two bins either side of it.
 */
function runsOf(bins: readonly DeviationBin[]): DeviationBin[][] {
  const runs: DeviationBin[][] = []
  let current: DeviationBin[] = []
  for (const bin of bins) {
    if (bin.meanErrorDeg === null) {
      if (current.length > 0) runs.push(current)
      current = []
    } else {
      current.push(bin)
    }
  }
  if (current.length > 0) runs.push(current)
  // Join the first and last run when the rose closes without a gap at north.
  if (
    runs.length > 1 &&
    bins[0].meanErrorDeg !== null &&
    bins[bins.length - 1].meanErrorDeg !== null
  ) {
    const first = runs.shift() as DeviationBin[]
    runs[runs.length - 1] = [...runs[runs.length - 1], ...first]
  }
  return runs
}

function DeviationCurve(): ReactElement {
  const withFigure = DEVIATION_BINS.filter((bin) => bin.meanErrorDeg !== null)
  const worst = withFigure.reduce(
    (max, bin) => (Math.abs(bin.meanErrorDeg as number) > Math.abs(max.meanErrorDeg as number) ? bin : max),
    withFigure[0]
  )
  const binMean =
    withFigure.reduce((sum, bin) => sum + (bin.meanErrorDeg as number), 0) / withFigure.length

  return (
    <>
      <svg
        width="100%"
        viewBox="0 0 300 300"
        role="img"
        aria-label="Compass deviation curve: heading error around the rose, in ten degree bins"
      >
        {/* Guide rings, outward from the zero ring. Error is always signed displacement from it. */}
        {[0, DEG_PER_RING, DEG_PER_RING * 2].map((ring) => (
          <g key={ring}>
            <circle
              cx={CX}
              cy={CY}
              r={radiusFor(ring)}
              fill="none"
              stroke={ring === 0 ? 'var(--text-secondary)' : 'var(--surface-border)'}
              strokeWidth={ring === 0 ? 1 : 0.6}
              strokeDasharray={ring === 0 ? undefined : '2 3'}
            />
            {/* Left of the vertical, so the outermost one does not crowd the N of the rose. */}
            <text
              x={CX - 4}
              y={CY - radiusFor(ring) - 2}
              fontSize="6.5"
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
              textAnchor="end"
            >
              {ring === 0 ? '0°' : `+${ring}°`}
            </text>
          </g>
        ))}

        {/* The rose itself: a tick every 30°, cardinals named. */}
        {Array.from({ length: 12 }, (_, index) => index * 30).map((heading) => {
          const inner = polar(heading, radiusFor(0) - 7)
          const outer = polar(heading, radiusFor(DEG_PER_RING * 2) + 3)
          const label = polar(heading, radiusFor(DEG_PER_RING * 2) + 13)
          const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[heading]
          return (
            <g key={heading}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="var(--surface-border)"
                strokeWidth="0.5"
              />
              <text
                x={label.x}
                y={label.y + 2.5}
                fontSize={cardinal ? '8' : '6.5'}
                fontWeight={cardinal ? 700 : 400}
                fontFamily="var(--font-mono)"
                fill={cardinal ? 'var(--text-secondary)' : 'var(--text-muted)'}
                textAnchor="middle"
              >
                {cardinal ?? heading}
              </text>
            </g>
          )
        })}

        {/* Bins with no figure: a stub across the zero ring, so the absence is visible as absence
            rather than as a curve that simply happens to stop. These are the whole argument for not
            bridging the gaps, so they are drawn to be seen, not whispered. */}
        {DEVIATION_BINS.filter((bin) => bin.meanErrorDeg === null).map((bin) => {
          const from = polar(bin.centerDeg, radiusFor(0) - 7)
          const to = polar(bin.centerDeg, radiusFor(0) + 7)
          return (
            <line
              key={bin.centerDeg}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--text-muted)"
              strokeWidth="2.4"
              opacity="0.8"
            />
          )
        })}

        {/* The curve, broken wherever a bin has no figure. */}
        {runsOf(DEVIATION_BINS).map((run) => (
          <polyline
            key={run[0].centerDeg}
            points={run
              .map((bin) => {
                const point = polar(bin.centerDeg, radiusFor(bin.meanErrorDeg as number))
                return `${point.x.toFixed(1)},${point.y.toFixed(1)}`
              })
              .join(' ')}
            fill="none"
            stroke="var(--text-accent)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        ))}

        {/* A bin at exactly MIN_POINTS_PER_BIN is a very different claim from one built on 60 rows. */}
        {withFigure.map((bin) => {
          const point = polar(bin.centerDeg, radiusFor(bin.meanErrorDeg as number))
          const thin = bin.points < MIN_POINTS_PER_BIN * 2
          return (
            <circle
              key={bin.centerDeg}
              cx={point.x}
              cy={point.y}
              r={thin ? 2 : 2.4}
              fill={thin ? 'var(--surface-raised)' : 'var(--text-accent)'}
              stroke="var(--text-accent)"
              strokeWidth="1"
            />
          )
        })}
      </svg>

      <Caption>
        Error against GPS course, around the rose, in {BIN_SIZE}° bins — the same resolution the
        fluxgate uses for its own deviation table. The curve is <strong>broken, not bridged</strong>,
        wherever a bin held fewer than {MIN_POINTS_PER_BIN} rows; those headings carry a stub on the
        zero ring instead. A <strong>hollow dot</strong> is a bin built on under{' '}
        {MIN_POINTS_PER_BIN * 2} rows.
      </Caption>

      <StatRow>
        <Stat label="of 36 bins have a figure" value={`${HEADING_COVERAGE_PCT}%`} />
        <Stat label={`worst bin (${worst.centerDeg}°)`} value={signed(worst.meanErrorDeg as number, '°')} />
        <Stat label="mean across bins" value={signed(binMean, '°')} />
      </StatRow>

      <Caption>
        The bins average {signed(binMean, '°')}, a little above the{' '}
        {signed(ERAS.hdg[0].value, '°')} on the card, and neither is wrong: a bin mean weights every
        heading equally, while the race figure weights every row. The gap is the shape of the
        error, showing up as a number.
      </Caption>
    </>
  )
}

/* ---------------------------------------------------------- 2. AWA upwind/downwind asymmetry */

const AWA_LEFT = 34
const AWA_RIGHT = 288
const AWA_MIN = -7
const AWA_MAX = 2.5

function awaX(degrees: number): number {
  return AWA_LEFT + ((degrees - AWA_MIN) / (AWA_MAX - AWA_MIN)) * (AWA_RIGHT - AWA_LEFT)
}

function AsymmetrySplit(): ReactElement {
  const legs = [
    { key: 'upwind' as const, label: `Upwind · |AWA| < ${UPWIND_MAX_AWA}°`, y: 42 },
    { key: 'downwind' as const, label: `Downwind · |AWA| > ${DOWNWIND_MIN_AWA}°`, y: 116 },
  ]
  const upwind = legMean('upwind')
  const downwind = legMean('downwind')

  return (
    <>
      <svg
        width="100%"
        viewBox="0 0 300 175"
        role="img"
        aria-label="Apparent wind asymmetry per tack, split into upwind and downwind pairs"
      >
        {/* Zero: where the two sides of a tack agree. The only line on this chart that means anything absolute. */}
        <line
          x1={awaX(0)}
          y1="20"
          x2={awaX(0)}
          y2="146"
          stroke="var(--text-secondary)"
          strokeWidth="1"
        />
        <text
          x={awaX(0)}
          y="15"
          fontSize="7"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
          textAnchor="middle"
        >
          the two tacks agree
        </text>

        {[-6, -4, -2, 2].map((tick) => (
          <g key={tick}>
            <line
              x1={awaX(tick)}
              y1="20"
              x2={awaX(tick)}
              y2="146"
              stroke="var(--surface-border)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
            <text
              x={awaX(tick)}
              y="158"
              fontSize="7"
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
              textAnchor="middle"
            >
              {tick > 0 ? `+${tick}` : tick}°
            </text>
          </g>
        ))}

        {legs.map((leg) => {
          const pairs = AWA_PAIRS.filter((pair) => pair.leg === leg.key)
          const mean = legMean(leg.key)
          return (
            <g key={leg.key}>
              <text
                x={AWA_LEFT - 2}
                y={leg.y - 18}
                fontSize="8"
                fontWeight="600"
                fontFamily="var(--font-mono)"
                fill="var(--text-secondary)"
              >
                {leg.label}
              </text>
              {/* One dot per tack. Spread vertically only to stop them stacking — the y carries no meaning. */}
              {pairs.map((pair, index) => (
                <circle
                  key={index}
                  cx={awaX(pair.asymmetryDeg)}
                  cy={leg.y + ((index % 5) - 2) * 4.6}
                  r="2.2"
                  fill="var(--text-accent)"
                  opacity="0.5"
                />
              ))}
              <line
                x1={awaX(mean)}
                y1={leg.y - 14}
                x2={awaX(mean)}
                y2={leg.y + 14}
                stroke="var(--text-accent)"
                strokeWidth="2"
              />
              <text
                x={awaX(mean)}
                y={leg.y + 24}
                fontSize="8"
                fontWeight="700"
                fontFamily="var(--font-mono)"
                fill="var(--text-accent)"
                textAnchor="middle"
              >
                {signed(mean, '°')} · {pairs.length} pairs
              </text>
            </g>
          )
        })}
      </svg>

      <Caption>
        One dot per tack, placed by how far its two sides disagreed. Reaching segments are
        discarded entirely, so nothing between {UPWIND_MAX_AWA}° and {DOWNWIND_MIN_AWA}° appears
        here at all.
      </Caption>

      <StatRow>
        <Stat label="upwind" value={signed(upwind, '°')} />
        <Stat label="downwind" value={signed(downwind, '°')} />
        <Stat label="the two disagree by" value={`${Math.abs(downwind - upwind).toFixed(1)}°`} />
      </StatRow>

      <Caption>
        <strong>This is the reason the figure is not called a Measured Offset.</strong> A vane
        rotated on the mast would read the same error upwind and downwind; these two populations
        sit {Math.abs(downwind - upwind).toFixed(1)}° apart. Something that depends on point of
        sail is in here — most likely the leeway model, or compass deviation arriving through
        qtVlm’s recomputed angle, which is the only input this check ever sees.
      </Caption>
    </>
  )
}

/* ------------------------------------------------------------------- 3. SOG on STW scatter */

const SC_LEFT = 36
const SC_RIGHT = 290
const SC_TOP = 14
const SC_BOTTOM = 210
const SPEED_MIN = 3
const SPEED_MAX = 11

function scX(knots: number): number {
  return SC_LEFT + ((knots - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * (SC_RIGHT - SC_LEFT)
}

function scY(knots: number): number {
  return SC_BOTTOM - ((knots - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * (SC_BOTTOM - SC_TOP)
}

function SpeedScatter(): ReactElement {
  const fitAt = (stw: number): number => STW_FIT.slope * stw + STW_FIT.intercept
  const gapAtSlow = fitAt(4.5) - 4.5
  const gapAtFast = fitAt(9) - 9

  return (
    <>
      <svg
        width="100%"
        viewBox="0 0 300 236"
        role="img"
        aria-label="GPS speed against paddlewheel speed, with the one-to-one line and this era's fit"
      >
        {[4, 6, 8, 10].map((tick) => (
          <g key={tick}>
            <line
              x1={scX(tick)}
              y1={SC_TOP}
              x2={scX(tick)}
              y2={SC_BOTTOM}
              stroke="var(--surface-border)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
            <line
              x1={SC_LEFT}
              y1={scY(tick)}
              x2={SC_RIGHT}
              y2={scY(tick)}
              stroke="var(--surface-border)"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
            <text
              x={scX(tick)}
              y={SC_BOTTOM + 11}
              fontSize="7"
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
              textAnchor="middle"
            >
              {tick}
            </text>
            <text
              x={SC_LEFT - 5}
              y={scY(tick) + 2.5}
              fontSize="7"
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}

        <text
          x={(SC_LEFT + SC_RIGHT) / 2}
          y={SC_BOTTOM + 24}
          fontSize="7.5"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
          textAnchor="middle"
        >
          STW as recorded (kt)
        </text>
        <text
          x="10"
          y={(SC_TOP + SC_BOTTOM) / 2}
          fontSize="7.5"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
          textAnchor="middle"
          transform={`rotate(-90 10 ${(SC_TOP + SC_BOTTOM) / 2})`}
        >
          SOG (kt)
        </text>

        {STW_POINTS.map((point, index) => (
          <circle
            key={index}
            cx={scX(point.stw)}
            cy={scY(point.sog)}
            r="1.5"
            fill="var(--text-accent)"
            opacity="0.3"
          />
        ))}

        {/* The 1:1 line IS the current configuration — no reconstructed raw value is ever plotted. */}
        <line
          x1={scX(SPEED_MIN)}
          y1={scY(SPEED_MIN)}
          x2={scX(9.9)}
          y2={scY(9.9)}
          stroke="var(--text-secondary)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <line
          x1={scX(3.5)}
          y1={scY(fitAt(3.5))}
          x2={scX(9.5)}
          y2={scY(fitAt(9.5))}
          stroke="var(--state-warning)"
          strokeWidth="2"
        />
      </svg>

      {/* A legend, not in-chart labels. At 390px a 612-point cloud fills the plot corner to corner,
          so there is nowhere inside the axes a label can sit without landing on data. */}
      <div style={{ display: 'flex', gap: spacing(3), flexWrap: 'wrap', marginTop: 2 }}>
        <LineKey label="1:1 — what the display says now" color="var(--text-secondary)" dashed />
        <LineKey label="this era’s fit" color="var(--state-warning)" />
      </div>

      <Caption>
        The fit sits <strong>above</strong> the 1:1 line, which is the paddlewheel reading low — and
        the two lines <strong>diverge</strong>, so the error is a slope rather than a constant. That
        shape is the point of the chart; ADR 0027 keeps the fitted coefficients off screen
        deliberately, because a multiplier and an offset read as a value to go and type in.
      </Caption>

      <StatRow>
        <Stat label="R², this era" value={STW_FIT.r2.toFixed(2)} />
        <Stat label="gap at 4.5 kt" value={signed(-gapAtSlow, 'kt', 2)} />
        <Stat label="gap at 9 kt" value={signed(-gapAtFast, 'kt', 2)} />
      </StatRow>

      <Caption>
        The gap more than doubles between 4.5 and 9 knots, so a single headline figure understates
        it exactly where racing happens. Separately, the paddlewheel recorded nothing at all for{' '}
        <strong>{COVERAGE.blankStwPct}%</strong> of the archive’s rows — those have no x-value, so
        they cannot appear on this chart at any speed.
      </Caption>
    </>
  )
}
