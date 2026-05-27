import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppLayout from '../AppLayout'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}))

describe('AppLayout', () => {
  const defaultProps = {
    raceTime: new Date('2026-05-27T19:00:00Z'),
    currentWind: {
      speed: 12,
      direction: 245,
    },
    children: <div>Page content</div>,
  }

  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-27T17:00:00Z'))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('renders RaceHeader with correct props', () => {
    render(<AppLayout {...defaultProps} />)

    // Check header content
    expect(screen.getByRole('heading', { name: /layline/i })).toBeInTheDocument()
    expect(screen.getByText(/12 kts/i)).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(<AppLayout {...defaultProps} />)

    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('opens menu when hamburger button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<AppLayout {...defaultProps} />)

    // Menu should be closed initially (translateX(-100%))
    let nav = container.querySelector('nav')
    expect(nav).toHaveStyle({ transform: 'translateX(-100%)' })

    // Click hamburger button (not close menu button)
    const hamburgerButton = screen.getByRole('button', { name: 'Menu' })
    await user.click(hamburgerButton)

    // Menu should be open (translateX(0))
    nav = screen.getByRole('navigation')
    expect(nav).toHaveStyle({ transform: 'translateX(0)' })
  })

  it('closes menu when HamburgerMenu triggers onClose', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<AppLayout {...defaultProps} />)

    // Open menu
    const hamburgerButton = screen.getByRole('button', { name: 'Menu' })
    await user.click(hamburgerButton)

    // Menu should be open
    let nav = screen.getByRole('navigation')
    expect(nav).toHaveStyle({ transform: 'translateX(0)' })

    // Click overlay to close
    const overlay = screen.getByTestId('menu-overlay')
    await user.click(overlay)

    // Menu should be closed (translateX(-100%))
    nav = container.querySelector('nav')
    expect(nav).toHaveStyle({ transform: 'translateX(-100%)' })
  })
})
