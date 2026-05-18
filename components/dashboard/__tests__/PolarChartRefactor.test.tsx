import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import PolarChart from '../PolarChart'
import type { MinuteDataPoint } from '@/types'

// Mock SVG getBoundingClientRect for overlay positioning
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, 'getBoundingClientRect', {
    writable: true,
    value: jest.fn().mockReturnValue({
      width: 360,
      height: 360,
      top: 0,
      left: 0,
      right: 360,
      bottom: 360,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  })
})

describe('PolarChart - Card Refactor (LAY-34)', () => {
  const mockData: MinuteDataPoint[] = [
    { minsAgo: 0, spd: 12, dir: 180 },
    { minsAgo: 10, spd: 14, dir: 185 },
    { minsAgo: 20, spd: 11, dir: 175 },
  ]

  const displayPoint: MinuteDataPoint = mockData[0]

  describe('Card structure', () => {
    it('renders complete card structure with header, SVG, and footer', () => {
      const { container } = render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={displayPoint}
          mode="reference"
        />
      )

      // Should have a card wrapper div with proper styling
      const cardDiv = container.firstChild as HTMLElement
      expect(cardDiv).toHaveStyle({
        background: 'var(--surface-raised)',
        borderRadius: '12px',
      })

      // Should still contain the SVG
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // Should have header section
      expect(screen.getByText(/at reference/i)).toBeInTheDocument()

      // Should have footer section
      expect(screen.getByText(/0° N · CW/i)).toBeInTheDocument()
    })
  })

  describe('Header', () => {
    it('shows "At reference" in gray when mode is reference', () => {
      render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={displayPoint}
          mode="reference"
        />
      )

      const label = screen.getByText('At reference')
      expect(label).toBeInTheDocument()
    })

    it('shows "● At touch" in accent color when mode is touch', () => {
      render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={displayPoint}
          mode="touch"
        />
      )

      const label = screen.getByText('● At touch')
      expect(label).toBeInTheDocument()
    })

    it('displays timestamp in HH:MM · offset format when displayPoint is provided', () => {
      const pointWithTime: MinuteDataPoint = {
        minsAgo: 30,
        spd: 12,
        dir: 180,
      }

      const { container } = render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={pointWithTime}
          mode="reference"
        />
      )

      // Should have timestamp format with dot separator
      // Looking for pattern like "19:42 · −30m"
      const timestampElements = container.querySelectorAll('span[style*="font-mono"]')
      const hasTimestamp = Array.from(timestampElements).some((el) => {
        const text = el.textContent || ''
        return text.includes('·') && text.includes('m')
      })
      expect(hasTimestamp).toBe(true)
    })
  })

  describe('Overlays', () => {
    it('renders left overlay with direction numerals and compass heading', async () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180, // South
      }

      render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={point}
          mode="reference"
        />
      )

      // Wait for overlays to render after SVG dimensions are measured
      // Should show direction in degrees
      await waitFor(() => expect(screen.getByText('180°')).toBeInTheDocument())

      // Should show "Direction" label
      expect(screen.getByText('Direction')).toBeInTheDocument()

      // Should show compass heading in the overlay (not just the chart)
      const directionLabel = screen.getByText('Direction')
      const overlay = directionLabel.closest('div[style*="position: absolute"]')
      expect(overlay).toBeInTheDocument()
      expect(overlay?.textContent).toContain('S')
    })

    it('renders right overlay with speed numerals and condition label', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12, // Medium air
        dir: 180,
      }

      render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={point}
          mode="reference"
        />
      )

      // Should show speed with 1 decimal
      expect(screen.getByText('12.0')).toBeInTheDocument()

      // Should show units
      expect(screen.getByText('kts')).toBeInTheDocument()

      // Should show condition label (Medium for 12 kts)
      expect(screen.getByText('Medium')).toBeInTheDocument()
    })

    it('colors speed numerals based on wind condition', async () => {
      const lightAirPoint: MinuteDataPoint = {
        minsAgo: 0,
        spd: 7, // Light air
        dir: 180,
      }

      render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={lightAirPoint}
          mode="reference"
        />
      )

      // Wait for overlays to render after SVG dimensions are measured
      // Speed text should have wind condition color
      // Light air = #007A52
      const speedText = await waitFor(() => screen.getByText('7.0'))
      expect(speedText).toHaveStyle({ color: '#007A52' })
    })

    it('overlays are positioned absolutely over the chart', async () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      const { container } = render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={point}
          mode="reference"
        />
      )

      // Wait for overlays to render after SVG dimensions are measured
      await waitFor(() => {
        const overlays = container.querySelectorAll('[style*="position: absolute"]')
        expect(overlays.length).toBeGreaterThan(0)
      })
    })
  })

  describe('CHII2 elevation note removal', () => {
    it('does NOT render CHII2 elevation note for CHII2 buoy (moved to Legend tab)', () => {
      render(
        <PolarChart
          data={mockData}
          buoyId="CHII2"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={displayPoint}
          mode="reference"
        />
      )

      // Should NOT show 85ft elevation text (removed from this component)
      expect(screen.queryByText(/85ft/i)).not.toBeInTheDocument()
    })

    it('does not render elevation note for other buoys', () => {
      render(
        <PolarChart
          data={mockData}
          buoyId="45198"
          timeWindowMinutes={60}
          nowOffsetMinutes={0}
          displayPoint={displayPoint}
          mode="reference"
        />
      )

      // Should not show 85ft text
      expect(screen.queryByText(/85ft/i)).not.toBeInTheDocument()
    })
  })
})
