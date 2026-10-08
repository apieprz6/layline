import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoverageLedgerPanel from '@/components/analysis/CoverageLedgerPanel'
import type { CoverageLedger, RecordedRowsState } from '@/types'

function ledger(over: Partial<CoverageLedger> = {}): CoverageLedger {
  return {
    matched_rows: 3251,
    total_rows: 3251,
    matched_races: 13,
    total_races: 13,
    countable_rows: 2316,
    gaps: [
      { dimension: 'sea', label: 'Sea state', rows: 1593, share: 0.49 },
      { dimension: 'sail', label: 'Sail Configuration', rows: 1593, share: 0.49 },
    ],
    ...over,
  }
}

function renderPanel(
  over: Partial<CoverageLedger> = {},
  recordedRows: RecordedRowsState = 'included'
) {
  const onRecordedRowsChange = jest.fn()
  render(
    <CoverageLedgerPanel
      ledger={ledger(over)}
      recordedRows={recordedRows}
      onRecordedRowsChange={onRecordedRowsChange}
    />
  )
  return { onRecordedRowsChange, user: userEvent.setup({ delay: null }) }
}

describe('what the ledger states', () => {
  it('says the rows and the races they came from', () => {
    renderPanel()
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(
      '3,251 rows · 13 of 13 races'
    )
  })

  it('says how much of the archive a narrowing is showing', () => {
    renderPanel({ matched_rows: 885, matched_races: 7 })
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('885 rows')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('of 3,251')
  })

  it('states the unannotated share in ADR 0029’s own words', () => {
    renderPanel()
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'Of those, 1,593 (49%) have no Sea state recorded.'
    )
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'Of those, 1,593 (49%) have no Sail Configuration recorded.'
    )
  })

  it('is there with nothing missing, saying so, rather than disappearing', () => {
    renderPanel({ gaps: [] })
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'Every row shown carries every annotation.'
    )
  })

  it('says when a narrowing matched nothing', () => {
    renderPanel({ matched_rows: 0, matched_races: 0, countable_rows: 0, gaps: [] })
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent('Nothing matches this narrowing.')
  })

  it('separates the rows a figure may read from the rows that matched', () => {
    // Matching and counting are independent questions (ADR 0026): an excluded row still matched.
    renderPanel()
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      '2,316 of those may be read by a figure; 935 are frozen, low-speed or mid-maneuver.'
    )
  })

  it('never shows a dash or a zero in place of a count', () => {
    renderPanel({ matched_rows: 0, matched_races: 0, countable_rows: 0, gaps: [] })
    expect(screen.getByTestId('coverage-ledger').textContent).not.toMatch(/—/)
  })
})

describe('the one switch', () => {
  it('reads checked while the unrecorded rows are in', () => {
    renderPanel()
    expect(screen.getByTestId('include-unrecorded')).toBeChecked()
  })

  it('reads unchecked when they are out', () => {
    renderPanel({}, 'excluded')
    expect(screen.getByTestId('include-unrecorded')).not.toBeChecked()
  })

  it('reads indeterminate when the dimensions disagree, rather than rounding to on or off', () => {
    renderPanel({}, 'mixed')
    const box = screen.getByTestId('include-unrecorded') as HTMLInputElement
    expect(box.indeterminate).toBe(true)
  })

  it('asks for exclusion when it is turned off', async () => {
    const { user, onRecordedRowsChange } = renderPanel()

    await user.click(screen.getByTestId('include-unrecorded'))
    expect(onRecordedRowsChange).toHaveBeenCalledWith(false)
  })

  it('asks for inclusion when it is turned on', async () => {
    const { user, onRecordedRowsChange } = renderPanel({}, 'excluded')

    await user.click(screen.getByTestId('include-unrecorded'))
    expect(onRecordedRowsChange).toHaveBeenCalledWith(true)
  })
})
