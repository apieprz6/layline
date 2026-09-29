/**
 * PROTOTYPE — Variant A's map, made zoomable. The one Client Component in the prototype.
 *
 * The box is a **stable** `width × height` whatever shape the track is, and the thin-track problem is
 * solved by zooming rather than by reshaping the frame. That reverses the shrink-to-track finding,
 * which only held while the whole track was the only view anyone could ever have.
 *
 * It takes *drawn* geometry, not points: the projection and the state classification stay on the
 * server, and what crosses the boundary is a list of `x,y x,y` strings and a colour each. That is
 * both the cheap thing to serialise — a 1743-row recording is already reduced to path strings — and
 * the honest split: the client is given no ability to re-decide what a row means. It only moves the
 * camera. (`Projection` itself cannot cross: it carries closures, and passing one is what broke this
 * component's first draft.)
 *
 * Zoom is a transform on an inner `<g>` rather than an animated `viewBox` so that pinned chrome
 * works: the scale bar stays in the corner and keeps telling the truth about distance, because it is
 * drawn as a sibling of the zoom layer and re-reads its own distance at the current zoom. Ink that is
 * not geography — type, hairlines, ring radii — divides the zoom back out, and every stroke is
 * `non-scaling-stroke`, because the point of zooming in is to separate the segments, not fatten them.
 *
 * Gesture ownership is deliberate. At zoom 1 the whole track is in frame, there is nothing to pan to,
 * and a 440px-tall map on a 390px phone would otherwise swallow every attempt to scroll the page — so
 * touch is left to the browser until the sailor zooms in, and the ⤢ button hands it back. A mouse
 * wheel zooms about the cursor at any zoom.
 */

'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { spacing } from '@/lib/utils/design'
import { DropoutBridges, ScaleBar, type Bridge } from './prototype-geometry'

const MIN_ZOOM = 1
/** Chicago–Waukegan is ~25nm end to end: at 12× a 390px screen covers about a quarter-mile of it. */
const MAX_ZOOM = 12
const STEP = 1.6

/** One leg of the track, already projected. `colour` is null for a row that carries no measurement. */
export interface DrawnSegment {
  points: string
  colour: string | null
  /** A row inside the polar's unmeasured low angles, drawn dotted rather than merely thin. */
  dotted: boolean
}

interface View {
  zoom: number
  tx: number
  ty: number
}

const HOME: View = { zoom: MIN_ZOOM, tx: 0, ty: 0 }

/**
 * Keep the track's box covering the frame, so the sailor can reach any corner of it and cannot lose
 * it off the edge of the world — a real hazard on a map whose middle is three long dropouts.
 */
function clamped(view: View, width: number, height: number): View {
  const zoom = Math.min(Math.max(view.zoom, MIN_ZOOM), MAX_ZOOM)

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

function bounded(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM)
}

export default function HeatmapMap({
  width,
  height,
  metresPerUnit,
  label,
  segments,
  dropouts,
  rings,
}: {
  width: number
  height: number
  metresPerUnit: number
  label: string
  segments: readonly DrawnSegment[]
  dropouts: readonly Bridge[]
  rings: readonly { cx: number; cy: number }[]
}): ReactElement {
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
        clamped(about(current, bounded(current.zoom * Math.exp(-event.deltaY / 320)), x, y), width, height)
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
      const { x, y } = toBox(midpoint().x, midpoint().y)
      setView((current) => clamped(about(current, bounded((zoom * spread()) / distance), x, y), width, height))
      return
    }

    // Nothing to pan to at zoom 1, and the page still owns the gesture there.
    if (view.zoom <= MIN_ZOOM) return

    const dx = ((event.clientX - previous.x) / rect.width) * width
    const dy = ((event.clientY - previous.y) / rect.height) * height
    setView((current) => clamped({ ...current, tx: current.tx + dx, ty: current.ty + dy }, width, height))
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
          // Without this a drag across the map selects the dropout labels instead of panning, and the
          // `feed dead 57m` annotation ends up highlighted blue in the middle of the chart.
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <clipPath id="heatmap-map-frame">
          <rect x="0" y="0" width={width} height={height} rx="6" />
        </clipPath>

        <rect x="0" y="0" width={width} height={height} rx="6" fill="var(--surface-elevated)" />

        <g clipPath="url(#heatmap-map-frame)">
          <g transform={`translate(${view.tx} ${view.ty}) scale(${zoom})`}>
            {/* Excluded first, underneath: a hairline the coloured track overlays rather than
                competes with. The boat was there, so the line is continuous; it carries no colour,
                so it makes no claim. */}
            {segments.map((segment, at) =>
              segment.colour === null ? (
                <polyline
                  key={`excluded-${at}`}
                  points={segment.points}
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth="1"
                  opacity="0.5"
                  strokeDasharray={segment.dotted ? '1 2' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null
            )}

            {/* The measurement. One segment per row, so the colour changes where the boat's
                performance changed and not where a Polar row boundary happens to fall. */}
            {segments.map((segment, at) =>
              segment.colour === null ? null : (
                <polyline
                  key={`measured-${at}`}
                  points={segment.points}
                  fill="none"
                  stroke={segment.colour}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            )}

            <DropoutBridges bridges={dropouts} width={width} zoom={zoom} />

            {/* Verbatim from `TrackMap`: ADR 0014 makes ringing Frozen rows an obligation of every
                map in Layline, and the track is already drawn broken into and out of them. */}
            {rings.map((ring, at) => (
              <circle
                key={`frozen-${at}`}
                cx={ring.cx}
                cy={ring.cy}
                r={3.4 / zoom}
                fill="none"
                stroke="var(--wind-storm)"
                strokeWidth="1"
                opacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </g>

        <ScaleBar width={width} height={height} metresPerUnit={metresPerUnit} zoom={zoom} />
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
        style={{
          margin: `${spacing(2)} 0 0`,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-muted)',
        }}
      >
        {zoomed ? `${zoom.toFixed(1)}× — drag to pan, ⤢ for the whole track` : 'pinch, scroll or + to zoom in'}
      </p>
    </div>
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
