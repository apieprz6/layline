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

  describe('SVG structure', () => {
    it('renders SVG with 360x360 viewBox', () => {
      render(<PolarChart data={mockData} buoyId="CHII2" />)

      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute('viewBox', '0 0 360 360')
    })
  })

  describe('Compass labels', () => {
    it('renders cardinal direction labels (N, E, S, W)', () => {
      render(<PolarChart data={mockData} buoyId="CHII2" />)

      expect(screen.getByText('N')).toBeInTheDocument()
      expect(screen.getByText('E')).toBeInTheDocument()
      expect(screen.getByText('S')).toBeInTheDocument()
      expect(screen.getByText('W')).toBeInTheDocument()
    })

    it('renders intercardinal direction labels (NE, SE, SW, NW)', () => {
      render(<PolarChart data={mockData} buoyId="CHII2" />)

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

      const { container } = render(<PolarChart data={data} buoyId="CHII2" />)

      // Should have circles for data points
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBeGreaterThan(0)
    })

    it('applies wind speed color to data points', () => {
      const data: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 7, dir: 0 },   // Light air (#007A52)
        { minsAgo: 10, spd: 12, dir: 45 }, // Medium air (#0055BB)
      ]

      const { container } = render(<PolarChart data={data} buoyId="CHII2" />)

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

      const { container } = render(<PolarChart data={data} buoyId="CHII2" />)

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

      const { container } = render(<PolarChart data={data} buoyId="CHII2" />)

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
      render(<PolarChart data={mockData} buoyId="CHII2" />)

      // Should show text about 85ft elevation
      expect(screen.getByText(/85ft/i)).toBeInTheDocument()
    })

    it('does not show elevation reminder for other buoys', () => {
      render(<PolarChart data={mockData} buoyId="45198" />)

      // Should not show 85ft text
      expect(screen.queryByText(/85ft/i)).not.toBeInTheDocument()
    })
  })
})
