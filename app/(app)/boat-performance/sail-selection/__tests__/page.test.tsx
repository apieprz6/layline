import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { CHART, ROWS, RACES, VOCABULARY } from '@/components/analysis/__tests__/fixture'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

jest.mock('@/services/analysis/readArchive', () => ({
  readAnalysisArchive: jest.fn(async () => null),
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartScreen: jest.fn(async () => null),
}))

jest.mock('@/services/boat/readPolarVersions', () => ({
  readPolarScreen: jest.fn(async () => null),
}))

import SailSelectionPage from '../page'

/**
 * The route: who is served, and the four answers its three reads can produce.
 *
 * The screen's own behaviour is `components/analysis/__tests__/SailSelectionContent.test.tsx`'s.
 * What is asked here is the page's job — the guard, the `searchParams` read, and the fact that a
 * failed archive, an empty one, a missing **Crossover Chart** and a missing **Polar** are four
 * different things to say and not one error.
 */
describe('/boat-performance/sail-selection', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readAnalysisArchive } = jest.requireMock('@/services/analysis/readArchive')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )
  const { readPolarScreen } = jest.requireMock('@/services/boat/readPolarVersions')

  const POLAR = {
    twa_axis: [30, 90, 180],
    tws_axis: [4, 10, 14],
    boat_speed: [
      [1, 2, 3],
      [4, 6, 7],
      [3, 5, 6],
    ],
    source: { format: 'orc-pol', header_token: 'twa/tws' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readAnalysisArchive.mockResolvedValue({ rows: ROWS, races: RACES, vocabulary: VOCABULARY })
    readCrossoverChartScreen.mockResolvedValue({ list: [], current: { payload: CHART } })
    readPolarScreen.mockResolvedValue({ list: [], current: { payload: POLAR } })
  })

  /** The reads sit behind a `<Suspense>`, so the tree has to be settled before it is rendered. */
  async function renderPage(
    params: Record<string, string | string[] | undefined> = {}
  ): Promise<void> {
    const page = await SailSelectionPage({ searchParams: Promise.resolve(params) })
    const { container } = render(await resolveServerTree(page))
    // And prove it settled: an unresolved tree renders the skeleton, which every negative
    // assertion below would sail straight through.
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(SailSelectionPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT'
    )

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-performance%2Fsail-selection')
    expect(readAnalysisArchive).not.toHaveBeenCalled()
    expect(document.body.textContent).toBe('')
  })

  it('draws the rail, the ledger, the four thumbnails and the grid to a signed-in sailor', async () => {
    await renderPage()

    expect(screen.getByTestId('analysis-filter-rail')).toBeInTheDocument()
    expect(screen.getByTestId('coverage-ledger')).toBeInTheDocument()
    expect(screen.getAllByTestId('sail-selection-layer')).toHaveLength(4)
    expect(screen.getAllByTestId('sail-selection-cell')).toHaveLength(6)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('renders a shared link’s own narrowing on first paint, before any hydration', async () => {
    await renderPage({ wind: 'heavy' })

    expect(screen.getByTestId('filter-chip-wind')).toHaveTextContent('Heavy (16–22 kt)')
  })

  it('offers no sail chip, whatever the URL says about one', async () => {
    await renderPage({ sail: 'Main + Jib 1' })

    // The registry is the authority on what this screen narrows by, not the query string
    // (ADR 0029): the sail is the chart's own answer here.
    expect(screen.queryByTestId('filter-chip-sail')).not.toBeInTheDocument()
    expect(screen.getByTestId('analysis-filter-rail').querySelectorAll('button')).toHaveLength(5)
  })

  it('says the archive could not be read, which is not the same as having no races', async () => {
    readAnalysisArchive.mockResolvedValue(null)

    await renderPage()

    expect(screen.getByText('The archive could not be read')).toBeInTheDocument()
    expect(screen.queryByTestId('sail-selection-grid')).not.toBeInTheDocument()
  })

  it('says there is no chart yet, because the grid is the chart', async () => {
    readCrossoverChartScreen.mockResolvedValue({ list: [], current: null })

    await renderPage()

    expect(screen.getByText('No Crossover Chart yet')).toBeInTheDocument()
    expect(screen.queryByTestId('sail-selection-grid')).not.toBeInTheDocument()
  })

  it('says an empty archive is empty rather than drawing four layers over nothing', async () => {
    readAnalysisArchive.mockResolvedValue({ rows: [], races: [], vocabulary: VOCABULARY })

    await renderPage()

    expect(screen.getByText('No sailing to lay over the chart yet')).toBeInTheDocument()
    expect(screen.queryByTestId('sail-selection-grid')).not.toBeInTheDocument()
  })

  it('draws the whole screen with no Polar, having only lost the structural claim', async () => {
    readPolarScreen.mockResolvedValue(null)

    await renderPage()

    // Every figure still holds: each row's Target Speed came from the Polar its own Race was
    // sailed under (ADR 0012) and is not re-derived here. What is gone is the claim that a region
    // can *never* hold one, so no cell is called structurally hopeless.
    expect(screen.getByTestId('sail-selection-grid')).toBeInTheDocument()
    expect(screen.getByTestId('sail-selection-summary')).toBeInTheDocument()
  })

  it('keeps the way back to the section it belongs to', async () => {
    await renderPage()

    expect(screen.getByRole('link', { name: '← Boat performance' })).toHaveAttribute(
      'href',
      '/boat-performance'
    )
  })
})
