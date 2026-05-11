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
      PolarChart: {data.length} points, buoy: {buoyId}
      {hoverPoint && <span data-testid="hover-active">Hovering</span>}
      {onHoverChange && (
        <button onClick={() => onHoverChange({ minsAgo: 10, spd: 12, dir: 180 })}>
          Simulate Hover
        </button>
      )}
    </div>
  ),
}))

jest.mock('../WindReadout', () => ({
  __esModule: true,
  default: ({ point }: { point: { minsAgo: number; spd: number; dir: number } }) => (
    <div data-testid="wind-readout">
      WindReadout: {point.spd}kts at {point.dir}°, {point.minsAgo}m ago
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

    it('filters data to 1h window by default', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      // Should show 4 points (0, 10, 30, 60 minutes ago)
      expect(screen.getByText(/PolarChart: 4 points/)).toBeInTheDocument()
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
    it('updates filtered data when scale changes to 30m', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '30m' }))

      // Should show 3 points (0, 10, 30 minutes ago)
      expect(screen.getByText(/PolarChart: 3 points/)).toBeInTheDocument()
    })

    it('updates filtered data when scale changes to 6h', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '6h' }))

      // Should show 6 points (0, 10, 30, 60, 120, 360 minutes ago)
      expect(screen.getByText(/PolarChart: 6 points/)).toBeInTheDocument()
    })

    it('updates filtered data when scale changes to 24h', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '24h' }))

      // Should show 7 points (all except 4320)
      expect(screen.getByText(/PolarChart: 7 points/)).toBeInTheDocument()
    })

    it('shows all data on 72h scale', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '72h' }))

      // Should show all 8 points
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

    it('handles data with no points in selected window', async () => {
      const futureData: MinuteDataPoint[] = [
        { minsAgo: 100, spd: 10, dir: 210 },
        { minsAgo: 200, spd: 11, dir: 220 },
      ]

      const user = userEvent.setup()
      render(<StationDetailView data={futureData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: '30m' }))

      expect(screen.getByText(/PolarChart: 0 points/)).toBeInTheDocument()
    })
  })

  describe('hover state management', () => {
    it('does not show WindReadout when no point is hovered', () => {
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      expect(screen.queryByTestId('wind-readout')).not.toBeInTheDocument()
    })

    it('shows WindReadout when a point is hovered', async () => {
      const user = userEvent.setup()
      render(<StationDetailView data={mockData} buoyId="CHII2" />)

      await user.click(screen.getByRole('button', { name: 'Simulate Hover' }))

      expect(screen.getByTestId('wind-readout')).toBeInTheDocument()
      expect(screen.getByText(/12kts at 180°/)).toBeInTheDocument()
    })

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
})
