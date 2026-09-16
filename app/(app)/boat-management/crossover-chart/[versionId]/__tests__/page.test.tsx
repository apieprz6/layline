import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { CrossoverChartVersionDetail } from '@/types'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn(async () => null) }))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartVersion: jest.fn(),
}))

import CrossoverChartVersionPage from '../page'

const VERSION: CrossoverChartVersionDetail = {
  id: '3f1b2c4d-0000-4000-8000-000000000001',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'HandsomePete_2026.sailselect',
  content_sha256: 'a'.repeat(64),
  is_current: false,
  payload: {
    twa_axis: [40, 80],
    tws_axis: [8, 12],
    cells: [
      [1, 1],
      [1, 2],
    ],
    sail_definitions: [
      { number: 1, label: 'GV + Genoa' },
      { number: 2, label: 'GV + A3' },
    ],
    source: {
      format: 'qtvlm-sailselect',
      header_token: 'TWA/TWS',
      definitions: {
        format: 'qtvlm-saildesc',
        filename: 'HandsomePete_2026.saildesc',
        content_sha256: 'c'.repeat(64),
      },
    },
  },
}

describe('/boat-management/crossover-chart/[versionId]', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readCrossoverChartVersion } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readCrossoverChartVersion.mockResolvedValue(VERSION)
  })

  /** Next 16 hands params as a promise, which is how the page takes them. */
  function params(versionId: string): { params: Promise<{ versionId: string }> } {
    return { params: Promise.resolve({ versionId }) }
  }

  async function renderPage(versionId = VERSION.id): Promise<HTMLElement> {
    const { container } = render(await CrossoverChartVersionPage(params(versionId)))
    return container
  }

  it('serves a Guest nothing, and remembers the Version they were aiming at', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(CrossoverChartVersionPage(params(VERSION.id))).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith(
      `/?signin=%2Fboat-management%2Fcrossover-chart%2F${VERSION.id}`
    )
    expect(readCrossoverChartVersion).not.toHaveBeenCalled()
  })

  it('reads the Version named in the route', async () => {
    await renderPage()

    expect(readCrossoverChartVersion).toHaveBeenCalledWith(VERSION.id)
  })

  it('shows a superseded Version to a viewer, chart and both files', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const page = await renderPage()

    expect(screen.getByTestId('crossover-chart-grid')).toBeInTheDocument()
    expect(page.textContent).toMatch('HandsomePete_2026.sailselect')
    expect(page.textContent).toMatch('HandsomePete_2026.saildesc')
    expect(page.textContent).toMatch('a'.repeat(64))
    expect(page.textContent).toMatch('c'.repeat(64))
  })

  it('offers an admin nothing extra — a recorded Version is immutable', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })

    const page = await renderPage()

    // The way to change the boat's sail choices is to upload the next pair of files, so there is
    // no editor here for an admin to be given and none for a viewer to be missing.
    expect(page.querySelectorAll('form')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('says there is no such Version rather than showing an empty one', async () => {
    readCrossoverChartVersion.mockResolvedValue(null)

    await renderPage('not-a-version')

    expect(screen.getByTestId('empty-state').textContent).toMatch(
      /No such Crossover Chart Version/
    )
    expect(screen.queryByTestId('crossover-chart-grid')).not.toBeInTheDocument()
  })
})
