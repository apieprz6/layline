import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import { SAIL_SELECTION_TEASER_RACES } from '@/components/analysis/SailSelectionTeaser'
import { CHART, ROWS, RACES, matchableRow } from '@/components/analysis/__tests__/fixture'
import { headingEra, tuningSeason } from '@/components/boat/instrument-tuning/__tests__/fixtures'

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

// And the whole-archive instrument read the third row's coverage word comes off (LAY-160). Mocked
// for the same reason as the other two, and because this is the expensive read on the tab: it is
// every Race's whole Transcription, which is `readInstrumentTuning`'s own suite to drive.
jest.mock('@/services/analysis/readInstrumentTuning', () => ({
  readInstrumentTuning: jest.fn(async () => ({ ok: false, reason: 'no-races' })),
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
    readRecentRaceRows.mockResolvedValue({ rows: [], races: [], polars: {} })
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
  const { readInstrumentTuning } = jest.requireMock('@/services/analysis/readInstrumentTuning')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readCrossoverChartScreen.mockResolvedValue({ list: [], current: { payload: CHART } })
    readInstrumentTuning.mockResolvedValue({
      ok: true,
      season: tuningSeason(),
      log: [],
      races: [],
    })
  })

  async function renderOverall(): Promise<void> {
    render(await resolveServerTree(await BoatPerformancePage()))
    await userEvent.setup({ delay: null }).click(screen.getByRole('tab', { name: 'Overall' }))
  }

  it('heroes the Polar performance teaser, which taps through to the detail screen', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })

    await renderOverall()

    const teaser = screen.getByTestId('polar-performance-teaser')
    expect(teaser).toHaveAttribute('href', '/boat-performance/polar')
    // Five races asked for, two came back: the card says two rather than claiming five.
    expect(teaser).toHaveTextContent('across 2 races')
  })

  it('asks the database for the wider of the two windows, once', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })

    await renderOverall()

    // The limit is the whole saving: the remaining races' Transcriptions would be read, assessed
    // and scored to make rows this tab never shows. One read for both cards, at the wider window,
    // rather than two overlapping on the five the Polar card wants.
    expect(readRecentRaceRows).toHaveBeenCalledTimes(1)
    expect(readRecentRaceRows).toHaveBeenCalledWith(SAIL_SELECTION_TEASER_RACES)
    expect(SAIL_SELECTION_TEASER_RACES).toBeGreaterThan(TEASER_RACES)
  })

  it('keeps the Polar card to its own five races out of the ten read', async () => {
    // Six races came back, so the two cards' windows genuinely differ: the Polar card is over the
    // five most recently sailed and the card below it over all six.
    const races = Array.from({ length: 6 }, (_, index) => ({
      id: `race-${index}`,
      title: `race ${index}`,
      // Newest first, as the database orders them on `window_start` descending.
      day: `2026-0${6 - index}-01`,
      seconds: 60,
    }))

    readRecentRaceRows.mockResolvedValue({
      rows: races.map((race) => matchableRow({ race_id: race.id })),
      races,
      polars: {},
    })

    await renderOverall()

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      `across ${TEASER_RACES} races`
    )
    expect(screen.getByTestId('sail-selection-teaser')).toHaveTextContent('over the last 6 races')
  })

  it('adds the Sail selection chart row, stating agreement and tapping through', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })

    await renderOverall()

    const row = screen.getByTestId('sail-selection-teaser')
    expect(row).toHaveAttribute('href', '/boat-performance/sail-selection')
    // Two of the fixture's Countable rows carried Main + Jib 1 where their own cell calls for it;
    // the third recorded no sail at all, so it is placed and not judgeable.
    expect(row).toHaveTextContent('100.0%')
    expect(row).toHaveTextContent('carried what the chart calls for')
    expect(row).toHaveTextContent('over the last 2 races')
    expect(row).toHaveTextContent('whose sail was written down')
  })

  it('says there is no chart yet rather than drawing an agreement figure over none', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    readCrossoverChartScreen.mockResolvedValue({ list: [], current: null })

    await renderOverall()

    // Not an error, and not an empty grid: the grid *is* the chart, so with none uploaded there is
    // nothing for the archive to be laid over, however much racing has been logged.
    expect(screen.getByTestId('sail-selection-teaser')).toHaveTextContent(
      'No Crossover Chart has been uploaded yet.'
    )
  })

  it('says there is nothing to summarise rather than drawing a figure over no rows', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: [], races: [], polars: {} })

    await renderOverall()

    expect(screen.getByText('Nothing to summarise yet')).toBeInTheDocument()
    expect(screen.queryByTestId('polar-performance-teaser')).not.toBeInTheDocument()
  })

  it('tells a failed read apart from an empty archive', async () => {
    readRecentRaceRows.mockResolvedValue(null)

    await renderOverall()

    // "No races" over a failed read would be Layline claiming the sailor has sailed nothing — and
    // it is the same sentence the detail screen shows, from the same component, so the two cannot
    // drift into disagreeing about what happened. One message, standing in for the pair of cards
    // that share this read — not printed once per card.
    expect(screen.getByText('The archive could not be read')).toBeInTheDocument()
    expect(screen.queryByTestId('polar-performance-teaser')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sail-selection-teaser')).not.toBeInTheDocument()
  })

  it('keeps the Instrument tuning card independent even when the race window read fails', async () => {
    readRecentRaceRows.mockResolvedValue(null)
    readInstrumentTuning.mockResolvedValue({
      ok: true,
      season: tuningSeason(),
      log: [],
      races: [],
    })

    await renderOverall()

    // The ten-race read failing is a fact about that query alone — the Instrument tuning card
    // reads the archive on a different query and says what it found, independently of a sibling
    // it never asked anything of.
    expect(screen.getByText('The archive could not be read')).toBeInTheDocument()
    expect(screen.getByTestId('instrument-tuning-teaser')).toBeInTheDocument()
    expect(screen.getByTestId('tuning-coverage')).toBeInTheDocument()
  })

  it('adds the Instrument tuning row beneath the other two, tapping through to the charts', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    readInstrumentTuning.mockResolvedValue({
      ok: true,
      // One `ANECDOTAL` channel among two solid ones, which is the word under the three figures.
      season: tuningSeason({ heading: [headingEra([], { headings_on_two_or_more_races: 4 })] }),
      log: [],
      races: [],
    })

    await renderOverall()

    const row = screen.getByTestId('instrument-tuning-teaser')
    expect(row).toHaveAttribute('href', '/boat-performance/instrument-tuning')
    // The three channels, each with what its figure rests on, and the worst of their words beneath.
    expect(screen.getAllByTestId('tuning-channel')).toHaveLength(3)
    expect(screen.getByTestId('tuning-coverage')).toHaveTextContent('anecdotal')
    expect(row).toHaveTextContent('4 of 36 headings rest on two or more Races')
    expect(row).toHaveTextContent('9 of 10 Races carry a line of their own')

    // Third of three, which is the order the tab's rows are a list of doors in: the Polar hero, the
    // Sail selection chart, then this.
    const above = screen.getByTestId('sail-selection-teaser')
    expect(above.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('asks the archive for the instrument season once, and only for this row', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })

    await renderOverall()

    // The expensive read on the tab — every Race's whole Transcription, uncached by ADR 0009. One
    // call for one word, and nothing above it waits on the answer: the row has a boundary of its
    // own, so the rows that are already measured paint while this one is still reading.
    expect(readInstrumentTuning).toHaveBeenCalledTimes(1)
    expect(readInstrumentTuning).toHaveBeenCalledWith()
  })

  it('keeps a failed instrument read to its own row', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    readInstrumentTuning.mockResolvedValue({ ok: false, reason: 'unreadable' })

    await renderOverall()

    // The two rows above are measured over a read that worked, so they still say what they found.
    expect(screen.getByTestId('polar-performance-teaser')).toBeInTheDocument()
    expect(screen.getByTestId('sail-selection-teaser')).toBeInTheDocument()

    const row = screen.getByTestId('instrument-tuning-teaser')
    expect(row).toHaveTextContent('The archive could not be read.')
    // And no coverage word over the part of the season that loaded: that read is all-or-nothing,
    // because a season over the Races that happened to load would present as a complete one.
    expect(screen.queryByTestId('tuning-coverage')).not.toBeInTheDocument()
  })
})
