import { render, screen } from '@testing-library/react'
import StationStatsPanel from '../StationStatsPanel'
import type { WindDataPointWithOffset } from '@/types'

jest.mock('../WindowStats', () => {
  return function MockWindowStats(props: {
    data: WindDataPointWithOffset[]
    timeWindowMinutes: number
    nowOffsetMinutes: number
  }) {
    return <span data-testid="window-stats-props">{JSON.stringify(props)}</span>
  }
})

const dataWithOffset: WindDataPointWithOffset[] = [
  { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 220, minsAgo: 0 },
  { timestamp: '2026-05-19T17:50:00Z', spd: 14, dir: 225, minsAgo: 10 },
]

const defaultProps = {
  dataWithOffset,
  timeWindowMinutes: 60,
  nowOffsetMinutes: 0,
}

describe('StationStatsPanel', () => {
  it('is the window stats under a label, with no tabs to choose between', () => {
    render(<StationStatsPanel {...defaultProps} />)

    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hands WindowStats the window it is showing', () => {
    render(<StationStatsPanel {...defaultProps} nowOffsetMinutes={30} />)

    const props = JSON.parse(screen.getByTestId('window-stats-props').textContent ?? '{}')
    expect(props).toEqual({ data: dataWithOffset, timeWindowMinutes: 60, nowOffsetMinutes: 30 })
  })

  it('carries no elevation note: that is the header chip, once per page (LAY-171)', () => {
    render(<StationStatsPanel {...defaultProps} />)

    expect(screen.queryByText(/higher than/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bft\b/)).not.toBeInTheDocument()
  })
})
