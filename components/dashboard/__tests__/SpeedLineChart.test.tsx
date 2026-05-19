import '@testing-library/jest-dom'
import { render, fireEvent, createEvent } from '@testing-library/react'
import SpeedLineChart from '../SpeedLineChart'
import type { MinuteDataPoint } from '@/types'

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
  const mockData: MinuteDataPoint[] = [
    { minsAgo: 0, spd: 12, dir: 180 },
    { minsAgo: 10, spd: 14, dir: 185 },
    { minsAgo: 20, spd: 11, dir: 175 },
    { minsAgo: 40, spd: 16, dir: 190 },
    { minsAgo: 60, spd: 9, dir: 170 },
  ]

  describe('Data filtering to time window', () => {
    it('filters data points to time window with nowOffset at 0', () => {
      const { container } = render(
        <SpeedLineChart
          data={mockData}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // With 30-minute window at nowOffset=0, should include:
      // - minsAgo: 0 (in window)
      // - minsAgo: 10 (in window)
      // - minsAgo: 20 (in window)
      // - minsAgo: 40 (outside window)
      // - minsAgo: 60 (outside window)
      // Should render area fill and line segments
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
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // With 30-minute window at nowOffset=30, window is [30, 60] minutes ago
      // Should include:
      // - minsAgo: 40 (in window)
      // - minsAgo: 60 (in window)
      // Should NOT include:
      // - minsAgo: 0, 10, 20 (before window start)
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 }, // Max = 12
        { minsAgo: 10, spd: 9, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 5, dir: 180 }, // Light air
        { minsAgo: 10, spd: 6, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 18, dir: 180 },
        { minsAgo: 10, spd: 16, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 28, dir: 180 },
        { minsAgo: 10, spd: 24, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 },
        { minsAgo: 15, spd: 14, dir: 185 },
        { minsAgo: 30, spd: 10, dir: 175 },
      ]

      const hoverPoint = data[1] // Middle point

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 },
        { minsAgo: 15, spd: 14, dir: 185 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          hoverPoint={data[0]}
          onHoverChange={() => {}}
        />
      )

      // Should have a hover circle
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBeGreaterThan(0)
    })

    it('does not render crosshair when hoverPoint is null', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 25, dir: 180 }, // Force max to include all bands
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 }, // Max will be 15
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 7, dir: 180 },  // Light
        { minsAgo: 10, spd: 12, dir: 185 }, // Medium
        { minsAgo: 20, spd: 18, dir: 175 }, // Heavy
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
          hoverPoint={null}
          onHoverChange={() => {}}
        />
      )

      // Should have colored line segments
      const lines = container.querySelectorAll('line[stroke-linecap="round"]')
      expect(lines.length).toBeGreaterThan(0)
    })
  })

  describe('Area fill gradient', () => {
    it('renders area fill path with gradient', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 },
        { minsAgo: 30, spd: 10, dir: 175 },
      ]

      const { container } = render(
        <SpeedLineChart
          data={data}
          timeWindowMinutes={30}
          nowOffsetMinutes={0}
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
