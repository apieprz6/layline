/**
 * The one projection every map in Layline reads.
 *
 * Extracted from `TrackMap`, which held it in a `useMemo` and so could not lend it to the **Race
 * Track Heatmap**. These are the claims that made it worth extracting rather than copying: a
 * `cos(lat)` correction that is actually applied, a stated scale that is a real distance, and a
 * frame that stays the shape the caller asked for.
 */

import {
  niceDistance,
  projectTrack,
  scaleBarLabel,
  type TrackFix,
} from '@/services/recordings/track-projection'

/** The venue: COLYC's race circle, where every figure below is measured. */
const LAT = 41.8528333
const LON = -87.5568333

const BOX = { width: 360, height: 440, pad: 12 }

function fix(latitude: number, longitude: number): TrackFix {
  return { latitude, longitude }
}

describe('projecting a track into a box', () => {
  it('centres the track and keeps it inside the padding', () => {
    const projection = projectTrack([fix(LAT, LON), fix(LAT + 0.01, LON + 0.01)], BOX)

    // The midpoint of the track is the middle of the box, whichever way round the box is.
    expect(projection?.x(LON + 0.005)).toBeCloseTo(BOX.width / 2, 1)
    expect(projection?.y(LAT + 0.005)).toBeCloseTo(BOX.height / 2, 1)

    // One axis fills its padding and the other is drawn at that same scale rather than stretched
    // to fill its own — a square degree box in a tall frame is constrained by the height, and
    // stretching the width instead would make the track a different shape from the race.
    expect(projection?.y(LAT + 0.01)).toBeCloseTo(BOX.pad, 1)
    expect(projection?.y(LAT)).toBeCloseTo(BOX.height - BOX.pad, 1)
    expect(projection?.x(LON)).toBeGreaterThan(BOX.pad)
    expect(projection?.x(LON + 0.01)).toBeLessThan(BOX.width - BOX.pad)
  })

  it('puts north at the top, because screen y grows the other way', () => {
    const projection = projectTrack([fix(LAT, LON), fix(LAT + 0.01, LON)], BOX)

    expect(projection?.y(LAT + 0.01)).toBeLessThan(projection?.y(LAT) as number)
  })

  it('corrects longitude by cos(lat), so a north-east leg draws at 45°', () => {
    // A tenth of a degree each way at this latitude is 11.1km north and 8.3km east. Without the
    // correction the track would draw square and the boat would appear to have sailed further east
    // than it did.
    const projection = projectTrack([fix(LAT, LON), fix(LAT + 0.1, LON + 0.1)], BOX)

    const east = (projection?.x(LON + 0.1) as number) - (projection?.x(LON) as number)
    const north = (projection?.y(LAT) as number) - (projection?.y(LAT + 0.1) as number)

    // Corrected at the track's own middle latitude, which is the figure the projection uses: one
    // `cos` for the whole track rather than one per fix, exact enough over a lake.
    expect(east / north).toBeCloseTo(Math.cos(((LAT + 0.05) * Math.PI) / 180), 4)
  })

  it('states a scale a sailor can check: one nautical mile, measured', () => {
    // One minute of latitude is one nautical mile by definition. The scale bar is built on this
    // figure, so if it drifts the map starts quietly lying about distance.
    const projection = projectTrack([fix(LAT, LON), fix(LAT + 1 / 60, LON)], BOX)

    const units = (projection?.y(LAT) as number) - (projection?.y(LAT + 1 / 60) as number)
    const metres = units * (projection?.metresPerUnit as number)

    expect(metres / 1852).toBeCloseTo(1, 2)
  })

  it('keeps the box the shape it was given, however thin the track is', () => {
    // A 25nm point-to-point with a mile of lateral spread. ADR 0033 reverses the prototype's own
    // shrink-to-track finding: the frame stays stable and the sailor zooms inside it, because a
    // frame that reshapes reflows the page between races and still cannot make this legible.
    const thin = projectTrack([fix(LAT, LON), fix(LAT + 0.4, LON + 0.01)], BOX)

    expect(thin?.y(LAT)).toBeCloseTo(BOX.height - BOX.pad, 1)
    // The long axis fills the height; the short one is drawn at that same scale rather than
    // stretched to fill the width.
    expect(thin?.x(LON + 0.01)).toBeLessThan(BOX.width - BOX.pad)
    expect(thin?.x(LON + 0.01)).toBeGreaterThan(BOX.width / 2)
  })

  it('answers null where there is no fix to project', () => {
    // A real case in this archive: a recording whose GPS never spoke. The caller says so in words
    // rather than drawing an empty frame.
    expect(projectTrack([], BOX)).toBeNull()
    expect(projectTrack([{ latitude: null, longitude: null }], BOX)).toBeNull()
    // Half a fix is no fix: a latitude with no longitude is not a position.
    expect(projectTrack([{ latitude: LAT, longitude: null }], BOX)).toBeNull()
  })

  it('puts a track that never moved in the middle of the frame rather than at infinity', () => {
    // A boat that sat on one fix has a span of zero, and dividing the box by it would send every
    // point to infinity. The floor in the span is what keeps the frame drawable.
    const projection = projectTrack([fix(LAT, LON), fix(LAT, LON)], BOX)

    expect(projection?.x(LON)).toBeCloseTo(BOX.width / 2, 1)
    expect(projection?.y(LAT)).toBeCloseTo(BOX.height / 2, 1)
    expect(Number.isFinite(projection?.metresPerUnit)).toBe(true)
  })
})

describe('the scale bar’s own numbers', () => {
  it('rounds 1-2-5, so the bar reads as a distance somebody would state', () => {
    expect(niceDistance(1)).toBe(1)
    expect(niceDistance(3.7)).toBe(2)
    expect(niceDistance(7.2)).toBe(5)
    expect(niceDistance(230)).toBe(200)
    expect(niceDistance(880)).toBe(500)
    expect(niceDistance(0)).toBe(1)
  })

  it('switches to nautical miles once metres stop being the unit a sailor would use', () => {
    expect(scaleBarLabel(500)).toBe('500 m')
    expect(scaleBarLabel(1852)).toBe('1.0 nm')
    expect(scaleBarLabel(5000)).toBe('2.7 nm')
  })
})
