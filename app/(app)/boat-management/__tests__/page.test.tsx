import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'
import type { BoatSetup } from '@/types'

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

// Likewise the read: what PostgREST is asked for is readBoatSetup's own suite.
jest.mock('@/services/boat/readBoatSetup', () => ({
  readBoatSetup: jest.fn(),
}))

// The write is never reached from here — no test submits — but the editor imports
// it, and the real module reaches for `next/cache` and a Supabase client.
jest.mock('../actions', () => ({
  saveBoatIdentity: jest.fn(async () => ({ ok: true })),
}))

import BoatManagementPage from '../page'

/** An empty archive: the boat exists, none of its four artifacts has a Version. */
const EMPTY_ARCHIVE: BoatSetup = {
  boat: {
    id: 'boat-1',
    name: 'Handsome Pete',
    model: 'Beneteau 10R',
    created_at: '2026-09-10T18:30:00Z',
    updated_at: '2026-09-10T18:30:00Z',
  },
  artifacts: BOAT_SETUP_ORDER.map((kind) => ({ kind, current: null })),
}

describe('/boat-management', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readBoatSetup } = jest.requireMock('@/services/boat/readBoatSetup')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
    readBoatSetup.mockResolvedValue(EMPTY_ARCHIVE)
  })

  // An async Server Component is a function returning a promise of an element;
  // awaiting it is how the server does it, and how a test has to.
  // The read sits behind a `<Suspense>` (LAY-132), so awaiting the page hands back a
  // tree with the boat still unresolved inside it. `resolveServerTree` calls it the way
  // the server does, which is what puts the settled screen in front of these assertions
  // rather than its skeleton.
  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await resolveServerTree(await BoatManagementPage()))
    // And prove it did: several assertions below are about what is *absent*, and every
    // one of them would pass against a skeleton if the tree came back unresolved.
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
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
    expect(readBoatSetup).not.toHaveBeenCalled()
  })

  it('names the boat itself, from the row — the heading is its identity', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    // Not "Boat management": the section's own name is the eyebrow above, because
    // the boat's identity *is* this header and there is nowhere else it lives.
    expect(screen.getByRole('heading', { name: 'Handsome Pete' })).toBeInTheDocument()
    expect(screen.getByText('Beneteau 10R')).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('never shows placeholder identity copy', async () => {
    resolveAccount.mockResolvedValue(CREW)

    const page = await renderPage()

    // The mockup's boat. It names a boat nobody owns, and a placeholder identity is
    // a value that looks like a record and is not one.
    expect(page.textContent).not.toMatch(/Wayward Wind|J\/105/)
  })

  it('lists the four Boat Setup artifacts, every one not recorded', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByText('Polar')).toBeInTheDocument()
    expect(screen.getByText('Crossover Chart')).toBeInTheDocument()
    expect(screen.getByText('Rig Tune')).toBeInTheDocument()
    expect(screen.getByText('Instrument Calibration')).toBeInTheDocument()
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(4)
  })

  it('shows an empty screen as empty, not as loading', async () => {
    resolveAccount.mockResolvedValue(CREW)

    const page = await renderPage()

    // Nothing resolves later in this render. A skeleton would promise a value that
    // is not coming, which is the third way of lying about an absent one.
    expect(page.querySelector('[aria-busy="true"]')).toBeNull()
    expect(page.textContent).not.toMatch(/loading|…/i)
  })

  it('opens for a viewer as readily as for an admin — the Role governs writes only', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.getByRole('heading', { name: 'Handsome Pete' })).toBeInTheDocument()
    expect(screen.getAllByTestId('not-recorded')).toHaveLength(4)
  })

  it('offers a viewer no way to edit the identity it is showing them', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('lets an admin edit the name and model in place, prefilled with what is recorded', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })
    await renderPage()

    // Closed until asked for: the header reads as the boat's identity, not as a form.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: /edit/i }))

    expect(screen.getByLabelText(/name/i)).toHaveValue('Handsome Pete')
    expect(screen.getByLabelText(/model/i)).toHaveValue('Beneteau 10R')
  })

  it('says so plainly when the boat cannot be read, and names no boat', async () => {
    resolveAccount.mockResolvedValue(CREW)
    readBoatSetup.mockResolvedValue(null)

    const page = await renderPage()

    // A failed read is reported as a failed read. The alternative — a header with a
    // blank name, or a remembered one — would be the screen inventing its subject.
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(page.textContent).not.toMatch(/Handsome Pete|Beneteau/)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
