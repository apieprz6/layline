import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PolarUploadPanel from '../PolarUploadPanel'
import type { PolarUploadPreview } from '@/types'

const previewPolarUpload = jest.fn()
const commitPolarVersion = jest.fn()

jest.mock('@/app/(app)/boat-management/polar/actions', () => ({
  previewPolarUpload: (body: FormData) => previewPolarUpload(body),
  commitPolarVersion: (body: FormData) => commitPolarVersion(body),
}))

const PREVIEW: PolarUploadPreview = {
  filename: 'FIRST_10R.pol',
  byte_length: 2048,
  content_sha256: 'abc123def456' + '0'.repeat(52),
  payload: {
    twa_axis: [52, 60],
    tws_axis: [4, 6],
    boat_speed: [
      [3.96, 5.39],
      [4.25, 5.66],
    ],
    source: { format: 'orc-pol', header_token: 'twa/tws' },
  },
  warnings: [],
  suppression: { firstTrustworthyTwa: 52, suppressedTwa: [], reason: null },
  next_version_number: 3,
}

/** A `.pol` as the browser hands one over. The contents never leave this file: the panel posts
 * the File itself and the server does the reading. */
function polarFile(name = 'FIRST_10R.pol'): File {
  return new File(['twa/tws;4;6\n52;3.96;5.39\n60;4.25;5.66\n'], name, { type: 'text/plain' })
}

async function drop(name?: string): Promise<void> {
  await userEvent.upload(screen.getByTestId('polar-file-input'), polarFile(name))
}

describe('the Polar upload panel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    previewPolarUpload.mockResolvedValue({ ok: true, preview: PREVIEW })
    commitPolarVersion.mockResolvedValue({ ok: true, version_id: 'version-3', version_number: 3 })
  })

  it('writes nothing when a file is dropped — it only reads it', async () => {
    render(<PolarUploadPanel />)
    await drop()

    await waitFor(() => expect(screen.getByTestId('polar-upload-preview')).toBeInTheDocument())
    expect(commitPolarVersion).not.toHaveBeenCalled()
  })

  it('shows the grid the server parsed before anything is committed', async () => {
    render(<PolarUploadPanel />)
    await drop()

    await waitFor(() => expect(screen.getByTestId('polar-grid')).toBeInTheDocument())
    expect(screen.getAllByTestId('polar-row')).toHaveLength(2)
  })

  it('names the file, its size and its hash, so the confirm is of a file the admin recognises', async () => {
    render(<PolarUploadPanel />)
    await drop()

    await waitFor(() => expect(screen.getByTestId('polar-preview-filename')).toBeInTheDocument())
    const preview = screen.getByTestId('polar-upload-preview')
    expect(preview.textContent).toMatch('FIRST_10R.pol')
    expect(preview.textContent).toMatch('2.0 KB')
    expect(preview.textContent).toMatch('abc123def456')
  })

  it('states everything the parser tolerated rather than quietly repairing it', async () => {
    previewPolarUpload.mockResolvedValue({
      ok: true,
      preview: {
        ...PREVIEW,
        warnings: [
          { code: 'crlf-line-endings' },
          { code: 'trailing-empty-field', line: 1 },
        ],
      },
    })

    render(<PolarUploadPanel />)
    await drop()

    await waitFor(() => expect(screen.getByTestId('polar-upload-warnings')).toBeInTheDocument())
    const warnings = screen.getByTestId('polar-upload-warnings')
    expect(warnings.textContent).toMatch(/Windows line endings/)
    expect(warnings.textContent).toMatch(/line 1/)
  })

  it('names the number this upload would take', async () => {
    render(<PolarUploadPanel />)
    await drop()

    await waitFor(() =>
      expect(screen.getByTestId('polar-confirm').textContent).toBe('Confirm and save v3')
    )
  })

  it('will not commit until the admin says which date it took effect', async () => {
    render(<PolarUploadPanel />)
    await drop()
    await waitFor(() => expect(screen.getByTestId('polar-confirm')).toBeInTheDocument())

    // `required` on the date, so the browser refuses the submit — there is no default,
    // because today would be a guess about when the polar started being true.
    expect(screen.getByTestId('polar-effective-from')).toBeRequired()
  })

  it('posts the file again on confirm, with the hash of the bytes that were shown', async () => {
    render(<PolarUploadPanel />)
    await drop()
    await waitFor(() => expect(screen.getByTestId('polar-confirm')).toBeInTheDocument())

    await userEvent.type(screen.getByTestId('polar-effective-from'), '2026-04-21')
    await userEvent.type(screen.getByTestId('polar-note'), 'Certificate reissued.')
    await userEvent.click(screen.getByTestId('polar-confirm'))

    await waitFor(() => expect(commitPolarVersion).toHaveBeenCalled())

    const body = commitPolarVersion.mock.calls[0][0] as FormData
    // The bytes, not the grid: the server re-parses from the file, so a client that lied
    // about the grid changes nothing (ADR 0009).
    expect(body.get('file')).toBeInstanceOf(File)
    expect(body.get('content_sha256')).toBe(PREVIEW.content_sha256)
    expect(body.get('effective_from')).toBe('2026-04-21')
    expect(body.get('note')).toBe('Certificate reissued.')
    expect(body.get('payload')).toBeNull()
  })

  it('says what was saved and clears itself, so the same file is not committed twice', async () => {
    render(<PolarUploadPanel />)
    await drop()
    await waitFor(() => expect(screen.getByTestId('polar-confirm')).toBeInTheDocument())

    await userEvent.type(screen.getByTestId('polar-effective-from'), '2026-04-21')
    await userEvent.click(screen.getByTestId('polar-confirm'))

    await waitFor(() => expect(screen.getByTestId('polar-upload-saved')).toBeInTheDocument())
    expect(screen.getByTestId('polar-upload-saved').textContent).toBe('Saved as v3.')
    expect(screen.queryByTestId('polar-upload-preview')).not.toBeInTheDocument()
  })

  it('shows a refusal as the server worded it, and keeps nothing to confirm', async () => {
    previewPolarUpload.mockResolvedValue({
      ok: false,
      message: 'That file could not be read as a polar (line 14): a row is 8 fields wide, not 10.',
    })

    render(<PolarUploadPanel />)
    await drop('mystery.pol')

    await waitFor(() => expect(screen.getByTestId('polar-upload-error')).toBeInTheDocument())
    expect(screen.getByTestId('polar-upload-error').textContent).toMatch('line 14')
    expect(screen.queryByTestId('polar-upload-preview')).not.toBeInTheDocument()
  })

  it('keeps the preview when the commit itself is refused, so nothing has to be re-dropped', async () => {
    commitPolarVersion.mockResolvedValue({ ok: false, message: 'Only an admin can upload a Polar.' })

    render(<PolarUploadPanel />)
    await drop()
    await waitFor(() => expect(screen.getByTestId('polar-confirm')).toBeInTheDocument())

    await userEvent.type(screen.getByTestId('polar-effective-from'), '2026-04-21')
    await userEvent.click(screen.getByTestId('polar-confirm'))

    await waitFor(() => expect(screen.getByTestId('polar-upload-error')).toBeInTheDocument())
    expect(screen.getByTestId('polar-upload-preview')).toBeInTheDocument()
  })

  it('lets the admin back out of a file it has read', async () => {
    render(<PolarUploadPanel />)
    await drop()
    await waitFor(() => expect(screen.getByTestId('polar-cancel')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('polar-cancel'))

    expect(screen.queryByTestId('polar-upload-preview')).not.toBeInTheDocument()
    expect(commitPolarVersion).not.toHaveBeenCalled()
  })

  it('names its own action, rather than leaving the browser to call it "Choose File"', () => {
    render(<PolarUploadPanel />)

    // The control the sailor sees and the control the browser fires are the same element: the
    // label is drawn as the button, so a keyboard reaches it and no `button` clicks a hidden
    // input from JavaScript.
    expect(screen.getByLabelText(/choose a \.pol file/i)).toBe(
      screen.getByTestId('polar-file-input')
    )
    expect(screen.getByTestId('polar-file-button').textContent).toMatch(/Choose a \.pol file/)
    // And no markdown left in the copy on the way: the card printed its own backticks.
    expect(screen.getByTestId('polar-upload-panel').textContent).not.toMatch(/`/)
  })

  it('says which file is in hand, before and after one is chosen', async () => {
    render(<PolarUploadPanel />)

    // The native "No file chosen" goes with the native button, so the card says it itself —
    // otherwise a chosen file leaves no trace on screen until the preview arrives.
    expect(screen.getByTestId('polar-chosen-file').textContent).toBe('No file chosen yet')

    await drop('FIRST_10R.pol')

    await waitFor(() =>
      expect(screen.getByTestId('polar-chosen-file').textContent).toBe('FIRST_10R.pol')
    )
  })

  it('describes the file it wants without swallowing the button that asks for it', () => {
    render(<PolarUploadPanel />)

    // The sentence about certificates and routers describes the input; it is not its name,
    // which is the action. Both have to reach a screen reader, so one is the label and the
    // other is `aria-describedby`.
    const hint = screen.getByTestId('polar-file-input').getAttribute('aria-describedby')
    expect(hint).toBe('polar-file-hint')
    expect(document.getElementById(hint as string)?.textContent).toMatch(/exactly as it came/)
  })

  it('filters the file chooser without treating the type as validation', async () => {
    render(<PolarUploadPanel />)

    // A browser types a `.pol` as `text/plain`, `application/octet-stream` or nothing at all,
    // so `accept` is a convenience and the parse on the server is the gate (ADR 0009).
    expect(screen.getByTestId('polar-file-input').getAttribute('accept')).toMatch('.pol')
  })
})
