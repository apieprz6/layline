import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TabbedInfoPanel from '../TabbedInfoPanel'
import type { WindDataPoint } from '@/types'

// Reference time for tests
const referenceTime = new Date('2026-05-19T18:00:00Z')

// Mock WindowStats component since it's tested separately
jest.mock('../WindowStats', () => {
  return function MockWindowStats(props: {
    data: WindDataPoint[]
    timeWindowMinutes: number
    nowOffsetMinutes: number
    referenceTime?: Date
  }) {
    return (
      <div data-testid="window-stats">
        WindowStats
        <span data-testid="window-stats-props">{JSON.stringify(props)}</span>
      </div>
    )
  }
})

const mockData: WindDataPoint[] = [
  { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 220 }, // now
  { timestamp: '2026-05-19T17:50:00Z', spd: 14, dir: 225 }, // 10 mins ago
  { timestamp: '2026-05-19T17:40:00Z', spd: 13, dir: 230 }, // 20 mins ago
]

const defaultProps = {
  data: mockData,
  timeWindowMinutes: 60,
  nowOffsetMinutes: 0,
  referenceTime,
  onOffsetChange: jest.fn(),
  buoyId: 'CHII2',
  maxOffsetMinutes: 4320, // 72 hours
}

describe('TabbedInfoPanel', () => {
  it('renders with Stats tab active by default', () => {
    render(<TabbedInfoPanel {...defaultProps} />)

    // Stats tab button should be active
    const statsTab = screen.getByRole('button', { name: /stats/i })
    expect(statsTab).toHaveClass('active')

    // WindowStats component should be visible
    expect(screen.getByTestId('window-stats')).toBeInTheDocument()
  })

  it('switches tabs when clicked', async () => {
    const user = userEvent.setup()
    render(<TabbedInfoPanel {...defaultProps} />)

    // Initially Stats tab is active
    expect(screen.getByTestId('window-stats')).toBeInTheDocument()

    // Click Jump to tab
    const jumpTab = screen.getByRole('button', { name: /jump to/i })
    await user.click(jumpTab)

    // Stats content should be gone, Jump content should appear
    expect(screen.queryByTestId('window-stats')).not.toBeInTheDocument()
    // Jump to tab should have navigation buttons
    expect(screen.getByRole('button', { name: /live/i })).toBeInTheDocument()

    // Click Legend tab
    const legendTab = screen.getByRole('button', { name: /legend/i })
    await user.click(legendTab)

    // Jump content should be gone
    expect(screen.queryByRole('button', { name: /live/i })).not.toBeInTheDocument()
    // Legend content should appear (check for wind condition bands)
    expect(screen.getByText(/light/i)).toBeInTheDocument()
  })

  it('calls onOffsetChange with correct clamped values when Jump to buttons are clicked', async () => {
    const user = userEvent.setup()
    const mockOnOffsetChange = jest.fn()

    render(
      <TabbedInfoPanel
        {...defaultProps}
        onOffsetChange={mockOnOffsetChange}
      />
    )

    // Switch to Jump to tab
    const jumpTab = screen.getByRole('button', { name: /jump to/i })
    await user.click(jumpTab)

    // Test each button
    await user.click(screen.getByRole('button', { name: /^live$/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(0)

    await user.click(screen.getByRole('button', { name: /30m ago/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(30)

    await user.click(screen.getByRole('button', { name: /1h ago/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(60)

    await user.click(screen.getByRole('button', { name: /6h ago/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(360)

    await user.click(screen.getByRole('button', { name: /yesterday/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(1440)

    await user.click(screen.getByRole('button', { name: /2d ago/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(2880)
  })

  it('clamps Jump to button values to maxOffsetMinutes', async () => {
    const user = userEvent.setup()
    const mockOnOffsetChange = jest.fn()

    // Only 1 hour of data available
    render(
      <TabbedInfoPanel
        {...defaultProps}
        onOffsetChange={mockOnOffsetChange}
        maxOffsetMinutes={60}
      />
    )

    // Switch to Jump to tab
    const jumpTab = screen.getByRole('button', { name: /jump to/i })
    await user.click(jumpTab)

    // Buttons should clamp to maxOffsetMinutes (60)
    await user.click(screen.getByRole('button', { name: /6h ago/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(60) // clamped from 360

    await user.click(screen.getByRole('button', { name: /yesterday/i }))
    expect(mockOnOffsetChange).toHaveBeenCalledWith(60) // clamped from 1440
  })

  it('displays all wind condition bands in Legend tab', async () => {
    const user = userEvent.setup()
    render(<TabbedInfoPanel {...defaultProps} />)

    // Switch to Legend tab
    const legendTab = screen.getByRole('button', { name: /legend/i })
    await user.click(legendTab)

    // Check all 4 wind condition bands
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('0–8 kts')).toBeInTheDocument()

    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('9–15')).toBeInTheDocument()

    expect(screen.getByText('Heavy')).toBeInTheDocument()
    expect(screen.getByText('16–22')).toBeInTheDocument()

    expect(screen.getByText('Storm')).toBeInTheDocument()
    expect(screen.getByText('23+')).toBeInTheDocument()
  })

  it('shows CHII2 elevation note only when buoyId is CHII2', async () => {
    const user = userEvent.setup()

    // Test with CHII2
    const { rerender } = render(
      <TabbedInfoPanel {...defaultProps} buoyId="CHII2" />
    )

    const legendTab = screen.getByRole('button', { name: /legend/i })
    await user.click(legendTab)

    expect(
      screen.getByText(/wind measured at 85ft elevation/i)
    ).toBeInTheDocument()

    // Test with different buoy
    rerender(<TabbedInfoPanel {...defaultProps} buoyId="45198" />)

    expect(
      screen.queryByText(/wind measured at 85ft elevation/i)
    ).not.toBeInTheDocument()
  })

  it('shows usage instructions in Legend tab', async () => {
    const user = userEvent.setup()
    render(<TabbedInfoPanel {...defaultProps} />)

    const legendTab = screen.getByRole('button', { name: /legend/i })
    await user.click(legendTab)

    expect(
      screen.getByText(/hover\/touch to see data at any time/i)
    ).toBeInTheDocument()
  })

  it('passes correct props to WindowStats component', () => {
    render(<TabbedInfoPanel {...defaultProps} />)

    // Get the props passed to WindowStats
    const propsElement = screen.getByTestId('window-stats-props')
    const props = JSON.parse(propsElement.textContent || '{}')

    // Component transforms WindDataPoint[] to WindDataPointWithOffset[]
    // by calculating minsAgo from timestamps
    const expectedData = mockData.map((point, i) => ({
      ...point,
      minsAgo: i * 10, // 0, 10, 20 minutes ago
    }))

    expect(props.data).toEqual(expectedData)
    expect(props.timeWindowMinutes).toBe(60)
    expect(props.nowOffsetMinutes).toBe(0)
  })
})
