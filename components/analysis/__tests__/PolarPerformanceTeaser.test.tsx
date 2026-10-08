import { render, screen } from '@testing-library/react'
import PolarPerformanceTeaser, { TEASER_RACES } from '@/components/analysis/PolarPerformanceTeaser'
import type { EfficiencyAggregate } from '@/types'

function aggregate(over: Partial<EfficiencyAggregate> = {}): EfficiencyAggregate {
  return {
    rows: 812,
    filler_anchored_rows: 0,
    vmg_rows: 812,
    vmg_filler_anchored_rows: 0,
    rows_without_interval: 5,
    rows_without_target: 61,
    elapsed_seconds: 60_000,
    actual_distance_nm: 95,
    target_distance_nm: 100,
    polar_efficiency: 0.95,
    actual_vmg_distance_nm: 70,
    target_vmg_distance_nm: 77,
    vmg_efficiency: 70 / 77,
    ...over,
  }
}

describe('the Overall tab’s hero card', () => {
  it('taps through to the full screen', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveAttribute(
      'href',
      '/boat-performance/polar'
    )
  })

  it('says it is a recent window, and how recent, rather than implying the whole archive', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      `Polar performance · last ${TEASER_RACES} races`
    )
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      'Tap for the whole archive'
    )
  })

  it('states both figures, in the same words the detail screen uses', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('95.0%')
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('VMG 90.9%')
  })

  it('states its own coverage, so the figure has rows behind it', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} />)

    // "Scored", not "countable": `EfficiencyAggregate.rows` counts the Countable rows that carried
    // *both* an interval and a target, and 66 more here carried one or the other.
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      '812 rows scored across 5 races'
    )
    expect(screen.getByTestId('polar-performance-teaser').textContent).not.toMatch(
      /countable rows/
    )
  })

  it('flags a filler-anchored share rather than withholding the figure', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate({ filler_anchored_rows: 203 })} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('95.0%')
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      '25% of them filler-anchored'
    )
  })

  it('counts a young archive honestly rather than claiming five races', () => {
    render(<PolarPerformanceTeaser races={1} efficiency={aggregate()} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('across 1 race.')
  })

  it('says in words that nothing could be scored, never a dash', () => {
    render(
      <PolarPerformanceTeaser
        races={3}
        efficiency={aggregate({ rows: 0, polar_efficiency: null, vmg_efficiency: null })}
      />
    )

    const card = screen.getByTestId('polar-performance-teaser')
    expect(card).toHaveTextContent('No row in these races could be scored against the Polar.')
    expect(card.textContent).not.toMatch(/—/)
  })

  it('never prints a dash for a VMG figure the Polar could not estimate', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate({ vmg_efficiency: null })} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('VMG not scorable')
  })
})
