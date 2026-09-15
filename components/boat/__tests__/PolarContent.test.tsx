import { render, screen } from '@testing-library/react'
import PolarContent from '../PolarContent'
import type { PolarVersionDetail, PolarVersionList, PolarVersionSummary } from '@/types'

// The panel is a Client Component whose only job is to call two Server Actions. Its behaviour is
// tested on its own; here it stands in as a marker, so importing the actions module — and with it
// `next/cache` and the Supabase server client — is not a condition of testing this screen.
jest.mock('../PolarUploadPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="polar-upload-panel" />,
}))

const V2: PolarVersionSummary = {
  id: 'version-2',
  version_number: 2,
  effective_from: '2026-06-14',
  recorded_at: '2026-09-15T04:00:00+00:00',
  note: 'Re-measured after the new main.',
  filename: 'FIRST_10R_2026.pol',
  content_sha256: 'b'.repeat(64),
  is_current: true,
}

const V1: PolarVersionSummary = {
  id: 'version-1',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'FIRST_10R.pol',
  content_sha256: 'a'.repeat(64),
  is_current: false,
}

const CURRENT: PolarVersionDetail = {
  ...V2,
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

const LIST: PolarVersionList = { current_version_id: 'version-2', versions: [V2, V1] }

const EMPTY: PolarVersionList = { current_version_id: null, versions: [] }

describe('the Polar screen', () => {
  it('draws the grid in force above the list of Versions', () => {
    render(<PolarContent list={LIST} current={CURRENT} canWrite={false} />)

    expect(screen.getByTestId('polar-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('polar-version-row')).toHaveLength(2)
  })

  it('offers the upload to an admin', () => {
    render(<PolarContent list={LIST} current={CURRENT} canWrite />)

    expect(screen.getByTestId('polar-upload-panel')).toBeInTheDocument()
  })

  it('lets a signed-in viewer read every Version and upload nothing', () => {
    render(<PolarContent list={LIST} current={CURRENT} canWrite={false} />)

    // Role governs writes only (ADR 0019): the difference between an admin and a viewer
    // on this screen is the panel, and nothing else.
    expect(screen.queryByTestId('polar-upload-panel')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('polar-version-row')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(2)
  })

  it('says nothing is recorded on an empty archive, and still offers the upload', () => {
    render(<PolarContent list={EMPTY} current={null} canWrite />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/No Polar recorded/)
    expect(screen.getByTestId('polar-upload-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument()
  })

  it('tells a viewer who to ask when nothing is recorded', () => {
    render(<PolarContent list={EMPTY} current={null} canWrite={false} />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/admin/)
    expect(screen.queryByTestId('polar-upload-panel')).not.toBeInTheDocument()
  })

  it('reports a failed read as a failed read, not as an empty archive', () => {
    render(<PolarContent list={null} current={null} canWrite />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/could not be read/)
    // Nothing to upload against when the archive cannot be read at all.
    expect(screen.queryByTestId('polar-upload-panel')).not.toBeInTheDocument()
  })

  it('says so when the Version in force cannot be read, rather than drawing the next one down', () => {
    render(<PolarContent list={LIST} current={null} canWrite={false} />)

    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument()
    expect(screen.getByText(/Version in force could not be read/)).toBeInTheDocument()
    // The Versions themselves are still listed and still openable.
    expect(screen.getAllByTestId('polar-version-row')).toHaveLength(2)
  })

  it('leads back to the four artifacts', () => {
    render(<PolarContent list={LIST} current={CURRENT} canWrite={false} />)

    expect(screen.getByRole('link', { name: /Boat management/ })).toHaveAttribute(
      'href',
      '/boat-management'
    )
  })
})
