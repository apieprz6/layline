import { Children, type ReactElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { RACES, ROWS } from '@/components/analysis/__tests__/fixture'
import type { RaceSet } from '@/services/analysis/readArchive'
import type { CrossoverChartScreen } from '@/types'
import OverallCards, { RaceWindowCards } from '../OverallCards'

jest.mock('@/services/analysis/readArchive', () => ({
  readRecentRaceRows: jest.fn(),
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartScreen: jest.fn(),
}))

jest.mock('@/services/analysis/readInstrumentTuning', () => ({
  readInstrumentTuning: jest.fn(() => new Promise(() => {})),
}))

describe('OverallCards', () => {
  const { readRecentRaceRows } = jest.requireMock('@/services/analysis/readArchive')
  const { readCrossoverChartScreen } = jest.requireMock(
    '@/services/boat/readCrossoverChartVersions'
  )
  const { readInstrumentTuning } = jest.requireMock('@/services/analysis/readInstrumentTuning')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('paints the Polar performance card without waiting for the Crossover Chart read', async () => {
    const racesPromise: Promise<RaceSet | null> = Promise.resolve({
      rows: ROWS,
      races: RACES,
      polars: {},
    })
    // Held back on purpose, standing in for a Crossover Chart read still on the wire: this
    // promise is never resolved anywhere in the test. Calling `RaceWindowCards` directly, rather
    // than going through `OverallCards` and a full `resolveServerTree`, is what lets the test
    // stop there — resolving the whole piece would also chase the Sail selection card nested
    // behind this same held-back promise and hang.
    const chartPromise: Promise<CrossoverChartScreen | null> = new Promise(() => {})

    const raceWindow = await RaceWindowCards({ racesPromise, chartPromise })
    const [polarCard] = Children.toArray(
      (raceWindow as ReactElement<{ children: ReactNode }>).props.children
    )

    render(polarCard as ReactElement)

    expect(screen.getByTestId('polar-performance-teaser')).toBeInTheDocument()
  })

  it('starts the ten-race read and the Crossover Chart read once each, together', async () => {
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    readCrossoverChartScreen.mockResolvedValue(null)
    readInstrumentTuning.mockResolvedValue({ ok: false, reason: 'no-races' })

    await OverallCards()

    // Called once by `OverallCards` itself, as plain function calls before anything is awaited —
    // not once per card that ends up consuming the result.
    expect(readRecentRaceRows).toHaveBeenCalledTimes(1)
    expect(readCrossoverChartScreen).toHaveBeenCalledTimes(1)
    expect(readInstrumentTuning).toHaveBeenCalledTimes(1)
  })
})
