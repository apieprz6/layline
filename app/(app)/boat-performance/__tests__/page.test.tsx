import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import { CHART, ROWS, RACES } from '@/components/analysis/__tests__/fixture'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

// The Overall tab reads the five most recent races, scored (LAY-155). Mocked here because what
// this suite asks is whether the tab gets its own boundary and its own content —
// `readRecentRaceRows`'s own behaviour is its module's business.
jest.mock('@/services/analysis/readArchive', () => ({
  readRecentRaceRows: jest.fn(async () => null),
}))

// And the boat's current Crossover Chart, which the Sail selection row's coverage is counted over
// (LAY-158). Mocked for the same reason, and because the grid *is* the chart: with none uploaded
// the row has a different thing to say, and that is one of the cases below.
jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartScreen: jest.fn(async () => null),
}))

import BoatPerformancePage from '../page'

describe('/boat-performance', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readRecentRaceRows } = jest.requireMock('@/services/analysis/readArchive')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
    readRecentRaceRows.mockResolvedValue({ rows: [], races: [] })
    readCrossoverChartScreen.mockResolvedValue(null)
  })

  // The read sits behind a `<Suspense>` (LAY-132), so awaiting the page hands back a
  // tree with the archive still unresolved inside it. `resolveServerTree` calls it the
  // way the server does, which is what puts the settled screen in front of these
  // assertions rather than its skeleton.
  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await resolveServerTree(await BoatPerformancePage()))
    // And prove it did: an unresolved tree renders the skeleton, which the negative
    // assertions below would sail straight through.
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    return container
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    await expect(BoatPerformancePage()).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-performance')
    // Not even the tab strip: a Guest is shown no part of the screen, rather than
    // its shape with the readings taken out.
    expect(document.body.textContent).toBe('')
  })

  it('opens both tabs once the sailor is signed in', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByRole('tab', { name: 'Races' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overall' })).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('the Overall tab', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readRecentRaceRows } = jest.requireMock('@/services/analysis/readArchive')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readCrossoverChartScreen.mockResolvedValue({ list: [], current: { payload: CHART } })
  })

  async function renderOverall(): Promise<void> {
    render(await resolveServerTree(await BoatPerformancePage()))
    await userEvent.setup({ delay: null }).click(screen.getByRole('tab', { name: 'Overall' }))
  }

  it('heroes the Polar performance teaser, which taps through to the detail screen', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES })

    await renderOverall()

    const teaser = screen.getByTestId('polar-performance-teaser')
    expect(teaser).toHaveAttribute('href', '/boat-performance/polar')
    // Five races asked for, two came back: the card says two rather than claiming five.
    expect(teaser).toHaveTextContent('across 2 races')
  })

  it('asks the database for five races rather than reading the archive and slicing it', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES })

    await renderOverall()

    // The limit is the whole saving: the other eight races' Transcriptions were being read,
    // assessed and scored to make rows this card never shows.
    expect(readRecentRaceRows).toHaveBeenCalledWith(TEASER_RACES)
  })

  it('adds the Sail selection chart row, stating coverage and tapping through', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES })

    await renderOverall()

    const row = screen.getByTestId('sail-selection-teaser')
    expect(row).toHaveAttribute('href', '/boat-performance/sail-selection')
    // Three of the fixture chart's six cells were reached, over the two races that came back.
    expect(row).toHaveTextContent('3')
    expect(row).toHaveTextContent('of 6 cells reached')
    expect(row).toHaveTextContent('Over the last 2 races')
  })

  it('says there is no chart yet rather than drawing a coverage figure over none', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES })
    readCrossoverChartScreen.mockResolvedValue({ list: [], current: null })

    await renderOverall()

    // Not an error, and not an empty grid: the grid *is* the chart, so with none uploaded there is
    // nothing for the archive to be laid over, however much racing has been logged.
    expect(screen.getByTestId('sail-selection-teaser')).toHaveTextContent(
      'No Crossover Chart has been uploaded yet.'
    )
  })

  it('says there is nothing to summarise rather than drawing a figure over no rows', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: [], races: [] })

    await renderOverall()

    expect(screen.getByText('Nothing to summarise yet')).toBeInTheDocument()
    expect(screen.queryByTestId('polar-performance-teaser')).not.toBeInTheDocument()
  })

  it('tells a failed read apart from an empty archive', async () => {
    readRecentRaceRows.mockResolvedValue(null)

    await renderOverall()

    // "No races" over a failed read would be Layline claiming the sailor has sailed nothing — and
    // it is the same sentence the detail screen shows, from the same component, so the two cannot
    // drift into disagreeing about what happened.
    expect(screen.getByText('The archive could not be read')).toBeInTheDocument()
  })
})
