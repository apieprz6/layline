import { Children, type ReactElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { RACES, ROWS } from '@/components/analysis/__tests__/fixture'
import OverallCards from '../OverallCards'

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
    readRecentRaceRows.mockResolvedValue({ rows: ROWS, races: RACES, polars: {} })
    // Held back on purpose, standing in for a Crossover Chart read still on the wire: this
    // promise is never resolved anywhere in the test.
    readCrossoverChartScreen.mockReturnValue(new Promise(() => {}))

    const overall = await OverallCards()
    // Polar performance's own boundary, first of the three siblings. Resolved on its own via the
    // suite's usual `resolveServerTree` rather than through the whole tree: the Sail selection
    // boundary beside it awaits the same held-back chart promise and would never settle, so
    // resolving the full tree here would hang.
    const [polarBoundary] = Children.toArray(
      (overall as ReactElement<{ children: ReactNode }>).props.children
    )

    render(await resolveServerTree(polarBoundary))

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
