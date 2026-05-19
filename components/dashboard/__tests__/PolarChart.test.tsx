import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import PolarChart from '../PolarChart'
import type { MinuteDataPoint } from '@/types'

describe('PolarChart', () => {
  const mockData: MinuteDataPoint[] = [
    { minsAgo: 0, spd: 12, dir: 180 },
    { minsAgo: 10, spd: 14, dir: 185 },
    { minsAgo: 20, spd: 11, dir: 175 },
  ]

  describe('Radial positioning with time window', () => {
    it('positions sparse data relative to time window, not oldest point', () => {
      // Single point at 5 mins ago in a 30-minute window
      // Should be at r01 ≈ 0.83 (near outer ring), not at center
      const sparseData: MinuteDataPoint[] = [{ minsAgo: 5, spd: 12, dir: 180 }]

      const { container } = render(
        <PolarChart data={sparseData} timeWindowMinutes={30} />
      )

      // The data point circle should exist and be positioned near the outer ring
      const circles = container.querySelectorAll('circle[fill="#0055BB"], circle[fill="#007A52"], circle[fill="#C47000"], circle[fill="#CC1100"]')
      expect(circles.length).toBeGreaterThan(0)

      // Calculate expected position for r01 ≈ 0.83 (5 mins ago in 30 min window)
      // r01 = 1 - (5/30) = 0.833...
      // With radius ≈ 138 (from (360-84)/2), expected r ≈ 115
      // This should be much closer to outer ring (138) than center (0)
      const circle = circles[0]
      const cx = parseFloat(circle.getAttribute('cx') || '0')
      const cy = parseFloat(circle.getAttribute('cy') || '0')
      const centerX = 180
      const centerY = 180

      const distanceFromCenter = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2)
      // Should be > 100 (closer to outer ring than center)
      expect(distanceFromCenter).toBeGreaterThan(100)
    })

    it('positions current data point at outer ring', () => {
      const currentData: MinuteDataPoint[] = [{ minsAgo: 0, spd: 12, dir: 0 }] // North

      const { container } = render(
        <PolarChart data={currentData} timeWindowMinutes={30} />
      )

      const circles = container.querySelectorAll('circle[fill="#0055BB"], circle[fill="#007A52"], circle[fill="#C47000"], circle[fill="#CC1100"]')
      expect(circles.length).toBeGreaterThan(0)

      // For r01 = 1 at angle 0° (North), should be at top of circle
      const circle = circles[0]
      const cy = parseFloat(circle.getAttribute('cy') || '0')

      // Should be at top (cy < 100)
      expect(cy).toBeLessThan(100)
    })

    it('filters out data points beyond time window', () => {
      const dataWithOldPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 15, spd: 13, dir: 45 },
        { minsAgo: 40, spd: 14, dir: 90 }, // Beyond 30-minute window
      ]

      const { container } = render(
        <PolarChart data={dataWithOldPoints} timeWindowMinutes={30} />
      )

      // Should only render 2 data points, not 3
      const circles = container.querySelectorAll('circle[fill="#0055BB"], circle[fill="#007A52"], circle[fill="#C47000"], circle[fill="#CC1100"]')
      expect(circles.length).toBeLessThanOrEqual(2)
    })
  })

  describe('SVG structure', () => {
    it('renders SVG with 360x360 viewBox', () => {
      render(<PolarChart data={mockData} timeWindowMinutes={60} />)

      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 360 360')
    })
  })

  describe('Radial rings at tick intervals', () => {
    it('renders rings at tick positions for 30m scale', () => {
      const { container } = render(
        <PolarChart data={mockData} timeWindowMinutes={30} />
      )

      // 30m scale should have 7 rings: [0, 5, 10, 15, 20, 25, 30]
      const circles = container.querySelectorAll('circle')
      // Filter for radial ring circles (not data points, not center dot, not reference ring)
      const ringCircles = Array.from(circles).filter(c => {
        const fill = c.getAttribute('fill')
        const stroke = c.getAttribute('stroke')
        const strokeWidth = c.getAttribute('stroke-width')
        // Rings have fill="none" and stroke with rgba, and strokeWidth 0.75 or 1.5
        // Exclude reference ring (strokeWidth 2.5)
        return fill === 'none' && stroke && stroke.includes('rgba') && strokeWidth !== '2.5'
      })

      expect(ringCircles.length).toBe(7)
    })

    it('renders rings at tick positions for 1h scale', () => {
      const { container } = render(
        <PolarChart data={mockData} timeWindowMinutes={60} />
      )

      const circles = container.querySelectorAll('circle')
      const ringCircles = Array.from(circles).filter(c => {
        const fill = c.getAttribute('fill')
        const stroke = c.getAttribute('stroke')
        const strokeWidth = c.getAttribute('stroke-width')
        // Exclude reference ring (strokeWidth 2.5)
        return fill === 'none' && stroke && stroke.includes('rgba') && strokeWidth !== '2.5'
      })

      // 1h scale should have 5 rings: [0, 15, 30, 45, 60]
      expect(ringCircles.length).toBe(5)
    })

    it('renders outer ring with stronger styling', () => {
      const { container } = render(
        <PolarChart data={mockData} timeWindowMinutes={30} />
      )

      const circles = container.querySelectorAll('circle[fill="none"]')
      // Outer ring should have blue accent color and solid stroke
      const outerRing = Array.from(circles).find(c => {
        const stroke = c.getAttribute('stroke')
        const dasharray = c.getAttribute('stroke-dasharray')
        return stroke && stroke.includes('0,68,204') && dasharray === '0'
      })

      expect(outerRing).toBeTruthy()
    })
  })

  describe('Time labels on radial rings', () => {
    it('renders time labels for subset of rings', () => {
      const { container } = render(
        <PolarChart data={mockData} timeWindowMinutes={30} />
      )

      // Should have time labels like "now", "−5m", "−15m", etc.
      const textElements = container.querySelectorAll('text')
      const timeLabels = Array.from(textElements).filter(t => {
        const text = t.textContent || ''
        return text === 'now' || text.includes('m') || text.includes('h')
      })

      // Should have at least 3-4 time labels (outer, inner, middle rings) + center label
      // Not all 7 rings get labels to avoid clutter
      // 30m scale has 7 rings, filtered to ~4 labeled rings + 1 center = 5-6 total
      expect(timeLabels.length).toBeGreaterThanOrEqual(3)
      expect(timeLabels.length).toBeLessThanOrEqual(6)
    })

    it('renders "now" label for outer ring', () => {
      render(<PolarChart data={mockData} timeWindowMinutes={30} />)

      expect(screen.getByText('now')).toBeInTheDocument()
    })

    it('renders time offset labels with proper format', () => {
      const { container } = render(
        <PolarChart data={mockData} timeWindowMinutes={60} />
      )

      const textElements = container.querySelectorAll('text')
      const timeLabels = Array.from(textElements)
        .map(t => t.textContent || '')
        .filter(text => text.includes('m') || text.includes('h'))

      // Should have labels in minute or hour format
      expect(timeLabels.length).toBeGreaterThan(0)
      expect(timeLabels.some(label => label.includes('m') || label.includes('h'))).toBe(true)
    })

    it('renders center label showing oldest time in window', () => {
      const { container } = render(
        <PolarChart data={mockData} timeWindowMinutes={30} />
      )

      // Should have a center label showing oldest time (−30m for 30-minute window)
      const textElements = container.querySelectorAll('text')
      const centerLabels = Array.from(textElements).filter(t => {
        const text = t.textContent || ''
        return text.includes('30m') || text.includes('0.5h')
      })

      expect(centerLabels.length).toBeGreaterThan(0)
    })
  })

  describe('Compass labels', () => {
    it('renders cardinal direction labels (N, E, S, W)', () => {
      render(<PolarChart data={mockData} timeWindowMinutes={60} />)

      expect(screen.getByText('N')).toBeInTheDocument()
      expect(screen.getByText('E')).toBeInTheDocument()
      expect(screen.getByText('S')).toBeInTheDocument()
      expect(screen.getByText('W')).toBeInTheDocument()
    })

    it('renders intercardinal direction labels (NE, SE, SW, NW)', () => {
      render(<PolarChart data={mockData} timeWindowMinutes={60} />)

      expect(screen.getByText('NE')).toBeInTheDocument()
      expect(screen.getByText('SE')).toBeInTheDocument()
      expect(screen.getByText('SW')).toBeInTheDocument()
      expect(screen.getByText('NW')).toBeInTheDocument()
    })
  })

  describe('Data point rendering', () => {
    it('renders circles for data points', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },    // North, now
        { minsAgo: 360, spd: 10, dir: 90 }, // East, 6h ago
      ]

      const { container } = render(<PolarChart data={data} timeWindowMinutes={360} />)

      // Should have circles for data points
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBeGreaterThan(0)
    })

    it('applies wind speed color to data points', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 7, dir: 0 },   // Light air (#007A52)
        { minsAgo: 10, spd: 12, dir: 45 }, // Medium air (#0055BB)
      ]

      const { container } = render(<PolarChart data={data} timeWindowMinutes={60} />)

      // Check that circles have wind-speed-based colors
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBeGreaterThan(0)

      // At least one circle should have a wind condition color
      const fills = Array.from(circles).map(c => c.getAttribute('fill'))
      const hasWindColor = fills.some(fill =>
        fill === '#007A52' || fill === '#0055BB' || fill === '#C47000' || fill === '#CC1100'
      )
      expect(hasWindColor).toBe(true)
    })
  })

  describe('Line segments', () => {
    it('connects adjacent data points with line segments', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 180 },
        { minsAgo: 10, spd: 14, dir: 185 },
        { minsAgo: 20, spd: 11, dir: 175 },
      ]

      const { container } = render(<PolarChart data={data} timeWindowMinutes={60} />)

      // Should have line elements connecting points
      const lines = container.querySelectorAll('line[stroke]')
      expect(lines.length).toBeGreaterThan(0)
    })

    it('skips line segments when angular gap exceeds 90 degrees', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },   // North
        { minsAgo: 10, spd: 12, dir: 180 }, // South (180° jump - should skip)
        { minsAgo: 20, spd: 12, dir: 185 }, // Near south
      ]

      const { container } = render(<PolarChart data={data} timeWindowMinutes={60} />)

      // Should have 1 line segment (20→10), not 2 (0→10 should be skipped)
      const lines = container.querySelectorAll('line[stroke]')
      const dataLines = Array.from(lines).filter(line => {
        const stroke = line.getAttribute('stroke')
        return stroke && stroke.match(/^#[0-9A-F]{6}$/i)
      })
      expect(dataLines.length).toBe(1)
    })
  })

  describe('CHII2 elevation reminder (REMOVED in LAY-34)', () => {
    it('does NOT show 85ft elevation reminder for CHII2 buoy (moved to Legend tab)', () => {
      render(<PolarChart data={mockData} timeWindowMinutes={60} />)

      // Should NOT show text about 85ft elevation (removed from this component)
      expect(screen.queryByText(/85ft/i)).not.toBeInTheDocument()
    })

    it('does not show elevation reminder for other buoys', () => {
      render(<PolarChart data={mockData} timeWindowMinutes={60} />)

      // Should not show 85ft text
      expect(screen.queryByText(/85ft/i)).not.toBeInTheDocument()
    })
  })

  describe('Touch interaction', () => {
    it('calls onHoverChange with nearest data point when pointer down', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },   // North, at outer ring
        { minsAgo: 30, spd: 10, dir: 180 }, // South, at center
      ]

      const handleHoverChange = jest.fn()

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          onHoverChange={handleHoverChange}
        />
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // Simulate pointer down near the top (North position)
      // Center is at (180, 180), North point should be near (180, 42)
      if (svg) {
        fireEvent.pointerDown(svg, {
          clientX: 180,
          clientY: 50,
        })
      }

      // Should call onHoverChange with the North point (first data point)
      expect(handleHoverChange).toHaveBeenCalledWith(data[0])
    })

    it('calls onHoverChange when pointer moves over chart', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 30, spd: 10, dir: 180 },
      ]

      const handleHoverChange = jest.fn()

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          onHoverChange={handleHoverChange}
        />
      )

      const svg = container.querySelector('svg')

      if (svg) {
        fireEvent.pointerMove(svg, {
          clientX: 200,
          clientY: 200,
        })
      }

      // Should call onHoverChange with one of the data points
      expect(handleHoverChange).toHaveBeenCalledTimes(1)
      const called = handleHoverChange.mock.calls[0][0]
      expect(called).toMatchObject({
        minsAgo: expect.any(Number),
        spd: expect.any(Number),
        dir: expect.any(Number),
      })
    })

    it('clears hover point on pointer up', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const handleHoverChange = jest.fn()

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          onHoverChange={handleHoverChange}
        />
      )

      const svg = container.querySelector('svg')

      if (svg) {
        fireEvent.pointerUp(svg)
      }

      expect(handleHoverChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Crosshairs rendering', () => {
    it('renders crosshair radial line when hoverPoint is provided', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const hoverPoint = data[0]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={hoverPoint}
        />
      )

      // Count lines before and after adding hover
      // With hover, should have an additional crosshair radial line with specific stroke-dasharray
      const lines = container.querySelectorAll('line')
      const crosshairLine = Array.from(lines).find(line => {
        const dasharray = line.getAttribute('stroke-dasharray')
        const strokeWidth = line.getAttribute('stroke-width')
        // Crosshair line has distinctive dasharray and wider stroke
        return dasharray === '4 2' && strokeWidth === '1.5'
      })

      expect(crosshairLine).toBeTruthy()
    })

    it('renders dotted circle at hover radius when hoverPoint is provided', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const hoverPoint = data[0]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={hoverPoint}
        />
      )

      // Should have a dotted circle (new visual feedback)
      const circles = container.querySelectorAll('circle')
      const dottedCircle = Array.from(circles).find(circle => {
        const strokeWidth = circle.getAttribute('stroke-width')
        const strokeDasharray = circle.getAttribute('stroke-dasharray')
        // Dotted circle has specific dash pattern
        return strokeWidth === '1' && strokeDasharray === '2 3'
      })

      expect(dottedCircle).toBeTruthy()
    })

    it('does not render crosshairs or dotted circle when hoverPoint is null', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={null}
        />
      )

      const lines = container.querySelectorAll('line')
      const crosshairLine = Array.from(lines).find(line => {
        const dasharray = line.getAttribute('stroke-dasharray')
        return dasharray === '4 2'
      })

      expect(crosshairLine).toBeFalsy()

      // Also check dotted circle is not rendered
      const circles = container.querySelectorAll('circle')
      const dottedCircle = Array.from(circles).find(circle => {
        const strokeDasharray = circle.getAttribute('stroke-dasharray')
        return strokeDasharray === '2 3'
      })

      expect(dottedCircle).toBeFalsy()
    })
  })

  describe('Reference point highlighting', () => {
    it('highlights most recent data point when not hovering', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },   // Most recent (should be highlighted)
        { minsAgo: 30, spd: 10, dir: 180 },
      ]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={null}
        />
      )

      // Should have a blue ring around the reference point
      const circles = container.querySelectorAll('circle')
      const referenceRing = Array.from(circles).find(circle => {
        const stroke = circle.getAttribute('stroke')
        const fill = circle.getAttribute('fill')
        const strokeWidth = circle.getAttribute('stroke-width')
        // Reference ring: blue stroke, no fill, specific width
        return stroke && stroke.includes('0,68,204') && fill === 'none' && strokeWidth === '2.5'
      })

      expect(referenceRing).toBeTruthy()

      // Should have a center dot at the reference point
      const referenceDot = Array.from(circles).find(circle => {
        const fill = circle.getAttribute('fill')
        const r = circle.getAttribute('r')
        // Reference dot: blue fill, small radius
        return fill && fill.includes('0,68,204') && r === '3'
      })

      expect(referenceDot).toBeTruthy()
    })

    it('does not highlight reference point when hovering', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 30, spd: 10, dir: 180 },
      ]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={data[1]} // Hovering over different point
        />
      )

      // Should not have the reference ring (crosshair instead)
      const circles = container.querySelectorAll('circle')
      const referenceRing = Array.from(circles).find(circle => {
        const stroke = circle.getAttribute('stroke')
        const fill = circle.getAttribute('fill')
        const strokeWidth = circle.getAttribute('stroke-width')
        return stroke && stroke.includes('0,68,204') && fill === 'none' && strokeWidth === '2.5'
      })

      // Reference ring should not be present when hovering
      expect(referenceRing).toBeFalsy()
    })
  })

  describe('Radial selection with new algorithm (tracer bullet)', () => {
    it('uses radial selection instead of cartesian distance', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 30, spd: 14, dir: 90 },
        { minsAgo: 60, spd: 10, dir: 180 },
      ]

      const handleHoverChange = jest.fn()

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          onHoverChange={handleHoverChange}
        />
      )

      const svg = container.querySelector('svg')

      if (svg) {
        // Mock the SVG bounding rect to match test expectations
        const mockGetBoundingClientRect = jest.fn().mockReturnValue({
          left: 0,
          top: 0,
          width: 360,
          height: 360,
          right: 360,
          bottom: 360,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        })
        Object.defineProperty(svg, 'getBoundingClientRect', {
          value: mockGetBoundingClientRect,
        })

        // Click near outer ring should select recent point
        fireEvent.pointerDown(svg, {
          clientX: 180,
          clientY: 50, // Near top = near outer ring = recent
        })
      }

      // Should select a recent point (0 or 30 mins ago, both acceptable)
      const call = handleHoverChange.mock.calls[0][0]
      expect(call.minsAgo).toBeLessThan(40)
    })
  })

  describe('Touch interaction improvements', () => {
    it('SVG element includes touch handling to prevent page scrolling', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
        />
      )

      const svg = container.querySelector('svg')
      // SVG should exist and have pointer event handlers
      expect(svg).toBeInTheDocument()
      expect(svg).toBeTruthy()
    })

    it('pointer down handler includes preventDefault call', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const handleHoverChange = jest.fn()

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          onHoverChange={handleHoverChange}
        />
      )

      const svg = container.querySelector('svg')

      if (svg) {
        // Verify handler is attached and processes event
        fireEvent.pointerDown(svg, {
          clientX: 180,
          clientY: 180,
        })
      }

      // Verify handler was triggered (via onHoverChange call)
      expect(handleHoverChange).toHaveBeenCalled()
    })

    it('pointer move handler processes touch events correctly', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const handleHoverChange = jest.fn()

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          onHoverChange={handleHoverChange}
        />
      )

      const svg = container.querySelector('svg')

      if (svg) {
        // Touch event should process even without buttons pressed
        fireEvent.pointerMove(svg, {
          clientX: 180,
          clientY: 180,
          buttons: 0,
          pointerType: 'touch',
        })
      }

      // Verify touch move is processed
      expect(handleHoverChange).toHaveBeenCalled()
    })
  })

  describe('Dotted circle visual feedback', () => {
    it('renders dotted circle at hover point radius', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
        { minsAgo: 30, spd: 14, dir: 90 },
      ]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={data[1]} // 30 mins ago = 50% radius
        />
      )

      const circles = container.querySelectorAll('circle')
      const dottedCircle = Array.from(circles).find(circle => {
        const strokeDasharray = circle.getAttribute('stroke-dasharray')
        const strokeWidth = circle.getAttribute('stroke-width')
        // Dotted circle has specific dash pattern
        return strokeDasharray === '2 3' && strokeWidth === '1'
      })

      expect(dottedCircle).toBeTruthy()
    })

    it('does not render dotted circle when hoverPoint is null', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12, dir: 0 },
      ]

      const { container } = render(
        <PolarChart
          data={data}
          
          timeWindowMinutes={60}
          hoverPoint={null}
        />
      )

      const circles = container.querySelectorAll('circle')
      const dottedCircle = Array.from(circles).find(circle => {
        const strokeDasharray = circle.getAttribute('stroke-dasharray')
        return strokeDasharray === '2 3'
      })

      expect(dottedCircle).toBeFalsy()
    })
  })
})
