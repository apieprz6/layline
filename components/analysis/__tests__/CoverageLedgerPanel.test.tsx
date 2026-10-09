import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoverageLedgerPanel from '@/components/analysis/CoverageLedgerPanel'
import type { CoverageLedger, RecordedRowsState } from '@/types'

function ledger(over: Partial<CoverageLedger> = {}): CoverageLedger {
  return {
    matched_seconds: 15_120,
    total_seconds: 15_120,
    countable_seconds: 10_860,
    matched_rows: 3251,
    matched_races: 13,
    total_races: 13,
    gaps: [
      { dimension: 'sea', label: 'Sea state', seconds: 7_380, share: 0.49 },
      { dimension: 'sail', label: 'Sail Configuration', seconds: 7_380, share: 0.49 },
    ],
    ...over,
  }
}

function renderPanel(
  over: Partial<CoverageLedger> = {},
  recordedRows: RecordedRowsState = 'included',
  label = 'Include sailing with no sea state or sail recorded'
) {
  const onRecordedRowsChange = jest.fn()
  render(
    <CoverageLedgerPanel
      ledger={ledger(over)}
      recordedRows={recordedRows}
      recordedRowsLabel={label}
      onRecordedRowsChange={onRecordedRowsChange}
    />
  )
  return { onRecordedRowsChange, user: userEvent.setup({ delay: null }) }
}

describe('what the ledger states', () => {
  it('leads with the races and follows with the sailing', () => {
    renderPanel()
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent(
      '13 of 13 races · 4h 12m recorded'
    )
  })

  it('says how much of the archive a narrowing is showing', () => {
    renderPanel({ matched_seconds: 5_400, matched_races: 7 })
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('1h 30m recorded')
    expect(screen.getByTestId('coverage-ledger-headline')).toHaveTextContent('of 4h 12m')
  })

  it('never says "row" anywhere a sailor can read it', () => {
    // The whole point of LAY-155's wording pass: "row" is the database's unit, not a sailor's.
    renderPanel()
    expect(screen.getByTestId('coverage-ledger').textContent).not.toMatch(/\brows?\b/i)
  })

  it('states the unannotated share as a share of the sailing on screen', () => {
    renderPanel()
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'Of that, 49% has no Sea state recorded.'
    )
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'Of that, 49% has no Sail Configuration recorded.'
    )
  })

  it('is there with nothing missing, saying so, rather than disappearing', () => {
    renderPanel({ gaps: [] })
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      'All of it carries every annotation.'
    )
  })

  it('says when a narrowing matched nothing', () => {
    renderPanel({ matched_rows: 0, matched_seconds: 0, matched_races: 0, countable_seconds: 0, gaps: [] })
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent('Nothing matches this narrowing.')
  })

  it('separates the sailing a figure may read from the sailing that matched', () => {
    // Matching and counting are independent questions (ADR 0026): excluded sailing still matched.
    renderPanel()
    expect(screen.getByTestId('coverage-ledger')).toHaveTextContent(
      '3h 1m of it can be scored; 1h 11m is frozen, low-speed or mid-maneuver.'
    )
  })

  it('never shows a dash in place of a figure', () => {
    renderPanel({ matched_rows: 0, matched_seconds: 0, matched_races: 0, countable_seconds: 0, gaps: [] })
    expect(screen.getByTestId('coverage-ledger').textContent).not.toMatch(/—/)
  })
})

describe('the one switch', () => {
  it('names the annotations it acts on rather than saying "nothing recorded"', () => {
    // A label that said "nothing recorded" left a sailor guessing what they were admitting. What
    // the switch actually governs is the sailing nobody tagged with a sea state or a sail.
    renderPanel()
    expect(screen.getByLabelText('Include sailing with no sea state or sail recorded')).toBeInTheDocument()
  })

  it('prints whatever label the screen’s own dimensions produced', () => {
    // The Sail Selection Screen has no "sail used" dimension, so its switch names one annotation.
    renderPanel({}, 'included', 'Include sailing with no sea state recorded')
    expect(screen.getByLabelText('Include sailing with no sea state recorded')).toBeInTheDocument()
  })

  it('reads checked while the unannotated sailing is in', () => {
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
