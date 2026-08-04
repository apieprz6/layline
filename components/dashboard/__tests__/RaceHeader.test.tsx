import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RaceHeader from '../RaceHeader'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}))

// Mock SWR
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}))

import useSWR from 'swr'
const mockUseSWR = useSWR as jest.Mock

describe('RaceHeader', () => {
  beforeEach(() => {
    mockUseSWR.mockReturnValue({
      data: {
        buoys: [
          {
            data: {
              buoyId: '45198',
              windSpeed: 12,
              windDirection: 245,
              timestamp: new Date().toISOString(),
            },
            status: 'online',
          },
        ],
      },
    })
  })

  it('renders hamburger button when onOpenMenu is provided', () => {
    const mockOnOpenMenu = jest.fn()
    render(<RaceHeader onOpenMenu={mockOnOpenMenu} />)

    const hamburgerButton = screen.getByRole('button', { name: /menu/i })
    expect(hamburgerButton).toBeInTheDocument()
  })

  it('calls onOpenMenu when hamburger button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const mockOnOpenMenu = jest.fn()

    render(<RaceHeader onOpenMenu={mockOnOpenMenu} />)

    const hamburgerButton = screen.getByRole('button', { name: /menu/i })
    await user.click(hamburgerButton)

    expect(mockOnOpenMenu).toHaveBeenCalledTimes(1)
  })

  it('renders layline logo and title', () => {
    render(<RaceHeader />)

    const logo = screen.getByAltText('L')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/logo-icon.svg')

    expect(screen.getByText('layline')).toBeInTheDocument()
  })

  it('displays current wind speed with one decimal', () => {
    render(<RaceHeader />)

    expect(screen.getByText(/12\.0 kts/i)).toBeInTheDocument()
  })

  it('displays dash when no wind data available', () => {
    mockUseSWR.mockReturnValue({ data: null })
    render(<RaceHeader />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
