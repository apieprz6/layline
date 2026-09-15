import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { PolarVersionDetail, PolarVersionList, PolarVersionSummary } from '@/types'

const redirect = jest.fn((to: string) => {
  // The real `redirect()` throws to abandon the render; a mock that returned would let the
  // page fall through into markup it never reaches in Next.
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn(async () => null) }))

jest.mock('@/services/boat/readPolarVersions', () => ({ readPolarScreen: jest.fn() }))

// The panel is never submitted from here, but it imports the actions module, which reaches for
// `next/cache` and a Supabase client at import time.
jest.mock('@/components/boat/PolarUploadPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="polar-upload-panel" />,
}))

import PolarPage from '../page'

const V1: PolarVersionSummary = {
  id: 'version-1',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'FIRST_10R.pol',
  content_sha256: 'a'.repeat(64),
  is_current: true,
}

const DETAIL: PolarVersionDetail = {
  ...V1,
  payload: {
    twa_axis: [52, 60],
    tws_axis: [4, 6],
    boat_speed: [
      [3.96, 5.39],
      [4.25, 5.66],
    ],
    source: { format: 'orc-pol', header_token: 'twa/tws' },
  },
}

const ONE_VERSION: PolarVersionList = { current_version_id: 'version-1', versions: [V1] }
const EMPTY: PolarVersionList = { current_version_id: null, versions: [] }

describe('/boat-management/polar', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readPolarScreen } = jest.requireMock('@/services/boat/readPolarVersions')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readPolarScreen.mockResolvedValue({ list: ONE_VERSION, current: DETAIL })
  })

  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await PolarPage())
    return container
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(PolarPage()).rejects.toThrow('NEXT_REDIRECT')

    // The ticket calls this "the locked screen", which was ADR 0015's original shape; LAY-104
    // replaced it with the redirect, and this page follows its sibling.
    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-management%2Fpolar')
    expect(readPolarScreen).not.toHaveBeenCalled()
    expect(document.body.textContent).toBe('')
  })

  it('shows the grid in force and every Version to a signed-in viewer', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.getByTestId('polar-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('polar-version-row')).toHaveLength(1)
  })

  it('offers a viewer no upload', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.queryByTestId('polar-upload-panel')).not.toBeInTheDocument()
  })

  it('offers an admin the upload', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })

    await renderPage()

    expect(screen.getByTestId('polar-upload-panel')).toBeInTheDocument()
  })

  it('asks for the list and the grid in force in one read of the artifact', async () => {
    await renderPage()

    // One question, not two: `readPolarVersions` and `readPolarVersion` each begin by finding the
    // artifact, so calling both in turn asks four things of the database to answer two.
    expect(readPolarScreen).toHaveBeenCalledTimes(1)
    expect(readPolarScreen).toHaveBeenCalledWith()
  })

  it('shows an empty archive as empty', async () => {
    readPolarScreen.mockResolvedValue({ list: EMPTY, current: null })

    await renderPage()

    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument()
    expect(screen.getByTestId('empty-state').textContent).toMatch(/No Polar recorded/)
  })

  it('reports a failed read as a failed read', async () => {
    readPolarScreen.mockResolvedValue(null)

    await renderPage()

    expect(screen.getByTestId('empty-state').textContent).toMatch(/could not be read/)
  })

  it('lists the Versions even when the grid in force cannot be read', async () => {
    // A payload that is not a grid is a fault in one row, not a reason to hide the archive.
    readPolarScreen.mockResolvedValue({ list: ONE_VERSION, current: null })

    await renderPage()

    expect(screen.getAllByTestId('polar-version-row')).toHaveLength(1)
    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument()
  })

  it('shows an empty archive as empty, not as loading', async () => {
    readPolarScreen.mockResolvedValue({ list: EMPTY, current: null })

    const page = await renderPage()

    expect(page.querySelector('[aria-busy="true"]')).toBeNull()
    expect(page.textContent).not.toMatch(/loading/i)
  })
})
