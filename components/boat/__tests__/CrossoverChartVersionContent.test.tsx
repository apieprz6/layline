import { render, screen } from '@testing-library/react'
import CrossoverChartVersionContent from '../CrossoverChartVersionContent'
import type { CrossoverChartVersionDetail } from '@/types'

const GRID_SHA = 'a'.repeat(64)
const DEFINITIONS_SHA = 'c'.repeat(64)

const VERSION: CrossoverChartVersionDetail = {
  id: '3f1b2c4d-0000-4000-8000-000000000001',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'HandsomePete_2026.sailselect',
  content_sha256: GRID_SHA,
  is_current: false,
  payload: {
    twa_axis: [40, 80],
    tws_axis: [8, 12],
    cells: [
      [1, 1],
      [1, 2],
    ],
    sail_definitions: [
      { number: 1, label: 'GV + Genoa' },
      { number: 2, label: 'GV + A3' },
    ],
    source: {
      format: 'qtvlm-sailselect',
      header_token: 'TWA/TWS',
      definitions: {
        format: 'qtvlm-saildesc',
        filename: 'HandsomePete_2026.saildesc',
        content_sha256: DEFINITIONS_SHA,
      },
    },
  },
}

describe('one Crossover Chart Version', () => {
  it('states its number, its effective date and when Layline was told', () => {
    render(<CrossoverChartVersionContent version={VERSION} />)

    const facts = screen.getByTestId('crossover-chart-version-facts')
    expect(facts.textContent).toMatch('21 Apr 2026')
    expect(facts.textContent).toMatch('Effective from')
    expect(facts.textContent).toMatch('Recorded')
    expect(facts.textContent).toMatch('2026-05-01T12:00:00+00:00')
  })

  it('says "None" for an absent note rather than leaving a blank', () => {
    render(<CrossoverChartVersionContent version={VERSION} />)

    expect(screen.getByTestId('crossover-chart-version-facts').textContent).toMatch('None')
  })

  it('shows the note when the sailor wrote one', () => {
    render(<CrossoverChartVersionContent version={{ ...VERSION, note: 'Sail names corrected.' }} />)

    expect(screen.getByText('Sail names corrected.')).toBeInTheDocument()
  })

  it('offers both halves, each named and each with its own hash in full', () => {
    render(<CrossoverChartVersionContent version={VERSION} />)

    const files = screen.getByTestId('crossover-chart-version-files')
    expect(screen.getAllByTestId('crossover-chart-version-file')).toHaveLength(2)
    expect(files.textContent).toMatch('HandsomePete_2026.sailselect')
    expect(files.textContent).toMatch('HandsomePete_2026.saildesc')
    // In full: half a hash proves nothing about the bytes behind the Download.
    expect(files.textContent).toMatch(GRID_SHA)
    expect(files.textContent).toMatch(DEFINITIONS_SHA)
  })

  it('sends each Download at the file it names, and says which is which', () => {
    render(<CrossoverChartVersionContent version={VERSION} />)

    // Two links that both said "Download" would name nothing, and the second needs the selector
    // because the definitions half has no columns of its own (ADR 0022).
    expect(screen.getByRole('link', { name: /Download the sail chart/ })).toHaveAttribute(
      'href',
      `/api/boat-setup/crossover-chart/${VERSION.id}/download`
    )
    expect(screen.getByRole('link', { name: /Download the sail definitions/ })).toHaveAttribute(
      'href',
      `/api/boat-setup/crossover-chart/${VERSION.id}/download?file=definitions`
    )
  })

  it('says so plainly when a payload records no separate definitions file', () => {
    const { source, ...payload } = VERSION.payload

    render(<CrossoverChartVersionContent version={{ ...VERSION, payload }} />)

    // The schema requires the provenance, so this is only reachable for a row written before it
    // did — said rather than drawn as a Download that would 404.
    expect(
      screen.getByTestId('crossover-chart-version-no-definitions-file').textContent
    ).toMatch(/no separate definitions file/)
    expect(screen.getAllByTestId('crossover-chart-version-file')).toHaveLength(1)
    expect(source).not.toBeUndefined()
  })

  it('opens a superseded Version just the same', () => {
    render(<CrossoverChartVersionContent version={VERSION} />)

    expect(screen.queryByTestId('crossover-chart-version-current')).not.toBeInTheDocument()
    expect(screen.getByTestId('crossover-chart-grid')).toBeInTheDocument()
  })

  it('marks the Version in force', () => {
    render(<CrossoverChartVersionContent version={{ ...VERSION, is_current: true }} />)

    expect(screen.getByTestId('crossover-chart-version-current').textContent).toBe('In force')
  })

  it('draws the chart the same way it is drawn everywhere, legend included', () => {
    render(<CrossoverChartVersionContent version={VERSION} />)

    expect(screen.getAllByTestId('crossover-chart-row')).toHaveLength(2)
    expect(screen.getAllByTestId('crossover-chart-legend-row')).toHaveLength(2)
  })

  it('says there is no such Version rather than an empty one', () => {
    render(<CrossoverChartVersionContent version={null} />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(
      /No such Crossover Chart Version/
    )
    expect(screen.queryByTestId('crossover-chart-grid')).not.toBeInTheDocument()
    // And still leads back to where every Version is listed.
    expect(screen.getByRole('link', { name: /Crossover Chart/ })).toHaveAttribute(
      'href',
      '/boat-management/crossover-chart'
    )
  })
})
