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

    const logo = screen.getByRole('img', { name: 'L' })
    expect(logo).toBe(screen.getByTestId('logo-mark'))

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

  describe('the boat, for a signed-in sailor', () => {
    it('names the boat exactly as written, in place of the wordmark', () => {
      render(<RaceHeader boat={{ name: 'Handsome Pete', iconUpdatedAt: null }} />)

      // Not lowercased to look like the wordmark: the name is the sailor's own.
      expect(screen.getByText('Handsome Pete')).toBeInTheDocument()
      expect(screen.queryByText('layline')).not.toBeInTheDocument()
    })

    it('shows the boat’s icon, keyed on when it last changed so the browser can cache it', () => {
      render(
        <RaceHeader
          boat={{ name: 'Handsome Pete', iconUpdatedAt: '2026-10-16T18:00:00.123+00:00' }}
        />
      )

      const icon = screen.getByAltText('Handsome Pete')
      expect(icon).toHaveAttribute(
        'src',
        `/boat/icon?v=${encodeURIComponent('2026-10-16T18:00:00.123+00:00')}`
      )
      expect(screen.queryByTestId('logo-mark')).not.toBeInTheDocument()
    })

    it('keeps the layline mark beside the name when the boat has no icon yet', () => {
      // No invented placeholder — no initials standing in for an icon nobody uploaded.
      render(<RaceHeader boat={{ name: 'Handsome Pete', iconUpdatedAt: null }} />)

      expect(screen.getByTestId('logo-mark')).toBeInTheDocument()
      expect(document.querySelector('img[src^="/boat/icon"]')).toBeNull()
    })

    it('names nothing for a Guest', () => {
      // ADR 0015: no signed-out screen names the boat.
      render(<RaceHeader boat={null} />)

      expect(screen.getByText('layline')).toBeInTheDocument()
      expect(screen.getByTestId('logo-mark')).toBeInTheDocument()
      expect(document.querySelector('img[src^="/boat/icon"]')).toBeNull()
    })
  })
})
