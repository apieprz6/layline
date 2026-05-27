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
    expect(screen.getByText(/layline/i)).toBeInTheDocument()
    expect(screen.getByText(/12 kts/i)).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(<AppLayout {...defaultProps} />)

    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('opens menu when hamburger button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<AppLayout {...defaultProps} />)

    // Menu should be closed initially
    let nav = container.querySelector('nav')
    expect(nav).not.toBeVisible()

    // Click hamburger button
    const hamburgerButton = screen.getByRole('button', { name: /menu/i })
    await user.click(hamburgerButton)

    // Menu should be visible
    nav = screen.getByRole('navigation')
    expect(nav).toBeVisible()
  })

  it('closes menu when HamburgerMenu triggers onClose', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AppLayout {...defaultProps} />)

    // Open menu
    const hamburgerButton = screen.getByRole('button', { name: /menu/i })
    await user.click(hamburgerButton)

    // Menu should be open
    let nav = screen.getByRole('navigation')
    expect(nav).toBeVisible()

    // Click overlay to close
    const overlay = screen.getByTestId('menu-overlay')
    await user.click(overlay)

    // Menu should be closed (not visible)
    const { container } = render(<AppLayout {...defaultProps} />)
    nav = container.querySelector('nav')
    expect(nav).not.toBeVisible()
  })
})
