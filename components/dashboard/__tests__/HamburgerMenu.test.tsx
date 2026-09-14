import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HamburgerMenu from '../HamburgerMenu'
import type { Account } from '@/types'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}))

const CREW: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  displayName: 'Jamie Torres',
  role: 'viewer',
}

describe('HamburgerMenu', () => {
  // The Account arrives as a prop, so the drawer needs no Supabase mock — which
  // is part of why ADR 0018 made it one.
  const defaultProps = {
    isOpen: false,
    onClose: jest.fn(),
    account: null,
    onSignIn: jest.fn(),
    onSignOut: jest.fn(),
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

  it('renders the five entries in the order ADR 0016 fixed', () => {
    const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/wind-data',
      '/boat-management',
      '/boat-performance',
      '/settings',
    ])
  })

  it('groups the middle pair with two dividers', () => {
    render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    // Two dividers is what makes the locked pair read as one section rather than
    // two locked items scattered through a list (ADR 0016).
    expect(screen.getAllByRole('separator')).toHaveLength(2)
  })

  it('keeps the station detail route out of the drawer', () => {
    const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs.some((href) => href?.startsWith('/station'))).toBe(false)
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

  describe('the account block in the bordered footer', () => {
    it('offers a Guest a way in, above the version hairline', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      const guestLine = screen.getByText('Browsing as guest')
      expect(guestLine).toBeInTheDocument()
      expect(screen.getByText('Weather is open to everyone')).toBeInTheDocument()

      // The block takes the top of the footer and demotes the version to a
      // hairline beneath it, so they share one bordered region in that order.
      const footer = guestLine.closest('div[style*="border-top"]')
      expect(footer).not.toBeNull()
      expect(footer?.textContent).toMatch(/Browsing as guest.*v1\.0 · May 2026/)
    })

    it('names the signed-in sailor instead, with a way out', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />)

      expect(screen.getByText('Jamie Torres')).toBeInTheDocument()
      expect(screen.getByText('crew@example.com')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
      expect(screen.queryByText('Browsing as guest')).not.toBeInTheDocument()
    })

    it('renders a sailor Google never named without inventing one', () => {
      render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={{ ...CREW, displayName: null }} />
      )

      expect(screen.getByText('crew@example.com')).toBeInTheDocument()
      expect(screen.getByText('Google account')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    })

    it('shows the same footer to a viewer and an admin — the Role is not in the drawer', () => {
      const { container: asViewer } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={{ ...CREW, role: 'viewer' }} />
      )
      const viewerText = asViewer.textContent

      const { container: asAdmin } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={{ ...CREW, role: 'admin' }} />
      )

      expect(asAdmin.textContent).toBe(viewerText)
      expect(viewerText).not.toMatch(/admin|viewer/i)
    })

    it('hands the two taps to the layout that owns the sheet and the session', async () => {
      const user = userEvent.setup()
      const onSignIn = jest.fn()
      const onSignOut = jest.fn()

      const { unmount } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} onSignIn={onSignIn} />
      )
      await user.click(screen.getByRole('button', { name: 'Sign in' }))
      expect(onSignIn).toHaveBeenCalledTimes(1)
      unmount()

      render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={CREW} onSignOut={onSignOut} />
      )
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(onSignOut).toHaveBeenCalledTimes(1)
    })

    it('keeps the nav identical either way (ADR 0016)', () => {
      const { container: asGuest, unmount } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} />
      )
      const guestNav = Array.from(asGuest.querySelectorAll('a')).map((a) => a.getAttribute('href'))
      unmount()

      const { container: signedIn } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />
      )
      const signedInNav = Array.from(signedIn.querySelectorAll('a')).map((a) =>
        a.getAttribute('href')
      )

      expect(signedInNav).toEqual(guestNav)
      expect(guestNav).toEqual([
        '/',
        '/wind-data',
        '/boat-management',
        '/boat-performance',
        '/settings',
      ])
    })
  })

  describe('the two boat sections', () => {
    const boatRows = /boat management|boat performance/i

    it('padlocks both of them for a Guest, with the invitation on the row', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      for (const label of ['Boat management', 'Boat performance']) {
        const row = screen.getByRole('link', { name: new RegExp(label, 'i') })
        expect(row).toHaveAttribute('href', `/${label.toLowerCase().replace(' ', '-')}`)
        expect(row.querySelector('[data-testid="locked-mark"]')).not.toBeNull()
        expect(row.textContent).toContain('Sign in')
      }
    })

    it('says "locked" in words, and names no control the row does not have', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      // The padlock and its "Sign in" are drawn for the eye. A screen reader that
      // read them literally would announce a Sign in control on a row that only
      // navigates, so the mark is hidden and the row is labelled instead.
      const row = screen.getByRole('link', { name: 'Boat management, locked. Sign in to open.' })
      expect(row.querySelector('[data-testid="locked-mark"]')).toHaveAttribute('aria-hidden')

      const open = screen.getByRole('link', { name: 'Wind Data' })
      expect(open).not.toHaveAttribute('aria-label')
    })

    it('takes the padlocks off once the sailor is signed in', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />)

      for (const label of ['Boat management', 'Boat performance']) {
        const row = screen.getByRole('link', { name: new RegExp(label, 'i') })
        expect(row.querySelector('[data-testid="locked-mark"]')).toBeNull()
        expect(row.textContent).not.toContain('Sign in')
      }
    })

    it('locks nothing else — the three open sections never padlock', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      for (const label of ['Dashboard', 'Wind Data', 'Settings']) {
        const row = screen.getByRole('link', { name: new RegExp(label, 'i') })
        expect(row.querySelector('[data-testid="locked-mark"]')).toBeNull()
      }
    })

    it('is the only thing about a row that sign-in changes', () => {
      const { container: asGuest, unmount } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} />
      )
      const guestRows = Array.from(asGuest.querySelectorAll('a'))
        .filter((a) => boatRows.test(a.textContent ?? ''))
        .map((a) => a.getAttribute('style'))
      unmount()

      const { container: signedIn } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />
      )
      const signedInRows = Array.from(signedIn.querySelectorAll('a'))
        .filter((a) => boatRows.test(a.textContent ?? ''))
        .map((a) => a.getAttribute('style'))

      expect(signedInRows).toEqual(guestRows)
    })

    it('holds "Boat performance" on one line at 268px', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      // The arithmetic is in ADR 0016 — ~105px of label against a ~196px budget —
      // so the wrap this guards against would have to come from a style change
      // rather than from the width. Whether it *lays out* on one line is a browser
      // question, and `e2e/boat-sections.spec.ts` asks it there.
      const row = screen.getByRole('link', { name: /boat performance/i })
      const label = row.querySelector('span')
      expect(label).toHaveStyle({ whiteSpace: 'nowrap' })
    })
  })
})
