import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HamburgerMenu from '../HamburgerMenu'
import { CREW } from '@/__tests__/fixtures/accounts'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}))

/**
 * The nav rows in order, however each one is built: a **Locked Entry** is not a
 * link, so a query for `a` alone would report a drawer of three.
 */
function navLabels(container: HTMLElement): string[] {
  const rows = container.querySelectorAll('a, [data-testid="locked-entry"]')
  return Array.from(rows).map((row) => row.querySelector('span')?.textContent ?? '')
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
    const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />)

    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/wind-data',
      '/boat-management',
      '/boat-performance',
      '/settings',
    ])
  })

  it('shows a Guest the same five in the same order, two of them inert', () => {
    const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} />)

    // Membership and order do not change across sign-in (ADR 0016) — what changes
    // is that the boat pair is not a link for a Guest, having nowhere to go.
    expect(navLabels(container)).toEqual([
      'Dashboard',
      'Wind Data',
      'Boat management',
      'Boat performance',
      'Settings',
    ])
    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/wind-data',
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

    it('keeps the nav itself identical either way (ADR 0016)', () => {
      const { container: asGuest, unmount } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} />
      )
      const guestNav = navLabels(asGuest)
      unmount()

      const { container: signedIn } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />
      )

      // Signing in changes the footer and unlocks the boat pair; it never adds,
      // removes, or reorders a section.
      expect(navLabels(signedIn)).toEqual(guestNav)
      expect(guestNav).toEqual([
        'Dashboard',
        'Wind Data',
        'Boat management',
        'Boat performance',
        'Settings',
      ])
    })
  })

  describe('the two boat sections', () => {
    /** The **Locked Entry** row for a named section, or `null` if it is not locked. */
    function lockedRow(container: HTMLElement, label: string): HTMLElement | null {
      const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="locked-entry"]'))
      return rows.find((row) => row.textContent?.includes(label)) ?? null
    }

    it('shows a Guest both of them as inert rows, not as links', () => {
      const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      for (const label of ['Boat management', 'Boat performance']) {
        const row = lockedRow(container, label)
        expect(row).not.toBeNull()
        // Nothing to follow: there is no signed-out version of either screen, so
        // the row names the section and stops there.
        expect(row?.tagName).toBe('DIV')
        expect(row?.querySelector('a')).toBeNull()
        expect(row?.querySelector('[data-testid="padlock"]')).not.toBeNull()
        expect(row).toHaveStyle({ color: 'var(--text-muted)' })
      }

      expect(screen.queryByRole('link', { name: /boat/i })).not.toBeInTheDocument()
    })

    it('makes the row Sign in the one control, and names what it unlocks', async () => {
      const user = userEvent.setup()
      const onSignIn = jest.fn()

      render(<HamburgerMenu {...defaultProps} isOpen={true} onSignIn={onSignIn} />)

      // A drawer of three identically-named "Sign in" buttons names nothing, so
      // each locked row's button says which section it opens.
      await user.click(screen.getByRole('button', { name: 'Sign in to open Boat management' }))
      expect(onSignIn).toHaveBeenLastCalledWith('/boat-management')

      await user.click(screen.getByRole('button', { name: 'Sign in to open Boat performance' }))
      expect(onSignIn).toHaveBeenLastCalledWith('/boat-performance')
      expect(onSignIn).toHaveBeenCalledTimes(2)
    })

    it('hides the padlock from a screen reader, which the button has already said', () => {
      const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      expect(lockedRow(container, 'Boat management')?.querySelector('[data-testid="padlock"]'))
        .toHaveAttribute('aria-hidden')
    })

    it('opens both rows into ordinary links once the sailor is signed in', () => {
      const { container } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />
      )

      expect(container.querySelectorAll('[data-testid="locked-entry"]')).toHaveLength(0)
      expect(container.querySelectorAll('[data-testid="padlock"]')).toHaveLength(0)
      expect(screen.getByRole('link', { name: 'Boat management' })).toHaveAttribute(
        'href',
        '/boat-management'
      )
      expect(screen.getByRole('link', { name: 'Boat performance' })).toHaveAttribute(
        'href',
        '/boat-performance'
      )
      // The only "Sign in" left anywhere would be the footer's, and a signed-in
      // sailor does not get that either.
      expect(screen.queryByText('Sign in')).not.toBeInTheDocument()
    })

    it('locks nothing else — the three open sections never lock for a Guest', () => {
      render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      for (const label of ['Dashboard', 'Wind Data', 'Settings']) {
        const row = screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') })
        expect(row.querySelector('[data-testid="padlock"]')).toBeNull()
      }
    })

    it('keeps the row geometry identical across the lock', () => {
      const { container: asGuest, unmount } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} />
      )
      const locked = lockedRow(asGuest, 'Boat management')
      unmount()

      const { container: signedIn } = render(
        <HamburgerMenu {...defaultProps} isOpen={true} account={CREW} />
      )
      const open = screen.getByRole('link', { name: 'Boat management' })

      // A locked row occupies the same space as an open one, so unlocking the pair
      // does not shift every row beneath them.
      expect(locked).toHaveStyle({ padding: '12px 12px', margin: '2px 0', gap: '12px' })
      expect(open).toHaveStyle({ padding: '12px 12px', margin: '2px 0', gap: '12px' })
      expect(signedIn.querySelectorAll('[data-testid="locked-entry"]')).toHaveLength(0)
    })

    it('holds "Boat performance" on one line at 268px', () => {
      const { container } = render(<HamburgerMenu {...defaultProps} isOpen={true} />)

      // The arithmetic is in ADR 0016 — ~105px of label against a ~196px budget,
      // now shared with a padlock and a "Sign in" — so the wrap this guards
      // against would have to come from a style change rather than from the width.
      // Whether it *lays out* on one line is a browser question, and
      // `e2e/boat-sections.spec.ts` asks it there.
      const label = lockedRow(container, 'Boat performance')?.querySelector('span')
      expect(label).toHaveStyle({ whiteSpace: 'nowrap' })
    })
  })
})
