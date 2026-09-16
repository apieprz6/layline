import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CrossoverChartUploadPanel from '../CrossoverChartUploadPanel'
import type { CrossoverChartUploadPreview } from '@/types'

const previewCrossoverChartUpload = jest.fn()
const commitCrossoverChartVersion = jest.fn()

jest.mock('@/app/(app)/boat-management/crossover-chart/actions', () => ({
  previewCrossoverChartUpload: (body: FormData) => previewCrossoverChartUpload(body),
  commitCrossoverChartVersion: (body: FormData) => commitCrossoverChartVersion(body),
}))

const GRID_SHA = 'aaaa1111bbbb' + '0'.repeat(52)
const DEFINITIONS_SHA = 'cccc2222dddd' + '0'.repeat(52)

const PREVIEW: CrossoverChartUploadPreview = {
  grid: {
    filename: 'HandsomePete_2026.sailselect',
    byte_length: 2048,
    content_sha256: GRID_SHA,
  },
  definitions: {
    filename: 'HandsomePete_2026.saildesc',
    byte_length: 96,
    content_sha256: DEFINITIONS_SHA,
  },
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
  grid_warnings: [],
  definitions_warnings: [],
  usage: [
    { definition: { number: 1, label: 'GV + Genoa' }, cells: 3 },
    { definition: { number: 2, label: 'GV + A3' }, cells: 1 },
  ],
  next_version_number: 3,
}

/**
 * The two files as a browser hands them over. The contents never matter here: the panel posts the
 * File itself and the server does every bit of the reading.
 */
function gridFile(name = 'HandsomePete_2026.sailselect'): File {
  return new File(['TWA/TWS;8;12\n40;1;1\n80;1;2\n'], name, { type: 'text/plain' })
}

function definitionsFile(name = 'HandsomePete_2026.saildesc'): File {
  return new File(['1;GV + Genoa\n2;GV + A3\n'], name, { type: 'text/plain' })
}

async function dropGrid(name?: string): Promise<void> {
  await userEvent.upload(screen.getByTestId('crossover-chart-grid-file-input'), gridFile(name))
}

async function dropDefinitions(name?: string): Promise<void> {
  await userEvent.upload(
    screen.getByTestId('crossover-chart-definitions-file-input'),
    definitionsFile(name)
  )
}

/** Both halves, which is the only state in which anything is read. */
async function dropBoth(): Promise<void> {
  await dropGrid()
  await dropDefinitions()
  await waitFor(() =>
    expect(screen.getByTestId('crossover-chart-upload-preview')).toBeInTheDocument()
  )
}

describe('the Crossover Chart upload panel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    previewCrossoverChartUpload.mockResolvedValue({ ok: true, preview: PREVIEW })
    commitCrossoverChartVersion.mockResolvedValue({
      ok: true,
      version_id: 'version-3',
      version_number: 3,
    })
  })

  it('reads nothing until both halves are in hand', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropGrid()

    // Half a crossover chart says nothing — a grid of numbers with no definitions behind it — and
    // an error message about the middle of a two-file task is not an error.
    expect(previewCrossoverChartUpload).not.toHaveBeenCalled()
    expect(screen.getByTestId('crossover-chart-upload-waiting').textContent).toMatch(
      /Now choose the sail definitions/
    )
    expect(screen.queryByTestId('crossover-chart-upload-error')).not.toBeInTheDocument()
  })

  it('says which half is still missing when the definitions come first', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropDefinitions()

    expect(screen.getByTestId('crossover-chart-upload-waiting').textContent).toMatch(
      /Now choose the sail chart/
    )
  })

  it('reads both files in one action once both are chosen', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    expect(previewCrossoverChartUpload).toHaveBeenCalledTimes(1)
    const body = previewCrossoverChartUpload.mock.calls[0][0] as FormData
    expect(body.get('grid')).toBeInstanceOf(File)
    expect(body.get('definitions')).toBeInstanceOf(File)
    // Two files, one Version (ADR 0012), and the first step writes nothing.
    expect(commitCrossoverChartVersion).not.toHaveBeenCalled()
  })

  it('draws the chart the server read, legend and all, before anything is committed', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    expect(screen.getByTestId('crossover-chart-grid')).toBeInTheDocument()
    expect(screen.getAllByTestId('crossover-chart-row')).toHaveLength(2)
    expect(screen.getAllByTestId('crossover-chart-legend-row')).toHaveLength(2)
  })

  it('names both files, both sizes and both hashes, so the confirm is of files the admin knows', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    const preview = screen.getByTestId('crossover-chart-upload-preview')
    expect(screen.getByTestId('crossover-chart-preview-grid-filename').textContent).toBe(
      'HandsomePete_2026.sailselect'
    )
    expect(screen.getByTestId('crossover-chart-preview-definitions-filename').textContent).toBe(
      'HandsomePete_2026.saildesc'
    )
    expect(preview.textContent).toMatch('2.0 KB')
    expect(preview.textContent).toMatch('96 bytes')
    expect(preview.textContent).toMatch('aaaa1111bbbb')
    expect(preview.textContent).toMatch('cccc2222dddd')
  })

  it('says what shape was read, and that nothing in either file was corrected', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    const preview = screen.getByTestId('crossover-chart-upload-preview')
    expect(preview.textContent).toMatch('2 wind angles × 2 wind speeds')
    expect(preview.textContent).toMatch('2 sails')
    expect(preview.textContent).toMatch(/renumbered, reordered or renamed/)
  })

  it('attributes every tolerated oddity to the file it was found in', async () => {
    previewCrossoverChartUpload.mockResolvedValue({
      ok: true,
      preview: {
        ...PREVIEW,
        grid_warnings: [{ code: 'crlf-line-endings' }],
        definitions_warnings: [{ code: 'comment-line-skipped', line: 2 }],
      },
    })

    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    // The two halves are read by different rules, so "a comment line was skipped" is useless
    // without saying which file had it.
    const warnings = screen.getByTestId('crossover-chart-upload-warnings')
    expect(warnings.textContent).toMatch(/The chart: has Windows line endings/)
    expect(warnings.textContent).toMatch(/The definitions: have a comment line/)
    expect(warnings.textContent).toMatch('line 2')
  })

  it('names the number this upload would take', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    expect(screen.getByTestId('crossover-chart-confirm').textContent).toBe(
      'Confirm and save v3'
    )
  })

  it('will not commit until the admin says which date it took effect', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    // No default: today would be a guess about when the boat started being sailed this way.
    expect(screen.getByTestId('crossover-chart-effective-from')).toBeRequired()
  })

  it('posts both files again on confirm, with the hash of each set of bytes that was shown', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    await userEvent.type(screen.getByTestId('crossover-chart-effective-from'), '2026-04-21')
    await userEvent.type(screen.getByTestId('crossover-chart-note'), 'Sail names corrected.')
    await userEvent.click(screen.getByTestId('crossover-chart-confirm'))

    await waitFor(() => expect(commitCrossoverChartVersion).toHaveBeenCalled())

    const body = commitCrossoverChartVersion.mock.calls[0][0] as FormData
    expect(body.get('grid')).toBeInstanceOf(File)
    expect(body.get('definitions')).toBeInstanceOf(File)
    // A hash per half: a swapped definitions file changes what every cell means without changing
    // a byte of the grid.
    expect(body.get('grid_content_sha256')).toBe(GRID_SHA)
    expect(body.get('definitions_content_sha256')).toBe(DEFINITIONS_SHA)
    expect(body.get('effective_from')).toBe('2026-04-21')
    expect(body.get('note')).toBe('Sail names corrected.')
    // The chart this panel holds is never sent: the server re-parses the bytes (ADR 0009).
    expect(body.get('payload')).toBeNull()
  })

  it('says what was saved and clears both choosers, so the same pair is not committed twice', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    await userEvent.type(screen.getByTestId('crossover-chart-effective-from'), '2026-04-21')
    await userEvent.click(screen.getByTestId('crossover-chart-confirm'))

    await waitFor(() =>
      expect(screen.getByTestId('crossover-chart-upload-saved')).toBeInTheDocument()
    )
    expect(screen.getByTestId('crossover-chart-upload-saved').textContent).toBe('Saved as v3.')
    expect(screen.queryByTestId('crossover-chart-upload-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('crossover-chart-grid-file-chosen').textContent).toBe(
      'No file chosen yet'
    )
    expect(screen.getByTestId('crossover-chart-definitions-file-chosen').textContent).toBe(
      'No file chosen yet'
    )
  })

  it('shows a refusal as the server worded it, and keeps nothing to confirm', async () => {
    previewCrossoverChartUpload.mockResolvedValue({
      ok: false,
      message:
        'Those two files parsed but do not make a usable chart: cell 40°/8 kn asks for sail 5, which no definition defines.',
    })

    render(<CrossoverChartUploadPanel />)
    await dropGrid()
    await dropDefinitions()

    await waitFor(() =>
      expect(screen.getByTestId('crossover-chart-upload-error')).toBeInTheDocument()
    )
    expect(screen.getByTestId('crossover-chart-upload-error').textContent).toMatch('sail 5')
    expect(screen.queryByTestId('crossover-chart-upload-preview')).not.toBeInTheDocument()
  })

  it('keeps the preview when the commit itself is refused, so nothing has to be re-dropped', async () => {
    commitCrossoverChartVersion.mockResolvedValue({
      ok: false,
      message: 'Only an admin can upload a Crossover Chart.',
    })

    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    await userEvent.type(screen.getByTestId('crossover-chart-effective-from'), '2026-04-21')
    await userEvent.click(screen.getByTestId('crossover-chart-confirm'))

    await waitFor(() =>
      expect(screen.getByTestId('crossover-chart-upload-error')).toBeInTheDocument()
    )
    expect(screen.getByTestId('crossover-chart-upload-preview')).toBeInTheDocument()
  })

  it('lets the admin back out of both files at once', async () => {
    render(<CrossoverChartUploadPanel />)
    await dropBoth()

    await userEvent.click(screen.getByTestId('crossover-chart-cancel'))

    // One artifact, so backing out of half of it would leave a state the Version cannot have.
    expect(screen.queryByTestId('crossover-chart-upload-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('crossover-chart-grid-file-chosen').textContent).toBe(
      'No file chosen yet'
    )
    expect(screen.getByTestId('crossover-chart-definitions-file-chosen').textContent).toBe(
      'No file chosen yet'
    )
    expect(commitCrossoverChartVersion).not.toHaveBeenCalled()
  })

  it('names each of its own actions, rather than leaving the browser to call them "Choose File"', () => {
    render(<CrossoverChartUploadPanel />)

    // The control the sailor sees and the control the browser fires are the same element for each
    // half: the label is drawn as the button, so a keyboard reaches it.
    expect(screen.getByLabelText(/choose the sail chart/i)).toBe(
      screen.getByTestId('crossover-chart-grid-file-input')
    )
    expect(screen.getByLabelText(/choose the sail definitions/i)).toBe(
      screen.getByTestId('crossover-chart-definitions-file-input')
    )
    // And no markdown left in the copy on the way.
    expect(screen.getByTestId('crossover-chart-upload-panel').textContent).not.toMatch(/`/)
  })

  it('says which file is in hand for each half, before and after one is chosen', async () => {
    render(<CrossoverChartUploadPanel />)

    expect(screen.getByTestId('crossover-chart-grid-file-chosen').textContent).toBe(
      'No file chosen yet'
    )
    await dropGrid('HandsomePete_2026.sailselect')

    await waitFor(() =>
      expect(screen.getByTestId('crossover-chart-grid-file-chosen').textContent).toBe(
        'HandsomePete_2026.sailselect'
      )
    )
    expect(screen.getByTestId('crossover-chart-definitions-file-chosen').textContent).toBe(
      'No file chosen yet'
    )
  })

  it('filters each file chooser without treating the type as validation', () => {
    render(<CrossoverChartUploadPanel />)

    // A browser types a `.sailselect` as `text/plain`, `application/octet-stream` or nothing at
    // all, so `accept` is a convenience and the parse on the server is the gate (ADR 0009).
    expect(
      screen.getByTestId('crossover-chart-grid-file-input').getAttribute('accept')
    ).toMatch('.sailselect')
    expect(
      screen.getByTestId('crossover-chart-definitions-file-input').getAttribute('accept')
    ).toMatch('.saildesc')
  })

  it('describes the pair it wants without swallowing the buttons that ask for them', () => {
    render(<CrossoverChartUploadPanel />)

    // The sentence about both files describes the inputs; it is not their name, which is the
    // action. Both have to reach a screen reader, so one is the label and the other is
    // `aria-describedby`.
    const hint = screen
      .getByTestId('crossover-chart-grid-file-input')
      .getAttribute('aria-describedby')
    expect(hint).toBe('crossover-chart-hint')
    expect(document.getElementById(hint as string)?.textContent).toMatch(/one Version/)
    expect(
      screen.getByTestId('crossover-chart-definitions-file-input').getAttribute('aria-describedby')
    ).toBe(hint)
  })
})
