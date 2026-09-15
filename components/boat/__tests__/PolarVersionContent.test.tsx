import { render, screen } from '@testing-library/react'
import PolarVersionContent from '../PolarVersionContent'
import type { PolarVersionDetail } from '@/types'

const VERSION: PolarVersionDetail = {
  id: '3f1b2c4d-0000-4000-8000-000000000001',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'FIRST_10R.pol',
  content_sha256: 'a'.repeat(64),
  is_current: false,
  payload: {
    twa_axis: [52, 60],
    tws_axis: [4, 6],
    boat_speed: [
      [3.96, 5.39],
      [4.25, 5.66],
    ],
    source: { format: 'orc-pol', header_token: 'twa/tws' },
  },
}

describe('one Polar Version', () => {
  it('states its number, its effective date, its filename and its hash', () => {
    render(<PolarVersionContent version={VERSION} />)

    const facts = screen.getByTestId('polar-version-facts')
    expect(facts.textContent).toMatch('21 Apr 2026')
    expect(facts.textContent).toMatch('FIRST_10R.pol')
    // In full: half a hash proves nothing about the bytes behind the Download.
    expect(facts.textContent).toMatch('a'.repeat(64))
  })

  it('says "None" for an absent note rather than leaving a blank', () => {
    render(<PolarVersionContent version={VERSION} />)

    expect(screen.getByTestId('polar-version-facts').textContent).toMatch('None')
  })

  it('shows the note when the sailor wrote one', () => {
    render(<PolarVersionContent version={{ ...VERSION, note: 'Certificate reissued.' }} />)

    expect(screen.getByText('Certificate reissued.')).toBeInTheDocument()
  })

  it('separates when the polar took effect from when Layline was told', () => {
    render(<PolarVersionContent version={VERSION} />)

    const facts = screen.getByTestId('polar-version-facts')
    expect(facts.textContent).toMatch('Effective from')
    expect(facts.textContent).toMatch('Recorded')
    expect(facts.textContent).toMatch('2026-05-01T12:00:00+00:00')
  })

  it('opens a superseded Version just the same, and offers its bytes', () => {
    render(<PolarVersionContent version={VERSION} />)

    expect(screen.queryByTestId('polar-version-current')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Download the original file/ })).toHaveAttribute(
      'href',
      `/api/boat-setup/polar/${VERSION.id}/download`
    )
  })

  it('marks the Version in force', () => {
    render(<PolarVersionContent version={{ ...VERSION, is_current: true }} />)

    expect(screen.getByTestId('polar-version-current').textContent).toBe('In force')
  })

  it('draws the grid the same way it is drawn everywhere', () => {
    render(<PolarVersionContent version={VERSION} />)

    expect(screen.getByTestId('polar-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('polar-row')).toHaveLength(2)
  })

  it('says there is no such Version rather than an empty one', () => {
    render(<PolarVersionContent version={null} />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/No such Polar Version/)
    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument()
    // And still leads back to where every Version is listed.
    expect(screen.getByRole('link', { name: /Polar/ })).toHaveAttribute(
      'href',
      '/boat-management/polar'
    )
  })
})
