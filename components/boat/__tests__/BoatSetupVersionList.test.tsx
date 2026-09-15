import { render, screen } from '@testing-library/react'
import BoatSetupVersionList from '../BoatSetupVersionList'
import type { FileBackedVersionSummary } from '@/types'

const V2: FileBackedVersionSummary = {
  id: '3f1b2c4d-0000-4000-8000-000000000002',
  version_number: 2,
  effective_from: '2026-06-14',
  recorded_at: '2026-09-15T04:00:00+00:00',
  note: 'Re-measured after the new main.',
  filename: 'FIRST_10R_2026.pol',
  content_sha256: 'b'.repeat(64),
  is_current: true,
}

const V1: FileBackedVersionSummary = {
  id: '3f1b2c4d-0000-4000-8000-000000000001',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'FIRST_10R.pol',
  content_sha256: 'a'.repeat(64),
  is_current: false,
}

describe('the Polar Version list', () => {
  it('lists every Version, newest first as given', () => {
    render(<BoatSetupVersionList kind="polar" versions={[V2, V1]} />)

    expect(
      screen.getAllByTestId('polar-version-row').map((row) => row.getAttribute('data-version-number'))
    ).toEqual(['2', '1'])
  })

  it('states each Version by number, effective date, note and filename', () => {
    render(<BoatSetupVersionList kind="polar" versions={[V2]} />)

    const row = screen.getByTestId('polar-version-row')
    expect(row.textContent).toMatch('v2')
    expect(row.textContent).toMatch('effective 14 Jun 2026')
    expect(row.textContent).toMatch('Re-measured after the new main.')
    expect(row.textContent).toMatch('FIRST_10R_2026.pol')
  })

  it('leaves the note out when there is none, rather than filling it in', () => {
    render(<BoatSetupVersionList kind="polar" versions={[V1]} />)

    expect(screen.queryByTestId('polar-version-note')).not.toBeInTheDocument()
  })

  it('opens each Version at its own address', () => {
    render(<BoatSetupVersionList kind="polar" versions={[V2, V1]} />)

    expect(screen.getByRole('link', { name: /v1/ })).toHaveAttribute(
      'href',
      `/boat-management/polar/${V1.id}`
    )
  })

  it('offers the original bytes of every Version, superseded ones included', () => {
    // A polar that was in force for a season is what that season's races were sailed
    // against, so superseding it is not retiring it.
    render(<BoatSetupVersionList kind="polar" versions={[V2, V1]} />)

    const downloads = screen.getAllByRole('link', { name: 'Download' })
    expect(downloads).toHaveLength(2)
    expect(downloads[1]).toHaveAttribute(
      'href',
      `/api/boat-setup/polar/${V1.id}/download`
    )
    expect(downloads[1]).toHaveAttribute('download', 'FIRST_10R.pol')
  })

  it('keeps the Download beside the row rather than inside its link', () => {
    render(<BoatSetupVersionList kind="polar" versions={[V2]} />)

    // An anchor inside an anchor is invalid HTML, and a browser resolves it by dropping
    // one of the two — usually the one that was wanted.
    const download = screen.getByRole('link', { name: 'Download' })
    expect(download.closest('a[href^="/boat-management"]')).toBeNull()
  })

  it('says which Version is the one in force, in words', () => {
    render(<BoatSetupVersionList kind="polar" versions={[V2, V1]} />)

    const badges = screen.getAllByTestId('polar-version-current')
    expect(badges).toHaveLength(1)
    expect(badges[0].textContent).toBe('In force')
  })

  it('renders an empty archive as an empty list rather than inventing a row', () => {
    render(<BoatSetupVersionList kind="polar" versions={[]} />)

    expect(screen.getByTestId('polar-version-list').textContent).toBe('')
  })
})

/** The same list, doing the second file-backed kind. One component, two artifacts (ADR 0011). */
describe('the Crossover Chart Version list', () => {
  const CHART: FileBackedVersionSummary = {
    ...V1,
    filename: 'HandsomePete_2026.sailselect',
    is_current: true,
  }

  it('names its rows after its own screen rather than the Polar’s', () => {
    render(<BoatSetupVersionList kind="crossover_chart" versions={[CHART]} />)

    expect(screen.getByTestId('crossover-chart-version-list')).toBeInTheDocument()
    expect(screen.getByTestId('crossover-chart-version-row')).toBeInTheDocument()
    expect(screen.getByTestId('crossover-chart-version-current').textContent).toBe('In force')
    expect(screen.queryByTestId('polar-version-list')).not.toBeInTheDocument()
  })

  it('opens and downloads at the Crossover Chart’s own addresses', () => {
    render(<BoatSetupVersionList kind="crossover_chart" versions={[CHART]} />)

    expect(screen.getByRole('link', { name: /v1/ })).toHaveAttribute(
      'href',
      `/boat-management/crossover-chart/${CHART.id}`
    )
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `/api/boat-setup/crossover-chart/${CHART.id}/download`
    )
  })

  it('names the grid file on the row, the half the Version’s own columns hold', () => {
    // The definitions half's filename lives in the payload, which a summary deliberately does not
    // carry (ADR 0022). Both files are offered on the Version's own screen, which reads it.
    render(<BoatSetupVersionList kind="crossover_chart" versions={[CHART]} />)

    expect(screen.getByTestId('crossover-chart-version-filename').textContent).toBe(
      'HandsomePete_2026.sailselect'
    )
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(1)
  })
})
