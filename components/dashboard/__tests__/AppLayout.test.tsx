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
    currentWind: {
      speed: 12,
      direction: 245,
    } as { speed: number; direction: number } | null,
    children: <div>Page content</div>,
  }

  it('renders RaceHeader with correct props', () => {
    render(<AppLayout {...defaultProps} />)

    // Check header content - logo should be visible
    const logo = screen.getByAltText('L')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/logo-icon.svg')

    // Check wind display with one decimal
    expect(screen.getByText(/12\.0 kts/i)).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(<AppLayout {...defaultProps} />)

    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('opens menu when hamburger button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<AppLayout {...defaultProps} />)

    // Menu should be closed initially (translateX(-100%))
    const nav = container.querySelector('nav')
    expect(nav).toHaveStyle({ transform: 'translateX(-100%)' })

    // Click hamburger button (not close menu button)
    const hamburgerButton = screen.getByRole('button', { name: 'Menu' })
    await user.click(hamburgerButton)

    // Menu should be open (translateX(0))
    const openedNav = screen.getByRole('navigation')
    expect(openedNav).toHaveStyle({ transform: 'translateX(0)' })
  })

  it('closes menu when HamburgerMenu triggers onClose', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<AppLayout {...defaultProps} />)

    // Open menu
    const hamburgerButton = screen.getByRole('button', { name: 'Menu' })
    await user.click(hamburgerButton)

    // Menu should be open
    const openNav = screen.getByRole('navigation')
    expect(openNav).toHaveStyle({ transform: 'translateX(0)' })

    // Click overlay to close
    const overlay = screen.getByTestId('menu-overlay')
    await user.click(overlay)

    // Menu should be closed (translateX(-100%))
    const closedNav = container.querySelector('nav')
    expect(closedNav).toHaveStyle({ transform: 'translateX(-100%)' })
  })
})
