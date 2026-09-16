import { arcPath, radialToXY, shortestAngularDelta } from '../windRoseGeometry'

const CENTER = 180
const RADIUS = 138

/** Pull the "x,y" pairs back out of a path so a test can talk about vertices. */
function vertices(d: string): Array<[number, number]> {
  return d
    .replace(/^M/, '')
    .split(' L')
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return [x, y] as [number, number]
    })
}

function radiusOf([x, y]: [number, number]): number {
  return Math.sqrt((x - CENTER) ** 2 + (y - CENTER) ** 2)
}

function bearingOf([x, y]: [number, number]): number {
  const deg = (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI + 90
  return ((deg % 360) + 360) % 360
}

describe('shortestAngularDelta', () => {
  it('is positive going clockwise and negative going anticlockwise', () => {
    expect(shortestAngularDelta(10, 40)).toBe(30)
    expect(shortestAngularDelta(40, 10)).toBe(-30)
  })

  it('takes the short way round across North', () => {
    expect(shortestAngularDelta(350, 10)).toBe(20)
    expect(shortestAngularDelta(10, 350)).toBe(-20)
  })

  it('breaks an exact reversal clockwise', () => {
    expect(shortestAngularDelta(0, 180)).toBe(180)
    expect(shortestAngularDelta(180, 0)).toBe(180)
    expect(shortestAngularDelta(270, 90)).toBe(180)
  })

  it('is zero for no change', () => {
    expect(shortestAngularDelta(180, 180)).toBe(0)
    expect(shortestAngularDelta(0, 360)).toBe(0)
  })

  it('never exceeds a half circle either way', () => {
    for (let from = 0; from < 360; from += 7) {
      for (let to = 0; to < 360; to += 11) {
        const delta = shortestAngularDelta(from, to)
        expect(delta).toBeGreaterThan(-180)
        expect(delta).toBeLessThanOrEqual(180)
      }
    }
  })
})

describe('arcPath', () => {
  it('starts at the first observation and ends at the second', () => {
    const d = arcPath({ dir: 30, r01: 0.4 }, { dir: 120, r01: 0.9 }, CENTER, CENTER, RADIUS)
    const points = vertices(d)

    const [startX, startY] = radialToXY(30, 0.4, CENTER, CENTER, RADIUS)
    const [endX, endY] = radialToXY(120, 0.9, CENTER, CENTER, RADIUS)

    expect(points[0][0]).toBeCloseTo(startX, 1)
    expect(points[0][1]).toBeCloseTo(startY, 1)
    expect(points[points.length - 1][0]).toBeCloseTo(endX, 1)
    expect(points[points.length - 1][1]).toBeCloseTo(endY, 1)
  })

  it('stays inside the annulus between the two radii — no chord across the centre', () => {
    // A 100° shift between two samples near the outer ring: the old straight line passed within
    // ~40% of the radius of the centre, i.e. drew a time the wind was never at.
    const d = arcPath({ dir: 20, r01: 0.85 }, { dir: 120, r01: 0.95 }, CENTER, CENTER, RADIUS)

    for (const vertex of vertices(d)) {
      const r01 = radiusOf(vertex) / RADIUS
      expect(r01).toBeGreaterThanOrEqual(0.85 - 0.01)
      expect(r01).toBeLessThanOrEqual(0.95 + 0.01)
    }
  })

  it('passes through the bearings between the two observations', () => {
    const d = arcPath({ dir: 20, r01: 0.5 }, { dir: 110, r01: 0.6 }, CENTER, CENTER, RADIUS)
    const bearings = vertices(d).map(bearingOf)

    for (const bearing of bearings) {
      expect(bearing).toBeGreaterThanOrEqual(20 - 0.01)
      expect(bearing).toBeLessThanOrEqual(110 + 0.01)
    }
    // Monotonic: it sweeps one way, it does not double back.
    for (let at = 1; at < bearings.length; at += 1) {
      expect(bearings[at]).toBeGreaterThan(bearings[at - 1])
    }
  })

  it('sweeps the short way across North rather than the long way round', () => {
    const d = arcPath({ dir: 350, r01: 0.5 }, { dir: 10, r01: 0.5 }, CENTER, CENTER, RADIUS)
    const bearings = vertices(d).map(bearingOf)

    // Every vertex is within 10° of North, either side — not 340° of detour through South.
    for (const bearing of bearings) {
      expect(Math.min(bearing, 360 - bearing)).toBeLessThanOrEqual(10.01)
    }
  })

  it('samples roughly one vertex per 5 degrees of sweep', () => {
    expect(vertices(arcPath({ dir: 0, r01: 0.5 }, { dir: 90, r01: 0.5 }, CENTER, CENTER, RADIUS)))
      .toHaveLength(19)
    expect(vertices(arcPath({ dir: 0, r01: 0.5 }, { dir: 20, r01: 0.5 }, CENTER, CENTER, RADIUS)))
      .toHaveLength(5)
  })

  it('draws a plain radial line when the direction did not change', () => {
    const d = arcPath({ dir: 90, r01: 0.2 }, { dir: 90, r01: 0.8 }, CENTER, CENTER, RADIUS)
    const points = vertices(d)

    expect(points).toHaveLength(2)
    expect(points.every((point) => Math.abs(bearingOf(point) - 90) < 0.01)).toBe(true)
  })

  it('draws a reversal clockwise in the direction it is handed', () => {
    // Oldest-first: the wind went from North to South, so the sweep passes through East.
    const bearings = vertices(
      arcPath({ dir: 0, r01: 0.5 }, { dir: 180, r01: 0.5 }, CENTER, CENTER, RADIUS)
    ).map(bearingOf)

    expect(bearings.some((bearing) => Math.abs(bearing - 90) < 0.01)).toBe(true)
    expect(bearings.every((bearing) => bearing <= 180.01)).toBe(true)
  })
})
