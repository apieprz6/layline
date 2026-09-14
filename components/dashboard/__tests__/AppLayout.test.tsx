import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppLayout from '../AppLayout'
import { CREW } from '@/__tests__/fixtures/accounts'

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

describe('AppLayout', () => {
  // A Guest by default: the Account is resolved on the server and arrives as a
  // prop, so the layout never asks who is signed in (ADR 0018).
  const defaultProps = {
    children: <div>Page content</div>,
    account: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // The layout reads `?signin=` off the URL on mount, and jsdom carries one URL
    // across a whole file, so each test starts on a clean dashboard.
    window.history.replaceState(null, '', '/')
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

    it("takes a locked section's Sign in as where the sailor was headed", async () => {
      const user = userEvent.setup({ delay: null })
      const { signInWithGoogle } = jest.requireMock('@/lib/account/browserAuth')
      render(<AppLayout {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Sign in to open Boat management' }))
      await user.click(screen.getByRole('button', { name: /continue with google/i }))

      // The offer was for that section, so the sailor arrives there rather than
      // back on the screen the drawer happened to be open over.
      expect(signInWithGoogle).toHaveBeenCalledWith('/boat-management')
    })

    it('forgets that destination if the sheet is dismissed', async () => {
      const user = userEvent.setup({ delay: null })
      const { signInWithGoogle } = jest.requireMock('@/lib/account/browserAuth')
      render(<AppLayout {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Sign in to open Boat performance' }))
      await user.click(screen.getByTestId('auth-sheet-dim'))

      // A later sign-in from the footer means "here", and must not inherit an
      // offer the sailor already turned down.
      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Sign in' }))
      await user.click(screen.getByRole('button', { name: /continue with google/i }))

      expect(signInWithGoogle).toHaveBeenCalledWith('/')
    })
  })

  describe('the sheet a redirect asked for', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      window.history.replaceState(null, '', '/')
    })

    it('opens on arrival, and takes the ask back out of the URL', () => {
      window.history.replaceState(null, '', '/?signin=%2Fboat-performance&target=1830')

      render(<AppLayout {...defaultProps} />)

      expect(screen.getByTestId('auth-sheet')).toBeInTheDocument()
      // Only that one param: a reload must not reopen a dismissed sheet, but a
      // Target Time the sailor set is part of the screen they are on.
      expect(window.location.search).toBe('?target=1830')
    })

    it('lands the sailor on the route they were sent back from', async () => {
      const user = userEvent.setup({ delay: null })
      const { signInWithGoogle } = jest.requireMock('@/lib/account/browserAuth')
      window.history.replaceState(null, '', '/?signin=%2Fboat-management')

      render(<AppLayout {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /continue with google/i }))

      expect(signInWithGoogle).toHaveBeenCalledWith('/boat-management')
    })

    it('will not be talked into another origin', async () => {
      const user = userEvent.setup({ delay: null })
      const { signInWithGoogle } = jest.requireMock('@/lib/account/browserAuth')
      // Anyone can write this URL and send it to a sailor, so the value is put
      // through the same guard as any other next-path (ADR 0018).
      window.history.replaceState(null, '', '/?signin=https%3A%2F%2Fevil.example%2Fsteal')

      render(<AppLayout {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /continue with google/i }))

      expect(signInWithGoogle).toHaveBeenCalledWith('/')
    })

    it('leaves the sheet closed when nothing asked', () => {
      render(<AppLayout {...defaultProps} />)

      expect(screen.queryByTestId('auth-sheet')).not.toBeInTheDocument()
    })
  })

  describe('signing out', () => {
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
