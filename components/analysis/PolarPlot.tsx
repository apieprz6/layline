/**
 * The **Polar Plot**, drawn: the boat's own sailing against its certificate, as a half rose (ADR
 * 0040).
 *
 * Bow up, 0° at the top and 180° at the bottom, one side only. The Polar's angle axis is `|TWA|`
 * (`targetSpeed` looks up the magnitude), so a mirrored rose would draw a port lobe out of
 * starboard rows.
 *
 * This file draws and decides nothing. What lands where, against which certificate columns, and in
 * which patch, is `services/analysis/polar-plot.ts`; the selection, the focus window and the
 * reading are whoever mounts it. It holds no state and uses no hook, so the Overall tab's teaser
 * renders it on the server and the two interactive screens render it in the browser — one drawing,
 * three places, and nothing for a fourth copy to drift from.
 *
 * Every colour is a token. The ramp is the **Race Track Heatmap**'s own seven bands
 * (`overlayBand('target_speed', …)`, ADR 0033), never a second scale for the same quantity, and
 * `.theme-nightvision` collapses it with everything else.
 */

import type { KeyboardEvent, ReactElement } from 'react'
import { FILLER_DASH } from '@/components/race/track-ink'
import { fillerAnchoredShare } from '@/services/analysis/polar-performance'
import { PATCH_SOG_KNOTS, PATCH_TWA_DEG, TRACE_TWA_DEG } from '@/services/analysis/polar-plot'
import { overlayBand, overlayColour } from '@/services/analysis/track-overlays'
import type {
  CertificateFamily,
  PolarPlotMoment,
  PolarPlotPatch,
  PolarPlotReading,
  PolarPlotTraceBin,
} from '@/types'

/** The frame: a half-disc with its centre on the left edge. */
const R = 168
const CX = 16
const CY = 190
const BOX = { width: 206, height: 384 }

/** The percent window when the radius is a ratio. 100% lands on its own labelled ring. */
const PCT = { low: 0.6, high: 1.4 }

/** The stitch a Filler-Anchored dot or patch wears, as the track's stitched legs do (ADR 0036). */
const STITCH = '1.2 1'

/** Where a speed at an angle lands: 0° straight up, clockwise down the right-hand side to 180°. */
function at(twa: number, fraction: number): [number, number] {
  const radius = Math.min(Math.max(fraction, 0), 1) * R
  const radians = (twa * Math.PI) / 180

  return [CX + radius * Math.sin(radians), CY - radius * Math.cos(radians)]
}

function pctFraction(pct: number): number {
  return (pct - PCT.low) / (PCT.high - PCT.low)
}

/**
 * Where a percent falls off the picture's window, if it does.
 *
 * A moment beyond the window is pinned to that edge and *marked*, never silently drawn as a
 * figure it was not; the legend's disclosure says what the mark means.
 */
function offScale(pct: number): 'below' | 'above' | null {
  return pct < PCT.low ? 'below' : pct > PCT.high ? 'above' : null
}

interface PolarPlotProps {
  reading: PolarPlotReading
  /** Knots at the rim — `rimKnots` over everything the screen will draw, so it does not jump. */
  rim: number
  /** The certificate columns behind the sailing. Drawn in the speed reading only. */
  families: readonly CertificateFamily[]
  /**
   * The plane binned, for the season and the teaser. Drawn in the speed reading only: a patch is
   * a bin of *speed*, and in the ratio reading speed is not the radius, so the picture falls back
   * to `moments` rather than re-binning on the ratio and calling it the same thing.
   */
  patches?: readonly PolarPlotPatch[]
  /** One dot per scored moment. */
  moments?: readonly PolarPlotMoment[]
  /** The season behind one Race, as a dotted accent line. */
  trace?: readonly PolarPlotTraceBin[]
  /** The selected patch's key, which wears the accent halo. */
  selectedPatch?: string | null
  onPatch?: (key: string | null) => void
  /** The selected row, shared with the track, which rings its dot. */
  selectedRow?: number | null
  onRow?: (rowIndex: number) => void
  /** `←`/`→`, once the plot has focus. */
  onStep?: (by: -1 | 1) => void
  /** About 150px, with no labels: the Overall tab's card. */
  teaser?: boolean
  /** What the picture is, for a reader who cannot see it. */
  label: string
}

export default function PolarPlot({
  reading,
  rim,
  families,
  patches,
  moments,
  trace,
  selectedPatch = null,
  onPatch,
  selectedRow = null,
  onRow,
  onStep,
  teaser = false,
  label,
}: PolarPlotProps): ReactElement {
  const drawPatches = patches !== undefined && reading === 'knots'

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    if (onStep === undefined) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onStep(event.key === 'ArrowLeft' ? -1 : 1)
  }

  return (
    <svg
      viewBox={`0 0 ${BOX.width} ${BOX.height}`}
      role="img"
      aria-label={label}
      data-testid="polar-plot"
      data-reading={reading}
      tabIndex={onStep === undefined ? undefined : 0}
      onKeyDown={onStep === undefined ? undefined : onKeyDown}
      style={{
        display: 'block',
        width: '100%',
        // A half-disc is 1:2, so every pixel of width costs two of height: 380 keeps it legible at
        // arm's length without the words beside it running out halfway down (ADR 0040).
        maxWidth: teaser ? 150 : 380,
        height: 'auto',
      }}
    >
      <Rings reading={reading} rim={rim} labelled={!teaser} />

      {reading === 'knots' ? (
        <Certificate families={families} rim={rim} />
      ) : (
        <OnTarget />
      )}

      {drawPatches ? (
        <Patches patches={patches} rim={rim} selected={selectedPatch} onSelect={onPatch} />
      ) : (
        moments !== undefined && (
          <Dots moments={moments} reading={reading} rim={rim} selected={selectedRow} onSelect={onRow} />
        )
      )}

      {trace !== undefined && trace.length > 0 && <Trace bins={trace} reading={reading} rim={rim} />}
    </svg>
  )
}

/** Speed rings or percent rings, and the spokes a sailor reads the lobes against. */
function Rings({
  reading,
  rim,
  labelled,
}: {
  reading: PolarPlotReading
  rim: number
  labelled: boolean
}): ReactElement {
  const ticks =
    reading === 'knots'
      ? Array.from({ length: rim / 2 }, (_, index) => (index + 1) * 2).map((knots) => ({
          fraction: knots / rim,
          label: `${knots}kt`,
        }))
      : [0.7, 0.85, 1, 1.15, 1.3].map((pct) => ({
          fraction: pctFraction(pct),
          label: `${Math.round(pct * 100)}%`,
        }))

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
            {/* On the beam spoke, where the rings are furthest from everything else, with the
                halo ADR 0033 gives labels over a drawn map: the beam is where the dots are. */}
            {labelled && (
              <text
                x={CX + r}
                y={CY - 3}
                fontSize={7}
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                textAnchor="middle"
                stroke="var(--page-bg)"
                strokeWidth={2.4}
                paintOrder="stroke"
              >
                {tick.label}
              </text>
            )}
          </g>
        )
      })}
      {[0, 30, 45, 60, 90, 120, 135, 150, 180].map((twa) => {
        const [x, y] = at(twa, 1)
        return (
          <g key={twa}>
            <line x1={CX} y1={CY} x2={x} y2={y} stroke="var(--surface-divider)" strokeWidth={0.5} />
            {labelled && (
              <text
                // 0° and 180° sit on the frame's left edge, so they read rightwards off it; the
                // beam's label drops under its spoke, clear of the ring labels that run along it.
                x={x + (twa === 0 || twa === 180 ? 4 : twa > 90 ? -2 : 2)}
                y={y + (twa === 0 ? 8 : twa === 180 ? -2 : twa === 90 ? 10 : 3)}
                fontSize={7}
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                textAnchor={twa > 90 && twa < 180 ? 'end' : 'start'}
                stroke="var(--page-bg)"
                strokeWidth={2.4}
                paintOrder="stroke"
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
 * The certificate family, in two inks: grey where measured, dashed amber where the file's own
 * ramp (`FILLER_DASH`, the track's stitch). No number on any curve — nine labels converge near
 * 180° and read as an axis belonging to nothing.
 */
function Certificate({
  families,
  rim,
}: {
  families: readonly CertificateFamily[]
  rim: number
}): ReactElement {
  return (
    <g data-testid="polar-plot-certificate">
      {families.flatMap((family) =>
        family.curves.map((curve) => (
          <g
            key={`${family.version_id}-${curve.tws}`}
            data-testid="polar-plot-column"
            data-tws={curve.tws}
          >
            {curve.runs.map((run, index) => (
              <path
                key={index}
                data-filler-anchored={run.filler_anchored ? '' : undefined}
                d={run.points
                  .map((point, step) => {
                    const [x, y] = at(point.twa, point.knots / rim)
                    return `${step === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
                  })
                  .join(' ')}
                fill="none"
                stroke={run.filler_anchored ? 'var(--state-warning)' : 'var(--text-muted)'}
                strokeWidth={1}
                strokeDasharray={run.filler_anchored ? FILLER_DASH : undefined}
                opacity={run.filler_anchored ? 0.6 : 0.55}
              />
            ))}
          </g>
        ))
      )}
    </g>
  )
}

/** In the ratio reading the certificate is a dashed circle at 100%, and a dent is a loss. */
function OnTarget(): ReactElement {
  const r = pctFraction(1) * R

  return (
    <path
      data-testid="polar-plot-on-target"
      d={`M ${CX} ${CY - r} A ${r} ${r} 0 0 1 ${CX} ${CY + r}`}
      fill="none"
      stroke="var(--text-primary)"
      strokeWidth={1.2}
      strokeDasharray="3 2"
    />
  )
}

/**
 * The patches: colour is the patch's time-weighted percent, opacity is the time behind it.
 *
 * A patch most of whose sailing was scored against filler wears the stitch, coloured all the same
 * (ADR 0040, ADR 0036 unchanged). The selected one wears the accent halo, never a recolour —
 * recolouring would take away the one thing the sailor tapped it to find out.
 */
function Patches({
  patches,
  rim,
  selected,
  onSelect,
}: {
  patches: readonly PolarPlotPatch[]
  rim: number
  selected: string | null
  onSelect?: (key: string | null) => void
}): ReactElement {
  const most = Math.max(1, ...patches.map((patch) => patch.efficiency.elapsed_seconds))

  return (
    <g data-testid="polar-plot-patches">
      {patches.map((patch) => {
        const pct = patch.efficiency.polar_efficiency
        if (pct === null) return null

        const inner = patch.sog / rim
        const outer = (patch.sog + PATCH_SOG_KNOTS) / rim
        const [ix0, iy0] = at(patch.twa, inner)
        const [ox0, oy0] = at(patch.twa, outer)
        const [ox1, oy1] = at(patch.twa + PATCH_TWA_DEG, outer)
        const [ix1, iy1] = at(patch.twa + PATCH_TWA_DEG, inner)
        const ro = Math.min(outer, 1) * R
        const ri = Math.min(inner, 1) * R
        const chosen = selected === patch.key
        const filler = (fillerAnchoredShare(patch.efficiency) ?? 0) > 0.5

        return (
          <path
            key={patch.key}
            data-testid="polar-plot-patch"
            data-patch={patch.key}
            data-selected-mark={chosen ? '' : undefined}
            data-filler-anchored={filler ? '' : undefined}
            onClick={onSelect === undefined ? undefined : () => onSelect(chosen ? null : patch.key)}
            d={
              `M ${ix0.toFixed(1)} ${iy0.toFixed(1)} L ${ox0.toFixed(1)} ${oy0.toFixed(1)} ` +
              `A ${ro.toFixed(1)} ${ro.toFixed(1)} 0 0 1 ${ox1.toFixed(1)} ${oy1.toFixed(1)} ` +
              `L ${ix1.toFixed(1)} ${iy1.toFixed(1)} ` +
              `A ${ri.toFixed(1)} ${ri.toFixed(1)} 0 0 0 ${ix0.toFixed(1)} ${iy0.toFixed(1)} Z`
            }
            fill={overlayColour(overlayBand('target_speed', pct))}
            stroke={chosen ? 'var(--text-accent)' : filler ? 'var(--state-warning)' : 'none'}
            strokeWidth={chosen ? 1.6 : filler ? 0.6 : 0}
            strokeDasharray={!chosen && filler ? '1.5 1.5' : undefined}
            // Floored, so a patch resting on one short moment is still seen: a patch nobody can
            // see reads as water the boat never crossed.
            opacity={chosen ? 1 : 0.3 + 0.7 * Math.sqrt(patch.efficiency.elapsed_seconds / most)}
            style={onSelect === undefined ? undefined : { cursor: 'pointer' }}
          />
        )
      })}
    </g>
  )
}

/**
 * Every scored moment, one dot: its own angle, its own speed, its own percent of its own target.
 *
 * Area is the moment's own measured interval. qtVlm logs on events, so equal dots would under-draw
 * a sparsely-sampled race against the figure printed above it; sized by its seconds, a sparse
 * moment is simply a bigger dot, weighed as ADR 0036's figure weighs it.
 */
function Dots({
  moments,
  reading,
  rim,
  selected,
  onSelect,
}: {
  moments: readonly PolarPlotMoment[]
  reading: PolarPlotReading
  rim: number
  selected: number | null
  onSelect?: (rowIndex: number) => void
}): ReactElement {
  const chosen = moments.find((moment) => moment.row_index === selected)

  const place = (moment: PolarPlotMoment): [number, number] =>
    at(
      Math.abs(moment.twa),
      reading === 'knots' ? moment.sog / rim : pctFraction(moment.polar_efficiency)
    )

  return (
    <g data-testid="polar-plot-dots">
      {moments.map((moment) => {
        const [x, y] = place(moment)
        const r = Math.max(onSelect === undefined ? 0.7 : 1.6, Math.min(3.2, Math.sqrt(moment.seconds) / 3.5))
        const pinned = reading === 'pct' ? offScale(moment.polar_efficiency) : null
        // Above the window: a tick pointing out past the rim. Below it: a ring at the centre.
        const radians = (Math.abs(moment.twa) * Math.PI) / 180
        const tick: [number, number] = [x + 5 * Math.sin(radians), y - 5 * Math.cos(radians)]

        return (
          <g
            key={`${moment.race_id}-${moment.row_index}`}
            data-testid="polar-plot-dot"
            data-row={moment.row_index}
            onClick={onSelect === undefined ? undefined : () => onSelect(moment.row_index)}
            style={onSelect === undefined ? undefined : { cursor: 'pointer' }}
          >
            {/* A thumb-sized target under a dot a few pixels across. Transparent, not absent:
                the dot's own area is the time it lasted and is not to be inflated for a tap. */}
            {onSelect !== undefined && <circle cx={x} cy={y} r={Math.max(r, 4)} fill="transparent" />}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={overlayColour(overlayBand('target_speed', moment.polar_efficiency))}
              stroke={moment.filler_anchored ? 'var(--state-warning)' : 'none'}
              strokeWidth={moment.filler_anchored ? 0.9 : 0}
              strokeDasharray={moment.filler_anchored ? STITCH : undefined}
              data-filler-anchored={moment.filler_anchored ? '' : undefined}
              opacity={0.72}
            />
            {pinned === 'above' && (
              <line
                data-testid="polar-plot-off-scale"
                x1={x}
                y1={y}
                x2={tick[0]}
                y2={tick[1]}
                stroke="var(--text-muted)"
                strokeWidth={0.8}
              />
            )}
            {pinned === 'below' && (
              <circle
                data-testid="polar-plot-off-scale"
                cx={x}
                cy={y}
                r={r + 1.2}
                fill="none"
                stroke="var(--text-muted)"
                strokeWidth={0.6}
              />
            )}
          </g>
        )
      })}

      {/* The ring, drawn last so no neighbour covers it: the halo the track's selected stretch
          wears, in the same accent, so one tap reads as one mark on two pictures. */}
      {chosen !== undefined && (() => {
        const [x, y] = place(chosen)
        return (
          <circle
            cx={x}
            cy={y}
            r={6}
            fill="none"
            stroke="var(--text-accent)"
            strokeWidth={1.8}
            data-testid="polar-plot-selected"
            data-selected-mark=""
            pointerEvents="none"
          />
        )
      })()}
    </g>
  )
}

/** The season behind one Race: ten-degree sums, dotted, in the accent — grey is the certificate. */
function Trace({
  bins,
  reading,
  rim,
}: {
  bins: readonly PolarPlotTraceBin[]
  reading: PolarPlotReading
  rim: number
}): ReactElement {
  // A slice off the percent window breaks the trace rather than being pinned to its edge.
  const radius = (bin: PolarPlotTraceBin): number | null =>
    reading === 'knots'
      ? bin.knots / rim
      : bin.polar_efficiency === null || offScale(bin.polar_efficiency) !== null
        ? null
        : pctFraction(bin.polar_efficiency)

  const placed = bins.flatMap((bin) => {
    const fraction = radius(bin)
    return fraction === null ? [] : [{ twa: bin.twa, point: at(bin.twa + TRACE_TWA_DEG / 2, fraction) }]
  })

  return (
    <g data-testid="polar-plot-trace" pointerEvents="none">
      {placed.slice(0, -1).map((from, index) => {
        const to = placed[index + 1]
        // A jump of more than one slice is a hole in the season, not a leg: nobody sailed there.
        if (to.twa - from.twa > TRACE_TWA_DEG) return null

        return (
          <line
            key={from.twa}
            x1={from.point[0]}
            y1={from.point[1]}
            x2={to.point[0]}
            y2={to.point[1]}
            stroke="var(--text-accent)"
            strokeWidth={1.4}
            strokeDasharray="2 3"
            strokeLinecap="round"
            opacity={0.6}
          />
        )
      })}
    </g>
  )
}
