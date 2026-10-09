/**
 * PROTOTYPE (LAY-165) — VARIANT B: **the ratio, on its own axes**. No polar geometry at all.
 *
 * The position: percent of target is *the* quantity this map speaks in — the track is coloured by
 * it, the Sail Selection cells carry it, the hero figure is it — so the chart under the filter rail
 * should draw that one number against the two axes the Polar has, and nothing else. Two small
 * panels, one per axis: how we do by angle, how we do by wind speed.
 *
 * What it costs: the certificate is nowhere in the picture, so the gap between 8 knots of boat
 * speed and 8.6 of target is invisible — only its ratio survives. What it buys: the 100% line is a
 * *straight line*, so being under it is legible at a glance in a way that being inside a curve is
 * not, and the two axes stop being entangled — a rose cannot say "we are fine at every angle but
 * poor in 6 knots" without four roses.
 *
 * It is also the only variant that can draw both axes at 390px without scrolling.
 */

'use client'

import { type ReactElement } from 'react'
import { FILLER_DASH } from '@/components/race/track-ink'
import { overlayBand, overlayColour } from '@/services/analysis/track-overlays'
import { describeDuration } from '@/services/recordings/coverage'
import {
  TWA_BIN_DEG,
  WIND_BANDS,
  anglesAcrossBands,
  summed,
  type PrototypeArchive,
  type PrototypeRow,
  type Summed,
} from './data'

const BOX = { width: 320, height: 150 }
const PAD = { left: 30, right: 8, top: 10, bottom: 26 }
/** The y window. Wide enough for this archive's p5–p95 (71%–114%) with room either side. */
const Y = { low: 0.6, high: 1.3 }

interface VariantProps {
  archive: PrototypeArchive
  rows: readonly PrototypeRow[]
  reference: readonly PrototypeRow[] | null
  mode: 'season' | 'race' | 'teaser'
}

/** One x-bin of a panel: its label, its figure, and what the figure rests on. */
interface Bin extends Summed {
  at: number
  label: string
}

export default function VariantB({ archive, rows, reference, mode }: VariantProps): ReactElement {
  const byAngle = angleSeries(rows)
  const byWind = windSeries(rows, archive)
  const ghostAngle = reference === null ? [] : angleSeries(reference)
  const ghostWind = reference === null ? [] : windSeries(reference, archive)

  if (mode === 'teaser') {
    return (
      <Panel
        title="By angle"
        bins={byAngle}
        ghost={[]}
        xLabel=""
        compact
        axisTicks={[0, 90, 180]}
        xOf={(value) => value / 180}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel
        title="By true wind angle"
        bins={byAngle}
        ghost={ghostAngle}
        xLabel="|TWA|, degrees off the wind"
        axisTicks={[0, 45, 90, 135, 180]}
        xOf={(value) => value / 180}
      />
      <Panel
        title="By true wind speed"
        bins={byWind}
        ghost={ghostWind}
        xLabel="TWS, knots — the certificate’s own columns"
        axisTicks={archive.polar.tws_axis}
        xOf={(value) => (value - 2) / 24}
      />
      <Legend bins={[...byAngle, ...byWind]} mode={mode} />
    </div>
  )
}

function angleSeries(rows: readonly PrototypeRow[]): Bin[] {
  return anglesAcrossBands(rows).map((bin) => ({
    ...bin,
    at: bin.twa + TWA_BIN_DEG / 2,
    label: `${bin.twa}–${bin.twa + TWA_BIN_DEG}°`,
  }))
}

/**
 * Binned on the certificate's **own wind-speed columns**, not on even knots.
 *
 * A bin boundary where the grid has one means every row in a bin was scored against the same pair
 * of columns, so a bin that reads low is a question about the boat rather than about which two
 * columns its rows happened to straddle. It is also why this panel's ticks are 4, 6, 8, 10, 12, 14,
 * 16, 20, 24 and not a ruler: the certificate's columns are not evenly spaced and pretending they
 * are would stretch 16–20 and squash 4–6.
 */
function windSeries(rows: readonly PrototypeRow[], archive: PrototypeArchive): Bin[] {
  const axis = archive.polar.tws_axis
  const into = new Map<number, PrototypeRow[]>()

  for (const row of rows) {
    if (row.tws === null) continue
    let index = -1
    for (const [at, entry] of axis.entries()) if (row.tws >= entry) index = at
    // Below the first column the Polar answers nothing, so the row has no figure to bin; it is
    // still in the Coverage Ledger above, which is where a row with no figure belongs.
    const key = index === -1 ? -1 : index
    const found = into.get(key)
    if (found === undefined) into.set(key, [row])
    else found.push(row)
  }

  return [...into.entries()]
    .filter(([index]) => index >= 0)
    .map(([index, bucket]) => {
      const low = axis[index]
      const high = axis[index + 1]
      return {
        ...summed(bucket),
        at: high === undefined ? low + 2 : (low + high) / 2,
        label: high === undefined ? `${low} kt and up` : `${low}–${high} kt`,
      }
    })
    .sort((left, right) => left.at - right.at)
}

/**
 * One axis, one line, with the evidence under it.
 *
 * Three things are drawn and they are deliberately separate: the **figure** (a point per bin at its
 * own percent of target, in the shipped ramp's colour), the **100% rule** (a straight line, which
 * is this variant's whole argument), and the **evidence** (a bar per bin, scaled by the time behind
 * it). A bin resting on two minutes and a bin resting on an hour are the same height on the figure
 * and nowhere near on the evidence — which is the honest way round, because the figure is not more
 * true for being better evidenced, it is just better evidenced.
 */
function Panel({
  title,
  bins,
  ghost,
  xLabel,
  axisTicks,
  xOf,
  compact = false,
}: {
  title: string
  bins: Bin[]
  ghost: Bin[]
  xLabel: string
  axisTicks: readonly number[]
  xOf: (value: number) => number
  compact?: boolean
}): ReactElement {
  const plot = {
    width: BOX.width - PAD.left - PAD.right,
    height: BOX.height - PAD.top - PAD.bottom,
  }

  const px = (value: number): number => PAD.left + xOf(value) * plot.width
  const py = (pct: number): number =>
    PAD.top + (1 - (Math.min(Math.max(pct, Y.low), Y.high) - Y.low) / (Y.high - Y.low)) * plot.height

  const maxSeconds = Math.max(1, ...bins.map((bin) => bin.seconds))
  const drawn = bins.filter((bin) => bin.pct !== null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!compact && (
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {title}
        </h3>
      )}

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        role="img"
        aria-label={`${title}: percent of target speed`}
        data-testid={`panel-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`}
        style={{ width: '100%', height: 'auto' }}
      >
        {/* The y gridlines are the ramp's own band edges, so the picture and the legend one screen
            over cut the axis in the same places. */}
        {[0.85, 0.95, 1.02, 1.05, 1.15].map((edge) => (
          <line
            key={edge}
            x1={PAD.left}
            x2={BOX.width - PAD.right}
            y1={py(edge)}
            y2={py(edge)}
            stroke="var(--surface-divider)"
            strokeWidth={0.5}
          />
        ))}

        {/* 100%: the straight line this variant exists for. */}
        <line
          x1={PAD.left}
          x2={BOX.width - PAD.right}
          y1={py(1)}
          y2={py(1)}
          stroke="var(--text-primary)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        <text x={2} y={py(1) + 3} fontSize={7} fill="var(--text-primary)" fontFamily="var(--font-mono)">
          100%
        </text>
        {[Y.low, Y.high].map((edge) => (
          <text
            key={edge}
            x={2}
            y={py(edge) + (edge === Y.high ? 6 : 0)}
            fontSize={7}
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {Math.round(edge * 100)}%
          </text>
        ))}

        {/* Evidence, hanging *down* from the axis so it cannot collide with the ticks — which it
            did in the first draft, where the bars grew up through the numbers. */}
        {bins.map((bin) => {
          const height = (bin.seconds / maxSeconds) * 11
          return (
            <rect
              key={`evidence-${bin.at}`}
              x={px(bin.at) - 2.5}
              y={BOX.height - PAD.bottom + 1}
              width={5}
              height={Math.max(0.6, height)}
              fill="var(--text-muted)"
              opacity={0.4}
            />
          )
        })}

        {/* The season behind this race, where there is one. */}
        {ghost.length > 1 && (
          <polyline
            points={ghost
              .filter((bin) => bin.pct !== null)
              .map((bin) => `${px(bin.at).toFixed(1)},${py(bin.pct ?? 1).toFixed(1)}`)
              .join(' ')}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth={1.2}
            opacity={0.45}
          />
        )}

        {/* The figure. Segment by segment, so a stretch resting on the certificate's filler can be
            stitched exactly where it does and the rest of the line stays solid. */}
        {drawn.slice(0, -1).map((bin, index) => {
          const next = drawn[index + 1]
          return (
            <line
              key={`seg-${bin.at}`}
              x1={px(bin.at)}
              y1={py(bin.pct ?? 1)}
              x2={px(next.at)}
              y2={py(next.pct ?? 1)}
              stroke={
                bin.filler_share > 0.5
                  ? 'var(--state-warning)'
                  : overlayColour(overlayBand('target_speed', bin.pct ?? 1))
              }
              strokeWidth={2.4}
              strokeDasharray={bin.filler_share > 0.5 ? FILLER_DASH : undefined}
              strokeLinecap="round"
            />
          )
        })}
        {/* Variant B's position on the filler question, and the third of the three this prototype
            offers: the figure is **kept on the axis and kept out of the ramp** — a hollow ring in
            the warning ink, at its own height, with the percentage still readable off the y axis.
            Different from A (which also refuses the colour, but on a shape where the certificate's
            own stitched curve is right there to explain why) and from C (which lets ADR 0036 colour
            itself, so a 242% cell goes teal). */}
        {drawn.map((bin) => {
          const flagged = bin.filler_share > 0.5
          return (
            <circle
              key={`dot-${bin.at}`}
              cx={px(bin.at)}
              cy={py(bin.pct ?? 1)}
              r={flagged ? 3.4 : 2.6}
              fill={flagged ? 'var(--surface-raised)' : overlayColour(overlayBand('target_speed', bin.pct ?? 1))}
              stroke={flagged ? 'var(--state-warning)' : 'var(--surface-raised)'}
              strokeWidth={flagged ? 1.4 : 0.7}
            />
          )
        })}

        {/* x axis */}
        <line
          x1={PAD.left}
          x2={BOX.width - PAD.right}
          y1={BOX.height - PAD.bottom}
          y2={BOX.height - PAD.bottom}
          stroke="var(--surface-border)"
          strokeWidth={0.8}
        />
        {!compact &&
          axisTicks.map((tick) => (
            <text
              key={tick}
              x={px(tick)}
              y={BOX.height - 7}
              fontSize={7}
              fill="var(--text-muted)"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
            >
              {tick}
            </text>
          ))}
        {!compact && (
          <text
            x={BOX.width - PAD.right}
            y={PAD.top + 2}
            fontSize={6.5}
            fill="var(--text-muted)"
            textAnchor="end"
          >
            {xLabel}
          </text>
        )}
      </svg>
    </div>
  )
}

function Legend({ bins, mode }: { bins: Bin[]; mode: 'season' | 'race' | 'teaser' }): ReactElement {
  const flagged = bins.filter((bin) => bin.filler_share > 0.5)
  const thin = bins.filter((bin) => bin.pct !== null && bin.seconds < 300)
  const clipped = bins.filter((bin) => bin.pct !== null && bin.pct > Y.high)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={NOTE}>
        Each point is a <strong>ratio of sums</strong> over its own bin, weighted by the seconds each
        row lasted — the same arithmetic as the figure above, so a bin and the headline can be added
        up from the same numbers. The bar under each point is that time.
      </p>
      {flagged.length > 0 && (
        <p style={{ ...NOTE, color: 'var(--state-warning)' }}>
          {flagged.length} bin{flagged.length === 1 ? '' : 's'} stitched and ringed:{' '}
          <strong>filler-anchored</strong>, mostly compared against cells the certificate
          manufactured — {flagged.map((bin) => bin.label).join(', ')}.
        </p>
      )}
      {clipped.length > 0 && (
        <p style={{ ...NOTE, color: 'var(--state-warning)' }}>
          {clipped.length} bin{clipped.length === 1 ? ' sits' : 's sit'} above the top of the axis
          and {clipped.length === 1 ? 'is' : 'are'} drawn on its edge:{' '}
          {clipped.map((bin) => `${bin.label} at ${Math.round((bin.pct ?? 0) * 100)}%`).join(', ')}.
          Every one of them is filler-anchored, which is the whole story — the number is large
          because what it is divided by is a ramp towards zero, not because the boat was fast. An
          axis stretched to fit them would squash the 85–115% range where all the real sailing is.
        </p>
      )}
      {thin.length > 0 && (
        <p style={NOTE}>
          {thin.length} bin{thin.length === 1 ? ' rests' : 's rest'} on under five minutes
          {thin.length <= 4 ? ` (${thin.map((bin) => `${bin.label} ${describeDuration(bin.seconds)}`).join(', ')})` : ''}
          . They are drawn the same size as the rest, because a thin figure is not a smaller one — it
          is just thinner, and the bar says so.
        </p>
      )}
      {mode === 'race' && (
        <p style={NOTE}>The faint line is the whole archive on the same axis.</p>
      )}
      {WIND_BANDS.length > 0 && null}
    </div>
  )
}

const NOTE = { margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }

export const VARIANT_B_NAME = 'Panels — the ratio on its own two axes'
