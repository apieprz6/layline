import { render, screen } from '@testing-library/react'
import SailSelectionTeaser from '@/components/analysis/SailSelectionTeaser'
import type { ChartAgreement } from '@/services/analysis/sail-selection'
import type { EfficiencyAggregate } from '@/types'

/**
 * The Overall tab's Sail selection card: a share, and both sides' own percent of target.
 *
 * What is pinned here is that the card **never prints a figure it does not have**, in any of the
 * five states its one read can produce — no chart, no annotated race, one empty side, nothing
 * scorable, and the ordinary case. Each of those is a sentence rather than a dash or a nought,
 * which is the whole of ADR 0012 applied to a card.
 *
 * And that it never divides the two efficiencies into a verdict. Over the owner's own archive the
 * two sides differ by half a point across 294 differing rows, a fifth of them Filler-Anchored, so
 * "the chart is wrong by 0.5%" would be a finding invented out of noise (ADR 0030, ADR 0036).
 */

/** An aggregate carrying one figure, which is all this card reads of one. */
function scored(ratio: number | null, rows = 10): EfficiencyAggregate {
  return {
    rows: ratio === null ? 0 : rows,
    filler_anchored_rows: 0,
    vmg_rows: 0,
    vmg_filler_anchored_rows: 0,
    rows_without_interval: 0,
    rows_without_target: ratio === null ? rows : 0,
    elapsed_seconds: rows * 60,
    actual_distance_nm: ratio === null ? 0 : ratio,
    target_distance_nm: ratio === null ? 0 : 1,
    actual_vmg_distance_nm: 0,
    target_vmg_distance_nm: 0,
    polar_efficiency: ratio,
    vmg_efficiency: null,
  }
}

function agreement(over: Partial<ChartAgreement> = {}): ChartAgreement {
  return {
    placed_rows: 20,
    judgeable_rows: 20,
    agreement: 0.748,
    following: scored(0.881),
    differing: scored(0.892),
    ...over,
  }
}

const card = () => screen.getByTestId('sail-selection-teaser')

describe('the ordinary case', () => {
  it('headlines the share and states both sides beneath it', () => {
    render(<SailSelectionTeaser agreement={agreement()} races={10} />)

    expect(screen.getByTestId('chart-agreement')).toHaveTextContent('74.8%')
    expect(card()).toHaveTextContent('carried what the chart calls for')
    expect(card()).toHaveTextContent(
      '88.1% of target when it did, 89.2% when it did not — over the last 10 races'
    )
  })

  it('never subtracts the two sides into a verdict on the chart', () => {
    render(<SailSelectionTeaser agreement={agreement()} races={10} />)

    // Both figures, side by side, and no delta anywhere: 1.1 points across a few hundred rows is
    // noise, and a card that named it would be read as a finding.
    expect(card().textContent).not.toMatch(/faster|slower|wrong|better|worse|1\.1/)
  })

  it('taps through to the screen', () => {
    render(<SailSelectionTeaser agreement={agreement()} races={10} />)
    expect(card()).toHaveAttribute('href', '/boat-performance/sail-selection')
  })

  it('says one race in the singular', () => {
    render(<SailSelectionTeaser agreement={agreement()} races={1} />)
    expect(card()).toHaveTextContent('over the last 1 race,')
  })
})

describe('what the share rests on', () => {
  it('states the judgeable share whenever it is not all of the sailing', () => {
    render(
      <SailSelectionTeaser
        agreement={agreement({ placed_rows: 1964, judgeable_rows: 1241 })}
        races={10}
      />
    )

    // The archive's own ten-race window. The other 37% is races nobody annotated, not sailing that
    // disagreed, and a card that dropped it from both halves of the share would not say so.
    expect(card()).toHaveTextContent('on the 63% of that sailing whose sail was written down')
  })

  it('says so when every row could be judged, rather than leaving it unsaid', () => {
    render(<SailSelectionTeaser agreement={agreement()} races={5} />)
    expect(card()).toHaveTextContent('all of which recorded their sails')
  })
})

describe('the states with no figure to print', () => {
  it('says there is no chart, which is not an error', () => {
    render(<SailSelectionTeaser agreement={null} races={10} />)

    expect(card()).toHaveTextContent('No Crossover Chart has been uploaded yet.')
    expect(card()).toHaveTextContent('Upload one under Boat setup')
    expect(screen.queryByTestId('chart-agreement')).not.toBeInTheDocument()
  })

  it('says no race recorded its sails rather than printing nought per cent', () => {
    render(
      <SailSelectionTeaser
        agreement={agreement({ judgeable_rows: 0, agreement: null, following: scored(null, 0), differing: scored(null, 0) })}
        races={10}
      />
    )

    expect(card()).toHaveTextContent('No race in this window recorded which sails it carried.')
    // The window, and nothing else. No `0.0%`, no percent of target for sides nobody can sort
    // rows into, and no "0% of that sailing whose sail was written down" beside a headline that
    // has just said so in words.
    expect(card()).toHaveTextContent('Over the last 10 races. Tap for the whole archive')
    expect(card().textContent).not.toMatch(/0\.0%|0%|of target/)
  })

  it('says nothing carried otherwise, where every judgeable row agreed', () => {
    render(
      <SailSelectionTeaser
        agreement={agreement({ agreement: 1, differing: scored(null, 0) })}
        races={10}
      />
    )

    // A window where nothing differed is real and flattering, and `88.1% / —` would read as a
    // figure withheld.
    expect(card()).toHaveTextContent('88.1% of target when it did, and nothing carried otherwise')
    // The sentence is the point: a dash where the other side's figure would go reads as a figure
    // withheld, and the em dash in this subline is its own separator.
    expect(card().textContent).not.toMatch(/\d\s*—|—\s*when/)
  })

  it('says nothing carried the chart’s own sail, where every judgeable row differed', () => {
    render(
      <SailSelectionTeaser
        agreement={agreement({ agreement: 0, following: scored(null, 0) })}
        races={10}
      />
    )

    expect(card()).toHaveTextContent(
      '89.2% of target when it did not, and nothing carried what the chart calls for'
    )
  })

  it('says nothing could be scored, where the rows were judged and never measured', () => {
    render(
      <SailSelectionTeaser
        agreement={agreement({ following: scored(null, 5), differing: scored(null, 5) })}
        races={10}
      />
    )

    // The share still stands — the sails were recorded — but neither side has a percent of target,
    // which is a different fact and gets its own sentence.
    expect(screen.getByTestId('chart-agreement')).toHaveTextContent('74.8%')
    expect(card()).toHaveTextContent('Nothing in this window could be scored against the Polar')
  })
})
