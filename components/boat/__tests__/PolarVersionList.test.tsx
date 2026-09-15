import { render, screen } from '@testing-library/react'
import PolarVersionList from '../PolarVersionList'
import type { PolarVersionSummary } from '@/types'

const V2: PolarVersionSummary = {
  id: '3f1b2c4d-0000-4000-8000-000000000002',
  version_number: 2,
  effective_from: '2026-06-14',
  recorded_at: '2026-09-15T04:00:00+00:00',
  note: 'Re-measured after the new main.',
  filename: 'FIRST_10R_2026.pol',
  content_sha256: 'b'.repeat(64),
  is_current: true,
}

const V1: PolarVersionSummary = {
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
    render(<PolarVersionList versions={[V2, V1]} />)

    expect(
      screen.getAllByTestId('polar-version-row').map((row) => row.getAttribute('data-version-number'))
    ).toEqual(['2', '1'])
  })

  it('states each Version by number, effective date, note and filename', () => {
    render(<PolarVersionList versions={[V2]} />)

    const row = screen.getByTestId('polar-version-row')
    expect(row.textContent).toMatch('v2')
    expect(row.textContent).toMatch('effective 14 Jun 2026')
    expect(row.textContent).toMatch('Re-measured after the new main.')
    expect(row.textContent).toMatch('FIRST_10R_2026.pol')
  })

  it('leaves the note out when there is none, rather than filling it in', () => {
    render(<PolarVersionList versions={[V1]} />)

    expect(screen.queryByTestId('polar-version-note')).not.toBeInTheDocument()
  })

  it('opens each Version at its own address', () => {
    render(<PolarVersionList versions={[V2, V1]} />)

    expect(screen.getByRole('link', { name: /v1/ })).toHaveAttribute(
      'href',
      `/boat-management/polar/${V1.id}`
    )
  })

  it('offers the original bytes of every Version, superseded ones included', () => {
    // A polar that was in force for a season is what that season's races were sailed
    // against, so superseding it is not retiring it.
    render(<PolarVersionList versions={[V2, V1]} />)

    const downloads = screen.getAllByRole('link', { name: 'Download' })
    expect(downloads).toHaveLength(2)
    expect(downloads[1]).toHaveAttribute(
      'href',
      `/api/boat-setup/polar/${V1.id}/download`
    )
    expect(downloads[1]).toHaveAttribute('download', 'FIRST_10R.pol')
  })

  it('keeps the Download beside the row rather than inside its link', () => {
    render(<PolarVersionList versions={[V2]} />)

    // An anchor inside an anchor is invalid HTML, and a browser resolves it by dropping
    // one of the two — usually the one that was wanted.
    const download = screen.getByRole('link', { name: 'Download' })
    expect(download.closest('a[href^="/boat-management"]')).toBeNull()
  })

  it('says which Version is the one in force, in words', () => {
    render(<PolarVersionList versions={[V2, V1]} />)

    const badges = screen.getAllByTestId('polar-version-current')
    expect(badges).toHaveLength(1)
    expect(badges[0].textContent).toBe('In force')
  })

  it('renders an empty archive as an empty list rather than inventing a row', () => {
    render(<PolarVersionList versions={[]} />)

    expect(screen.getByTestId('polar-version-list').textContent).toBe('')
  })
})
