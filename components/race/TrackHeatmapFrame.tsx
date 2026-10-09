'use client'

/**
 * The **Race Track Heatmap**'s frame: a stable box the sailor zooms, pans and taps inside.
 *
 * It owns the camera and the hit test, and nothing else — which overlay is painted and which row
 * is selected are its caller's state, because the legend and the readout need the same two answers
 * and two copies of them would drift.
 *
 * It takes drawn geometry with each row's facts attached, and bands them through
 * `track-overlays.ts` — the same module the server tallies its counts with, so a band this draws
 * cannot be one the rules refuse (ADR 0037). The projection stays on the server: it carries
 * closures and cannot be serialised at all.
 *
 * Three constraints the prototype got wrong first, each load-bearing here:
 *
 * **Zoom is a transform on an inner `<g>`, not an animated `viewBox`**, so pinned chrome works.
 * The scale bar stays in its corner and re-reads its own distance at the current zoom, which is
 * what keeps it telling the truth — a scale bar that travelled with the pan would be the one thing
 * on the map able to lie about distance. Every stroke is `vectorEffect="non-scaling-stroke"`, and
 * ink that is not geography — type, ring radii — divides the zoom back out: zooming in is for
 * separating the segments, not fattening them.
 *
 * **Touch belongs to the page until the sailor zooms in.** A map this tall on a 390px phone would
 * otherwise swallow every attempt to scroll past it, and at 1× the whole track is in frame with
 * nothing to pan to. So `touch-action` switches on zoom state and the ⤢ button hands the gesture
 * back. A *tap* is never swallowed, at any zoom, because it is read on pointer-up from a pointer
 * that did not travel.
 *
 * **The box never changes shape.** A frame that took the track's aspect ratio reflows the page
 * between races and still cannot make a 25nm point-to-point legible on a phone, which is why the
 * answer to a long thin track is zoom rather than a reshaped frame. Its *size* is fluid: the
 * `viewBox` holds the projection true at whatever width the column gives it.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { dropoutDuration } from '@/services/analysis/track-heatmap'
import { overlayColour, overlayPaint } from '@/services/analysis/track-overlays'
import { niceDistance, scaleBarLabel } from '@/services/recordings/track-projection'
import { spacing } from '@/lib/utils/design'
import type { RaceTrack, RaceTrackHeatmap, TrackOverlay, TrackRowFacts } from '@/types'

import TrackReadout from './TrackReadout'
import {
  DROPOUT,
  FILLER_DASH,
  HAIRLINE,
  SELECTION,
  TESTIMONY,
  TRACK_STROKE,
  testimonyGlyph,
} from './track-ink'

const MIN_ZOOM = 1
/** Chicago–Waukegan is ~25nm end to end: at 12× a 390px screen covers about a quarter-mile of it. */
const MAX_ZOOM = 12
/** One press of + or −. Eight presses cross the whole range, which is a reachable number of taps. */
const STEP = 1.6

/** The frame's own padding, matching `TRACK_BOX`'s, for the chrome drawn in box coordinates. */
const PAD = 12

/**
 * How far a pointer may travel and still count as a tap, in CSS pixels.
 *
 * A finger never lands still, so zero would make the track untappable on the one device this is
 * designed for; much more than this and a short pan would select a stretch the sailor was only
 * dragging past.
 */
const TAP_SLOP = 6

/** How near a tap has to land, in box units, before it is taken to mean *that* stretch. */
const TAP_REACH = 20

interface View {
  zoom: number
  tx: number
  ty: number
}

const HOME: View = { zoom: MIN_ZOOM, tx: 0, ty: 0 }

function bounded(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM)
}

/**
 * Keep the track's box covering the frame, so the sailor can reach any corner of it and cannot
 * lose it off the edge of the world — a real hazard on a map whose middle is three long dropouts.
 */
function clamped(view: View, width: number, height: number): View {
  const zoom = bounded(view.zoom)

  return {
    zoom,
    tx: Math.min(0, Math.max(width - width * zoom, view.tx)),
    ty: Math.min(0, Math.max(height - height * zoom, view.ty)),
  }
}

/** Zoom to `next` while holding the box point under (`px`, `py`) still. */
function about(view: View, next: number, px: number, py: number): View {
  const factor = next / view.zoom

  return {
    zoom: next,
    tx: px - factor * (px - view.tx),
    ty: py - factor * (py - view.ty),
  }
}

/** How far (`px`, `py`) is from the segment `a`–`b`, in box units. */
function distanceToSegment(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy

  // A zero-length leg is a point: two fixes the projection rounded onto each other.
  if (lengthSquared === 0) return Math.hypot(px - a.x, py - a.y)

  // Where the foot of the perpendicular falls along the leg, clamped to its ends — so a tap beyond
  // one end measures to that end rather than to the infinite line through it.
  const along = Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared))
  return Math.hypot(px - (a.x + along * dx), py - (a.y + along * dy))
}

export default function TrackHeatmapFrame({
  heatmap,
  label,
  overlay,
  scoring,
  selected,
  onSelect,
}: {
  heatmap: RaceTrackHeatmap
  /** What the map is, for a reader who cannot see it. The section's own words, not a restatement. */
  label: string
  overlay: TrackOverlay
  /** What the race was scored against, which the two ratio overlays and the readout both need. */
  scoring: RaceTrack['scoring']
  /** The stretch being read out, or null. */
  selected: TrackRowFacts | null
  onSelect: (row: TrackRowFacts | null) => void
}): ReactElement {
  const hasPolar = scoring === 'polar'
  const { width, height, metres_per_unit, segments, points, bridges, rings, annotations } = heatmap
  const svg = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<View>(HOME)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  /** Where a single pointer went down, and whether it has travelled far enough to be a drag. */
  const tap = useRef<{ x: number; y: number; travelled: boolean } | null>(null)

  /** Client coordinates into box coordinates, the space every transform is expressed in. */
  const toBox = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = svg.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return { x: width / 2, y: height / 2 }

      return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height,
      }
    },
    [width, height]
  )

  /** Box coordinates into the *track's* own coordinates, which the camera has moved. */
  const toTrack = useCallback(
    (box: { x: number; y: number }): { x: number; y: number } => ({
      x: (box.x - view.tx) / view.zoom,
      y: (box.y - view.ty) / view.zoom,
    }),
    [view]
  )

  // React attaches `onWheel` passively, so the page would scroll as well as the map zooming. The
  // listener has to be registered by hand to be allowed to say no.
  useEffect(() => {
    const node = svg.current
    if (!node) return

    function onWheel(event: WheelEvent): void {
      event.preventDefault()
      const { x, y } = toBox(event.clientX, event.clientY)
      setView((current) =>
        clamped(
          about(current, bounded(current.zoom * Math.exp(-event.deltaY / 320)), x, y),
          width,
          height
        )
      )
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [toBox, width, height])

  function spread(): number {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
  }

  function midpoint(): { x: number; y: number } {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return { x: 0, y: 0 }

    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    // Optional because jsdom has no pointer capture, and a component that only works in a browser
    // cannot be tested in the runner that answers most of the questions about it. `TrackMap` calls
    // it the same way.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    tap.current = { x: event.clientX, y: event.clientY, travelled: false }
    if (pointers.current.size === 2) pinch.current = { distance: spread(), zoom: view.zoom }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (
      tap.current !== null &&
      Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > TAP_SLOP
    ) {
      tap.current.travelled = true
    }

    const rect = svg.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return

    if (pointers.current.size >= 2 && pinch.current) {
      // Two fingers: scale about the midpoint between them, which is where the hand expects the
      // gesture to be anchored.
      const { distance, zoom } = pinch.current
      if (distance === 0) return
      const between = midpoint()
      const { x, y } = toBox(between.x, between.y)
      setView((current) =>
        clamped(about(current, bounded((zoom * spread()) / distance), x, y), width, height)
      )
      return
    }

    // Nothing to pan to at 1×, and the page still owns the gesture there.
    if (view.zoom <= MIN_ZOOM) return

    const dx = ((event.clientX - previous.x) / rect.width) * width
    const dy = ((event.clientY - previous.y) / rect.height) * height
    setView((current) =>
      clamped({ ...current, tx: current.tx + dx, ty: current.ty + dy }, width, height)
    )
  }

  /**
   * The nearest stretch to where the sailor tapped, or null when they tapped open water.
   *
   * Nearest *geographically*, which is the whole reason the track is tappable: a sailor points at
   * the place they were slow, not at a moment on an axis. Measured in the track's own coordinates
   * so that the reach is the same patch of water at every zoom — and null beyond it, because
   * selecting a stretch a thumb-width away would be the map answering a question nobody asked.
   */
  function nearest(box: { x: number; y: number }): TrackRowFacts | null {
    const where = toTrack(box)
    let best: TrackRowFacts | null = null
    let bestDistance = TAP_REACH / view.zoom

    for (const segment of segments) {
      const distance = distanceToSegment(
        where.x,
        where.y,
        { x: segment.x1, y: segment.y1 },
        { x: segment.x2, y: segment.y2 }
      )
      if (distance < bestDistance) {
        bestDistance = distance
        best = segment.row
      }
    }

    for (const point of points) {
      const distance = Math.hypot(where.x - point.x, where.y - point.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = point.row
      }
    }

    return best
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
    const wasTap = tap.current !== null && !tap.current.travelled && pointers.current.size === 1

    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    tap.current = null

    // A tap selects what it landed on, and clears the readout when it landed on water. Read on
    // pointer-*up* from a pointer that did not travel, so a pan never selects anything and a tap
    // works at every zoom, including the one where the page owns the scroll gesture.
    if (wasTap) onSelect(nearest(toBox(event.clientX, event.clientY)))
  }

  function step(factor: number): void {
    setView((current) =>
      clamped(about(current, bounded(current.zoom * factor), width / 2, height / 2), width, height)
    )
  }

  const { zoom } = view
  const zoomed = zoom > MIN_ZOOM
  // A fifth of the box, rather than a fixed length: it has to read as a bar at 1× and still fit
  // once twelve times as much of it is one screen.
  const metresOnScreen = metres_per_unit / zoom
  const barMetres = niceDistance(metresOnScreen * (width / 5))

  const painted = segments.map((segment) => ({
    segment,
    paint: overlayPaint(overlay, segment.row, hasPolar),
  }))
  // Partitioned once rather than walked twice: the unscored hairlines go down first, under the
  // coloured track, so the measurement overlays the geometry rather than competing with it.
  const unscored = painted.filter(({ paint }) => paint.band === null)
  const scored = painted.filter(({ paint }) => paint.band !== null)
  const chosen = segments.find(({ row }) => row.row_index === selected?.row_index)
  const chosenPoint = points.find(({ row }) => row.row_index === selected?.row_index)

  /**
   * Which half of the frame the selected stretch is in, so the readout can sit in the other one.
   *
   * Through the camera, not in the track's own coordinates: what matters is where the stretch is on
   * screen *now*, after a pan has moved it, since that is what the card would cover.
   */
  const anchor = chosen
    ? { x: (chosen.x1 + chosen.x2) / 2, y: (chosen.y1 + chosen.y2) / 2 }
    : chosenPoint
      ? { x: chosenPoint.x, y: chosenPoint.y }
      : null
  const selectionInTopHalf = anchor !== null && anchor.y * zoom + view.ty < height / 2

  return (
    // Fluid, and *not* capped at the box's own 360 units: the `viewBox` holds the projection true
    // whatever room the element gets, so the track takes the whole width of the column it is in
    // rather than sitting at half the width of a desktop one. The box being *stable* is a claim
    // about its aspect ratio — it does not reshape to the track's extent — never about its size in
    // CSS pixels. `TrackMap` is fluid for the same reason.
    <div style={{ position: 'relative' }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          // The stable frame: the box never changes shape, only its contents move inside it.
          aspectRatio: `${width} / ${height}`,
          touchAction: zoomed ? 'none' : 'pan-y',
          cursor: zoomed ? 'grab' : 'pointer',
          // Without this a drag across the map selects the dropout labels instead of panning, and
          // `feed dead 57m` ends up highlighted in the middle of the chart.
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <clipPath id="race-track-frame">
          <rect x="0" y="0" width={width} height={height} rx="6" />
        </clipPath>

        <rect x="0" y="0" width={width} height={height} rx="6" fill="var(--surface-elevated)" />

        <g clipPath="url(#race-track-frame)">
          {/* The camera. A test asserts this attribute rather than the click, because `next dev`
              never hydrates in this environment and a Playwright click on an un-hydrated node
              succeeds silently — so "the button was clicked" proves nothing (ADR 0033). */}
          <g data-testid="track-camera" transform={`translate(${view.tx} ${view.ty}) scale(${zoom})`}>
            {/* The stretch being read out, under everything: a halo rather than a recolour, so the
                band the sailor is asking about is still the band they can see. */}
            {chosen && (
              <polyline
                data-testid="track-selection"
                points={chosen.points}
                fill="none"
                stroke={SELECTION.stroke}
                strokeWidth={SELECTION.width}
                strokeLinecap="round"
                opacity={SELECTION.opacity}
                vectorEffect="non-scaling-stroke"
              />
            )}

            {unscored.map(({ segment, paint }) => (
              <polyline
                key={`unscored-${segment.row.row_index}`}
                points={segment.points}
                fill="none"
                stroke={HAIRLINE.stroke}
                strokeWidth={HAIRLINE.width}
                opacity={HAIRLINE.opacity}
                vectorEffect="non-scaling-stroke"
                // The reason, carried to the DOM even though all of these draw alike: the state is
                // discriminated all the way to the renderer (ADR 0033), and a hairline that cannot
                // say why it is grey is the collapse that rule exists to prevent.
                data-not-scored={paint.not_scored ?? undefined}
              />
            ))}

            {/* The measurement. A Filler-Anchored row is coloured by its own percent like any
                other and stitched rather than solid, so it still reads differently from a fully
                measured one (ADR 0036) — the doubt is on the number, not in place of it. */}
            {scored.map(({ segment, paint }) => (
              <polyline
                key={`scored-${segment.row.row_index}`}
                points={segment.points}
                fill="none"
                stroke={overlayColour(paint.band!)}
                strokeWidth={TRACK_STROKE}
                strokeLinecap="round"
                strokeDasharray={paint.flagged ? FILLER_DASH : undefined}
                vectorEffect="non-scaling-stroke"
                data-filler-anchored={paint.flagged ? 'true' : undefined}
              />
            ))}

            {/* A fix with no neighbour to join. A run of one cannot be a polyline, and a boat that
                surfaced for a single fix between two dropouts was somewhere — so it is plotted
                rather than dropped, at the weight of the run it would have been part of. */}
            {points.map((point) => {
              const paint = overlayPaint(overlay, point.row, hasPolar)

              return (
                <circle
                  key={`point-${point.row.row_index}`}
                  cx={point.x}
                  cy={point.y}
                  r={TRACK_STROKE / 2 / zoom}
                  fill={paint.band === null ? HAIRLINE.stroke : overlayColour(paint.band)}
                  opacity={paint.band === null ? HAIRLINE.opacity : 1}
                  data-not-scored={paint.not_scored ?? undefined}
                  data-filler-anchored={paint.flagged ? 'true' : undefined}
                />
              )
            })}

            <DropoutBridges bridges={bridges} width={width} zoom={zoom} />

            {/* What the sailor said, where they said it happened. Last of the ink inside the
                camera, so Testimony sits over the measurement rather than under it: on a map an
                annotation is a *place*, and a sail change hidden beneath a fat track tells nobody
                anything. */}
            {annotations.map((annotation, index) => {
              // Two recorded seconds apart land on one fix, so each after the first is lifted off
              // the pile — in *screen* units, dividing the zoom out, since the pile is a drawing
              // problem and not a geographic one. The leader line back to the fix is what keeps
              // that honest: the disc has been moved, and the line says where from.
              const lift = annotation.dy / zoom
              const cy = annotation.y + lift
              const rightThird = annotation.x * zoom + view.tx > (width * 2) / 3

              return (
                <g key={`testimony-${index}`} data-testid={`track-testimony-${annotation.lane}`}>
                  {annotation.dy !== 0 && (
                    <line
                      x1={annotation.x}
                      y1={annotation.y}
                      x2={annotation.x}
                      y2={cy}
                      stroke={TESTIMONY.stroke}
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {/* The fix itself, so a lifted marker still shows the place it is about. */}
                  {annotation.dy !== 0 && (
                    <circle cx={annotation.x} cy={annotation.y} r={1.6 / zoom} fill={TESTIMONY.stroke} />
                  )}
                  <circle
                    cx={annotation.x}
                    cy={cy}
                    r={TESTIMONY.radius / zoom}
                    fill={TESTIMONY.fill}
                    stroke={TESTIMONY.stroke}
                    strokeWidth={TESTIMONY.width}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={annotation.x}
                    y={cy + 3 / zoom}
                    textAnchor="middle"
                    fontSize={9 / zoom}
                    fontWeight="700"
                    fontFamily="var(--font-mono)"
                    fill={TESTIMONY.glyph}
                  >
                    {testimonyGlyph(annotation.lane)}
                  </text>
                  {/* Beside the disc, not above it. Above was fine for one marker and unreadable
                      for two: a lifted disc landed on the label of the one below it. Beside, each
                      label is as far from its neighbour as the discs are. It flips to the left of
                      the disc in the right-hand third of the frame, where it would otherwise run
                      off the edge. */}
                  <text
                    x={annotation.x + ((rightThird ? -1 : 1) * (TESTIMONY.radius + 3)) / zoom}
                    y={cy + 3 / zoom}
                    textAnchor={rightThird ? 'end' : 'start'}
                    fontSize={8 / zoom}
                    fontFamily="var(--font-mono)"
                    fill="var(--text-secondary)"
                    stroke="var(--surface-base)"
                    strokeWidth={2.4 / zoom}
                    paintOrder="stroke"
                  >
                    {annotation.label}
                  </text>
                </g>
              )
            })}

            {/* ADR 0014 makes ringing Frozen rows an obligation of every map in Layline, and the
                track is already drawn broken into and out of them. The bridge above is the rest of
                that obligation: on a long dropout the rings stack into one pixel. */}
            {rings.map((ring, index) => (
              <circle
                key={`frozen-${index}`}
                cx={ring.cx}
                cy={ring.cy}
                r={DROPOUT.ringRadius / zoom}
                fill="none"
                stroke={DROPOUT.stroke}
                strokeWidth={DROPOUT.ringWidth}
                opacity={DROPOUT.ringOpacity}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </g>

        {/* Pinned chrome, in stable box coordinates outside the camera: a track with no scale
            invites a guess about distance, and this one re-reads itself at the current zoom. */}
        <g opacity="0.75" data-testid="track-scale-bar">
          <line
            x1={width - PAD - barMetres / metresOnScreen}
            y1={height - 12}
            x2={width - PAD}
            y2={height - 12}
            stroke="var(--text-muted)"
            strokeWidth="1.4"
          />
          <text
            x={width - PAD}
            y={height - 16}
            textAnchor="end"
            fontSize="7"
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
            stroke="var(--surface-base)"
            strokeWidth="2.4"
            paintOrder="stroke"
          >
            {scaleBarLabel(barMetres)}
          </text>
        </g>
      </svg>

      <div
        style={{
          position: 'absolute',
          top: spacing(2),
          right: spacing(2),
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <Knob label="Zoom in" onClick={() => step(STEP)} disabled={zoom >= MAX_ZOOM}>
          +
        </Knob>
        <Knob label="Zoom out" onClick={() => step(1 / STEP)} disabled={!zoomed}>
          −
        </Knob>
        <Knob label="Whole track" onClick={() => setView(HOME)} disabled={!zoomed}>
          ⤢
        </Knob>
      </div>

      {/* The answer to a tap, over the map rather than under it: at 390px a card below the frame
          lands past the fold, and a readout the sailor has to scroll to find is not a readout. It
          sits in the half the selection is not in, so the stretch stays visible while it is
          described. */}
      {selected !== null && (
        <TrackReadout
          row={selected}
          overlay={overlay}
          scoring={scoring}
          onDismiss={() => onSelect(null)}
          selectionInTopHalf={selectionInTopHalf}
        />
      )}

      <p
        data-testid="track-zoom-readout"
        style={{
          margin: `${spacing(2)} 0 0`,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-muted)',
        }}
      >
        {zoomed
          ? `${zoom.toFixed(1)}× — drag to pan, tap a stretch to read it, ⤢ for the whole track`
          : 'tap a stretch to read it · pinch, scroll or + to zoom in'}
      </p>
    </div>
  )
}

/**
 * Every gap bridged; only the ones with room for it labelled.
 *
 * The line is never conditional. A dropout where the boat barely moved still joins two fixes with
 * water the recording never recorded between them, and leaving that as a bare gap is the thing ADR
 * 0014's obligation is against — ringing alone, with no statement that the feed had died. What is
 * conditional is the annotation: below about fourteen screen units there is nowhere to put it, and
 * zooming in is what reveals it, since the threshold is measured on screen rather than in the
 * frame's own units.
 *
 * The label is clamped inside the frame rather than centred on the gap. Before that it clipped to
 * `feed dead` with no duration at all, which is worse than no label: the duration is the entire
 * point of the annotation.
 */
function DropoutBridges({
  bridges,
  width,
  zoom,
}: {
  bridges: RaceTrackHeatmap['bridges']
  width: number
  zoom: number
}): ReactElement {
  // Type is not geography: a label that grew 12× with the track would be unreadable at full zoom
  // and the dashes would turn into bars, so everything here divides the zoom back out.
  const fontSize = 7 / zoom
  const halo = 2.4 / zoom

  return (
    <>
      {bridges.map((bridge, index) => {
        const span = Math.hypot(bridge.x2 - bridge.x1, bridge.y2 - bridge.y1) * zoom
        const label = `feed dead ${dropoutDuration(bridge.seconds)}`
        // 3.9 units per character at font size 7 in the mono face, near enough to keep it inside.
        const half = (label.length * 3.9) / 2 / zoom
        const wanted = (bridge.x1 + bridge.x2) / 2
        const x = Math.min(Math.max(wanted, half + 2), Math.max(width - half - 2, half + 2))

        return (
          <g key={`bridge-${index}`} data-testid="track-bridge">
            <line
              x1={bridge.x1}
              y1={bridge.y1}
              x2={bridge.x2}
              y2={bridge.y2}
              stroke={DROPOUT.stroke}
              strokeWidth={DROPOUT.bridgeWidth}
              strokeDasharray={DROPOUT.bridgeDash}
              opacity={DROPOUT.bridgeOpacity}
              vectorEffect="non-scaling-stroke"
            />
            {span >= 14 && (
              <text
                x={x}
                y={(bridge.y1 + bridge.y2) / 2 - halo}
                textAnchor="middle"
                fontSize={fontSize}
                fontFamily="var(--font-mono)"
                fill={DROPOUT.stroke}
                stroke="var(--surface-base)"
                strokeWidth={halo}
                paintOrder="stroke"
              >
                {label}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}

function Knob({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        // 32px: a thumb target on a 390px screen, per the mobile-first rule.
        width: 32,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--surface-border)',
        borderRadius: 6,
        background: 'var(--surface-base)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        opacity: disabled ? 0.4 : 1,
        fontSize: 14,
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
