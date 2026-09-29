/**
 * PROTOTYPE — throwaway. The projection, lifted from `components/race-flow/TrackMap.tsx`.
 *
 * Shared by all three variants because it is *geometry*, not layout: equirectangular with a
 * cos(lat) correction on longitude, exact enough over the two nautical miles a Lake Michigan beer
 * can covers. If the variants each rolled their own the tracks would differ in shape and the
 * comparison would be about projections instead of about colour.
 */

import type { ReactElement } from 'react'

import type { TrackPoint } from './prototype-data'

export const MAP_WIDTH = 360
export const MAP_PAD = 12

export interface Projection {
  x: (lon: number) => number
  y: (lat: number) => number
  metresPerUnit: number
  /** The box the track actually fills, which is the viewBox a variant should draw into. */
  width: number
  height: number
}

/**
 * Fit the track into the space allowed.
 *
 * A Lake Michigan distance race is long and thin — Chicago to Waukegan is 25nm north with maybe 2nm
 * of lateral spread — and a fixed 4:3 box spends 80% of a phone screen on empty water either side of
 * it. With `shrinkToTrack` the box takes the track's own aspect ratio and the longest dimension gets
 * the room, which is the cheapest answer when the whole track is all you will ever see.
 *
 * A **zoomable** map wants the opposite: `shrinkToTrack: false` keeps the box at a stable
 * `maxWidth × maxHeight` whatever shape the track is, so the frame does not resize under the sailor
 * when they switch races, and the thin track is dealt with by zooming into it instead of by
 * reshaping the frame around it.
 */
export function project(
  points: readonly TrackPoint[],
  maxHeight: number,
  maxWidth = MAP_WIDTH,
  shrinkToTrack = true
): Projection | null {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (const point of points) {
    const { latitude: lat, longitude: lon } = point
    if (lat === null || lon === null) continue
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }

  if (!Number.isFinite(minLat)) return null

  const midLat = (minLat + maxLat) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * kx, 1e-6)
  const spanY = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((maxWidth - MAP_PAD * 2) / spanX, (maxHeight - MAP_PAD * 2) / spanY)
  const centreLon = (minLon + maxLon) / 2

  const width = shrinkToTrack ? Math.min(maxWidth, spanX * scale + MAP_PAD * 2) : maxWidth
  const height = shrinkToTrack ? Math.min(maxHeight, spanY * scale + MAP_PAD * 2) : maxHeight

  return {
    x: (lon) => width / 2 + (lon - centreLon) * kx * scale,
    y: (lat) => height / 2 - (lat - midLat) * scale,
    metresPerUnit: 111_320 / scale,
    width,
    height,
  }
}

/** 1-2-5 rounding, so the scale bar reads as a distance somebody would state. */
export function niceDistance(metres: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(metres, 1))))
  const leading = metres / power
  const step = leading >= 5 ? 5 : leading >= 2 ? 2 : 1
  return step * power
}

export function scaleBarLabel(metres: number): string {
  return metres >= 1852 ? `${(metres / 1852).toFixed(1)} nm` : `${metres} m`
}

/**
 * A track with no scale invites a guess about distance, so all three variants carry the same one —
 * it is part of the projection, not part of any variant's argument.
 *
 * A fifth of the box wide rather than a fixed 60 units, because the box is now the track's own
 * shape and on a thin one 60 units was most of its width.
 *
 * `zoom` is why this is pinned chrome rather than part of the track: it is drawn *outside* the
 * zoomable layer, in stable box coordinates, and re-reads its own distance at the current zoom. A
 * scale bar that travelled with the pan would be the one thing on the map able to lie about distance.
 */
export function ScaleBar({
  width,
  height,
  metresPerUnit,
  zoom = 1,
}: {
  width: number
  height: number
  metresPerUnit: number
  zoom?: number
}): ReactElement {
  const metresPerUnitOnScreen = metresPerUnit / zoom
  const metres = niceDistance(metresPerUnitOnScreen * (width / 5))

  return (
    <g opacity="0.75">
      <line
        x1={width - MAP_PAD - metres / metresPerUnitOnScreen}
        y1={height - 12}
        x2={width - MAP_PAD}
        y2={height - 12}
        stroke="var(--text-muted)"
        strokeWidth="1.4"
      />
      <text
        x={width - MAP_PAD}
        y={height - 16}
        textAnchor="end"
        fontSize="7"
        fontFamily="var(--font-mono)"
        fill="var(--text-muted)"
        stroke="var(--surface-base)"
        strokeWidth="2.4"
        paintOrder="stroke"
      >
        {scaleBarLabel(metres)}
      </text>
    </g>
  )
}

export interface Segment {
  /** `x1,y1 x2,y2` — one leg of the track, carrying the state of the row it arrives at. */
  points: string
  point: TrackPoint
}

/**
 * The track as one short segment per row transition, plus the runs a break interrupts.
 *
 * A heatmap needs per-row colour, so the track cannot be one polyline. Each segment is attributed
 * to the row it *arrives at*, which is the row whose reading it is showing. A segment is emitted
 * only where both ends have a fix and neither is a break — so a Frozen run breaks the line exactly
 * as `TrackMap` breaks it, and the boat's stall is visible as absence rather than as a straight
 * line through water it never crossed.
 */
export function segments(
  points: readonly TrackPoint[],
  projection: Projection,
  breaks: (point: TrackPoint) => boolean
): Segment[] {
  const out: Segment[] = []
  let previous: { x: number; y: number } | null = null

  for (const point of points) {
    const { latitude: lat, longitude: lon } = point

    if (lat === null || lon === null || breaks(point)) {
      previous = null
      continue
    }

    const here = { x: projection.x(lon), y: projection.y(lat) }

    if (previous) {
      const from = `${previous.x.toFixed(1)},${previous.y.toFixed(1)}`
      out.push({ points: `${from} ${here.x.toFixed(1)},${here.y.toFixed(1)}`, point })
    }

    previous = here
  }

  return out
}

export interface Bridge {
  x1: number
  y1: number
  x2: number
  y2: number
  /** How long the feed was dead, which is the number that makes the gap mean something. */
  seconds: number
  rows: number
}

/**
 * The gap a Frozen run leaves, drawn as a labelled bridge.
 *
 * This is the finding the 47%-frozen recording forced. `TrackMap` rings Frozen rows, and ADR 0014
 * makes that an obligation — but a frozen run repeats *one* position, so 815 frozen rows stack 815
 * rings into a single pixel and the map shows three. On a long dropout the ring is not the signal:
 * **the gap is**, and a bare gap is ambiguous, because a track can also break because the boat left
 * the crop or the fix was absent. So the gap gets a dashed connector and its duration, which is the
 * difference between "the recording stops here" and "the feed died for 41 minutes across five miles
 * of water".
 */
export function bridges(
  points: readonly TrackPoint[],
  projection: Projection
): Bridge[] {
  const out: Bridge[] = []
  let before: TrackPoint | null = null
  let run = 0

  for (const point of points) {
    const hasFix = point.latitude !== null && point.longitude !== null

    if (point.state === 'frozen') {
      run += 1
      continue
    }

    if (!hasFix) {
      // A missing fix is a break too, but it is not a Frozen run and carries no duration claim.
      before = null
      run = 0
      continue
    }

    if (run > 0 && before && before.latitude !== null && before.longitude !== null) {
      out.push({
        x1: projection.x(before.longitude),
        y1: projection.y(before.latitude),
        x2: projection.x(point.longitude as number),
        y2: projection.y(point.latitude as number),
        seconds: point.seconds - before.seconds,
        rows: run,
      })
    }

    before = point
    run = 0
  }

  return out
}

/**
 * Only the gaps long enough to be worth labelling — a two-row dropout needs no annotation.
 *
 * The label is clamped inside the box rather than centred on the gap, because the box is the track's
 * own shape: Chicago–Waukegan fits in 60 units of width and a centred `feed dead 2h11` ran off both
 * edges, so the map read `feed dead 2` and `feed dead` — the duration, which is the entire point of
 * the annotation, was the part that got clipped.
 */
export function DropoutBridges({
  bridges: list,
  width,
  zoom = 1,
}: {
  bridges: readonly Bridge[]
  /** The box width, to keep a label from running off the edge. Not the whole `Projection`, because
   *  that carries closures and this component is rendered inside a Client Component. */
  width: number
  zoom?: number
}): ReactElement {
  // Type is not geography: a label that grew 12× with the track would be unreadable at full zoom and
  // the dashes would turn into bars, so everything here is divided back out of the zoom.
  const fontSize = 7 / zoom
  const halo = 2.4 / zoom

  return (
    <>
      {list.map((bridge, at) => {
        const span = Math.hypot(bridge.x2 - bridge.x1, bridge.y2 - bridge.y1) * zoom
        if (span < 14) return null

        const label = `feed dead ${minutes(bridge.seconds)}`
        // 3.9 units per character at fontSize 7 in the mono face, near enough to keep it inside.
        const half = (label.length * 3.9) / 2 / zoom
        const wanted = (bridge.x1 + bridge.x2) / 2
        const x = Math.min(Math.max(wanted, half + 2), Math.max(width - half - 2, half + 2))

        return (
          <g key={`bridge-${at}`}>
            <line
              x1={bridge.x1}
              y1={bridge.y1}
              x2={bridge.x2}
              y2={bridge.y2}
              stroke="var(--wind-storm)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x}
              y={(bridge.y1 + bridge.y2) / 2 - halo}
              textAnchor="middle"
              fontSize={fontSize}
              fontFamily="var(--font-mono)"
              fill="var(--wind-storm)"
              stroke="var(--surface-base)"
              strokeWidth={halo}
              paintOrder="stroke"
            >
              {label}
            </text>
          </g>
        )
      })}
    </>
  )
}

function minutes(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`
  const mins = Math.round(seconds / 60)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
}

/** Every Frozen row that still has a fix — the position it is repeating, which is where to ring. */
export function frozenRings(
  points: readonly TrackPoint[],
  projection: Projection
): { cx: number; cy: number }[] {
  const rings: { cx: number; cy: number }[] = []

  for (const point of points) {
    if (point.state !== 'frozen') continue
    if (point.latitude === null || point.longitude === null) continue
    rings.push({ cx: projection.x(point.longitude), cy: projection.y(point.latitude) })
  }

  return rings
}
