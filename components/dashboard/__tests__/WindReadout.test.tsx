import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import WindReadout from '../WindReadout'
import type { MinuteDataPoint } from '@/types'

describe('WindReadout', () => {
  describe('Mode display (tracer bullet)', () => {
    it('displays "At Reference" label when mode is reference', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText('At Reference')).toBeInTheDocument()
    })

    it('displays "At Touch" label when mode is touch', () => {
      const point: MinuteDataPoint = {
        minsAgo: 30,
        spd: 14,
        dir: 90,
      }

      render(<WindReadout point={point} mode="touch" buoyId="CHII2" />)

      expect(screen.getByText('At Touch')).toBeInTheDocument()
    })
  })

  describe('Wind direction display', () => {
    it('displays wind direction with degrees and compass notation', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 235, // SW
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      // Should show "235° SW"
      expect(screen.getByText(/235°/)).toBeInTheDocument()
      expect(screen.getByText(/SW/)).toBeInTheDocument()
    })

    it('displays North direction correctly', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 0,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText(/0°/)).toBeInTheDocument()
      expect(screen.getByText(/N/)).toBeInTheDocument()
    })
  })

  describe('Wind speed display', () => {
    it('displays wind speed with kts unit', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 11.5,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText(/11\.5/)).toBeInTheDocument()
      expect(screen.getByText(/kts/)).toBeInTheDocument()
    })

    it('applies correct color based on wind condition', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12, // Medium air
        dir: 180,
      }

      const { container } = render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      // Should have colored wind speed (uses getWindColorHex)
      // Find the speed value span and check its color
      const speedSpan = screen.getByText('12')
      expect(speedSpan).toHaveStyle({ color: '#0055BB' })
    })
  })

  describe('Wind condition badge', () => {
    it('displays Light condition badge below speed', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 7,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText('Light')).toBeInTheDocument()
    })

    it('displays Medium condition badge below speed', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText('Medium')).toBeInTheDocument()
    })

    it('displays Heavy condition badge below speed', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 18,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText('Heavy')).toBeInTheDocument()
    })

    it('displays Storm condition badge below speed', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 25,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      expect(screen.getByText('Storm')).toBeInTheDocument()
    })
  })

  describe('Timestamp and time offset display', () => {
    // Mock Date for consistent timestamp testing
    beforeAll(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-05-11T19:42:00'))
    })

    afterAll(() => {
      jest.useRealTimers()
    })

    it('displays timestamp in HH:MM format with "now" offset for current point', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      // Should show "19:42 · now"
      expect(screen.getByText(/19:42/)).toBeInTheDocument()
      expect(screen.getByText(/now/)).toBeInTheDocument()
    })

    it('displays timestamp with minute offset for past points', () => {
      const point: MinuteDataPoint = {
        minsAgo: 5,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} mode="touch" buoyId="CHII2" />)

      // Should show "19:37 · −5m"
      expect(screen.getByText(/19:37/)).toBeInTheDocument()
      expect(screen.getByText(/−5m/)).toBeInTheDocument()
    })

    it('displays timestamp with hour offset for older points', () => {
      const point: MinuteDataPoint = {
        minsAgo: 90,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} mode="touch" buoyId="CHII2" />)

      // Should show "18:12 · −1.5h"
      expect(screen.getByText(/18:12/)).toBeInTheDocument()
      expect(screen.getByText(/−1\.5h/)).toBeInTheDocument()
    })
  })

  describe('Two-column layout', () => {
    it('renders direction on left and speed on right', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      const { container } = render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      // Check for grid layout
      const gridElement = container.querySelector('[style*="grid"]')
      expect(gridElement).toBeTruthy()
    })

    it('includes vertical divider between columns', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      const { container } = render(<WindReadout point={point} mode="reference" buoyId="CHII2" />)

      // Check for divider element
      const divider = container.querySelector('[style*="border-right"]')
      expect(divider).toBeTruthy()
    })
  })
})
