import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import WindRose from '../WindRose'
import { formatTimeHHMM } from '@/lib/utils/timeFormatting'
import type { StationCapability, WindDataPoint, WindDataPointWithOffset } from '@/types'

// The overlays only draw once the SVG has measured itself.
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, 'getBoundingClientRect', {
    writable: true,
    value: jest.fn().mockReturnValue({
      width: 360, height: 360, top: 0, left: 0, right: 360, bottom: 360, x: 0, y: 0, toJSON: () => {},
    }),
  })
})

const now = new Date('2026-10-13T18:00:00Z')

const purdue: WindDataPoint[] = [
  { timestamp: '2026-10-13T18:00:00.000Z', spd: 12.4, dir: 220, gust: 17.6, waveHeight: 2.3, wavePeriod: 4.6, waveDir: 45 },
  { timestamp: '2026-10-13T17:50:00.000Z', spd: 11.0, dir: 215, gust: 15.2, waveHeight: 2.1, wavePeriod: 4.4, waveDir: 40 },
]

const withOffset = (p: WindDataPoint): WindDataPointWithOffset => ({
  ...p,
  minsAgo: (now.getTime() - new Date(p.timestamp).getTime()) / 60_000,
})

const BOTH: StationCapability = { gust: true, waves: true }
const GUST_ONLY: StationCapability = { gust: true, waves: false }

function renderRose(data: WindDataPoint[], displayPoint: WindDataPointWithOffset, capability?: StationCapability) {
  return render(
    <WindRose
      data={data}
      referenceTime={now}
      timeWindowMinutes={60}
      nowOffsetMinutes={0}
      displayPoint={displayPoint}
      capability={capability}
    />
  )
}

describe('WindRose gust readout', () => {
  it('reads "G 18" under the speed, at the displayed moment', () => {
    renderRose(purdue, withOffset(purdue[0]), BOTH)
    expect(screen.getByTestId('rose-gust')).toHaveTextContent('G18')
  })

  it('follows a scrubbed or touched moment, not the latest reading', () => {
    renderRose(purdue, withOffset(purdue[1]), BOTH)
    expect(screen.getByTestId('rose-gust')).toHaveTextContent('G15')
  })

  it('shows "G —" when the station measures gust but has no reading then', () => {
    const data = [{ ...purdue[0], gust: null }, purdue[1]]
    renderRose(data, withOffset(data[0]), BOTH)
    expect(screen.getByTestId('rose-gust')).toHaveTextContent('G—')
  })

  it('is absent when the station cannot measure gust', () => {
    renderRose(purdue, withOffset(purdue[0]), { gust: false, waves: true })
    expect(screen.queryByTestId('rose-gust')).not.toBeInTheDocument()
  })

  it('is absent with no capability given', () => {
    renderRose(purdue, withOffset(purdue[0]))
    expect(screen.queryByTestId('rose-gust')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rose-waves')).not.toBeInTheDocument()
  })
})

describe('WindRose wave corner', () => {
  it('reads height, period and the compass word for where waves come from', () => {
    renderRose(purdue, withOffset(purdue[0]), BOTH)
    const corner = screen.getByTestId('rose-waves')

    expect(within(corner).getByText('Waves')).toBeInTheDocument()
    expect(within(corner).getByText('2.3')).toBeInTheDocument()
    expect(within(corner).getByText('ft')).toBeInTheDocument()
    expect(within(corner).getByText('5s')).toBeInTheDocument()
    expect(within(corner).getByText('NE')).toBeInTheDocument()
  })

  it('points its arrow the way the waves are going: from NE draws toward SW', () => {
    renderRose(purdue, withOffset(purdue[0]), BOTH)
    const arrow = screen.getByTestId('rose-waves').querySelector('svg g')
    expect(arrow).toHaveAttribute('transform', 'rotate(225 10 10)')
  })

  it('follows the displayed moment', () => {
    renderRose(purdue, withOffset(purdue[1]), BOTH)
    expect(within(screen.getByTestId('rose-waves')).getByText('2.1')).toBeInTheDocument()
  })

  it('says when the last reading was rather than carrying it forward', () => {
    const data = [{ ...purdue[0], waveHeight: null, wavePeriod: null, waveDir: null }, purdue[1]]
    renderRose(data, withOffset(data[0]), BOTH)
    const corner = screen.getByTestId('rose-waves')

    expect(corner).toHaveTextContent('—')
    expect(corner).toHaveTextContent(`No reading since ${formatTimeHHMM(new Date(purdue[1].timestamp))}`)
    expect(within(corner).queryByText('2.1')).not.toBeInTheDocument()
  })

  it('says so when there was no reading in the whole history', () => {
    const data = purdue.map((p) => ({ ...p, waveHeight: null }))
    renderRose(data, withOffset(data[0]), BOTH)
    expect(screen.getByTestId('rose-waves')).toHaveTextContent('No reading in 72h')
  })

  it('leaves out a period or direction the station did not report', () => {
    const data = [{ ...purdue[0], wavePeriod: null, waveDir: null }]
    renderRose(data, withOffset(data[0]), BOTH)
    const corner = screen.getByTestId('rose-waves')

    expect(within(corner).getByText('2.3')).toBeInTheDocument()
    expect(corner).not.toHaveTextContent(/\ds/)
    expect(corner.querySelector('svg')).toBeNull()
  })

  it('draws nothing wave-shaped for a station without wave capability', () => {
    renderRose(purdue, withOffset(purdue[0]), GUST_ONLY)
    expect(screen.queryByTestId('rose-waves')).not.toBeInTheDocument()
    expect(screen.queryByText('Waves')).not.toBeInTheDocument()
  })

  it("says nothing about waves when the history's fetch path never carried them", () => {
    // Absent is not null: Purdue's NDBC fallback reads speed, direction and gust only, so its
    // history can't say whether the buoy had a wave reading, and "No reading" would be a claim.
    const data: WindDataPoint[] = purdue.map(({ timestamp, spd, dir, gust }) => ({ timestamp, spd, dir, gust }))
    renderRose(data, withOffset(data[0]), BOTH)

    expect(screen.queryByTestId('rose-waves')).not.toBeInTheDocument()
    expect(screen.getByTestId('rose-gust')).toHaveTextContent('G18')
  })

  it('says nothing about gust either when no point carries it', () => {
    const data: WindDataPoint[] = purdue.map(({ timestamp, spd, dir }) => ({ timestamp, spd, dir }))
    renderRose(data, withOffset(data[0]), BOTH)

    expect(screen.queryByTestId('rose-gust')).not.toBeInTheDocument()
  })
})
