import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'

const redirect = jest.fn((to: string) => {
  // The real `redirect()` throws to abandon the render; a mock that returned
  // would let the page fall through into markup it never reaches in Next.
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

// The one server resolve site is stubbed: this suite is about whether the route
// serves this screen or nobody, not about how a JWT is verified (that is
// resolveAccount's own suite).
jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

import BoatManagementPage from '../page'

describe('/boat-management', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
  })

  // An async Server Component is a function returning a promise of an element;
  // awaiting it is how the server does it, and how a test has to.
  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await BoatManagementPage())
    return container
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    await expect(BoatManagementPage()).rejects.toThrow('NEXT_REDIRECT')

    // Back to the dashboard with the sheet open and the destination remembered,
    // so finishing sign-in lands on the section they were aiming for (ADR 0015).
    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-management')
  })

  it('renders no part of the screen while deciding — the Guest gets no markup', async () => {
    // The point of the redirect over a locked screen: there is no signed-out
    // rendering of this route at all, so nothing about the boat can leak from one.
    await expect(BoatManagementPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(document.body.textContent).toBe('')
  })

  it('opens the section itself once the sailor is signed in', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByRole('heading', { name: 'Boat management' })).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('opens for a viewer as readily as for an admin — the Role governs writes only', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })
    const asAdmin = await renderPage()

    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })
    const asViewer = await renderPage()

    expect(asViewer.textContent).toBe(asAdmin.textContent)
  })
})
