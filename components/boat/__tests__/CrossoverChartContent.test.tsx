import { render, screen } from '@testing-library/react'
import CrossoverChartContent from '../CrossoverChartContent'
import type {
  CrossoverChartVersionDetail,
  FileBackedVersionList,
  FileBackedVersionSummary,
} from '@/types'

// The panel is a Client Component whose only job is to call two Server Actions. Its behaviour is
// tested on its own; here it stands in as a marker, so importing the actions module — and with it
// `next/cache` and the Supabase server client — is not a condition of testing this screen.
jest.mock('../CrossoverChartUploadPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="crossover-chart-upload-panel" />,
}))

const V2: FileBackedVersionSummary = {
  id: 'version-2',
  version_number: 2,
  effective_from: '2026-06-14',
  recorded_at: '2026-09-15T04:00:00+00:00',
  note: 'Sail names corrected.',
  filename: 'HandsomePete_2026.sailselect',
  content_sha256: 'b'.repeat(64),
  is_current: true,
}

const V1: FileBackedVersionSummary = {
  id: 'version-1',
  version_number: 1,
  effective_from: '2026-04-21',
  recorded_at: '2026-05-01T12:00:00+00:00',
  note: null,
  filename: 'HandsomePete.sailselect',
  content_sha256: 'a'.repeat(64),
  is_current: false,
}

const CURRENT: CrossoverChartVersionDetail = {
  ...V2,
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
        content_sha256: 'c'.repeat(64),
      },
    },
  },
}

const LIST: FileBackedVersionList = { current_version_id: 'version-2', versions: [V2, V1] }

const EMPTY: FileBackedVersionList = { current_version_id: null, versions: [] }

describe('the Crossover Chart screen', () => {
  it('draws the chart in force above the list of Versions', () => {
    render(<CrossoverChartContent list={LIST} current={CURRENT} canWrite={false} />)

    expect(screen.getByTestId('crossover-chart-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('crossover-chart-version-row')).toHaveLength(2)
  })

  it('says the chart and its definitions are one Version', () => {
    render(<CrossoverChartContent list={LIST} current={CURRENT} canWrite={false} />)

    // One artifact, never versioned apart (ADR 0012) — so this is not a screen about two things,
    // and the subtitle is where that is said.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Crossover Chart')
    expect(document.body.textContent).toMatch(/kept as one Version/)
  })

  it('offers the upload to an admin', () => {
    render(<CrossoverChartContent list={LIST} current={CURRENT} canWrite />)

    expect(screen.getByTestId('crossover-chart-upload-panel')).toBeInTheDocument()
  })

  it('lets a signed-in viewer read every Version and upload nothing', () => {
    render(<CrossoverChartContent list={LIST} current={CURRENT} canWrite={false} />)

    // Role governs writes only (ADR 0019): the difference between an admin and a viewer on this
    // screen is the panel, and nothing else.
    expect(screen.queryByTestId('crossover-chart-upload-panel')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('crossover-chart-version-row')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(2)
  })

  it('sends a sailor to a Version for both of its files', () => {
    render(<CrossoverChartContent list={LIST} current={CURRENT} canWrite={false} />)

    // The list row carries the grid file's name, because a summary has no payload and the
    // definitions half's name lives in it (ADR 0022). Both are named on the Version's own screen.
    expect(
      screen.getAllByTestId('crossover-chart-version-row')[0].querySelector('a')
    ).toHaveAttribute('href', '/boat-management/crossover-chart/version-2')
    expect(document.body.textContent).toMatch(/download both of its files/)
  })

  it('says nothing is recorded on an empty archive, and still offers the upload', () => {
    render(<CrossoverChartContent list={EMPTY} current={null} canWrite />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/No Crossover Chart recorded/)
    expect(screen.getByTestId('crossover-chart-upload-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('crossover-chart-grid')).not.toBeInTheDocument()
  })

  it('tells a viewer who to ask when nothing is recorded', () => {
    render(<CrossoverChartContent list={EMPTY} current={null} canWrite={false} />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/admin/)
    expect(screen.queryByTestId('crossover-chart-upload-panel')).not.toBeInTheDocument()
  })

  it('reports a failed read as a failed read, not as an empty archive', () => {
    render(<CrossoverChartContent list={null} current={null} canWrite />)

    expect(screen.getByTestId('empty-state').textContent).toMatch(/could not be read/)
    // Nothing to upload against when the archive cannot be read at all.
    expect(screen.queryByTestId('crossover-chart-upload-panel')).not.toBeInTheDocument()
  })

  it('says so when the Version in force cannot be read, rather than drawing the next one down', () => {
    render(<CrossoverChartContent list={LIST} current={null} canWrite={false} />)

    // Drawing the Version below would show a sailor sail choices that are not the boat's.
    expect(screen.queryByTestId('crossover-chart-grid')).not.toBeInTheDocument()
    expect(screen.getByText(/Version in force could not be read/)).toBeInTheDocument()
    expect(screen.getAllByTestId('crossover-chart-version-row')).toHaveLength(2)
  })

  it('leads back to the four artifacts', () => {
    render(<CrossoverChartContent list={LIST} current={CURRENT} canWrite={false} />)

    expect(screen.getByRole('link', { name: /Boat management/ })).toHaveAttribute(
      'href',
      '/boat-management'
    )
  })
})
