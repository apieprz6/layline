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
    currentWind: {
      speed: 12,
      direction: 245,
    } as { speed: number; direction: number } | null,
  }

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

  it('renders layline logo and title', () => {
    render(<RaceHeader {...defaultProps} />)

    const logo = screen.getByAltText('L')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/logo-icon.svg')

    expect(screen.getByText('layline')).toBeInTheDocument()
  })

  it('displays current wind speed with one decimal', () => {
    render(<RaceHeader {...defaultProps} />)

    expect(screen.getByText(/12\.0 kts/i)).toBeInTheDocument()
  })

  it('displays dash when wind data is null', () => {
    render(<RaceHeader currentWind={null} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
