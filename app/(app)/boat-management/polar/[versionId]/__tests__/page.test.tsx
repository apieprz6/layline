import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { PolarVersionDetail } from '@/types'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn(async () => null) }))

jest.mock('@/services/boat/readPolarVersions', () => ({ readPolarVersion: jest.fn() }))

import PolarVersionPage from '../page'

const VERSION: PolarVersionDetail = {
  id: '3f1b2c4d-0000-4000-8000-000000000001',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'FIRST_10R.pol',
  content_sha256: 'a'.repeat(64),
  is_current: false,
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

describe('/boat-management/polar/[versionId]', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readPolarVersion } = jest.requireMock('@/services/boat/readPolarVersions')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readPolarVersion.mockResolvedValue(VERSION)
  })

  /** Next 16 hands params as a promise, which is how the page takes them. */
  function params(versionId: string): { params: Promise<{ versionId: string }> } {
    return { params: Promise.resolve({ versionId }) }
  }

  async function renderPage(versionId = VERSION.id): Promise<HTMLElement> {
    const { container } = render(await PolarVersionPage(params(versionId)))
    return container
  }

  it('serves a Guest nothing, and remembers the Version they were aiming at', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(PolarVersionPage(params(VERSION.id))).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith(
      `/?signin=%2Fboat-management%2Fpolar%2F${VERSION.id}`
    )
    expect(readPolarVersion).not.toHaveBeenCalled()
  })

  it('reads the Version named in the route', async () => {
    await renderPage()

    expect(readPolarVersion).toHaveBeenCalledWith(VERSION.id)
  })

  it('shows a superseded Version to a viewer, grid, file and hash', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const page = await renderPage()

    expect(screen.getByTestId('polar-grid')).toBeInTheDocument()
    expect(page.textContent).toMatch('FIRST_10R.pol')
    expect(page.textContent).toMatch('a'.repeat(64))
  })

  it('offers an admin nothing extra — a recorded Version is immutable', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })

    const page = await renderPage()

    // The way to change the boat's polar is to upload the next one, so there is no editor
    // here for an admin to be given and none for a viewer to be missing.
    expect(page.querySelectorAll('form')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('says there is no such Version rather than showing an empty one', async () => {
    readPolarVersion.mockResolvedValue(null)

    await renderPage('not-a-version')

    expect(screen.getByTestId('empty-state').textContent).toMatch(/No such Polar Version/)
    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument()
  })
})
