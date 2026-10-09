/**
 * Putting a recorded track on a screen: one equirectangular projection, read by every map.
 *
 * Extracted from `components/race-flow/TrackMap.tsx`, which held it in a `useMemo` and so could
 * not lend it to anything. The **Race Track Heatmap** needs the same geometry on a different
 * screen (ADR 0033), and two copies of a projection do not disagree loudly — they disagree by a
 * few pixels, and the same race reads as two slightly different shapes on two screens with nothing
 * failing anywhere.
 *
 * Equirectangular with a `cos(lat)` correction on longitude, so one unit east is one unit north on
 * screen. Exact enough over the two nautical miles a Lake Michigan beer can covers and the
 * twenty-five a distance race does, and it carries `metresPerUnit` so a map can state a real
 * distance rather than inviting a guess. It is not a chart plotter.
 *
 * Nothing here is React, and nothing here knows what a row means — it takes fixes and gives back
 * two functions and a scale. Which rows were worth drawing, and in what colour, belongs to the
 * caller.
 */

/** A recorded position, with either half absent where the file logged none. */
export interface TrackFix {
  latitude: number | null
  longitude: number | null
}

/** The box a track is drawn into: its own units, which a `viewBox` then makes fluid. */
export interface TrackBox {
  width: number
  height: number
  /** The track's own margin inside the box, so a fix on the extreme never lands on the edge. */
  pad: number
}

export interface TrackProjection {
  /** Longitude to a screen x inside the box. */
  x: (lon: number) => number
  /** Latitude to a screen y inside the box. Screen y grows downward; latitude grows north. */
  y: (lat: number) => number
  /** Metres per screen unit, for a scale bar that states a real distance. */
  metresPerUnit: number
}

/** Metres per degree of latitude. The equirectangular constant every scale here is built on. */
const METRES_PER_DEGREE = 111_320

/**
 * The whole track fitted into the box, centred, or null where no fix exists to project.
 *
 * Null is a real case in this archive and not a failure: a recording whose GPS never spoke has no
 * track, and a map must say so in words rather than draw an empty frame (ADR 0033). Every caller
 * handles it; none of them invents a centre.
 *
 * The box is **stable** — it is whatever the caller asked for, never the track's own aspect ratio.
 * A long thin track is dealt with by zooming into it, which is the reversal ADR 0033 records: a
 * frame that takes the track's shape reflows the page between races and still cannot make a 25nm
 * trace legible on a phone.
 */
export function projectTrack(
  fixes: readonly TrackFix[],
  { width, height, pad }: TrackBox
): TrackProjection | null {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (const fix of fixes) {
    const { latitude: lat, longitude: lon } = fix
    if (lat === null || lon === null) continue
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }

  if (!Number.isFinite(minLat)) return null

  const midLat = (minLat + maxLat) / 2
  // Work in "corrected degrees" so a boat sailing north-east draws a line at 45° rather than one
  // squashed by the latitude it was sailed at.
  const kx = Math.cos((midLat * Math.PI) / 180)
  // A floor rather than a guard: a race that never left one fix has a span of zero, and dividing
  // the box by it would put every point at infinity instead of in the middle of the frame.
  const spanX = Math.max((maxLon - minLon) * kx, 1e-6)
  const spanY = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)
  const centreLon = (minLon + maxLon) / 2

  return {
    x: (lon: number) => width / 2 + (lon - centreLon) * kx * scale,
    y: (lat: number) => height / 2 - (lat - midLat) * scale,
    metresPerUnit: METRES_PER_DEGREE / scale,
  }
}

/** 1-2-5 rounding, so the scale bar reads as a distance somebody would state. */
export function niceDistance(metres: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(metres, 1))))
  const leading = metres / power
  const step = leading >= 5 ? 5 : leading >= 2 ? 2 : 1
  return step * power
}

/** The bar's own label: nautical miles once metres stop being the unit a sailor would use. */
export function scaleBarLabel(metres: number): string {
  return metres >= 1852 ? `${(metres / 1852).toFixed(1)} nm` : `${metres} m`
}
