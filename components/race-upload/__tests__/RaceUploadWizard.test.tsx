/**
 * The wizard, driven end to end against two stubs.
 *
 * The seams this exercises are the ones the ticket names rather than the ones that happen to be
 * easy: the chart stack is mounted once and the channel survives a step change, one window state
 * drives everything on screen, the two hard refusals block and everything else is a note, a duplicate
 * hash asks and then proceeds, and nothing at all is sent to the server before the last press.
 *
 * Geometry is not tested here. jsdom gives every element a zero-sized bounding box, so a drag would
 * be arithmetic against zeros — a passing test about nothing. The window is driven through the
 * datetime field and the nudges, which is also how a sailor reaches a time between two rows.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { raceChartSeries } from '@/services/recordings/chart-series'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type {
  StagedRecording,
  SubmitRaceInput,
  TranscriptionChannels,
  TranscriptionRow,
} from '@/types'
import RaceUploadWizard from '../RaceUploadWizard'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

const BLANK: TranscriptionChannels = {
  longitude: null,
  latitude: null,
  cog: null,
  sog: null,
  twd: null,
  tws: null,
  twa: null,
  gwd: null,
  gws: null,
  ctw: null,
  stw: null,
  pol: null,
  pre: null,
  xte: null,
  rpm: null,
  twa_calc: null,
  awa_calc: null,
  aws_calc: null,
  alarm: null,
  observations: null,
}

/** A row a minute apart from 19:00, on a plausible bit of Lake Michigan. */
function row(index: number, values: Partial<TranscriptionChannels> = {}): TranscriptionRow {
  const at = `2026-06-03T19:${String(index).padStart(2, '0')}:00`
  return {
    ...BLANK,
    latitude: `41.85${index}`,
    longitude: `-87.55${index}`,
    cog: '10',
    sog: '6.2',
    stw: '6.0',
    ctw: '12',
    tws: '11.4',
    twa: String(40 + index),
    awa_calc: String(30 + index),
    ...values,
    row_index: index,
    date_verbatim: at,
    row_time: at,
    extras: null,
  }
}

const ROWS = [row(0), row(1), row(2), row(3), row(4)]

function stagedOf(overrides: Partial<StagedRecording> = {}): StagedRecording {
  const rows = ROWS
  const quality = assessRowQuality(rows)

  return {
    upload_id: 'upload-1',
    recording_id: 'recording-1',
    filename: '06-03-26-wed.csv',
    content_sha256: 'a'.repeat(64),
    series: raceChartSeries(
      {
        rows,
        first_row_time: rows[0].row_time,
        last_row_time: rows[rows.length - 1].row_time,
      },
      quality
    ),
    findings: [],
    ...overrides,
  }
}

/** The wizard with two stubs, and the calls each one saw. */
function mount(staged: StagedRecording = stagedOf()) {
  // Typed by their call signatures rather than by a parameter neither stub reads, so
  // `mock.calls[0][0]` is the input the wizard actually sent and not an element of an empty tuple.
  const stage = jest.fn<Promise<{ ok: true; staged: StagedRecording }>, [FormData]>(async () => ({
    ok: true as const,
    staged,
  }))
  const submit = jest.fn<Promise<{ ok: true; race_id: string }>, [SubmitRaceInput]>(async () => ({
    ok: true as const,
    race_id: 'race-1',
  }))

  render(<RaceUploadWizard stageRecording={stage} submitRace={submit} />)

  return { stage, submit }
}

function csv(): File {
  return new File(['Date;Latitude;Longitude\n'], '06-03-26-wed.csv', { type: 'text/csv' })
}

/** Every action a sailor takes, counted, so the cost of the flow is a number and not a claim. */
async function pickFile(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.upload(screen.getByLabelText('qtVlm CSV export'), csv())
}

/**
 * A bound typed straight in, as one change.
 *
 * `user.type` on a `datetime-local` sends a keystroke at a time, and a controlled field rejects
 * every intermediate value as not-yet-a-time — so it never arrives. What a sailor's browser widget
 * actually emits is one change with a complete value, which is this.
 */
function setBound(label: 'Start' | 'Finish', value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('the three steps, and what they cost', () => {
  it('costs three actions for a race with nothing to annotate', async () => {
    // ADR 0014 measured the old flow at 24 actions and this one at 5, over all five steps. This
    // ticket ships three of them, so the honest count here is three: pick the file, one Next, save.
    // Sails and Sea state add the other two Nexts.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await pickFile(user) // 1 — and it advances on its own; a Next here would confirm a done thing
    await user.click(screen.getByRole('button', { name: 'Next' })) // 2
    await user.click(screen.getByRole('button', { name: 'Save race' })) // 3

    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('sends the whole recording as the window when nothing is dragged', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await pickFile(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    const input = submit.mock.calls[0][0]
    // The recording's own stamps, verbatim, with no offset applied in either direction.
    expect(input.window_start).toBe('2026-06-03T19:00:00')
    expect(input.window_finish).toBe('2026-06-03T19:04:00')
    expect(input.title).toBe('')
    expect(input.recording_id).toBe('recording-1')
    expect(input.content_sha256).toBe('a'.repeat(64))
  })

  it('writes nothing before the last press', async () => {
    // Nothing between staging and submit touches the database (ADR 0013), and this is the visible
    // half of that: a sailor who gets to Review and closes the tab has left one tmp/ object.
    const user = userEvent.setup({ delay: null })
    const { stage, submit } = mount()

    await pickFile(user)
    expect(stage).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('button', { name: 'Save race' })).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })
})

describe('the chart stack, across a step change', () => {
  it('keeps the channel the sailor chose', async () => {
    // The pill row's state lives in the wizard and the stack is never remounted, which is the whole
    // of ADR 0014's decision. A remount would silently reset this to SOG.
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await user.click(screen.getByRole('button', { name: 'TWS' }))
    expect(screen.getByRole('button', { name: 'TWS' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('button', { name: 'TWS' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'SOG' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('is still on screen on Review, with both charts in it', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // The track and the channel chart, in one card, on the step that is meant to be a read-through.
    expect(screen.getByRole('img', { name: /GPS track/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^SOG in kt/ })).toBeInTheDocument()
  })

  it('drives everything on screen from one window, not two', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    expect(screen.getByText('Jun 3 · 19:00 – 19:04')).toBeInTheDocument()

    // One nudge on the start, and the stack's own header — which is what both charts read — moves
    // with it. There is one state, so there is nothing for a second scrubber to disagree with.
    await user.click(screen.getByRole('button', { name: /Start earlier by 5 minutes/ }))

    expect(screen.getByText('Jun 3 · 18:55 – 19:04')).toBeInTheDocument()
    expect(screen.getByLabelText('Start')).toHaveValue('2026-06-03T18:55')
  })
})

describe('the two hard refusals', () => {
  it('blocks a finish at or before the start, and says which handle to move', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    // The start typed past the finish: the one thing `races_window_ordered` also refuses.
    setBound('Start', '2026-06-03T20:00')

    expect(screen.getByText(/The finish has to come after the start/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('blocks a window with no rows in it, and says to widen rather than blaming the file', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    setBound('Finish', '2026-06-03T22:00')
    setBound('Start', '2026-06-03T21:00')

    expect(screen.getByText(/no recorded rows between those two times/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('accepts a finish past the last row, and states the gap', async () => {
    // The gap is legal and ordinary — a distance race's logger is stopped on the dock — so this is a
    // note, and the window is the race even where the recording does not reach the end of it.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await pickFile(user)
    setBound('Finish', '2026-06-03T19:20')

    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(/16m before the finish/)).toBeInTheDocument()
    // And the coverage readout says the same thing in figures, in time.
    expect(screen.getByText('After the last row')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit.mock.calls[0][0].window_finish).toBe('2026-06-03T19:20:00')
  })
})

describe('a duplicate content hash', () => {
  const duplicate = stagedOf({
    findings: [
      {
        severity: 'confirmation',
        message:
          'These are byte for byte the same as 06-03-26-wed.csv, already in the archive. Upload it ' +
          'again only if this really is a second race from the same log.',
      },
    ],
  })

  it('asks, and does not save until the sailor says so', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(duplicate)

    await pickFile(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // A confirmation is not a refusal: the sailor gets there, and is stopped one press short.
    expect(screen.getByText(/byte for byte the same as/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save race' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))

    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit).toHaveBeenCalledTimes(1)
  })
})

describe('what Review says about the recording', () => {
  it('states the same notes the race page will, from the flags it already has', async () => {
    // Row Quality is assessed over the whole Transcription and then filtered (ADR 0009), and the
    // wizard and the race page call one `windowFindings` over the same two flags — so Review cannot
    // be a cleaner-looking preview of the race than the race turns out to be.
    const slow = [
      row(0, { sog: '0.3' }),
      row(1, { sog: '0.4' }),
      row(2, { sog: '6.2' }),
      row(3, { sog: '6.4' }),
    ]
    const user = userEvent.setup({ delay: null })
    mount(
      stagedOf({
        series: raceChartSeries(
          {
            rows: slow,
            first_row_time: slow[0].row_time,
            last_row_time: slow[slow.length - 1].row_time,
          },
          assessRowQuality(slow)
        ),
      })
    )

    await pickFile(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(/50% of this window is below 2 knots/)).toBeInTheDocument()
  })

  it('states coverage in time and never as a row count', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const readout = screen.getByTestId('coverage-readout')
    expect(within(readout).getByText('Window')).toBeInTheDocument()
    expect(within(readout).getByText('Recorded')).toBeInTheDocument()
    // A clean recording of the whole window: both figures are its length, and the two gaps and the
    // dropout time are absent rather than shown as `0s`.
    expect(within(readout).getAllByText('4m')).toHaveLength(2)
    expect(within(readout).queryByText('Feed dropped')).not.toBeInTheDocument()
    expect(within(readout).queryByText(/\brows?\b/i)).not.toBeInTheDocument()
  })
})

describe('a refusal from the server', () => {
  it('shows the reason and stays on the File step', async () => {
    const user = userEvent.setup({ delay: null })
    const stage = jest.fn(async () => ({
      ok: false as const,
      message: 'This file has no Date column, so there is no way to place a single row in time.',
    }))
    const submit = jest.fn(async () => ({ ok: true as const, race_id: 'race-1' }))

    render(<RaceUploadWizard stageRecording={stage} submitRace={submit} />)
    await pickFile(user)

    expect(screen.getByText(/no Date column/)).toBeInTheDocument()
    // No stack, because there is nothing to draw, and Next has nothing to advance to.
    expect(screen.queryByRole('img', { name: /GPS track/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
