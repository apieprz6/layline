import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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
        <PolarChart data={sparseData} buoyId="CHII2" timeWindowMinutes={30} />
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
        <PolarChart data={currentData} buoyId="CHII2" timeWindowMinutes={30} />
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
        <PolarChart data={dataWithOldPoints} buoyId="CHII2" timeWindowMinutes={30} />
      )

      // Should only render 2 data points, not 3
      const circles = container.querySelectorAll('circle[fill="#0055BB"], circle[fill="#007A52"], circle[fill="#C47000"], circle[fill="#CC1100"]')
      expect(circles.length).toBeLessThanOrEqual(2)
    })
  })

  describe('SVG structure', () => {
    it('renders SVG with 360x360 viewBox', () => {
      render(<PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={60} />)

      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 360 360')
    })
  })

  describe('Radial rings at tick intervals', () => {
    it('renders rings at tick positions for 30m scale', () => {
      const { container } = render(
        <PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={30} />
      )

      // 30m scale should have 7 rings: [0, 5, 10, 15, 20, 25, 30]
      const circles = container.querySelectorAll('circle')
      // Filter for radial ring circles (not data points, not center dot)
      const ringCircles = Array.from(circles).filter(c => {
        const fill = c.getAttribute('fill')
        const stroke = c.getAttribute('stroke')
        // Rings have fill="none" and stroke with rgba
        return fill === 'none' && stroke && stroke.includes('rgba')
      })

      expect(ringCircles.length).toBe(7)
    })

    it('renders rings at tick positions for 1h scale', () => {
      const { container } = render(
        <PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={60} />
      )

      const circles = container.querySelectorAll('circle')
      const ringCircles = Array.from(circles).filter(c => {
        const fill = c.getAttribute('fill')
        const stroke = c.getAttribute('stroke')
        return fill === 'none' && stroke && stroke.includes('rgba')
      })

      // 1h scale should have 5 rings: [0, 15, 30, 45, 60]
      expect(ringCircles.length).toBe(5)
    })

    it('renders outer ring with stronger styling', () => {
      const { container } = render(
        <PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={30} />
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
        <PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={30} />
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
      render(<PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={30} />)

      expect(screen.getByText('now')).toBeInTheDocument()
    })

    it('renders time offset labels with proper format', () => {
      const { container } = render(
        <PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={60} />
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
        <PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={30} />
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
      render(<PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={60} />)

      expect(screen.getByText('N')).toBeInTheDocument()
      expect(screen.getByText('E')).toBeInTheDocument()
      expect(screen.getByText('S')).toBeInTheDocument()
      expect(screen.getByText('W')).toBeInTheDocument()
    })

    it('renders intercardinal direction labels (NE, SE, SW, NW)', () => {
      render(<PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={60} />)

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

      const { container } = render(<PolarChart data={data} buoyId="CHII2" timeWindowMinutes={360} />)

      // Should have circles for data points
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBeGreaterThan(0)
    })

    it('applies wind speed color to data points', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 7, dir: 0 },   // Light air (#007A52)
        { minsAgo: 10, spd: 12, dir: 45 }, // Medium air (#0055BB)
      ]

      const { container } = render(<PolarChart data={data} buoyId="CHII2" timeWindowMinutes={60} />)

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

      const { container } = render(<PolarChart data={data} buoyId="CHII2" timeWindowMinutes={60} />)

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

      const { container } = render(<PolarChart data={data} buoyId="CHII2" timeWindowMinutes={60} />)

      // Should have 1 line segment (20→10), not 2 (0→10 should be skipped)
      const lines = container.querySelectorAll('line[stroke]')
      const dataLines = Array.from(lines).filter(line => {
        const stroke = line.getAttribute('stroke')
        return stroke && stroke.match(/^#[0-9A-F]{6}$/i)
      })
      expect(dataLines.length).toBe(1)
    })
  })

  describe('CHII2 elevation reminder', () => {
    it('shows 85ft elevation reminder for CHII2 buoy', () => {
      render(<PolarChart data={mockData} buoyId="CHII2" timeWindowMinutes={60} />)

      // Should show text about 85ft elevation
      expect(screen.getByText(/85ft/i)).toBeInTheDocument()
    })

    it('does not show elevation reminder for other buoys', () => {
      render(<PolarChart data={mockData} buoyId="45198" timeWindowMinutes={60} />)

      // Should not show 85ft text
      expect(screen.queryByText(/85ft/i)).not.toBeInTheDocument()
    })
  })
})
