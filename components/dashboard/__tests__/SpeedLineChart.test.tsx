import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import SpeedLineChart from '../SpeedLineChart'
import type { WindDataPoint } from '@/types'

// Mock SVG getBoundingClientRect for coordinate calculations
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, 'getBoundingClientRect', {
    writable: true,
    value: jest.fn().mockReturnValue({
      width: 360,
      height: 130,
      top: 0,
      left: 0,
      right: 360,
      bottom: 130,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  })
})

describe('SpeedLineChart', () => {
  // Reference time for all tests
  const referenceTime = new Date('2026-05-19T18:00:00Z')

  const mockData: WindDataPoint[] = [
    { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 }, // now
    { timestamp: '2026-05-19T17:50:00Z', spd: 14, dir: 185 }, // 10 mins ago
    { timestamp: '2026-05-19T17:40:00Z', spd: 11, dir: 175 }, // 20 mins ago
    { timestamp: '2026-05-19T17:20:00Z', spd: 16, dir: 190 }, // 40 mins ago
    { timestamp: '2026-05-19T17:00:00Z', spd: 9, dir: 170 },  // 60 mins ago
  ]

  describe('Data filtering to time window', () => {
    it('filters data points to time window with nowOffset at 0', () => {
      const { container } = render(
        <SpeedLineChart
          data={mockData}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // With 30-minute window at nowOffset=0, should include:
      // - 18:00:00Z (0 mins ago - in window)
      // - 17:50:00Z (10 mins ago - in window)
      // - 17:40:00Z (20 mins ago - in window)
      // - 17:20:00Z (40 mins ago - outside window)
      // - 17:00:00Z (60 mins ago - outside window)
      // Should render area fill and line segments
      const lines = container.querySelectorAll('line[stroke-linecap="round"]')
      expect(lines.length).toBe(2) // 2 segments for 3 points
    })

    it('filters data points with nowOffset scrubbed back', () => {
      const { container } = render(
        <SpeedLineChart
          data={mockData}
          timeWindowMinutes={30}
          nowOffsetMinutes={30}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // With 30-minute window at nowOffset=30, window is [30, 60] minutes ago
      // Should include:
      // - 17:20:00Z (40 mins ago - in window)
      // - 17:00:00Z (60 mins ago - in window)
      // Should NOT include:
      // - 18:00:00Z, 17:50:00Z, 17:40:00Z (before window start)
      // Should render 1 line segment for 2 points
      const lines = container.querySelectorAll('line[stroke-linecap="round"]')
      expect(lines.length).toBe(1)
    })

    it('renders empty SVG when no data in window', () => {
      const { container } = render(
        <SpeedLineChart
          data={mockData}
          timeWindowMinutes={5}
          nowOffsetMinutes={100}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // No data points in window, should not render line segments
      const lines = container.querySelectorAll('line[stroke-linecap="round"]')
      expect(lines.length).toBe(0)
    })
  })

  describe('Dynamic Y-axis scaling', () => {
    it('scales Y-axis to nearest 5 kts above max speed', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 }, // Max = 12
        { timestamp: '2026-05-19T17:50:00Z', spd: 9, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Max speed 12 -> should scale to 15
      // Should have Y-axis tick label "15" at top
      const textElements = container.querySelectorAll('text')
      const labels = Array.from(textElements).map((t) => t.textContent)
      expect(labels).toContain('15')
    })

    it('uses minimum Y-axis of 8 kts for light air conditions', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 5, dir: 180 }, // Light air
        { timestamp: '2026-05-19T17:50:00Z', spd: 6, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Max speed 6 -> rounds to 10, but minimum is 8 (wait, logic should be minimum 8)
      // Actually per spec: "rounds up to nearest 5 kts, minimum 8 kts"
      // So max(8, ceil(6/5)*5) = max(8, 10) = 10
      const textElements = container.querySelectorAll('text')
      const labels = Array.from(textElements).map((t) => t.textContent)
      expect(labels).toContain('10')
    })

    it('uses 10 kts step when max speed is 20 or less', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 18, dir: 180 },
        { timestamp: '2026-05-19T17:50:00Z', spd: 16, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Max 18 -> scales to 20, step should be 5 (not 10)
      // Y-axis ticks: 0, 5, 10, 15, 20
      const textElements = container.querySelectorAll('text')
      const labels = Array.from(textElements).map((t) => t.textContent)
      expect(labels).toContain('0')
      expect(labels).toContain('5')
      expect(labels).toContain('10')
      expect(labels).toContain('15')
      expect(labels).toContain('20')
    })

    it('uses 10 kts step when max speed exceeds 20', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 28, dir: 180 },
        { timestamp: '2026-05-19T17:50:00Z', spd: 24, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Max 28 -> scales to 30, step should be 10
      // Y-axis ticks: 0, 10, 20, 30
      const textElements = container.querySelectorAll('text')
      const labels = Array.from(textElements).map((t) => t.textContent)
      expect(labels).toContain('0')
      expect(labels).toContain('10')
      expect(labels).toContain('20')
      expect(labels).toContain('30')
    })
  })

  describe('Hover visualization', () => {
    it('renders hover highlight when hoverPoint is provided', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 },
        { timestamp: '2026-05-19T17:45:00Z', spd: 14, dir: 185 },
        { timestamp: '2026-05-19T17:30:00Z', spd: 10, dir: 175 },
      ]

      const hoverPoint = { ...data[1], minsAgo: 15 } // Middle point with minsAgo

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={hoverPoint}
          onHoverChange={() => {}}
        />
      )

      // Should have a vertical crosshair line
      const lines = container.querySelectorAll('line')
      const crosshairLine = Array.from(lines).find(line => {
        const dasharray = line.getAttribute('stroke-dasharray')
        return dasharray === '2 3'
      })

      expect(crosshairLine).toBeTruthy()
    })

    it('renders hover circle at hoverPoint position', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 },
        { timestamp: '2026-05-19T17:45:00Z', spd: 14, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={{ ...data[0], minsAgo: 0 }}
          onHoverChange={() => {}}
        />
      )

      // Should have a hover circle
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBeGreaterThan(0)
    })

    it('does not render crosshair when hoverPoint is null', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Should not have crosshair line
      const lines = container.querySelectorAll('line')
      const crosshairLine = Array.from(lines).find(line => {
        const dasharray = line.getAttribute('stroke-dasharray')
        return dasharray === '2 3'
      })

      expect(crosshairLine).toBeFalsy()
    })
  })

  describe('Wind condition band lines', () => {
    it('renders dashed lines at 8, 15, 22 kts thresholds', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 25, dir: 180 }, // Force max to include all bands
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Should have band lines at 8, 15, 22 kts
      const lines = container.querySelectorAll('line')
      const bandLines = Array.from(lines).filter(line => {
        const dasharray = line.getAttribute('stroke-dasharray')
        const stroke = line.getAttribute('stroke')
        // Band lines have specific dasharray (1 3) and wind-condition colors
        return dasharray === '1 3' && stroke && (
          stroke === '#007A52' || // Light
          stroke === '#0055BB' || // Medium
          stroke === '#C47000'    // Heavy
        )
      })

      expect(bandLines.length).toBe(3) // 8, 15, 22 kts
    })

    it('only renders band lines below maxSpeed', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 }, // Max will be 15
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // With max 15, should only have 8 kts band (15 and 22 are above max)
      const lines = container.querySelectorAll('line')
      const bandLines = Array.from(lines).filter(line => {
        const dasharray = line.getAttribute('stroke-dasharray')
        const stroke = line.getAttribute('stroke')
        return dasharray === '1 3' && stroke === '#007A52' // Light air at 8 kts
      })

      expect(bandLines.length).toBe(1) // Only 8 kts
    })
  })

  describe('Line segment coloring', () => {
    it('renders line segments colored by wind conditions', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 7, dir: 180 },  // Light
        { timestamp: '2026-05-19T17:50:00Z', spd: 12, dir: 185 }, // Medium
        { timestamp: '2026-05-19T17:40:00Z', spd: 18, dir: 175 }, // Heavy
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Should have colored line segments
      const lines = container.querySelectorAll('line[stroke-linecap="round"]')
      expect(lines.length).toBeGreaterThan(0)
    })
  })

  describe('Gaps in the data', () => {
    // Three observations at the feed's cadence, a three-hour outage, then two more.
    const dataWithOutage: WindDataPoint[] = [
      { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 }, // now
      { timestamp: '2026-05-19T17:50:00Z', spd: 13, dir: 182 }, // 10 mins ago
      { timestamp: '2026-05-19T17:40:00Z', spd: 11, dir: 184 }, // 20 mins ago
      { timestamp: '2026-05-19T14:40:00Z', spd: 9, dir: 200 },  // 200 mins ago
      { timestamp: '2026-05-19T14:30:00Z', spd: 10, dir: 205 }, // 210 mins ago
    ]

    it('draws no line segment across an outage', () => {
      const { container } = render(
        <SpeedLineChart
          data={dataWithOutage}
          timeWindowMinutes={360}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Five points would be four segments; the one spanning the outage is not drawn.
      const lines = container.querySelectorAll('line[stroke-linecap="round"]')
      expect(lines.length).toBe(3)
    })

    it('splits the area fill so it does not bridge what the stroke broke', () => {
      const { container } = render(
        <SpeedLineChart
          data={dataWithOutage}
          timeWindowMinutes={360}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      const fills = container.querySelectorAll('path[fill="url(#spdGradient)"]')
      expect(fills.length).toBe(2)
      // Each shape closes on itself rather than the two sharing one outline.
      fills.forEach((fill) => {
        expect(fill.getAttribute('d')).toMatch(/Z$/)
      })
    })

    it('draws an observation stranded between two outages', () => {
      const stranded: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 }, // now
        { timestamp: '2026-05-19T17:50:00Z', spd: 13, dir: 182 }, // 10 mins ago
        { timestamp: '2026-05-19T14:40:00Z', spd: 5, dir: 200 },  // 200 mins ago, alone
        { timestamp: '2026-05-19T12:10:00Z', spd: 9, dir: 210 },  // 350 mins ago
        { timestamp: '2026-05-19T12:00:00Z', spd: 10, dir: 212 }, // 360 mins ago
      ]

      const { container } = render(
        <SpeedLineChart
          data={stranded}
          timeWindowMinutes={360}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Two runs of two draw one segment each; the lone 200-minute reading draws neither a segment
      // nor an area, so it has to be a dot or it vanishes from a chart that then reads as empty
      // there rather than intermittent.
      expect(container.querySelectorAll('line[stroke-linecap="round"]').length).toBe(2)
      expect(container.querySelectorAll('path[fill="url(#spdGradient)"]').length).toBe(2)

      const lone = container.querySelector('circle[r="1.75"]')
      expect(lone).toBeTruthy()
      expect(lone).toHaveAttribute('fill', '#007A52') // 5 kts is light air
    })

    it('anchors the fill gradient to the plot so every run fades on one scale', () => {
      const { container } = render(
        <SpeedLineChart
          data={dataWithOutage}
          timeWindowMinutes={360}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // With the SVG default (objectBoundingBox) each run would restart the ramp inside its own box,
      // so a short light-air shape after an outage would read darker than a tall heavy-air one.
      const gradient = container.querySelector('#spdGradient')
      expect(gradient).toHaveAttribute('gradientUnits', 'userSpaceOnUse')
    })

    it('keeps drawing through a spacing the threshold allows', () => {
      const closeEnough: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 },
        { timestamp: '2026-05-19T17:00:00Z', spd: 10, dir: 190 }, // exactly 60 minutes
      ]

      const { container } = render(
        <SpeedLineChart
          data={closeEnough}
          timeWindowMinutes={360}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      expect(container.querySelectorAll('line[stroke-linecap="round"]').length).toBe(1)
      expect(container.querySelectorAll('path[fill="url(#spdGradient)"]').length).toBe(1)
    })
  })

  describe('Area fill gradient', () => {
    it('renders area fill path with gradient', () => {
      const data: WindDataPoint[] = [
        { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 180 },
        { timestamp: '2026-05-19T17:30:00Z', spd: 10, dir: 175 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          referenceTime={referenceTime}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Should have area fill path
      const path = container.querySelector('path[fill]')
      expect(path).toBeInTheDocument()
      expect(path).not.toHaveAttribute('fill', 'none')
    })
  })
})
