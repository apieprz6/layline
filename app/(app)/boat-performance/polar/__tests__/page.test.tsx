import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { ROWS, RACES, VOCABULARY } from '@/components/analysis/__tests__/fixture'

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

import PolarPerformancePage from '../page'

describe('/boat-performance/polar', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readAnalysisArchive } = jest.requireMock('@/services/analysis/readArchive')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readAnalysisArchive.mockResolvedValue({ rows: ROWS, races: RACES, vocabulary: VOCABULARY })
  })

  /** The read sits behind a `<Suspense>`, so the tree has to be settled before it is rendered. */
  async function renderPage(
    params: Record<string, string | string[] | undefined> = {}
  ): Promise<void> {
    const page = await PolarPerformancePage({ searchParams: Promise.resolve(params) })
    const { container } = render(await resolveServerTree(page))
    // And prove it settled: an unresolved tree renders the skeleton, which every negative
    // assertion below would sail straight through.
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(
      PolarPerformancePage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-performance%2Fpolar')
    // Not even the rail: a Guest is shown no part of the screen, and the archive is not read.
    expect(readAnalysisArchive).not.toHaveBeenCalled()
    expect(document.body.textContent).toBe('')
  })

  it('draws the rail, the ledger and both figures to a signed-in sailor', async () => {
    await renderPage()

    expect(screen.getByTestId('analysis-filter-rail')).toBeInTheDocument()
    expect(screen.getByTestId('coverage-ledger')).toBeInTheDocument()
    expect(screen.getByTestId('polar-efficiency')).toBeInTheDocument()
    expect(screen.getByTestId('vmg-efficiency')).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('opens on the whole archive when the URL says nothing', async () => {
    await renderPage()

    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(
      '2 of 2 races · 4m recorded'
    )
    expect(screen.getByTestId('filter-chip-wind')).toHaveTextContent('Any')
  })

  it('renders a shared link’s own narrowing on first paint, before any hydration', async () => {
    await renderPage({ wind: 'heavy' })

    expect(screen.getByTestId('filter-chip-wind')).toHaveTextContent('Heavy (16–22 kt)')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('2m recorded')
  })

  it('reads a repeated param as a multi-select', async () => {
    await renderPage({ wind: ['light', 'heavy'] })

    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('3m recorded')
  })

  it('drops a bucket id this build does not know rather than narrowing to nothing', async () => {
    await renderPage({ wind: 'hurricane' })

    expect(screen.getByTestId('filter-chip-wind')).toHaveTextContent('Any')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('4m recorded')
  })

  it('reads a sail bucket named in the Crossover Chart’s own words', async () => {
    await renderPage({ sail: 'Main + Jib 1' })

    expect(screen.getByTestId('filter-chip-sail')).toHaveTextContent('Main + Jib 1')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('2m recorded')
  })

  it('says the archive could not be read, which is not the same as having no races', async () => {
    readAnalysisArchive.mockResolvedValue(null)

    await renderPage()

    expect(screen.getByText('The archive could not be read')).toBeInTheDocument()
    expect(screen.queryByTestId('analysis-filter-rail')).not.toBeInTheDocument()
  })

  it('says an empty archive is empty rather than drawing a filter over nothing', async () => {
    readAnalysisArchive.mockResolvedValue({ rows: [], races: [], vocabulary: VOCABULARY })

    await renderPage()

    expect(screen.getByText('No rows to measure yet')).toBeInTheDocument()
    expect(screen.queryByTestId('polar-efficiency')).not.toBeInTheDocument()
  })

  it('keeps the way back to the section it belongs to', async () => {
    await renderPage()

    expect(screen.getByRole('link', { name: '← Boat performance' })).toHaveAttribute(
      'href',
      '/boat-performance'
    )
  })
})
