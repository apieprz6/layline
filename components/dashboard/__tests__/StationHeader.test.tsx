import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StationHeader from '../StationHeader'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), back: jest.fn() })),
}))

const latestDataTime = new Date(2026, 9, 13, 18, 42)

function renderHeader(nowOffset = 0, onReturnToLive = jest.fn()) {
  render(
    <StationHeader
      stationName="Harrison Dever Crib"
      buoyId="CHII2"
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
})
