import { render, screen } from '@testing-library/react'
import { AuthSheetOpener } from '@/components/auth/authSheetOpener'
import type { Account } from '@/types'

// The one server resolve site is stubbed: this suite is about which screen the
// route chooses, not about how a JWT is verified (that is resolveAccount's own
// suite).
jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

import BoatManagementPage from '../page'

const CREW: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  displayName: 'Jamie Torres',
  role: 'viewer',
}

describe('/boat-management', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
  })

  // An async Server Component is a function returning a promise of an element;
  // awaiting it is how the server does it, and how a test has to.
  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(
      <AuthSheetOpener value={jest.fn()}>{await BoatManagementPage()}</AuthSheetOpener>
    )
    return container
  }

  it('renders the locked screen for a Guest — no 404 and no redirect', async () => {
    const container = await renderPage()

    expect(screen.getByRole('heading', { name: 'Boat management' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByTestId('locked-placeholder')).toBeInTheDocument()
    // A deep link lands *here*, so nothing may leave: the sheet opens in place.
    expect(container.querySelector('a')).toBeNull()
  })

  it('names no boat and shows no figure to a Guest', async () => {
    const container = await renderPage()

    expect(container.textContent).not.toMatch(/handsome pete|beneteau/i)
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('opens the section itself once the sailor is signed in', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByRole('heading', { name: 'Boat management' })).toBeInTheDocument()
    expect(screen.queryByTestId('locked-placeholder')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('opens for a viewer as readily as for an admin — the Role governs writes only', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })
    const asAdmin = await renderPage()

    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })
    const asViewer = await renderPage()

    expect(asViewer.textContent).toBe(asAdmin.textContent)
  })
})
