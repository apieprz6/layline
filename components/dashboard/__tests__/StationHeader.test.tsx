import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StationHeader from '../StationHeader'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
  })),
}))

const baseProps = {
  stationName: 'Harrison Dever Crib',
  buoyId: 'CHII2',
  latestDataTime: new Date('2026-09-16T15:20:00Z'),
  lastFetchTime: new Date('2026-09-16T15:22:00Z'),
  nowOffset: 0,
  onReturnToLive: jest.fn(),
}

describe('StationHeader refresh control', () => {
  it('offers a refresh when there is something to ask again', () => {
    render(<StationHeader {...baseProps} onRefresh={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'Refresh this reading' })).toBeInTheDocument()
  })

  it('leaves it out where nothing can be asked again — the skeleton header', () => {
    render(<StationHeader {...baseProps} />)

    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
  })

  it('asks when the sailor taps it', async () => {
    const onRefresh = jest.fn()
    const user = userEvent.setup()
    render(<StationHeader {...baseProps} onRefresh={onRefresh} />)

    await user.click(screen.getByRole('button', { name: 'Refresh this reading' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('says it is refreshing, and will not be asked twice while it is', async () => {
    const onRefresh = jest.fn()
    const user = userEvent.setup()
    render(<StationHeader {...baseProps} onRefresh={onRefresh} isRefreshing />)

    const button = screen.getByRole('button', { name: 'Refreshing' })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
