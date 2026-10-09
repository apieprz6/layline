/**
 * PROTOTYPE (LAY-165) — VARIANT A: **the rose**. The boat's own speed profile, against the
 * certificate's.
 *
 * The position this variant takes: the thing a sailor wants to see is *the shape of their boat* —
 * where the two lobes are, where they fall away, how far inside the certificate's curve they sit —
 * and that is a claim about **speed**, in knots, at an angle. The percentage is then a colour on
 * that shape rather than the shape itself.
 *
 * What it costs: a percentage is the quantity every other screen in this map speaks in (the track,
 * the Sail Selection cells, the hero figure), and a rose makes it secondary. What it buys: the
 * certificate is *in the picture*, so "92% of target" stops being a number you take on trust and
 * becomes a gap you can see — and the gap is wider downwind than up on this archive, which no
 * percentage-only view says out loud.
 *
 * One side, not two. The Polar's TWA axis is one side of the boat (`targetSpeed` looks up
 * `Math.abs(twa)`), so a mirrored rose would draw a port-tack lobe out of starboard-tack rows. The
 * fold is stated in words instead.
 */

'use client'

import { type ReactElement } from 'react'
import { FILLER_DASH } from '@/components/race/track-ink'
import { overlayBand, overlayColour } from '@/services/analysis/track-overlays'
import { describeDuration } from '@/services/recordings/coverage'
import {
  WIND_BANDS,
  anchorable,
  angleBins,
  certificateCurve,
  type AngleBin,
  type PrototypeArchive,
  type PrototypeRow,
  type WindBandId,
} from './data'

/** Frame: a half-disc with its centre on the left edge, 0° up and 180° down. */
const R = 168
const CX = 16
const CY = 190
const BOX = { width: 206, height: 384 }

/** Knots at the rim. This boat's certificate tops out at 8.5 kt and it has never beaten that. */
const RIM_KNOTS = 9

interface VariantProps {
  archive: PrototypeArchive
  /** The rows the filter matched — what the picture is of. */
  rows: readonly PrototypeRow[]
  /** The whole archive's Countable rows, for the per-Race view's reference ghost. Null in season. */
  reference: readonly PrototypeRow[] | null
  band: WindBandId
  onBand: (band: WindBandId) => void
  mode: 'season' | 'race' | 'teaser'
}

/**
 * Where a speed at an angle lands: 0° straight up, sweeping clockwise down the right-hand side to
 * 180° at the bottom. Bow up, which is how every polar diagram and every chart plotter draws it.
 */
function at(twa: number, knots: number): [number, number] {
  const radius = (Math.min(Math.max(knots, 0), RIM_KNOTS) / RIM_KNOTS) * R
  const radians = (twa * Math.PI) / 180

  return [CX + radius * Math.sin(radians), CY - radius * Math.cos(radians)]
}

export default function VariantA({
  archive,
  rows,
  reference,
  band,
  onBand,
  mode,
}: VariantProps): ReactElement {
  const bins = angleBins(rows).filter((bin) => bin.band === band)
  const ghost = reference === null ? [] : angleBins(reference).filter((bin) => bin.band === band)

  // Every certificate column inside the selected band, so the band's own spread is visible and
  // each column's filler section ends where *it* ends (LAY-150's ragged floor, drawn).
  const columns = archive.polar.tws_axis
    .map((tws, index) => ({ tws, index }))
    .filter(({ tws }) => {
      const below = WIND_BANDS.find((entry) => entry.id === band)?.below ?? Infinity
      const above = WIND_BANDS.filter((entry) => entry.below < below).pop()?.below ?? 0
      return tws >= above && tws < below
    })

  const teaser = mode === 'teaser'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!teaser && <BandChips rows={rows} band={band} onBand={onBand} />}

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        role="img"
        aria-label={`Speed against the Polar, ${band} air`}
        data-testid="rose"
        style={{ width: '100%', maxWidth: teaser ? 150 : 420, height: 'auto' }}
      >
        <Rings teaser={teaser} />

        {/* The certificate, behind everything: one faint curve per wind-speed column in the band,
            drawn solid where the cell is measured and stitched where it is the file's own ramp. */}
        {columns.map(({ index, tws }) => (
          <Certificate key={tws} archive={archive} column={index} label={!teaser} />
        ))}

        {/* The same race's own trace over the season's, where there is a season to compare to. */}
        {ghost.length > 0 && <Trace bins={ghost} ghost />}
        {bins.length > 0 ? <Trace bins={bins} ghost={false} /> : null}
      </svg>

      {!teaser && <Readout bins={bins} band={band} archive={archive} mode={mode} />}
    </div>
  )
}

/** Speed rings every 2 knots, and the angle spokes a sailor reads the lobes against. */
function Rings({ teaser }: { teaser: boolean }): ReactElement {
  const ticks = [2, 4, 6, 8]
  const spokes = [0, 30, 45, 60, 90, 120, 135, 150, 180]

  return (
    <g>
      {ticks.map((knots) => {
        const radius = (knots / RIM_KNOTS) * R
        return (
          <g key={knots}>
            <path
              d={`M ${CX} ${CY - radius} A ${radius} ${radius} 0 0 1 ${CX} ${CY + radius}`}
              fill="none"
              stroke="var(--surface-divider)"
              strokeWidth={0.7}
            />
            {/* On the beam spoke, where the rings are furthest from everything else on the page.
                Stacked up the centre line they read as a column of numbers belonging to nothing. */}
            {!teaser && (
              <text
                x={CX + radius}
                y={CY - 3}
                fontSize={7}
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                textAnchor="middle"
              >
                {knots}kt
              </text>
            )}
          </g>
        )
      })}
      {spokes.map((twa) => {
        const [x, y] = at(twa, RIM_KNOTS)
        return (
          <g key={twa}>
            <line x1={CX} y1={CY} x2={x} y2={y} stroke="var(--surface-divider)" strokeWidth={0.5} />
            {!teaser && (
              <text
                x={x + (twa > 90 ? -2 : twa < 90 ? 2 : 4)}
                y={y + (twa === 0 ? 8 : twa === 180 ? -2 : 3)}
                fontSize={7}
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                textAnchor={twa > 90 ? 'end' : 'start'}
              >
                {twa}°
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/**
 * One wind-speed column of the certificate, in two inks.
 *
 * The stitched inner section is not decoration: those cells are the file ramping up from zero
 * towards its first real measurement, and a sailor reading a solid curve there would be reading a
 * target nobody measured. ADR 0036 computes against them and flags the figure; the same rule drawn
 * is a curve that changes its ink where its evidence changes.
 */
function Certificate({
  archive,
  column,
  label,
}: {
  archive: PrototypeArchive
  column: number
  label: boolean
}): ReactElement {
  const curve = certificateCurve(archive.polar, column)
  const real = curve.filter((entry) => anchorable(entry.origin))
  const filler = curve.filter((entry) => !anchorable(entry.origin))

  // The joining segment: from the last filler point to the first real one, so the two inks meet.
  const bridge = filler.length > 0 && real.length > 0 ? [filler[filler.length - 1], real[0]] : []

  const path = (points: typeof curve): string =>
    points
      .map((entry, index) => {
        const [x, y] = at(entry.twa, entry.knots)
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

  return (
    <g data-testid={`certificate-${archive.polar.tws_axis[column]}`}>
      <path d={path(real)} fill="none" stroke="var(--text-muted)" strokeWidth={1.1} opacity={0.75} />
      <path
        d={path([...filler, ...bridge])}
        fill="none"
        stroke="var(--state-warning)"
        strokeWidth={1.1}
        strokeDasharray={FILLER_DASH}
        opacity={0.9}
      />
      {/* No label on the curve. The first draft wrote the wind speed at each curve's 180° end,
          where three of them converge and the text ran off the left edge of the frame — the
          readout below names the columns instead, which is one place rather than three. */}
      {label && null}
    </g>
  )
}

/**
 * The boat's own trace: one segment per pair of bins, coloured by that stretch's percent of target.
 *
 * The colour is the shipped track ramp (`RATIO_BANDS`), not a new one — this is the same quantity
 * the map on the race page colours by, and two scales for one number on two screens is how a sailor
 * learns to distrust both.
 *
 * **This variant's position on the filler question: a filler-anchored bin is drawn, in place, but
 * never coloured as performance.** It is stitched in the warning ink and its point is hollow, so it
 * sits exactly where the boat sailed and carries no claim about how well. The reason is what the
 * grid in variant C shows if you let ADR 0036's rule colour itself: on the diverging ramp those
 * bins land at the *flattering* end — 242% of "target" at 30° in 4 knots — because the thing they
 * are divided by is a ramp towards zero. A weak comparison that reads as the best sailing in the
 * archive is worse than one that reads as nothing.
 *
 * Gaps are gaps. Where the boat never sailed — 90–110° on this archive is nearly empty — the trace
 * stops rather than interpolating across the hole, because a line there would assert a speed at an
 * angle nobody sailed.
 */
function Trace({ bins, ghost }: { bins: AngleBin[]; ghost: boolean }): ReactElement {
  const points = bins.filter((bin) => bin.observed_knots !== null && bin.pct !== null)

  return (
    <g data-testid={ghost ? 'trace-ghost' : 'trace'}>
      {points.slice(0, -1).map((bin, index) => {
        const next = points[index + 1]
        // One bin wide at 10°, two at 20°: a jump of more than one bin is a hole in the evidence.
        if (next.twa - bin.twa > TWA_GAP) return null

        const [x1, y1] = at(bin.twa + 5, bin.observed_knots ?? 0)
        const [x2, y2] = at(next.twa + 5, next.observed_knots ?? 0)
        const flagged = bin.filler_share > 0.5

        return (
          <line
            key={bin.twa}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={
              ghost
                ? 'var(--text-accent)'
                : flagged
                  ? 'var(--state-warning)'
                  : overlayColour(overlayBand('target_speed', bin.pct ?? 1))
            }
            strokeWidth={ghost ? 1.4 : 3.4}
            strokeDasharray={ghost ? '2 3' : flagged ? FILLER_DASH : undefined}
            opacity={ghost ? 0.5 : 1}
            strokeLinecap="round"
          />
        )
      })}

      {!ghost &&
        points.map((bin) => {
          const [x, y] = at(bin.twa + 5, bin.observed_knots ?? 0)
          // Evidence as area: a bin resting on four minutes should not look like one resting on an
          // hour, and on a trace the only free channel left is size.
          const radius = Math.max(1.6, Math.min(5, Math.sqrt(bin.seconds) / 11))
          const flagged = bin.filler_share > 0.5

          return (
            <circle
              key={bin.twa}
              cx={x}
              cy={y}
              r={radius}
              fill={
                flagged
                  ? 'var(--surface-raised)'
                  : overlayColour(overlayBand('target_speed', bin.pct ?? 1))
              }
              stroke={flagged ? 'var(--state-warning)' : 'var(--surface-raised)'}
              strokeWidth={flagged ? 1.4 : 0.7}
            />
          )
        })}
    </g>
  )
}

const TWA_GAP = 10

/** One chip per wind band, with what the match holds in it — disabled where it holds nothing. */
function BandChips({
  rows,
  band,
  onBand,
}: {
  rows: readonly PrototypeRow[]
  band: WindBandId
  onBand: (band: WindBandId) => void
}): ReactElement {
  const bins = angleBins(rows)

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {WIND_BANDS.map((entry) => {
        const own = bins.filter((bin) => bin.band === entry.id)
        const seconds = own.reduce((total, bin) => total + bin.seconds, 0)
        const empty = seconds === 0

        return (
          <button
            key={entry.id}
            type="button"
            data-testid={`band-${entry.id}`}
            disabled={empty}
            onClick={() => onBand(entry.id)}
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              border: `1px solid ${band === entry.id ? 'var(--text-accent)' : 'var(--surface-border)'}`,
              background: band === entry.id ? 'var(--surface-elevated)' : 'none',
              color: empty ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
              fontWeight: band === entry.id ? 700 : 400,
              opacity: empty ? 0.5 : 1,
            }}
          >
            {entry.label} · {entry.range}
            <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 6, color: 'var(--text-muted)' }}>
              {empty ? 'none' : describeDuration(seconds)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** What the picture rests on, in words, under it. */
function Readout({
  bins,
  band,
  archive,
  mode,
}: {
  bins: AngleBin[]
  band: WindBandId
  archive: PrototypeArchive
  mode: 'season' | 'race' | 'teaser'
}): ReactElement {
  const seconds = bins.reduce((total, bin) => total + bin.seconds, 0)
  const flagged = bins.filter((bin) => bin.filler_share > 0.5)
  const floors = archive.polar.tws_axis
    .map((tws, column) => {
      const row = archive.polar.origins.findIndex((cells) => anchorable(cells[column]))
      return row === -1 ? null : `${tws}kt above ${archive.polar.twa_axis[row]}°`
    })
    .filter((entry): entry is string => entry !== null)

  if (seconds === 0) {
    return (
      <p style={NOTE}>
        Nothing in {band} air in this match. The certificate’s own curves are still drawn, because
        what the boat <em>should</em> do at this wind speed does not depend on having sailed it.
      </p>
    )
  }

  const columns = archive.polar.tws_axis
    .filter((tws) => {
      const below = WIND_BANDS.find((entry) => entry.id === band)?.below ?? Infinity
      const above = WIND_BANDS.filter((entry) => entry.below < below).pop()?.below ?? 0
      return tws >= above && tws < below
    })
    .map((tws) => `${tws} kt`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={NOTE}>
        {describeDuration(seconds)} of scored sailing in {band} air, over {bins.length} ten-degree
        bins. Each point is that bin’s time-weighted mean speed; its colour is the same percent-of-
        target ramp the race track uses. The grey curves behind it are the certificate’s own columns
        in this band — {columns.join(', ')} — stitched in amber wherever the cell they pass through
        is the file’s manufactured ramp rather than a measurement.
      </p>
      {flagged.length > 0 && (
        <p style={{ ...NOTE, color: 'var(--state-warning)' }}>
          {flagged.length} bin{flagged.length === 1 ? '' : 's'} mostly{' '}
          <strong>filler-anchored</strong>: drawn where the boat sailed, hollow and stitched, and
          deliberately <em>not</em> coloured — divided by a ramp towards zero they would read as the
          fastest sailing on the screen. The certificate measures {floors.slice(0, 3).join(', ')},
          and the floor moves column by column.
        </p>
      )}
      {mode === 'race' && (
        <p style={NOTE}>
          The dotted blue line is the whole archive in the same band — this race against what the
          boat usually does, which is the only way the picture answers “was this good{' '}
          <em>for us</em>”. It is drawn in the accent rather than in grey because grey is what the
          certificate is drawn in, and the first draft of this chart had three grey lines on it that
          meant two different things.
        </p>
      )}
    </div>
  )
}

const NOTE = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  lineHeight: 1.5,
}

export const VARIANT_A_NAME = 'Rose — speed against the certificate'
