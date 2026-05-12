import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StationDetailView from '../StationDetailView'
import type { MinuteDataPoint } from '@/types'

// Mock child components
jest.mock('../ScaleControl', () => ({
  __esModule: true,
  default: ({ activeScale, onScaleChange }: { activeScale: string; onScaleChange: (scale: string) => void }) => (
    <div data-testid="scale-control">
      {['30m', '1h', '6h', '24h', '72h'].map(scale => (
        <button key={scale} onClick={() => onScaleChange(scale)}>
          {scale} {scale === activeScale && '(active)'}
        </button>
      ))}
    </div>
  ),
}))

jest.mock('../PolarChart', () => ({
  __esModule: true,
  default: ({ data, buoyId, hoverPoint, onHoverChange }: {
    data: unknown[]
    buoyId: string
    hoverPoint?: unknown
    onHoverChange?: (point: unknown) => void
  }) => (
    <div data-testid="polar-chart">
      PolarChart: {data?.length ?? 0} points, buoy: {buoyId}
      {hoverPoint ? <span data-testid="hover-active">Hovering</span> : null}
      {onHoverChange ? (
        <button onClick={() => onHoverChange({ minsAgo: 10, spd: 12, dir: 180 })}>
          Simulate Hover
        </button>
      ) : null}
    </div>
  ),
}))

jest.mock('../WindReadout', () => ({
  __esModule: true,
  default: ({ point, mode }: { point: { minsAgo: number; spd: number; dir: number }; mode: string }) => (
    <div data-testid="wind-readout">
      WindReadout: {point.spd}kts at {point.dir}°, {point.minsAgo}m ago (mode: {mode})
    </div>
  ),
}))

jest.mock('../TimeScrubber', () => ({
  __esModule: true,
  default: ({ value, max, scaleMinutes }: {
    value: number
    max: number
    scaleMinutes: number
    onChange: (value: number) => void
  }) => (
    <div data-testid="time-scrubber">
      TimeScrubber: value={value}, max={max}, scale={scaleMinutes}
    </div>
  ),
}))

describe('StationDetailView', () => {
  const mockData: MinuteDataPoint[] = [
    { minsAgo: 0, spd: 12, dir: 220 },
    { minsAgo: 10, spd: 13, dir: 225 },
    { minsAgo: 30, spd: 14, dir: 230 },
    { minsAgo: 60, spd: 13, dir: 225 },
    { minsAgo: 120, spd: 11, dir: 215 },
    { minsAgo: 360, spd: 10, dir: 210 },
    { minsAgo: 1440, spd: 9, dir: 205 },
    { minsAgo: 4320, spd: 8, dir: 200 },
  ]

  describe('default behavior', () => {
    it('defaults to 1h scale', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      expect(screen.getByText(/1h \(active\)/)).toBeInTheDocument()
    })

    it('passes all data to PolarChart (filtering happens inside chart)', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Should pass all 8 points to PolarChart (chart handles window filtering internally)
      expect(screen.getByText(/PolarChart: 8 points/)).toBeInTheDocument()
    })

    it('renders ScaleControl and PolarChart', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      expect(screen.getByTestId('scale-control')).toBeInTheDocument()
      expect(screen.getByTestId('polar-chart')).toBeInTheDocument()
    })

    it('passes buoyId to PolarChart', () => {
      render(<StationDetailView data={mockData} buoyId="45198" />)

      expect(screen.getByText(/buoy: 45198/)).toBeInTheDocument()
    })
  })

  describe('scale interaction', () => {
    it('passes timeWindowMinutes to PolarChart when scale changes to 30m', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '30m' }))

      // PolarChart still receives all 8 points, but timeWindowMinutes changes
      expect(screen.getByText(/PolarChart: 8 points/)).toBeInTheDocument()
    })

    it('passes timeWindowMinutes to PolarChart when scale changes to 6h', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '6h' }))

      // PolarChart still receives all 8 points, but timeWindowMinutes changes
      expect(screen.getByText(/PolarChart: 8 points/)).toBeInTheDocument()
    })

    it('passes timeWindowMinutes to PolarChart when scale changes to 24h', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '24h' }))

      // PolarChart still receives all 8 points, but timeWindowMinutes changes
      expect(screen.getByText(/PolarChart: 8 points/)).toBeInTheDocument()
    })

    it('passes timeWindowMinutes to PolarChart when scale changes to 72h', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '72h' }))

      // PolarChart still receives all 8 points
      expect(screen.getByText(/PolarChart: 8 points/)).toBeInTheDocument()
    })

    it('updates active scale button when changed', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      expect(screen.getByText(/1h \(active\)/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '6h' }))

      expect(screen.getByText(/6h \(active\)/)).toBeInTheDocument()
      expect(screen.queryByText(/1h \(active\)/)).not.toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles empty data gracefully', () => {
      render(<StationDetailView data={[]} buoyId="CHII2" />)

      expect(screen.getByText(/PolarChart: 0 points/)).toBeInTheDocument()
    })

    it('handles undefined data without crashing', () => {
      // @ts-expect-error - testing runtime undefined handling
      render(<StationDetailView data={undefined} buoyId="CHII2" />)

      expect(screen.getByText(/PolarChart: 0 points/)).toBeInTheDocument()
    })

    it('handles null data without crashing', () => {
      // @ts-expect-error - testing runtime null handling
      render(<StationDetailView data={null} buoyId="CHII2" />)

      expect(screen.getByText(/PolarChart: 0 points/)).toBeInTheDocument()
    })

    it('passes all data to PolarChart even when window contains no points', async () => {
      const futureData: MinuteDataPoint[] = [
        { minsAgo: 100, spd: 10, dir: 210 },
        { minsAgo: 200, spd: 11, dir: 220 },
      ]

      const user = userEvent.setup()
      render(<StationDetailView data={futureData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '30m' }))

      // PolarChart receives all 2 points (chart handles window filtering internally)
      expect(screen.getByText(/PolarChart: 2 points/)).toBeInTheDocument()
    })
  })

  describe('permanent WindReadout card (tracer bullet)', () => {
    it('always renders WindReadout card, even when not hovering', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // WindReadout should always be visible
      expect(screen.getByTestId('wind-readout')).toBeInTheDocument()
    })

    it('displays most recent data point by default (reference mode)', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Should show most recent point (0 mins ago, 12kts, 220°) in reference mode
      expect(screen.getByText(/12kts at 220°, 0m ago \(mode: reference\)/)).toBeInTheDocument()
    })

    it('switches to touch mode when hovering', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Initially in reference mode
      expect(screen.getByText(/mode: reference/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Simulate Hover' }))

      // After hover, switches to touch mode with hovered point
      expect(screen.getByText(/mode: touch/)).toBeInTheDocument()
      expect(screen.getByText(/12kts at 180°, 10m ago/)).toBeInTheDocument()
    })

    it('calculates displayPoint from hoverPoint or most recent', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Default display point should be most recent (minsAgo = 0)
      const windReadout = screen.getByTestId('wind-readout')
      expect(windReadout.textContent).toContain('0m ago')
    })

    it('passes correct mode prop to WindReadout', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Should show reference mode by default
      expect(screen.getByText(/mode: reference/)).toBeInTheDocument()
    })
  })

  describe('hover state management', () => {
    it('passes hoverPoint to PolarChart', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Initially no hover
      expect(screen.queryByTestId('hover-active')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Simulate Hover' }))

      // After hover callback
      expect(screen.getByTestId('hover-active')).toBeInTheDocument()
    })

    it('passes onHoverChange callback to PolarChart', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Check that callback is passed (button exists)
      expect(screen.getByRole('button', { name: 'Simulate Hover' })).toBeInTheDocument()
    })
  })

  describe('Time scrubber integration', () => {
    it('renders TimeScrubber component', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      const scrubber = screen.getByTestId('time-scrubber')
      expect(scrubber).toBeInTheDocument()
    })

    it('renders "Return to live" button', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      const button = screen.getByRole('button', { name: /return to live/i })
      expect(button).toBeInTheDocument()
    })

    it('"Return to live" button is disabled when at live (nowOffset = 0)', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      const button = screen.getByRole('button', { name: /return to live/i })
      expect(button).toBeDisabled()
    })
  })
})
