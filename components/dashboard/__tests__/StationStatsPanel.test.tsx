import { render, screen } from '@testing-library/react'
import StationStatsPanel from '../StationStatsPanel'
import type { BuoyMetadata, WindDataPointWithOffset } from '@/types'

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

const chii2Metadata: BuoyMetadata = {
  station: 'CHII2',
  source: 'ndbc',
  location: { latitude: 41.87, longitude: -87.59 },
  windMeasurementHeight: 85,
  adjustmentNote: 'Wind measured at 85ft typically reads 20-30% higher than surface',
  capability: { gust: true, waves: false },
}

const purdueMetadata: BuoyMetadata = {
  station: '45198',
  source: 'ndbc',
  location: { latitude: 41.89, longitude: -87.6 },
  windMeasurementHeight: 3,
  adjustmentNote: 'Surface-level measurements',
  capability: { gust: true, waves: true },
}

const defaultProps = {
  dataWithOffset,
  timeWindowMinutes: 60,
  nowOffsetMinutes: 0,
  metadata: chii2Metadata,
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

  it("explains an elevated anemometer's height in the station's own words", () => {
    render(<StationStatsPanel {...defaultProps} metadata={chii2Metadata} />)

    expect(screen.getByText(chii2Metadata.adjustmentNote!)).toBeInTheDocument()
  })

  it('says nothing about height for a surface-level station', () => {
    render(<StationStatsPanel {...defaultProps} metadata={purdueMetadata} />)

    expect(screen.queryByText(purdueMetadata.adjustmentNote!)).not.toBeInTheDocument()
    expect(screen.queryByText(/85ft/)).not.toBeInTheDocument()
  })
})
