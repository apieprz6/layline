import { render, screen, within } from '@testing-library/react'
import { POLAR, POLAR_VERSION, matchableRow } from '@/components/analysis/__tests__/fixture'
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
    elapsed_seconds: 10_860,
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
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} rows={[]} polars={{}} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveAttribute(
      'href',
      '/boat-performance/polar'
    )
  })

  it('says it is a recent window, and how recent, rather than implying the whole archive', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} rows={[]} polars={{}} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      `Polar performance · last ${TEASER_RACES} races`
    )
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      'Tap for the whole archive'
    )
  })

  it('states both figures, in the same words the detail screen uses', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} rows={[]} polars={{}} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('95.0%')
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('VMG 90.9%')
  })

  it('states its own coverage, so the figure has rows behind it', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} rows={[]} polars={{}} />)

    // In time, and "scored" rather than "countable": this is the sailing that carried *both* a
    // measured interval and a Target Speed, which is less than the whole of the five races.
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      '3h 1m scored across 5 races'
    )
    expect(screen.getByTestId('polar-performance-teaser').textContent).not.toMatch(/\brows?\b/i)
  })

  it('flags a filler-anchored share rather than withholding the figure', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate({ filler_anchored_rows: 203 })} rows={[]} polars={{}} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('95.0%')
    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent(
      '25% of it filler-anchored'
    )
  })

  it('counts a young archive honestly rather than claiming five races', () => {
    render(<PolarPerformanceTeaser races={1} efficiency={aggregate()} rows={[]} polars={{}} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('across 1 race.')
  })

  it('says in words that nothing could be scored, never a dash', () => {
    render(
      <PolarPerformanceTeaser
        races={3}
        efficiency={aggregate({ rows: 0, polar_efficiency: null, vmg_efficiency: null })}
        rows={[]}
        polars={{}}
      />
    )

    const card = screen.getByTestId('polar-performance-teaser')
    expect(card).toHaveTextContent('Nothing in these races could be scored against the Polar.')
    expect(card.textContent).not.toMatch(/\brows?\b/i)
    expect(card.textContent).not.toMatch(/—/)
  })

  it('never prints a dash for a VMG figure the Polar could not estimate', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate({ vmg_efficiency: null })} rows={[]} polars={{}} />)

    expect(screen.getByTestId('polar-performance-teaser')).toHaveTextContent('VMG not scorable')
  })

  it('draws the small patched Polar Plot under the figure, with no labels on it (ADR 0040)', () => {
    const rows = [matchableRow({ twa: 42, sog: 5 }), matchableRow({ twa: 140, sog: 7 })]
    render(
      <PolarPerformanceTeaser
        races={5}
        efficiency={aggregate()}
        rows={rows}
        polars={{ [POLAR_VERSION]: POLAR }}
      />
    )

    const card = screen.getByTestId('polar-performance-teaser')
    const plot = within(card).getByTestId('polar-plot')
    // Patches, not dots: at 150px a cloud is a smudge.
    expect(within(plot).getAllByTestId('polar-plot-patch')).toHaveLength(2)
    expect(within(plot).queryByTestId('polar-plot-dot')).not.toBeInTheDocument()
    expect(plot.querySelectorAll('text')).toHaveLength(0)
    expect(plot.style.maxWidth).toBe('150px')
    // The figure is above the picture.
    expect(card.textContent?.indexOf('95.0%')).toBeLessThan(card.textContent?.length ?? 0)
    expect(
      screen.getByText('95.0%').compareDocumentPosition(plot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('draws no picture over races that carry nothing to draw', () => {
    render(<PolarPerformanceTeaser races={5} efficiency={aggregate()} rows={[]} polars={{}} />)
    expect(screen.queryByTestId('polar-plot')).not.toBeInTheDocument()
  })
})
