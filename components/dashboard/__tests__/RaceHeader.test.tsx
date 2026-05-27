import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RaceHeader from '../RaceHeader'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}))

describe('RaceHeader', () => {
  const defaultProps = {
    raceTime: new Date('2026-05-27T19:00:00Z'),
    currentWind: {
      speed: 12,
      direction: 245,
    },
  }

  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-27T17:00:00Z')) // 2 hours before race
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('renders hamburger button when onOpenMenu is provided', () => {
    const mockOnOpenMenu = jest.fn()
    render(<RaceHeader {...defaultProps} onOpenMenu={mockOnOpenMenu} />)

    const hamburgerButton = screen.getByRole('button', { name: /menu/i })
    expect(hamburgerButton).toBeInTheDocument()
  })

  it('calls onOpenMenu when hamburger button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const mockOnOpenMenu = jest.fn()

    render(<RaceHeader {...defaultProps} onOpenMenu={mockOnOpenMenu} />)

    const hamburgerButton = screen.getByRole('button', { name: /menu/i })
    await user.click(hamburgerButton)

    expect(mockOnOpenMenu).toHaveBeenCalledTimes(1)
  })

  it('renders Layline text as clickable link to root', () => {
    render(<RaceHeader {...defaultProps} />)

    const laylineLink = screen.getByRole('link', { name: /layline/i })
    expect(laylineLink).toHaveAttribute('href', '/')
  })

  it('displays race countdown', () => {
    render(<RaceHeader {...defaultProps} />)

    // Should show "2h 0m until race"
    expect(screen.getByText(/2h 0m until race/i)).toBeInTheDocument()
  })

  it('displays current wind speed', () => {
    render(<RaceHeader {...defaultProps} />)

    expect(screen.getByText(/12 kts/i)).toBeInTheDocument()
  })
})
