/**
 * The geometry of the Wind Rose: where an observation sits, and what the path between two of them is.
 *
 * On this display angle is wind direction and radius is recency, so the straight line between two
 * observations is not a shorter version of what happened — it is a chord across bearings the wind was
 * never on. Two samples ten minutes and 100° apart get joined by a stroke that passes close to the
 * centre, which on a chart where the centre means "an hour ago" reads as a time the wind did not
 * blow. The connector here sweeps instead: it interpolates direction and radius together, so it stays
 * inside the annulus between the two radii and on the bearings between the two directions.
 *
 * Out here rather than inside the component because it is the part worth testing on its own — the
 * component is a page of SVG chrome around it. Nothing in this file is named "polar": that word is the
 * boat's target-speed table (CONTEXT.md), and this is a weather display.
 */

/** One vertex per this many degrees of sweep — at a 360px viewBox, finer than a pixel. */
const DEGREES_PER_VERTEX = 5

/** An observation reduced to what the geometry needs: a bearing and a normalised radius. */
export interface ArcEnd {
  /** Wind direction in degrees, 0° = North. */
  dir: number
  /** 0 = centre (oldest in window), 1 = outer ring (reference time). */
  r01: number
}

export function radialToXY(
  angleDeg: number,
  r0to1: number,
  cx: number,
  cy: number,
  radius: number,
): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  const x = Math.round((cx + r0to1 * radius * Math.cos(rad)) * 1e6) / 1e6
  const y = Math.round((cy + r0to1 * radius * Math.sin(rad)) * 1e6) / 1e6
  return [x, y]
}

/**
 * The signed shortest way round from one bearing to another, in (−180°, 180°].
 *
 * Positive is clockwise. The half-open range is what decides the one ambiguous case: an exact reversal
 * is 180°, never −180°, so a wind that backs through a full half-circle is drawn sweeping clockwise.
 * That is arbitrary, but it has to be resolved somewhere, and resolving it here means it is resolved
 * against the direction the caller passes — which is chronological — rather than against array order.
 */
export function shortestAngularDelta(fromDeg: number, toDeg: number): number {
  const forward = (((toDeg - fromDeg) % 360) + 360) % 360
  return forward > 180 ? forward - 360 : forward
}

/**
 * An SVG path connecting two observations along the bearings and radii between them.
 *
 * Pass `from` and `to` in **chronological** order — oldest first. The stroke looks the same either
 * way, but the 180° tie-break in `shortestAngularDelta` only means "clockwise as time passed" if time
 * is the direction of travel.
 */
export function arcPath(
  from: ArcEnd,
  to: ArcEnd,
  cx: number,
  cy: number,
  radius: number,
): string {
  const delta = shortestAngularDelta(from.dir, to.dir)
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / DEGREES_PER_VERTEX))

  const vertices: string[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const [x, y] = radialToXY(
      from.dir + delta * t,
      from.r01 + (to.r01 - from.r01) * t,
      cx,
      cy,
      radius,
    )
    vertices.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }

  return `M${vertices.join(' L')}`
}
