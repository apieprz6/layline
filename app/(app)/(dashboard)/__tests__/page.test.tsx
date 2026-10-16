import { Children, type ReactElement, type ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { CREW } from '@/__tests__/fixtures/accounts'
import { RACES, ROWS } from '@/components/analysis/__tests__/fixture'
import LiveWindCard from '@/components/dashboard/LiveWindCard'
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

describe('Dashboard', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readRecentRaceRows } = jest.requireMock('@/services/analysis/readArchive')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )
  const { readInstrumentTuning } = jest.requireMock('@/services/analysis/readInstrumentTuning')

  beforeEach(() => {
    jest.clearAllMocks()
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    readCrossoverChartScreen.mockResolvedValue(null)
    readInstrumentTuning.mockResolvedValue({ ok: false, reason: 'no-races' })
  })

  it('shows a Guest the live wind and no boat performance, without reading the archive', async () => {
    resolveAccount.mockResolvedValue(null)

    render(await resolveServerTree(await DashboardPage()))

    expect(screen.getByText('Live Wind')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Boat performance' })).not.toBeInTheDocument()
    expect(readRecentRaceRows).not.toHaveBeenCalled()
    expect(readCrossoverChartScreen).not.toHaveBeenCalled()
    expect(readInstrumentTuning).not.toHaveBeenCalled()
  })

  it('shows a signed-in sailor the three Overall cards below the live wind, each a door to its screen', async () => {
    resolveAccount.mockResolvedValue(CREW)

    render(await resolveServerTree(await DashboardPage()))

    const boat = screen.getByRole('region', { name: 'Boat performance' })
    const hrefs = Array.from(boat.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '/boat-performance/polar',
      '/boat-performance/sail-selection',
      '/boat-performance/instrument-tuning',
    ])

    // Below the live wind card in document order, which is what stacks it beneath on a phone.
    const wind = screen.getByText('Live Wind')
    expect(wind.compareDocumentPosition(boat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('tells a signed-in sailor an unreadable archive is unreadable, not empty', async () => {
    resolveAccount.mockResolvedValue(CREW)
    readRecentRaceRows.mockResolvedValue(null)

    render(await resolveServerTree(await DashboardPage()))

    const boat = screen.getByRole('region', { name: 'Boat performance' })
    expect(boat).not.toHaveTextContent('Nothing to summarise yet')
    // The Overall tab's own words, once per card that depends on the ten-race read.
    expect(within(boat).getAllByText('The archive could not be read')).toHaveLength(2)
  })

  it('tells a signed-in sailor an empty archive is empty, in the Overall tab\'s words', async () => {
    resolveAccount.mockResolvedValue(CREW)
    readRecentRaceRows.mockResolvedValue({ rows: [], races: [], polars: {} })

    render(await resolveServerTree(await DashboardPage()))

    const boat = screen.getByRole('region', { name: 'Boat performance' })
    expect(within(boat).getAllByText('Nothing to summarise yet')).toHaveLength(2)
    expect(boat).not.toHaveTextContent('The archive could not be read')
  })

  it('hands back the live wind without waiting on any archive read', async () => {
    resolveAccount.mockResolvedValue(CREW)
    // Every archive read held on the wire, never to resolve.
    readRecentRaceRows.mockReturnValue(new Promise(() => {}))
    readCrossoverChartScreen.mockReturnValue(new Promise(() => {}))
    readInstrumentTuning.mockReturnValue(new Promise(() => {}))

    // The page itself resolves, live wind card and all: the archive is awaited only inside
    // `OverallCards`' own boundaries, never by the page around them.
    const page = await DashboardPage()
    const children = Children.toArray(
      (page as ReactElement<{ children: ReactNode }>).props.children
    ) as ReactElement[]

    expect(children.some((child) => child.type === LiveWindCard)).toBe(true)
  })
})
