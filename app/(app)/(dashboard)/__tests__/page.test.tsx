import { Children, type ReactElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { CREW } from '@/__tests__/fixtures/accounts'
import { RACES, ROWS } from '@/components/analysis/__tests__/fixture'
import LiveWindCard from '@/components/dashboard/LiveWindCard'
import type { LatestRace } from '@/types'
import DashboardPage from '../page'

// The station rows inside the live wind card navigate on tap.
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

jest.mock('@/services/buoys/ndbc', () => ({
  fetchCHII2: jest.fn(async () => ({
    data: { buoyId: 'CHII2', windSpeed: 12, windDirection: 245, timestamp: new Date().toISOString() },
    status: 'online',
  })),
  fetchPurdueBuoy: jest.fn(async () => ({ data: null, error: 'Purdue buoy offline', status: 'offline' })),
  buoyMetadata: jest.requireActual('@/services/buoys/ndbc').buoyMetadata,
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

jest.mock('@/services/analysis/readArchive', () => ({
  readRecentRaceRows: jest.fn(),
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartScreen: jest.fn(),
}))

jest.mock('@/services/analysis/readInstrumentTuning', () => ({
  readInstrumentTuning: jest.fn(),
}))

jest.mock('@/services/races/readLatestRace', () => ({
  readLatestRace: jest.fn(),
}))

/** The newest race, with a track that went dark for seven minutes in the middle of it. */
const LATEST: LatestRace = {
  id: 'race-newest',
  title: 'Verve Cup',
  window_start: '2026-08-22T11:05:00',
  window_finish: '2026-08-22T13:20:00',
  window_seconds: 8100,
  track: {
    width: 96,
    height: 64,
    runs: ['6.0,40.0 30.0,10.0', '60.0,20.0 90.0,58.0'],
    points: [],
    bridges: [{ x1: 30, y1: 10, x2: 60, y2: 20, seconds: 420, rows: 6 }],
    rings: [{ cx: 30, cy: 10 }],
  },
}

/** The Overall tab's three doors, and not the race card's. */
const OVERALL_CARDS = 'a[href^="/boat-performance"]:not([href^="/boat-performance/races/"])'
const RACE_CARD = 'a[href^="/boat-performance/races/"]'

describe('Dashboard', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readRecentRaceRows } = jest.requireMock('@/services/analysis/readArchive')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )
  const { readInstrumentTuning } = jest.requireMock('@/services/analysis/readInstrumentTuning')
  const { readLatestRace } = jest.requireMock('@/services/races/readLatestRace')

  beforeEach(() => {
    jest.clearAllMocks()
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    readCrossoverChartScreen.mockResolvedValue(null)
    readInstrumentTuning.mockResolvedValue({ ok: false, reason: 'no-races' })
    readLatestRace.mockResolvedValue({ ok: true, race: LATEST })
  })

  it('shows a Guest the live wind and no boat performance, without reading the archive', async () => {
    resolveAccount.mockResolvedValue(null)

    render(await resolveServerTree(await DashboardPage()))

    expect(screen.getByText('Live Wind')).toBeInTheDocument()
    expect(document.querySelector('a[href^="/boat-performance"]')).toBeNull()
    expect(readRecentRaceRows).not.toHaveBeenCalled()
    expect(readCrossoverChartScreen).not.toHaveBeenCalled()
    expect(readInstrumentTuning).not.toHaveBeenCalled()
    expect(readLatestRace).not.toHaveBeenCalled()
  })

  it('shows a signed-in sailor the three Overall cards below the live wind, each a door to its screen', async () => {
    resolveAccount.mockResolvedValue(CREW)

    render(await resolveServerTree(await DashboardPage()))

    const cards = Array.from(document.querySelectorAll(OVERALL_CARDS))
    expect(cards.map((a) => a.getAttribute('href'))).toEqual([
      '/boat-performance/polar',
      '/boat-performance/sail-selection',
      '/boat-performance/instrument-tuning',
    ])

    // Below the live wind card in document order, which is what stacks it beneath on a phone.
    const wind = screen.getByText('Live Wind')
    expect(wind.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('tells a signed-in sailor an unreadable archive is unreadable, not empty', async () => {
    resolveAccount.mockResolvedValue(CREW)
    readRecentRaceRows.mockResolvedValue(null)

    render(await resolveServerTree(await DashboardPage()))

    expect(screen.queryByText('Nothing to summarise yet')).not.toBeInTheDocument()
    // The Overall tab's own words, once per card that depends on the ten-race read.
    expect(screen.getAllByText('The archive could not be read')).toHaveLength(2)
  })

  it('tells a signed-in sailor an empty archive is empty, in the Overall tab\'s words', async () => {
    resolveAccount.mockResolvedValue(CREW)
    readRecentRaceRows.mockResolvedValue({ rows: [], races: [], polars: {} })

    render(await resolveServerTree(await DashboardPage()))

    expect(screen.getAllByText('Nothing to summarise yet')).toHaveLength(2)
    expect(screen.queryByText('The archive could not be read')).not.toBeInTheDocument()
  })

  it('hands back the live wind without waiting on any archive read', async () => {
    resolveAccount.mockResolvedValue(CREW)
    // Every archive read held on the wire, never to resolve.
    readRecentRaceRows.mockReturnValue(new Promise(() => {}))
    readCrossoverChartScreen.mockReturnValue(new Promise(() => {}))
    readInstrumentTuning.mockReturnValue(new Promise(() => {}))
    readLatestRace.mockReturnValue(new Promise(() => {}))

    // The page itself resolves, live wind card and all: the archive is awaited only inside
    // `OverallCards`' own boundaries, never by the page around them.
    const page = await DashboardPage()
    const children = Children.toArray(
      (page as ReactElement<{ children: ReactNode }>).props.children
    ) as ReactElement[]

    expect(children.some((child) => child.type === LiveWindCard)).toBe(true)
  })

  describe('the most recent race', () => {
    it('is the second card, beside the live wind and before the Overall cards, tapping through to that race', async () => {
      resolveAccount.mockResolvedValue(CREW)

      render(await resolveServerTree(await DashboardPage()))

      const card = document.querySelector(RACE_CARD) as HTMLAnchorElement
      expect(card.getAttribute('href')).toBe('/boat-performance/races/race-newest')
      expect(card).toHaveTextContent('Verve Cup')
      expect(card).toHaveTextContent('Aug 22 · 11:05 – 13:20')
      expect(card).toHaveTextContent('2h 15m')

      // Document order is what puts it beside Live Wind on a desktop and next under it on a phone.
      const wind = screen.getByText('Live Wind')
      const [firstOverall] = Array.from(document.querySelectorAll(OVERALL_CARDS))
      expect(wind.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(card.compareDocumentPosition(firstOverall) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('draws the track broken at the Dropout and bridged with its duration', async () => {
      resolveAccount.mockResolvedValue(CREW)

      render(await resolveServerTree(await DashboardPage()))

      const card = document.querySelector(RACE_CARD) as HTMLAnchorElement
      expect(card.querySelectorAll('polyline')).toHaveLength(2)
      expect(card.querySelectorAll('[data-testid="track-bridge"]')).toHaveLength(1)
      expect(card).toHaveTextContent('Feed dead 7m')
    })

    it('calls an untitled race untitled, and writes it no name', async () => {
      resolveAccount.mockResolvedValue(CREW)
      readLatestRace.mockResolvedValue({ ok: true, race: { ...LATEST, title: null } })

      render(await resolveServerTree(await DashboardPage()))

      expect(document.querySelector(RACE_CARD)).toHaveTextContent('Untitled race')
    })

    it('says in words that a race with no GPS fix has no track, rather than drawing an empty frame', async () => {
      resolveAccount.mockResolvedValue(CREW)
      readLatestRace.mockResolvedValue({ ok: true, race: { ...LATEST, track: null } })

      render(await resolveServerTree(await DashboardPage()))

      const card = document.querySelector(RACE_CARD) as HTMLAnchorElement
      expect(card.querySelector('svg')).toBeNull()
      expect(card).toHaveTextContent('No GPS fix was recorded in this race’s window')
    })

    it('says the archive could not be read, never that it is empty', async () => {
      resolveAccount.mockResolvedValue(CREW)
      readLatestRace.mockResolvedValue({ ok: false, reason: 'unreadable' })

      render(await resolveServerTree(await DashboardPage()))

      expect(document.querySelector(RACE_CARD)).toBeNull()
      // The two ten-race cards read fine here, so this is the race card's own.
      expect(screen.getAllByText('The archive could not be read')).toHaveLength(1)
    })

    it('is left off the Dashboard altogether when there are no races', async () => {
      resolveAccount.mockResolvedValue(CREW)
      readLatestRace.mockResolvedValue({ ok: false, reason: 'no-races' })

      render(await resolveServerTree(await DashboardPage()))

      expect(document.querySelector(RACE_CARD)).toBeNull()
      expect(document.querySelector('[data-testid="latest-race-card"]')).toBeNull()
      expect(screen.queryByText('The archive could not be read')).not.toBeInTheDocument()
    })
  })
})
