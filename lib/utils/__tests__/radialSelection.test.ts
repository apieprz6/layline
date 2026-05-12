import { findPointByRadius } from '../radialSelection'
import type { MinuteDataPoint } from '@/types'

describe('findPointByRadius', () => {
  // Mock SVG element with getBoundingClientRect
  const createMockSVG = (width = 360, height = 360): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 360 360')

    // Mock getBoundingClientRect
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    return svg
  }

  describe('Tracer bullet: radial time-based selection', () => {
    it('selects data point at midpoint of time window when clicking at 50% radius', () => {
      // Setup: 60-minute window with data at 0, 30, and 60 minutes ago
      const dataPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },   // Now (outer ring)
        { minsAgo: 30, spd: 14, dir: 90 }, // 30 mins ago (middle)
        { minsAgo: 60, spd: 10, dir: 180 }, // 60 mins ago (center)
      ]

      const svg = createMockSVG()
      const timeWindowMinutes = 60

      // Click at center of chart (180, 180) with 50% radius offset
      // 50% radius = 30 minutes ago in a 60-minute window
      const centerX = 180
      const centerY = 180
      const radius = (360 - 84) / 2 // R = (SIZE - PAD*2) / 2 = 138

      // Click halfway between center and outer ring (pointing North for simplicity)
      const clickX = centerX
      const clickY = centerY - radius * 0.5 // 50% radius toward North

      const result = findPointByRadius(clickX, clickY, dataPoints, svg, timeWindowMinutes)

      // Should return the 30-minute data point (closest to 50% of time window)
      expect(result).toEqual({ minsAgo: 30, spd: 14, dir: 90 })
    })
  })

  describe('Radial selection at different time offsets', () => {
    const dataPoints: MinuteDataPoint[] = [
      { minsAgo: 0, spd: 12, dir: 0 },
      { minsAgo: 15, spd: 13, dir: 45 },
      { minsAgo: 30, spd: 14, dir: 90 },
      { minsAgo: 45, spd: 11, dir: 135 },
      { minsAgo: 60, spd: 10, dir: 180 },
    ]
    const svg = createMockSVG()
    const timeWindowMinutes = 60
    const centerX = 180
    const centerY = 180
    const radius = (360 - 84) / 2

    it('selects current point when clicking at outer ring (100% radius)', () => {
      const clickX = centerX
      const clickY = centerY - radius // Full radius North

      const result = findPointByRadius(clickX, clickY, dataPoints, svg, timeWindowMinutes)
      expect(result?.minsAgo).toBe(0)
    })

    it('selects oldest point when clicking at center (0% radius)', () => {
      const clickX = centerX
      const clickY = centerY // Exact center

      const result = findPointByRadius(clickX, clickY, dataPoints, svg, timeWindowMinutes)
      expect(result?.minsAgo).toBe(60)
    })

    it('selects point at 25% of time window when clicking at 75% radius', () => {
      const clickX = centerX
      const clickY = centerY - radius * 0.75 // 75% radius North

      const result = findPointByRadius(clickX, clickY, dataPoints, svg, timeWindowMinutes)
      // 75% radius = 25% through time = 15 minutes ago
      expect(result?.minsAgo).toBe(15)
    })

    it('selects point at 75% of time window when clicking at 25% radius', () => {
      const clickX = centerX
      const clickY = centerY - radius * 0.25 // 25% radius North

      const result = findPointByRadius(clickX, clickY, dataPoints, svg, timeWindowMinutes)
      // 25% radius = 75% through time = 45 minutes ago
      expect(result?.minsAgo).toBe(45)
    })
  })

  describe('Angle-independent selection (time-prioritized)', () => {
    it('selects same time point regardless of click angle', () => {
      const dataPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 30, spd: 14, dir: 90 },
        { minsAgo: 60, spd: 10, dir: 180 },
      ]
      const svg = createMockSVG()
      const timeWindowMinutes = 60
      const centerX = 180
      const centerY = 180
      const radius = (360 - 84) / 2

      // Click at 50% radius in different directions
      const clickNorth = findPointByRadius(
        centerX,
        centerY - radius * 0.5,
        dataPoints,
        svg,
        timeWindowMinutes
      )
      const clickEast = findPointByRadius(
        centerX + radius * 0.5,
        centerY,
        dataPoints,
        svg,
        timeWindowMinutes
      )
      const clickSouth = findPointByRadius(
        centerX,
        centerY + radius * 0.5,
        dataPoints,
        svg,
        timeWindowMinutes
      )
      const clickWest = findPointByRadius(
        centerX - radius * 0.5,
        centerY,
        dataPoints,
        svg,
        timeWindowMinutes
      )

      // All should return the same point (30 mins ago)
      expect(clickNorth?.minsAgo).toBe(30)
      expect(clickEast?.minsAgo).toBe(30)
      expect(clickSouth?.minsAgo).toBe(30)
      expect(clickWest?.minsAgo).toBe(30)
    })
  })

  describe('Nearest neighbor matching', () => {
    it('finds nearest data point when exact time does not exist', () => {
      const dataPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 20, spd: 13, dir: 45 },
        { minsAgo: 40, spd: 14, dir: 90 },
        { minsAgo: 60, spd: 10, dir: 180 },
      ]
      const svg = createMockSVG()
      const timeWindowMinutes = 60
      const centerX = 180
      const centerY = 180
      const radius = (360 - 84) / 2

      // Click at 50% radius (30 mins ago target, but no exact match)
      const clickX = centerX
      const clickY = centerY - radius * 0.5

      const result = findPointByRadius(clickX, clickY, dataPoints, svg, timeWindowMinutes)

      // Should return closest point (either 20 or 40 mins ago)
      // 30 is equidistant from 20 and 40, so either is acceptable
      expect([20, 40]).toContain(result?.minsAgo)
    })
  })

  describe('Edge cases', () => {
    const svg = createMockSVG()
    const timeWindowMinutes = 60

    it('returns null for empty data array', () => {
      const result = findPointByRadius(180, 180, [], svg, timeWindowMinutes)
      expect(result).toBeNull()
    })

    it('returns null when time window is zero', () => {
      const dataPoints: MinuteDataPoint[] = [{ minsAgo: 0, spd: 12, dir: 0 }]
      const result = findPointByRadius(180, 180, dataPoints, svg, 0)
      expect(result).toBeNull()
    })

    it('returns single data point when only one point exists', () => {
      const dataPoints: MinuteDataPoint[] = [{ minsAgo: 15, spd: 12, dir: 90 }]
      const result = findPointByRadius(180, 180, dataPoints, svg, timeWindowMinutes)
      expect(result).toEqual({ minsAgo: 15, spd: 12, dir: 90 })
    })

    it('clamps radius to 0-1 range when clicking outside chart bounds', () => {
      const dataPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 60, spd: 10, dir: 180 },
      ]

      // Click far outside chart (beyond 100% radius)
      const result = findPointByRadius(180, 0, dataPoints, svg, timeWindowMinutes)

      // Should clamp to outer ring and return most recent point
      expect(result?.minsAgo).toBe(0)
    })
  })

  describe('Responsive sizing', () => {
    it('handles different SVG element sizes correctly', () => {
      const dataPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 30, spd: 14, dir: 90 },
        { minsAgo: 60, spd: 10, dir: 180 },
      ]
      const timeWindowMinutes = 60

      // Smaller SVG rendering (mobile)
      const smallSVG = createMockSVG(300, 300)
      const smallResult = findPointByRadius(150, 75, dataPoints, smallSVG, timeWindowMinutes)

      // Larger SVG rendering (desktop)
      const largeSVG = createMockSVG(600, 600)
      const largeResult = findPointByRadius(300, 150, dataPoints, largeSVG, timeWindowMinutes)

      // Both should select the same time point (50% radius = 30 mins ago)
      expect(smallResult?.minsAgo).toBe(30)
      expect(largeResult?.minsAgo).toBe(30)
    })
  })
})

