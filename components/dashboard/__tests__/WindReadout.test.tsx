import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import WindReadout from '../WindReadout'
import type { MinuteDataPoint } from '@/types'

describe('WindReadout', () => {
  describe('Wind direction display', () => {
    it('displays wind direction with degrees and compass notation', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 235, // SW
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

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

      render(<WindReadout point={point} buoyId="CHII2" />)

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

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText(/11\.5/)).toBeInTheDocument()
      expect(screen.getByText(/kts/)).toBeInTheDocument()
    })

    it('applies correct color for light air condition', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 7, // Light air
        dir: 180,
      }

      const { container } = render(<WindReadout point={point} buoyId="CHII2" />)

      // Should have element with light air color
      const element = container.querySelector('[style*="--wind-light"]')
      expect(element).toBeTruthy()
    })

    it('applies correct color for medium air condition', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12, // Medium air
        dir: 180,
      }

      const { container } = render(<WindReadout point={point} buoyId="CHII2" />)

      const element = container.querySelector('[style*="--wind-medium"]')
      expect(element).toBeTruthy()
    })
  })

  describe('Wind condition label', () => {
    it('displays Light condition with matching color', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 7,
        dir: 180,
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText('Light')).toBeInTheDocument()
    })

    it('displays Medium condition with matching color', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText('Medium')).toBeInTheDocument()
    })

    it('displays Heavy condition with matching color', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 18,
        dir: 180,
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText('Heavy')).toBeInTheDocument()
    })

    it('displays Storm condition with matching color', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 25,
        dir: 180,
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText('Storm')).toBeInTheDocument()
    })
  })

  describe('Timestamp display', () => {
    it('displays "now" for current data point', () => {
      const point: MinuteDataPoint = {
        minsAgo: 0,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText(/now/i)).toBeInTheDocument()
    })

    it('displays minutes ago for past data points', () => {
      const point: MinuteDataPoint = {
        minsAgo: 15,
        spd: 12,
        dir: 180,
      }

      render(<WindReadout point={point} buoyId="CHII2" />)

      expect(screen.getByText(/15.*ago/i)).toBeInTheDocument()
    })
  })
})
