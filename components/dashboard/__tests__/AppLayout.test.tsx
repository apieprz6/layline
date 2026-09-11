import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppLayout from '../AppLayout'
import type { Account } from '@/types'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    refresh: jest.fn(),
  })),
}))

// The layout subscribes to auth events so a sign-in refreshes the chrome; the
// subscription is all this suite needs from Supabase.
const unsubscribe = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe } } })),
    },
  })),
}))

jest.mock('@/lib/account/browserAuth', () => ({
  signInWithGoogle: jest.fn(async () => {}),
  signOutHere: jest.fn(async () => {}),
}))

// Mock SWR (used by RaceHeader)
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(() => ({
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
  })),
}))

const CREW: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  displayName: 'Jamie Torres',
  role: 'viewer',
}

describe('AppLayout', () => {
  // A Guest by default: the Account is resolved on the server and arrives as a
  // prop, so the layout never asks who is signed in (ADR 0018).
  const defaultProps = {
    children: <div>Page content</div>,
    account: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

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

  it('applies left-aligned container classes at md breakpoint', () => {
    render(<AppLayout {...defaultProps} />)

    const content = screen.getByText('Page content')
    const container = content.parentElement
    expect(container).toHaveClass('max-w-md', 'mx-auto', 'md:mx-0', 'md:max-w-none')
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

  describe('the Account it was handed, and the sheet it owns', () => {
    it('passes the Account down to the drawer rather than fetching one', () => {
      render(<AppLayout {...defaultProps} account={CREW} />)

      expect(screen.getByText('Jamie Torres')).toBeInTheDocument()
      expect(screen.queryByText('Browsing as guest')).not.toBeInTheDocument()
    })

    it('shows a Guest the guest footer', () => {
      render(<AppLayout {...defaultProps} />)

      expect(screen.getByText('Browsing as guest')).toBeInTheDocument()
    })

    it('keeps the sheet closed until something asks for it', () => {
      render(<AppLayout {...defaultProps} />)

      expect(screen.queryByTestId('auth-sheet')).not.toBeInTheDocument()
    })

    it("opens the sheet from the drawer's Sign in, and closes the drawer behind it", async () => {
      const user = userEvent.setup({ delay: null })
      const { container } = render(<AppLayout {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(screen.getByTestId('auth-sheet')).toBeInTheDocument()
      // The round trip through Google reloads the page, so the drawer would not
      // survive to be reopened — it gets out of the way now.
      expect(container.querySelector('nav')).toHaveStyle({ transform: 'translateX(-100%)' })
    })

    it('sends the sailor to Google with the screen they are on', async () => {
      const user = userEvent.setup({ delay: null })
      const { signInWithGoogle } = jest.requireMock('@/lib/account/browserAuth')
      render(<AppLayout {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Sign in' }))
      await user.click(screen.getByRole('button', { name: /continue with google/i }))

      expect(signInWithGoogle).toHaveBeenCalledWith('/')
    })

    it('signs out where the sailor stands — no push, no replace', async () => {
      const user = userEvent.setup({ delay: null })
      const { signOutHere } = jest.requireMock('@/lib/account/browserAuth')
      const { useRouter } = jest.requireMock('next/navigation')
      const push = jest.fn()
      useRouter.mockReturnValue({ push, refresh: jest.fn() })

      render(<AppLayout {...defaultProps} account={CREW} />)

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(signOutHere).toHaveBeenCalledTimes(1)
      expect(push).not.toHaveBeenCalled()
    })
  })
})
