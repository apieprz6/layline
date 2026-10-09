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
 * the Sail Selection cells, the hero figure), and a rose makes it secondary — which is what the
 * radius toggle is for. What it buys: the certificate is *in the picture*, so "92% of target" stops
 * being a number you take on trust and becomes a gap you can see.
 *
 * One side, not two. The Polar's TWA axis is one side of the boat (`targetSpeed` looks up
 * `Math.abs(twa)`), so a mirrored rose would draw a port-tack lobe out of starboard-tack rows. The
 * fold is stated in words instead.
 *
 * ## There is no wind-band control on this chart, and that is the point
 *
 * The first draft had a row of band chips. They were doing two jobs — choosing which rows were
 * drawn, and choosing which of the certificate's nine columns were drawn — and the first of those
 * is **the rail's job**. Two controls over one axis is the conflict ADR 0032 settled on the
 * Instrument Tuning screen by making the Era structure rather than a chip, and the same answer
 * applies here: the rail decides which rows are in play, and the chart reads the certificate *where
 * those rows actually are*.
 *
 * So the reference curve is the Polar read at the matched rows' own **time-weighted mean TWS**,
 * through the shipped `polarTargets` — which interpolates between columns anyway (ADR 0028), so a
 * curve at 9.4 knots is a legitimate read of the grid rather than an invention. Behind it sits the
 * spread between the 10th and 90th percentile of the same rows' wind, which is the honest way to
 * say "this reference is a range, and here is how wide": a sailor who wants it sharp narrows the
 * rail's own Wind speed chip, and watches the band close. The chart teaches the control instead of
 * duplicating it.
 *
 * On the per-Race view there is no rail and no chips at all (the map's decision 8), and nothing
 * here changes: that race's own mean wind is what the curve is read at.
 */

'use client'

import { useMemo, useState, type ReactElement } from 'react'
import { FILLER_DASH } from '@/components/race/track-ink'
import { polarTargets } from '@/services/analysis/polar-targets'
import { overlayBand, overlayColour } from '@/services/analysis/track-overlays'
import { describeDuration } from '@/services/recordings/coverage'
import {
  TWA_BIN_DEG,
  anglesAcrossBands,
  type AngleBin,
  type PrototypeArchive,
  type PrototypeRow,
} from './data'

/** Frame: a half-disc with its centre on the left edge, 0° up and 180° down. */
const R = 168
const CX = 16
const CY = 190
const BOX = { width: 206, height: 384 }

/** Knots at the rim. This boat's certificate tops out at 8.5 kt and it has never beaten that. */
const RIM_KNOTS = 9

/** The percent window, when the radius is a ratio. 100% lands on its own labelled ring. */
const PCT = { low: 0.6, high: 1.4 }

/** What the radius means. Two readings of one selection, the LAY-149 pattern (ADR 0034). */
type Radius = 'knots' | 'pct'

interface VariantProps {
  archive: PrototypeArchive
  /** The rows the filter matched — what the picture is of. */
  rows: readonly PrototypeRow[]
  /** The whole archive's rows, for the per-Race view's reference ghost. Null in season. */
  reference: readonly PrototypeRow[] | null
  mode: 'season' | 'race' | 'teaser'
}

/**
 * Where a speed at an angle lands: 0° straight up, sweeping clockwise down the right-hand side to
 * 180° at the bottom. Bow up, which is how every polar diagram and every chart plotter draws it.
 */
function at(twa: number, fraction: number): [number, number] {
  const radius = Math.min(Math.max(fraction, 0), 1) * R
  const radians = (twa * Math.PI) / 180

  return [CX + radius * Math.sin(radians), CY - radius * Math.cos(radians)]
}

/** A bin's radius, in either reading, as a fraction of the rim. */
function radiusOf(bin: AngleBin, radius: Radius): number | null {
  if (radius === 'knots') {
    return bin.observed_knots === null ? null : bin.observed_knots / RIM_KNOTS
  }

  return bin.pct === null ? null : (bin.pct - PCT.low) / (PCT.high - PCT.low)
}

export default function VariantA({ archive, rows, reference, mode }: VariantProps): ReactElement {
  const [radius, setRadius] = useState<Radius>('knots')
  const [selected, setSelected] = useState<number | null>(null)

  const bins = anglesAcrossBands(rows)
  const ghost = reference === null ? [] : anglesAcrossBands(reference)

  // The shipped lookup, in the browser. `polar-targets.ts` is pure and free of server-only imports
  // (ADR 0029 requires that of everything in `services/analysis/`), so the client can read the
  // grid itself rather than being shipped a curve it cannot re-derive.
  const targets = useMemo(
    () =>
      polarTargets({
        twa_axis: archive.polar.twa_axis,
        tws_axis: archive.polar.tws_axis,
        boat_speed: archive.polar.boat_speed,
      }),
    [archive.polar]
  )

  const wind = useMemo(() => windBehind(rows), [rows])
  const teaser = mode === 'teaser'
  const drawn = bins.filter((bin) => radiusOf(bin, radius) !== null)
  const chosen = selected === null ? null : (bins.find((bin) => bin.twa === selected) ?? null)

  function step(by: number): void {
    if (drawn.length === 0) return
    const index = chosen === null ? -1 : drawn.findIndex((bin) => bin.twa === chosen.twa)
    setSelected(drawn[(index + by + drawn.length) % drawn.length].twa)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!teaser && <RadiusToggle radius={radius} onRadius={setRadius} />}

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        role="img"
        aria-label={`Speed against the Polar over ${describeDuration(
          bins.reduce((total, bin) => total + bin.seconds, 0)
        )} of sailing`}
        data-testid="rose"
        tabIndex={teaser ? -1 : 0}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          // The switcher listens for the same two keys on `window`. Once the chart has focus they
          // belong to the chart, so the event stops here rather than also changing variant.
          event.stopPropagation()
          event.preventDefault()
          step(event.key === 'ArrowLeft' ? -1 : 1)
        }}
        style={{
          width: '100%',
          maxWidth: teaser ? 150 : 420,
          height: 'auto',
          outlineOffset: 2,
        }}
      >
        <Rings teaser={teaser} radius={radius} />

        {/* The certificate, behind everything: one curve at the mean wind behind these rows, over
            the spread between their 10th and 90th percentile. */}
        {wind !== null && radius === 'knots' && (
          <Certificate targets={targets} archive={archive} wind={wind} />
        )}
        {radius === 'pct' && <OnTarget />}

        {ghost.length > 0 && <Trace bins={ghost} radius={radius} ghost />}
        {bins.length > 0 && <Trace bins={bins} radius={radius} ghost={false} />}

        {/* The tap targets, last so they sit over everything: one wedge per bin, a whole sector
            wide, because a 3px dot is not a target on a phone. */}
        {!teaser &&
          drawn.map((bin) => (
            <path
              key={`hit-${bin.twa}`}
              d={wedge(bin.twa)}
              fill="transparent"
              data-testid={`bin-${bin.twa}`}
              onClick={() => setSelected(selected === bin.twa ? null : bin.twa)}
              style={{ cursor: 'pointer' }}
            />
          ))}

        {chosen !== null && <Selection bin={chosen} radius={radius} />}
      </svg>

      {!teaser && (
        <Readout
          bins={bins}
          chosen={chosen}
          radius={radius}
          wind={wind}
          rows={rows}
          archive={archive}
          targets={targets}
          mode={mode}
          onClear={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/** A whole 10° sector, from the centre to the rim: one bin's tap target. */
function wedge(twa: number): string {
  const [x1, y1] = at(twa, 1)
  const [x2, y2] = at(twa + TWA_BIN_DEG, 1)

  return `M ${CX} ${CY} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`
}

/** The wind behind a set of rows: its time-weighted mean, and the spread it is a mean of. */
function windBehind(
  rows: readonly PrototypeRow[]
): { mean: number; low: number; high: number } | null {
  const weighted = rows
    .filter(
      (row): row is PrototypeRow & { tws: number; interval_seconds: number } =>
        row.countable &&
        row.tws !== null &&
        row.interval_seconds !== null &&
        row.efficiency.target_speed !== null
    )
    .map((row) => ({ tws: row.tws, seconds: row.interval_seconds }))
    .sort((left, right) => left.tws - right.tws)

  const total = weighted.reduce((sum, entry) => sum + entry.seconds, 0)
  if (total === 0) return null

  /** The wind speed `share` of the way through the *time*, not through the rows. */
  const quantile = (share: number): number => {
    let seen = 0
    for (const entry of weighted) {
      seen += entry.seconds
      if (seen >= total * share) return entry.tws
    }
    return weighted[weighted.length - 1].tws
  }

  return {
    mean: weighted.reduce((sum, entry) => sum + entry.tws * entry.seconds, 0) / total,
    low: quantile(0.1),
    high: quantile(0.9),
  }
}

/** Speed rings, or percent rings, and the angle spokes a sailor reads the lobes against. */
function Rings({ teaser, radius }: { teaser: boolean; radius: Radius }): ReactElement {
  const ticks =
    radius === 'knots'
      ? [2, 4, 6, 8].map((knots) => ({ fraction: knots / RIM_KNOTS, label: `${knots}kt` }))
      : [0.7, 0.85, 1, 1.15, 1.3].map((pct) => ({
          fraction: (pct - PCT.low) / (PCT.high - PCT.low),
          label: `${Math.round(pct * 100)}%`,
        }))
  const spokes = [0, 30, 45, 60, 90, 120, 135, 150, 180]

  return (
    <g>
      {ticks.map((tick) => {
        const r = tick.fraction * R
        return (
          <g key={tick.label}>
            <path
              d={`M ${CX} ${CY - r} A ${r} ${r} 0 0 1 ${CX} ${CY + r}`}
              fill="none"
              stroke="var(--surface-divider)"
              strokeWidth={0.7}
            />
            {/* On the beam spoke, where the rings are furthest from everything else on the page.
                Stacked up the centre line they read as a column of numbers belonging to nothing. */}
            {!teaser && (
              <text
                x={CX + r}
                y={CY - 3}
                fontSize={7}
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                textAnchor="middle"
              >
                {tick.label}
              </text>
            )}
          </g>
        )
      })}
      {spokes.map((twa) => {
        const [x, y] = at(twa, 1)
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
 * The certificate at the wind these rows actually blew in, in two inks, over its own spread.
 *
 * Read through the shipped `targetSpeed`, point by point along the Polar's TWA axis, so the two
 * things that make the curve honest come for free: it stops where the grid stops (ADR 0028 — no
 * extrapolation past 24 kt or below 4, and nothing below the first tabulated angle), and each point
 * knows whether its own bracket touched the file's manufactured ramp (ADR 0036). The ink changes
 * where that flag does, which is **why the floor looks ragged at a glance**: it is 52° at 4 knots,
 * 45° at 6 and 8, and 40° from 10 up, so the stitched section of this curve moves as the rail
 * narrows the wind.
 */
function Certificate({
  targets,
  archive,
  wind,
}: {
  targets: ReturnType<typeof polarTargets>
  archive: PrototypeArchive
  wind: { mean: number; low: number; high: number }
}): ReactElement {
  const curve = (tws: number): { twa: number; knots: number; filler: boolean }[] =>
    archive.polar.twa_axis.flatMap((twa) => {
      const target = targets.targetSpeed(twa, tws)
      return target === null ? [] : [{ twa, knots: target.knots, filler: target.filler_anchored }]
    })

  const path = (points: { twa: number; knots: number }[]): string =>
    points
      .map((entry, index) => {
        const [x, y] = at(entry.twa, entry.knots / RIM_KNOTS)
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

  const mean = curve(wind.mean)
  const real = mean.filter((entry) => !entry.filler)
  const filler = mean.filter((entry) => entry.filler)
  const bridge = filler.length > 0 && real.length > 0 ? [filler[filler.length - 1], real[0]] : []

  /*
   * The spread, as a closed shape between the two percentile curves — clipped to the angles **both**
   * of them answer at.
   *
   * The clip is the whole of the arithmetic here and the first draft did not have it: the floor
   * moves with the wind, so at 6 kt the certificate starts at 45° and at 14 kt it starts at 40°,
   * and stitching two curves of different lengths into one closed path threw a spike off the top of
   * the rose. Where only one of the two can answer there is no band, because a band needs two
   * sides.
   */
  const low = curve(wind.low)
  const high = curve(wind.high)
  const shared = low
    .map((entry) => entry.twa)
    .filter((twa) => high.some((entry) => entry.twa === twa))
  const sideOf = (points: typeof low): typeof low =>
    shared.flatMap((twa) => points.filter((entry) => entry.twa === twa))

  const spread =
    wind.high - wind.low < 0.5 || shared.length < 2
      ? null
      : `${path(sideOf(low))} ${[...sideOf(high)]
          .reverse()
          .map((entry) => {
            const [x, y] = at(entry.twa, entry.knots / RIM_KNOTS)
            return `L ${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join(' ')} Z`

  return (
    <g data-testid="certificate">
      {spread !== null && (
        <path d={spread} fill="var(--text-muted)" opacity={0.1} stroke="none" />
      )}
      <path d={path(real)} fill="none" stroke="var(--text-muted)" strokeWidth={1.3} opacity={0.8} />
      <path
        d={path([...filler, ...bridge])}
        fill="none"
        stroke="var(--state-warning)"
        strokeWidth={1.3}
        strokeDasharray={FILLER_DASH}
        opacity={0.9}
      />
    </g>
  )
}

/** In the ratio reading the reference is a circle at 100%, and a dent in the trace is a loss. */
function OnTarget(): ReactElement {
  const r = ((1 - PCT.low) / (PCT.high - PCT.low)) * R

  return (
    <path
      data-testid="on-target"
      d={`M ${CX} ${CY - r} A ${r} ${r} 0 0 1 ${CX} ${CY + r}`}
      fill="none"
      stroke="var(--text-primary)"
      strokeWidth={1.2}
      strokeDasharray="3 2"
    />
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
function Trace({
  bins,
  radius,
  ghost,
}: {
  bins: AngleBin[]
  radius: Radius
  ghost: boolean
}): ReactElement {
  const points = bins.filter((bin) => radiusOf(bin, radius) !== null && bin.pct !== null)

  return (
    <g data-testid={ghost ? 'trace-ghost' : 'trace'}>
      {points.slice(0, -1).map((bin, index) => {
        const next = points[index + 1]
        // One bin wide at 10°: a jump of more than one is a hole in the evidence, not a leg.
        if (next.twa - bin.twa > TWA_BIN_DEG) return null

        const [x1, y1] = at(bin.twa + TWA_BIN_DEG / 2, radiusOf(bin, radius) ?? 0)
        const [x2, y2] = at(next.twa + TWA_BIN_DEG / 2, radiusOf(next, radius) ?? 0)
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
          const [x, y] = at(bin.twa + TWA_BIN_DEG / 2, radiusOf(bin, radius) ?? 0)
          // Evidence as area: a bin resting on four minutes should not look like one resting on an
          // hour, and on a trace the only free channel left is size.
          const r = Math.max(1.6, Math.min(5, Math.sqrt(bin.seconds) / 11))
          const flagged = bin.filler_share > 0.5

          return (
            <circle
              key={bin.twa}
              cx={x}
              cy={y}
              r={r}
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

/**
 * The bin being read: a halo under its own sector, never a recolour of the point.
 *
 * `track-ink.ts`'s own rule for the selected stretch on the map, for the same reason — recolouring
 * the selection would take away the one thing the sailor tapped to find out.
 */
function Selection({ bin, radius }: { bin: AngleBin; radius: Radius }): ReactElement {
  const fraction = radiusOf(bin, radius)
  const middle = bin.twa + TWA_BIN_DEG / 2

  /*
   * The target **this bin was actually scored against**, marked on its own spoke.
   *
   * It is not where the drawn curve passes, and that gap is the rose's deepest honesty problem:
   * the reference curve is read at the match's *mean* wind, while every row was scored against the
   * Polar at its *own* wind (ADR 0012, ADR 0028). So a point can sit well inside the grey curve and
   * still read 95% — on the per-Race view the 50–60° bin holds 5.80 kt against a 6.13 kt target of
   * its own, while the curve drawn at 11.5 kt passes through 7.02. Without this tick a sailor would
   * read the gap off the picture and get a different answer from the one in the figure.
   */
  const scoredAgainst = bin.target_knots === null ? null : bin.target_knots / RIM_KNOTS

  return (
    <g data-testid="selection" pointerEvents="none">
      {/* Faint, because a full-radius wedge in the accent is the loudest thing on the picture at
          anything above this — at 0.12 it read as a *measurement* sitting next to the certificate's
          own wind shadow, which is two grey-blue shapes meaning entirely different things. The ring
          on the point is what actually says "this one"; the wedge only says which sector. */}
      <path d={wedge(bin.twa)} fill="var(--text-accent)" opacity={0.07} />

      {radius === 'knots' && scoredAgainst !== null && (
        <g data-testid="scored-against">
          <line
            x1={at(bin.twa + 1, scoredAgainst)[0]}
            y1={at(bin.twa + 1, scoredAgainst)[1]}
            x2={at(bin.twa + TWA_BIN_DEG - 1, scoredAgainst)[0]}
            y2={at(bin.twa + TWA_BIN_DEG - 1, scoredAgainst)[1]}
            stroke="var(--text-primary)"
            strokeWidth={1.4}
          />
          <text
            x={at(middle, scoredAgainst)[0] + 4}
            y={at(middle, scoredAgainst)[1] - 3}
            fontSize={6.5}
            fill="var(--text-primary)"
            fontFamily="var(--font-mono)"
          >
            target {bin.target_knots?.toFixed(1)}
          </text>
        </g>
      )}

      {fraction !== null && (
        <circle
          cx={at(middle, fraction)[0]}
          cy={at(middle, fraction)[1]}
          r={8}
          fill="none"
          stroke="var(--text-accent)"
          strokeWidth={1.6}
        />
      )}
    </g>
  )
}

/** Knots or percent: two readings of one selection, which survives the switch (ADR 0034). */
function RadiusToggle({
  radius,
  onRadius,
}: {
  radius: Radius
  onRadius: (next: Radius) => void
}): ReactElement {
  return (
    <div style={{ display: 'flex', gap: 0, alignSelf: 'flex-start' }}>
      {(
        [
          ['knots', 'Speed'],
          ['pct', '% of target'],
        ] as const
      ).map(([value, label], index) => (
        <button
          key={value}
          type="button"
          data-testid={`radius-${value}`}
          aria-pressed={radius === value}
          onClick={() => onRadius(value)}
          style={{
            padding: '5px 12px',
            border: '1px solid var(--surface-border)',
            borderRadius: index === 0 ? '999px 0 0 999px' : '0 999px 999px 0',
            borderLeftWidth: index === 0 ? 1 : 0,
            background: radius === value ? 'var(--text-accent)' : 'none',
            color: radius === value ? 'var(--surface-raised)' : 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            fontWeight: radius === value ? 700 : 400,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** What the picture rests on, in words, under it — and what the tapped bin says. */
function Readout({
  bins,
  chosen,
  radius,
  wind,
  rows,
  archive,
  targets,
  mode,
  onClear,
}: {
  bins: AngleBin[]
  chosen: AngleBin | null
  radius: Radius
  wind: { mean: number; low: number; high: number } | null
  rows: readonly PrototypeRow[]
  archive: PrototypeArchive
  targets: ReturnType<typeof polarTargets>
  mode: 'season' | 'race' | 'teaser'
  onClear: () => void
}): ReactElement {
  const seconds = bins.reduce((total, bin) => total + bin.seconds, 0)
  const flagged = bins.filter((bin) => bin.filler_share > 0.5)

  if (seconds === 0) {
    return (
      <p style={NOTE}>
        Nothing in this match could be scored against the Polar, so there is no trace — and no
        reference curve either, because which wind to read the certificate at is a fact about the
        rows and there are none.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {chosen !== null && (
        <BinDetail bin={chosen} rows={rows} archive={archive} targets={targets} wind={wind} onClear={onClear} />
      )}

      <p style={NOTE}>
        {describeDuration(seconds)} of scored sailing over {bins.length}{' '}
        ten-degree bins. Each point is that bin&rsquo;s time-weighted mean{' '}
        {radius === 'knots' ? 'speed' : 'percent of target'}, sized by the time behind it, coloured
        on the same percent-of-target ramp the race track uses.{' '}
        {chosen === null && <>Tap a sector to read one, or focus the chart and use ←/→.</>}
      </p>

      {wind !== null && radius === 'knots' && (
        <p style={NOTE}>
          The grey curve is the certificate read at <strong>{wind.mean.toFixed(1)} kt</strong> — the
          time-weighted mean wind behind these rows — and the shadow behind it is the same
          certificate between {wind.low.toFixed(0)} and {wind.high.toFixed(0)} kt, where the middle
          80% of this sailing happened.{' '}
          {wind.high - wind.low >= 4 && mode === 'season' && (
            <>
              That shadow is wide, which is the honest cost of one curve over a range of wind:
              narrow the rail&rsquo;s <strong>Wind speed</strong> chip and it closes.
            </>
          )}
        </p>
      )}

      {radius === 'pct' && (
        <p style={NOTE}>
          In this reading the certificate is the dashed <strong>100% circle</strong> and a dent in
          the trace is a loss, wherever it is. It is the same number the hero figure states — and
          the one thing it cannot show is how many knots a dent is worth. There is no wind shadow
          here: a ratio has already divided the wind out, which is exactly why the circle is a
          circle.
        </p>
      )}

      {flagged.length > 0 && (
        <p style={{ ...NOTE, color: 'var(--state-warning)' }}>
          {flagged.length} bin{flagged.length === 1 ? '' : 's'} mostly{' '}
          <strong>filler-anchored</strong>: drawn where the boat sailed, hollow and stitched, and
          deliberately <em>not</em> coloured — divided by a ramp towards zero they would read as the
          fastest sailing on the screen. The certificate&rsquo;s stitched inner section is the same
          fact about the same cells.
        </p>
      )}

      {mode === 'race' && (
        <p style={NOTE}>
          The dotted blue line is the whole archive on the same axis — this race against what the
          boat usually does, which is the only way the picture answers “was this good{' '}
          <em>for us</em>”. It is drawn in the accent rather than in grey because grey is what the
          certificate is drawn in, and the first draft of this chart had three grey lines on it that
          meant two different things.
        </p>
      )}
    </div>
  )
}

/** One bin, read out: the figure, the evidence, and the comparison point it was scored against. */
function BinDetail({
  bin,
  rows,
  archive,
  targets,
  wind,
  onClear,
}: {
  bin: AngleBin
  rows: readonly PrototypeRow[]
  archive: PrototypeArchive
  targets: ReturnType<typeof polarTargets>
  wind: { mean: number; low: number; high: number } | null
  onClear: () => void
}): ReactElement {
  const own = rows.filter(
    (row) =>
      row.twa !== null &&
      Math.abs(row.twa) >= bin.twa &&
      Math.abs(row.twa) < bin.twa + TWA_BIN_DEG
  )
  const races = new Set(own.filter((row) => row.countable).map((row) => row.race_id))
  const reference =
    wind === null ? null : targets.targetSpeed(bin.twa + TWA_BIN_DEG / 2, wind.mean)

  return (
    <div
      data-testid="bin-detail"
      style={{
        padding: 10,
        border: '1px solid var(--surface-border)',
        borderLeft: '3px solid var(--text-accent)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-raised)',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 'var(--text-sm)' }}>
          {bin.twa}–{bin.twa + TWA_BIN_DEG}° off the wind
        </strong>
        <button
          type="button"
          onClick={onClear}
          aria-label="clear the selection"
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 'var(--text-xs)',
          }}
        >
          clear
        </button>
      </div>

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 700 }}>
        {bin.observed_knots?.toFixed(2) ?? '—'} kt
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {' '}
          · {bin.pct === null ? 'no figure' : `${Math.round(bin.pct * 100)}% of target`}
        </span>
      </span>

      <span style={NOTE}>
        {describeDuration(bin.seconds)} over {races.size} race{races.size === 1 ? '' : 's'} ·{' '}
        {bin.rows} scored row{bin.rows === 1 ? '' : 's'} of {own.length} in this sector
        {bin.target_knots !== null && <> · target averaged {bin.target_knots.toFixed(2)} kt</>}
      </span>

      {bin.target_knots !== null && (
        <span style={NOTE}>
          Scored against <strong>{bin.target_knots.toFixed(2)} kt</strong> — these rows&rsquo; own
          targets, at their own wind, which is the bar marked on the chart. Not where the grey curve
          passes: that is read at the whole match&rsquo;s mean wind, and this sector did not
          necessarily sail it.
        </span>
      )}

      {reference !== null && (
        <span style={NOTE}>
          The drawn curve says {reference.knots.toFixed(2)} kt here
          {reference.filler_anchored && (
            <>
              {' '}
              — and that cell is the file&rsquo;s own <strong>ramp</strong>, not a measurement, which
              is why this bin is not coloured
            </>
          )}
          .
        </span>
      )}

      {bin.filler_share > 0 && bin.filler_share <= 0.5 && (
        <span style={{ ...NOTE, color: 'var(--state-warning)' }}>
          {Math.round(bin.filler_share * 100)}% of this bin&rsquo;s rows are filler-anchored — under
          half, so the bin is still coloured. Where the line is drawn is a decision this prototype
          is asking for.
        </span>
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
