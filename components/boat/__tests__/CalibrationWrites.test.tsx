import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalibrationWrites from '../CalibrationWrites'
import type { InstrumentCalibrationPayload, InstrumentCalibrationVersion } from '@/types'

// The three writes are the actions' own suite. What is under test here is which panel
// opens on which props, so a real one would only reach for a Supabase client.
jest.mock('@/app/(app)/boat-management/instrument-calibration/actions', () => ({
  recordCalibrationVersion: jest.fn(async () => ({ ok: true })),
  correctCalibrationVersion: jest.fn(async () => ({ ok: true })),
  addCalibrationEvent: jest.fn(async () => ({ ok: true })),
}))

const AS_PROGRAMMED: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

function version(
  version_number: number,
  payload: InstrumentCalibrationPayload = AS_PROGRAMMED
): InstrumentCalibrationVersion {
  return {
    id: `version-${version_number}`,
    artifact_id: 'artifact-1',
    kind: 'instrument_calibration',
    version_number,
    effective_from: '2026-05-30',
    recorded_at: '2026-05-30T19:00:00Z',
    note: null,
    created_by: 'owner-1',
    filename: null,
    content_sha256: null,
    payload,
  }
}

describe('the admin’s calibration writes', () => {
  it('opens the correction panel on the Version that arrived after the first record', async () => {
    // A write revalidates the page, which re-renders this island with new props
    // without remounting it. Anything the correction target was seeded with at mount
    // would still be the empty archive's `null`, and the button would do nothing.
    const { rerender } = render(<CalibrationWrites versions={[]} currentVersionId={null} />)

    expect(
      screen.queryByRole('button', { name: 'Correct a recorded Version in place' })
    ).not.toBeInTheDocument()

    const v1 = version(1)
    rerender(<CalibrationWrites versions={[v1]} currentVersionId={v1.id} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Correct a recorded Version in place' })
    )

    expect(screen.getByTestId('calibration-version-form')).toBeInTheDocument()
    expect(screen.getByTestId('correction-consequence')).toBeInTheDocument()
    expect(screen.getByText('Correct v1 in place')).toBeInTheDocument()
  })

  it('corrects the Version in force by default, not merely the last one recorded', async () => {
    // A correction may give a later Version an earlier effective date, so mint order
    // and "what the boat is set to" can disagree. A freshly mistyped figure is in the
    // one in force.
    const [v1, v2] = [version(1), version(2)]

    render(<CalibrationWrites versions={[v1, v2]} currentVersionId={v1.id} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Correct a recorded Version in place' })
    )

    expect(screen.getByText('Correct v1 in place')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'v1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('rebuilds the fields when the sailor picks a different Version', async () => {
    const v1 = version(1)
    const v2 = version(2, { ...AS_PROGRAMMED, AWA: { offset: 7 } })

    render(<CalibrationWrites versions={[v1, v2]} currentVersionId={v1.id} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Correct a recorded Version in place' })
    )
    expect(screen.getByLabelText('Offset (°)', { selector: '#cal-offset-AWA' })).toHaveValue(2)

    await userEvent.click(screen.getByRole('button', { name: 'v2' }))

    // Keyed on the Version: leaving v1's figures under a heading reading v2 would be
    // the form describing one Version and about to write another.
    expect(screen.getByText('Correct v2 in place')).toBeInTheDocument()
    expect(screen.getByLabelText('Offset (°)', { selector: '#cal-offset-AWA' })).toHaveValue(7)
  })

  it('prefills a stored multiplier exactly, not rounded to how it is displayed', async () => {
    // A multiplier is shown to two decimals everywhere else, but the field is not a
    // rendering of the figure — it is the figure. Prefilled as 1.02, a recorded 1.023
    // would be overwritten by an admin correcting a different channel entirely.
    const v1 = version(1, { ...AS_PROGRAMMED, AWS: { multiplier: 1.023, offset: 0 } })

    render(<CalibrationWrites versions={[v1]} currentVersionId={v1.id} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Correct a recorded Version in place' })
    )

    expect(screen.getByLabelText('Multiplier', { selector: '#cal-multiplier-AWS' })).toHaveValue(
      1.023
    )
  })

  it('starts a new Version from the figures in force, so an untouched channel is not blank', async () => {
    const v1 = version(1)

    render(<CalibrationWrites versions={[v1]} currentVersionId={v1.id} />)
    await userEvent.click(screen.getByRole('button', { name: 'Record new values' }))

    expect(screen.getByLabelText('Offset (°)', { selector: '#cal-offset-AWA' })).toHaveValue(2)
    // A mint's effective date is not the one already recorded: it is the day these
    // figures went into the display, which is what is being asked.
    expect(screen.getByLabelText(/Effective from/)).toHaveValue('')
  })

  it('starts every field blank when nothing is recorded, and never at zero', async () => {
    render(<CalibrationWrites versions={[]} currentVersionId={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Record new values' }))

    // A zero nobody typed cannot be told afterwards from a genuine 0.0 on the display.
    for (const field of screen.getAllByRole('spinbutton')) {
      expect(field).toHaveValue(null)
    }
  })

  it('shows one panel at a time, and comes back to the menu on cancel', async () => {
    const v1 = version(1)
    render(<CalibrationWrites versions={[v1]} currentVersionId={v1.id} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add a calibration event' }))
    expect(screen.getByTestId('calibration-event-form')).toBeInTheDocument()
    expect(screen.queryByTestId('calibration-writes')).not.toBeInTheDocument()
    expect(screen.queryByTestId('calibration-version-form')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('calibration-writes')).toBeInTheDocument()
  })
})
