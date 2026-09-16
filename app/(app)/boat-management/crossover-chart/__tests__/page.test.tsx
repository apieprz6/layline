import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import type {
  CrossoverChartVersionDetail,
  FileBackedVersionList,
  FileBackedVersionSummary,
} from '@/types'

const redirect = jest.fn((to: string) => {
  // The real `redirect()` throws to abandon the render; a mock that returned would let the
  // page fall through into markup it never reaches in Next.
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn(async () => null) }))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartScreen: jest.fn(),
}))

// The panel is never submitted from here, but it imports the actions module, which reaches for
// `next/cache` and a Supabase client at import time.
jest.mock('@/components/boat/CrossoverChartUploadPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="crossover-chart-upload-panel" />,
}))

import CrossoverChartPage from '../page'

const V1: FileBackedVersionSummary = {
  id: 'version-1',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'HandsomePete_2026.sailselect',
  content_sha256: 'a'.repeat(64),
  is_current: true,
}

const DETAIL: CrossoverChartVersionDetail = {
  ...V1,
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

const ONE_VERSION: FileBackedVersionList = { current_version_id: 'version-1', versions: [V1] }
const EMPTY: FileBackedVersionList = { current_version_id: null, versions: [] }

describe('/boat-management/crossover-chart', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readCrossoverChartScreen.mockResolvedValue({ list: ONE_VERSION, current: DETAIL })
  })

  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await CrossoverChartPage())
    return container
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(CrossoverChartPage()).rejects.toThrow('NEXT_REDIRECT')

    // The ticket calls this "the locked screen", which was ADR 0015's original shape; LAY-104
    // replaced it with the redirect, and this page follows its siblings.
    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-management%2Fcrossover-chart')
    expect(readCrossoverChartScreen).not.toHaveBeenCalled()
    expect(document.body.textContent).toBe('')
  })

  it('shows the chart in force and every Version to a signed-in viewer', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.getByTestId('crossover-chart-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('crossover-chart-version-row')).toHaveLength(1)
  })

  it('offers a viewer no upload', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.queryByTestId('crossover-chart-upload-panel')).not.toBeInTheDocument()
  })

  it('offers an admin the upload', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'admin' })

    await renderPage()

    expect(screen.getByTestId('crossover-chart-upload-panel')).toBeInTheDocument()
  })

  it('asks for the list and the chart in force in one read of the artifact', async () => {
    await renderPage()

    // One question, not two: each read begins by finding the artifact, so calling both in turn
    // asks four things of the database to answer two.
    expect(readCrossoverChartScreen).toHaveBeenCalledTimes(1)
    expect(readCrossoverChartScreen).toHaveBeenCalledWith()
  })

  it('shows an empty archive as empty', async () => {
    readCrossoverChartScreen.mockResolvedValue({ list: EMPTY, current: null })

    await renderPage()

    expect(screen.queryByTestId('crossover-chart-grid')).not.toBeInTheDocument()
    expect(screen.getByTestId('empty-state').textContent).toMatch(/No Crossover Chart recorded/)
  })

  it('reports a failed read as a failed read', async () => {
    readCrossoverChartScreen.mockResolvedValue(null)

    await renderPage()

    expect(screen.getByTestId('empty-state').textContent).toMatch(/could not be read/)
  })

  it('lists the Versions even when the chart in force cannot be read', async () => {
    // A payload that is not a chart is a fault in one row, not a reason to hide the archive.
    readCrossoverChartScreen.mockResolvedValue({ list: ONE_VERSION, current: null })

    await renderPage()

    expect(screen.getAllByTestId('crossover-chart-version-row')).toHaveLength(1)
    expect(screen.queryByTestId('crossover-chart-grid')).not.toBeInTheDocument()
  })

  it('shows an empty archive as empty, not as loading', async () => {
    readCrossoverChartScreen.mockResolvedValue({ list: EMPTY, current: null })

    const page = await renderPage()

    expect(page.querySelector('[aria-busy="true"]')).toBeNull()
    expect(page.textContent).not.toMatch(/loading/i)
  })
})
