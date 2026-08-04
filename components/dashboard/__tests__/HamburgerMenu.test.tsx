import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HamburgerMenu from '../HamburgerMenu'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}))

describe('HamburgerMenu', () => {
  const defaultProps = {
    isOpen: false,
    onClose: jest.fn(),
  }

  it('renders closed by default', () => {
    const { container } = render(<HamburgerMenu {...defaultProps} />)

    // Menu should be in DOM but transformed off-screen when closed
    const nav = container.querySelector('nav')
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveStyle({ transform: 'translateX(-100%)' })
  })

  it('opens when isOpen is true', () => {
    render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    // Menu should be visible and accessible when open
    const nav = screen.getByRole('navigation')
    expect(nav).toBeVisible()
  })

  it('closes when overlay is clicked', async () => {
    const user = userEvent.setup()
    const mockOnClose = jest.fn()

    render(<HamburgerMenu {...defaultProps} isOpen={true} onClose={mockOnClose} />)

    // Find and click the overlay
    const overlay = screen.getByTestId('menu-overlay')
    await user.click(overlay)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('closes when ESC key is pressed', async () => {
    const user = userEvent.setup()
    const mockOnClose = jest.fn()

    render(<HamburgerMenu {...defaultProps} isOpen={true} onClose={mockOnClose} />)

    // Press ESC key
    await user.keyboard('{Escape}')

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders Dashboard, Wind Data, and Settings navigation links', () => {
    render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /wind data/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('Settings link routes to /settings', () => {
    render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    const settingsLink = screen.getByRole('link', { name: /settings/i })
    expect(settingsLink).toHaveAttribute('href', '/settings')
  })

  it('highlights active route', () => {
    const { usePathname } = jest.requireMock('next/navigation')
    usePathname.mockReturnValue('/wind-data')

    render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    const windDataLink = screen.getByRole('link', { name: /wind data/i })

    // Wind Data should have active styling
    expect(windDataLink).toHaveStyle({ color: 'var(--accent)' })
    expect(windDataLink).toHaveStyle({ background: 'var(--blue-muted)' })

    // Dashboard should not have active styling
    expect(dashboardLink).toHaveStyle({ color: 'var(--text-secondary)' })
    expect(dashboardLink).toHaveStyle({ background: 'transparent' })
  })

  it('closes menu when nav item is clicked', async () => {
    const user = userEvent.setup()
    const mockOnClose = jest.fn()

    render(<HamburgerMenu {...defaultProps} isOpen={true} onClose={mockOnClose} />)

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
    await user.click(dashboardLink)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders close button that closes menu', async () => {
    const user = userEvent.setup()
    const mockOnClose = jest.fn()

    render(<HamburgerMenu {...defaultProps} isOpen={true} onClose={mockOnClose} />)

    const closeButton = screen.getByRole('button', { name: /close menu/i })
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders version information', () => {
    render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    expect(screen.getByText(/v1\.0/i)).toBeInTheDocument()
  })
})
