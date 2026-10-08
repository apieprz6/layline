'use client'

/**
 * The **Race Track Heatmap**'s frame: a stable box the sailor zooms and pans inside.
 *
 * The one Client Component in this section, and it owns exactly one thing — the camera. It takes
 * *drawn* geometry rather than rows: the projection and the state classification happened on the
 * server, and what crossed the boundary is a list of `x,y x,y` strings with a band each. That is
 * both the cheap thing to serialise (a 1,743-row recording is already reduced to path strings) and
 * the honest split, since nothing on this side can re-decide what a row meant (ADR 0033).
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
 * **Touch belongs to the page until the sailor zooms in.** A 440-unit-tall map on a 390px phone
 * would otherwise swallow every attempt to scroll past it, and at 1× the whole track is in frame
 * with nothing to pan to. So `touch-action` switches on zoom state and the ⤢ button hands the
 * gesture back.
 *
 * **The box never changes shape.** A frame that took the track's aspect ratio reflows the page
 * between races and still cannot make a 25nm point-to-point legible on a phone, which is why the
 * answer to a long thin track is zoom rather than a reshaped frame.
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
import { dropoutDuration, trackBandColour } from '@/services/analysis/track-heatmap'
import { niceDistance, scaleBarLabel } from '@/services/recordings/track-projection'
import { spacing } from '@/lib/utils/design'
import type { RaceTrackHeatmap, TrackBand } from '@/types'

import { DROPOUT, FILLER_DASH, HAIRLINE, TRACK_STROKE } from './track-ink'

const MIN_ZOOM = 1
/** Chicago–Waukegan is ~25nm end to end: at 12× a 390px screen covers about a quarter-mile of it. */
const MAX_ZOOM = 12
/** One press of + or −. Eight presses cross the whole range, which is a reachable number of taps. */
const STEP = 1.6

/** The frame's own padding, matching `TRACK_BOX`'s, for the chrome drawn in box coordinates. */
const PAD = 12

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

export default function TrackHeatmapFrame({
  heatmap,
  label,
}: {
  heatmap: RaceTrackHeatmap
  /** What the map is, for a reader who cannot see it. The section's own words, not a restatement. */
  label: string
}): ReactElement {
  const { width, height, metres_per_unit, segments, points, bridges, rings } = heatmap

  // Partitioned once rather than walked twice: the unscored hairlines go down first, under the
  // coloured track, so the measurement overlays the geometry rather than competing with it.
  const unscored = segments.filter((segment) => segment.band === null)
  const scored = segments.filter((segment) => segment.band !== null)
  const svg = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<View>(HOME)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)

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
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pointers.current.size === 2) pinch.current = { distance: spread(), zoom: view.zoom }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

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

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
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

  return (
    <div style={{ position: 'relative', maxWidth: width, margin: '0 auto' }}>
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
          cursor: zoomed ? 'grab' : 'default',
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
            {/* Drawn but not scored, first and underneath: a hairline the coloured track overlays
                rather than competes with. The boat was there, so the line is continuous; it carries
                no colour, so it makes no claim. Never the ramp's grey, which means on target. */}
            {unscored.map((segment, index) => (
              <polyline
                key={`unscored-${index}`}
                points={segment.points}
                fill="none"
                stroke={HAIRLINE.stroke}
                strokeWidth={HAIRLINE.width}
                opacity={HAIRLINE.opacity}
                vectorEffect="non-scaling-stroke"
                // The reason, carried to the DOM even though all of these draw alike: the state is
                // discriminated all the way to the renderer (ADR 0033), and a hairline that cannot
                // say why it is grey is the collapse that rule exists to prevent.
                data-not-scored={segment.not_scored ?? undefined}
              />
            ))}

            {/* The measurement. A Filler-Anchored row is coloured by its own percent like any
                other and stitched rather than solid, so it still reads differently from a fully
                measured one (ADR 0036) — the doubt is on the number, not in place of it. */}
            {scored.map((segment, index) => (
              <polyline
                key={`scored-${index}`}
                points={segment.points}
                fill="none"
                stroke={trackBandColour(segment.band as TrackBand)}
                strokeWidth={TRACK_STROKE}
                strokeLinecap="round"
                strokeDasharray={segment.filler_anchored ? FILLER_DASH : undefined}
                vectorEffect="non-scaling-stroke"
                data-filler-anchored={segment.filler_anchored ? 'true' : undefined}
              />
            ))}

            {/* A fix with no neighbour to join. A run of one cannot be a polyline, and a boat that
                surfaced for a single fix between two dropouts was somewhere — so it is plotted
                rather than dropped, at the weight of the run it would have been part of. */}
            {points.map((point, index) => (
              <circle
                key={`point-${index}`}
                cx={point.x}
                cy={point.y}
                r={TRACK_STROKE / 2 / zoom}
                fill={point.band === null ? HAIRLINE.stroke : trackBandColour(point.band)}
                opacity={point.band === null ? HAIRLINE.opacity : 1}
                data-not-scored={point.not_scored ?? undefined}
                data-filler-anchored={point.filler_anchored ? 'true' : undefined}
              />
            ))}

            <DropoutBridges bridges={bridges} width={width} zoom={zoom} />

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
          ? `${zoom.toFixed(1)}× — drag to pan, ⤢ for the whole track`
          : 'pinch, scroll or + to zoom in'}
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
