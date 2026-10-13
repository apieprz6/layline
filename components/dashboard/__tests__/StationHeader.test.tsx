import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StationHeader from '../StationHeader'
import type { BuoyMetadata } from '@/types'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
}))

const latestDataTime = new Date(2026, 9, 13, 18, 42)

const chii2Metadata: BuoyMetadata = {
  station: 'CHII2',
  source: 'ndbc',
  location: { latitude: 41.87, longitude: -87.59 },
  windMeasurementHeight: 85,
  adjustmentNote: 'Wind at this height typically reads 20–30% higher than at the surface.',
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

function renderHeader(nowOffset = 0, onReturnToLive = jest.fn(), metadata = chii2Metadata) {
  render(
    <StationHeader
      stationName="Harrison Dever Crib"
      buoyId="CHII2"
      metadata={metadata}
      latestDataTime={latestDataTime}
      nowOffset={nowOffset}
      onReturnToLive={onReturnToLive}
    />
  )
  return onReturnToLive
}

describe('StationHeader', () => {
  it('is one row: back, the name with its id, the latest sample time and the live pill', () => {
    renderHeader()

    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Harrison Dever Crib')
    expect(screen.getByText('CHII2')).toBeInTheDocument()
    expect(screen.getByText('· Latest 18:42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Live' })).toHaveTextContent('Live')
  })

  it('does not say how long ago the page was fetched', () => {
    renderHeader()

    expect(screen.queryByText(/Fetched/)).not.toBeInTheDocument()
  })

  it('shows the scrubbed offset on the pill, and returns to live when tapped', async () => {
    const onReturnToLive = renderHeader(90)

    const pill = screen.getByRole('button', { name: 'Return to live' })
    expect(pill).toHaveTextContent('1.5h ago')

    await userEvent.setup().click(pill)
    expect(onReturnToLive).toHaveBeenCalledTimes(1)
  })

  it('carries the elevation note beside the id for an elevated anemometer', () => {
    renderHeader()

    const title = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(title).toContainElement(screen.getByRole('button', { name: /Measured at 85 ft/ }))
  })

  it('carries no elevation note for a surface station', () => {
    renderHeader(0, jest.fn(), purdueMetadata)

    expect(screen.queryByRole('button', { name: /Measured at/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/ft/)).not.toBeInTheDocument()
  })
})
