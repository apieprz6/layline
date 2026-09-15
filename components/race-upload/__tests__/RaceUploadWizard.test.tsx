/**
 * The wizard, driven end to end against two stubs.
 *
 * The seams this exercises are the ones the ticket names rather than the ones that happen to be
 * easy: the chart stack is mounted once and the channel survives a step change, one window state
 * drives everything on screen, the two hard refusals block and everything else is a note, a duplicate
 * hash asks and then proceeds, and nothing at all is sent to the server before the last press.
 *
 * The two annotation steps are Testimony (ADR 0010), so what is tested about them is what nothing may
 * invent: nothing is pre-selected, both steps are skippable and two empty lists are a legal race, a
 * new entry inherits the previous one, an entry naming no sails is refused, and an entry's time is not
 * bounded by the window.
 *
 * Layout is not tested here. jsdom gives every element a zero-sized bounding box, so a drag would be
 * arithmetic against zeros — a passing test about nothing. The window is driven through the datetime
 * field and the nudges, which is also how a sailor reaches a time between two rows. A *tap* is tested,
 * once, over a stubbed rect the width of the chart's own viewBox, so the two extremes of the axis are
 * the two ends of the recording and nothing is asserted about a pixel in between.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { raceChartSeries } from '@/services/recordings/chart-series'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type {
  SailChoice,
  StagedRecording,
  SubmitRaceInput,
  SubmitRaceResult,
  TranscriptionChannels,
  TranscriptionRow,
} from '@/types'
import RaceUploadWizard from '../RaceUploadWizard'
import { CHART_WIDTH } from '../chart-geometry'

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

/** Ten rows, for a race with more sail changes than a five-row recording has places to put them. */
const LONG_ROWS = Array.from({ length: 10 }, (_, index) => row(index))

function seriesOf(rows: readonly TranscriptionRow[]) {
  return raceChartSeries(
    {
      rows: [...rows],
      first_row_time: rows[0].row_time,
      last_row_time: rows[rows.length - 1].row_time,
    },
    assessRowQuality([...rows])
  )
}

/**
 * The boat's locker, in `sort_order`, with one sail already retired.
 *
 * The retired jib is not decoration: the archive is hand-entered, so most races annotated through this
 * wizard are older than the locker, and a picker that offered only today's sails would make an honest
 * answer unavailable — or offer a sail that had already gone.
 */
const INVENTORY: SailChoice[] = [
  { id: 'id-main', key: 'main', label: 'Mainsail', retired_on: null },
  { id: 'id-jib-1', key: 'j1', label: 'Jib 1', retired_on: '2026-01-31' },
  { id: 'id-jib-2', key: 'j2', label: 'Jib 2', retired_on: null },
  { id: 'id-a2', key: 'A2', label: 'A2', retired_on: null },
]

function stagedOf(overrides: Partial<StagedRecording> = {}): StagedRecording {
  return {
    upload_id: 'upload-1',
    recording_id: 'recording-1',
    filename: '06-03-26-wed.csv',
    content_sha256: 'a'.repeat(64),
    series: seriesOf(ROWS),
    findings: [],
    ...overrides,
  }
}

/** The wizard with two stubs, and the calls each one saw. */
function mount(staged: StagedRecording = stagedOf(), inventory: SailChoice[] | null = INVENTORY) {
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

  render(
    <RaceUploadWizard stageRecording={stage} submitRace={submit} inventory={inventory} />
  )

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

/** Next, pressed `times` times: one action each, and how a skipped step is skipped. */
async function next(user: ReturnType<typeof userEvent.setup>, times = 1): Promise<void> {
  for (let press = 0; press < times; press += 1) {
    await user.click(screen.getByRole('button', { name: 'Next' }))
  }
}

/** The Window step through to Review, skipping both annotation steps: three Nexts. */
async function toReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await next(user, 3)
}

/**
 * A tap on the channel chart, at one end of the axis or the other.
 *
 * The rect is stubbed at the chart's own viewBox width, so a client x of 0 is the left edge of the
 * axis and one of `CHART_WIDTH` is the right — the two ends of the recording. Nothing here asserts
 * where a pixel in the middle lands, which is the part jsdom cannot honestly answer.
 */
function tapChart(end: 'first' | 'last'): void {
  const chart = screen.getByRole('img', { name: /^SOG in kt/ })

  jest.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: CHART_WIDTH,
    bottom: 0,
    width: CHART_WIDTH,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)

  // A `MouseEvent` named `pointerdown` rather than `fireEvent.pointerDown`: jsdom has no
  // `PointerEvent`, so testing-library falls back to a plain `Event` and the `clientX` — the whole
  // point of a tap — is dropped on the way. React dispatches on the event's type either way.
  fireEvent(
    chart,
    new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: end === 'first' ? 0 : CHART_WIDTH,
    })
  )
}

describe('the five steps, and what they cost', () => {
  it('costs five actions for a race with nothing to annotate', async () => {
    // ADR 0014's own figure, and the one this wizard is answerable for: pick the file, three Nexts,
    // Save race. A change that adds a press to the ordinary race fails here rather than passing.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await pickFile(user) // 1 — and it advances on its own; a Next here would confirm a done thing
    await next(user, 3) // 2, 3, 4 — Window, Sails, Sea state, each skippable
    await user.click(screen.getByRole('button', { name: 'Save race' })) // 5

    expect(submit).toHaveBeenCalledTimes(1)
    // Skipped is skipped: two empty lists, and never a stand-in configuration (ADR 0010).
    expect(submit.mock.calls[0][0].sails).toEqual([])
    expect(submit.mock.calls[0][0].sea_state).toEqual([])
  })

  it('costs 24 actions for the archive’s worst case, seven sail changes', async () => {
    // ADR 0014's count, item for item: 1 file + 1 Next + 7 placements + 13 chip taps + 2 Nexts = 24,
    // ending on Review. (Save is the 25th; the ADR's own two figures count it for the clean race and
    // not for this one, and this test pins each of them as the ADR states it.)
    //
    // The seven placements are the "+ Add one by time instead" button rather than seven taps on the
    // track: both place one entry in one action, and jsdom cannot deliver seven distinguishable tap
    // coordinates. What the count is really about is the *chips* — 13 of them for seven changes only
    // holds because each entry inherits the one before it.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(stagedOf({ series: seriesOf(LONG_ROWS) }))

    let actions = 0

    await pickFile(user)
    actions += 1
    await next(user) // to Sails
    actions += 1

    /** One change: place it, then say what is different about it. */
    const change = async (chips: readonly string[]): Promise<void> => {
      await user.click(screen.getByRole('button', { name: '+ Add one by time instead' }))
      actions += 1

      for (const chip of chips) {
        await user.click(screen.getByRole('button', { name: chip }))
        actions += 1
      }
    }

    // The first entry has nothing to inherit, so it states the whole sail plan: two sails and the
    // main's state. Every change after it is only what changed.
    await change(['Mainsail', 'Jib 2', 'Full']) // 3 chips
    await change(['Jib 2', 'A2']) // 2 — headsail down, kite up
    await change(['A2', 'Jib 2']) // 2 — and back
    await change(['Jib 2', 'A2']) // 2
    await change(['A2', 'Jib 2']) // 2
    await change(['Jib 2']) // 1 — main alone
    await change(['One reef']) // 1 — and reefed

    await next(user, 2) // Sea state, Review
    actions += 2

    expect(actions).toBe(24)
    expect(screen.getByRole('button', { name: 'Save race' })).toBeEnabled()
    // Seven entries, all of them finished, or the count above bought nothing.
    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit.mock.calls[0][0].sails).toHaveLength(7)
    expect(submit.mock.calls[0][0].sails[6]).toMatchObject({
      reef: 'reef-1',
      sail_ids: ['id-main'],
    })
  })

  it('sends the whole recording as the window when nothing is dragged', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await pickFile(user)
    await toReview(user)
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
    await toReview(user)

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
    await toReview(user)

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
    await toReview(user)

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
    await toReview(user)

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
    mount(stagedOf({ series: seriesOf(slow) }))

    await pickFile(user)
    await toReview(user)

    expect(screen.getByText(/50% of this window is below 2 knots/)).toBeInTheDocument()
  })

  it('states coverage in time and never as a row count', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await toReview(user)

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

describe('the sailor’s Testimony about the sails', () => {
  /** Pick the file and go one step on, which is the Sails step. */
  async function toSails(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await pickFile(user)
    await next(user)
  }

  it('says what an empty step means before the sailor wonders whether they are stuck', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    expect(screen.getByText(/No sail changes recorded/)).toBeInTheDocument()
    expect(screen.getByText(/say the sail plan was not recorded/)).toBeInTheDocument()

    await next(user)
    expect(screen.getByText(/No sea state recorded/)).toBeInTheDocument()
  })

  it('places an entry at the nearest recorded row when the track is tapped', async () => {
    // The left end of the axis is the first row, and an entry lands on a time the file actually has —
    // never between two samples, and never a time nobody tapped.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    expect(screen.getByLabelText('Exact time, if you know it')).toHaveValue('2026-06-03T19:00')
  })

  it('steps a second entry onto the next free row rather than colliding', async () => {
    // `UNIQUE (race_id, at)` fires inside the transaction, after the bytes have moved (ADR 0013), so
    // two entries on one row must be impossible to place rather than refused after a failed save.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('last')
    tapChart('last')

    // The last row was taken, so the second entry went to the row before it — and the first one is
    // still there, closed, with its own clock.
    expect(screen.getByLabelText('Exact time, if you know it')).toHaveValue('2026-06-03T19:03')
    expect(screen.getByRole('button', { name: /19:04/ })).toBeInTheDocument()
  })

  it('starts a new entry with nothing selected at all', async () => {
    // The mockup pre-selects a configuration by index. That is the same failure as `ndbc.ts`'s
    // `wind_direction ?? 0`: a value nobody stated, indistinguishable from one somebody did.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    for (const chip of ['Mainsail', 'Jib 2', 'A2', 'Full', 'One reef']) {
      expect(screen.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('carries the previous entry forward, so one swap is two chip taps', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    await user.click(screen.getByRole('button', { name: '+ Add one by time instead' }))
    await user.click(screen.getByRole('button', { name: 'Mainsail' }))
    await user.click(screen.getByRole('button', { name: 'Jib 2' }))
    await user.click(screen.getByRole('button', { name: 'Full' }))

    await user.click(screen.getByRole('button', { name: '+ Add one by time instead' }))

    // The second entry arrives as the boat already was, so the swap is the jib off and the kite on.
    expect(screen.getByRole('button', { name: 'Mainsail' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Jib 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('refuses an entry that names no sails, and will not go on', async () => {
    // `race_sail_entries_non_empty` says the same thing at commit. This is the sentence instead of it.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    expect(screen.getAllByText(/a sail plan with nothing in it/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    // Sails named and the main still unstated is half-finished too: a Sail Configuration is a set of
    // sails *plus* a Reef State, and defaulting to `full` would be Layline saying it.
    await user.click(screen.getByRole('button', { name: 'Mainsail' }))
    expect(screen.getAllByText(/whether the main was full or reefed/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Full' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('lets an entry sit before the window, because the sails were set before the start', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSails(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Mainsail' }))
    await user.click(screen.getByRole('button', { name: 'Full' }))
    await user.click(screen.getByRole('button', { name: /Earlier by 5 minutes/ }))

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    const input = submit.mock.calls[0][0]
    expect(input.window_start).toBe('2026-06-03T19:00:00')
    // Five minutes before the window opens, in the recording's own frame, with no offset applied.
    expect(input.sails).toEqual([
      { at: '2026-06-03T18:55:00', reef: 'full', sail_ids: ['id-main'] },
    ])
  })

  it('offers the locker as it was on the race’s own day', async () => {
    // Jib 1 was retired in January and this race is in June, so it is not something that was up. A
    // sail retired *after* the race would still be offered, which is why the filter is by date.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    expect(screen.getByRole('button', { name: 'Jib 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Jib 1' })).not.toBeInTheDocument()
  })

  it('says so and offers nothing when the inventory could not be read, and still saves', async () => {
    // Null is not an empty locker, and neither is a sail plan: the race saves with the sails not
    // recorded rather than with a chip row that claims the boat has none.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(stagedOf(), null)

    await toSails(user)
    expect(screen.getByText(/sail inventory could not be read/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '+ Add one by time instead' })
    ).not.toBeInTheDocument()
    // The gesture is off, but this is not the Review step: the strip must not claim the window is
    // being shown as saved when the sailor is standing on Sails.
    expect(screen.getByText('No sails to name')).toBeInTheDocument()
    expect(screen.queryByText('The window as saved')).not.toBeInTheDocument()

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit.mock.calls[0][0].sails).toEqual([])
  })
})

describe('the sailor’s Testimony about the water', () => {
  async function toSeaState(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await pickFile(user)
    await next(user, 2)
  }

  it('offers the four sea states with nothing stated, and never says it matched anything', async () => {
    // The mockup's "Auto-matched to wind readings" is fiction — there is no wind reading anywhere that
    // says what the water was doing, and a Sea State is Testimony or it is nothing (ADR 0008).
    const user = userEvent.setup({ delay: null })
    mount()

    await toSeaState(user)
    tapChart('first')

    for (const chip of ['Calm', 'Slight', 'Moderate', 'Rough']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${chip}`) })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    }
    expect(screen.getAllByText(/what the water was doing/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(document.body.textContent ?? '').not.toMatch(/auto-matched/i)

    await user.click(screen.getByRole('button', { name: /^Moderate/ }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('sends what the sailor said about the water, and calls it the sea state', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSeaState(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: /^Rough/ }))
    await next(user)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(submit.mock.calls[0][0].sea_state).toEqual([
      { at: '2026-06-03T19:00:00', sea_state: 'rough' },
    ])
    // Never a wave state, anywhere the sailor can read.
    expect(document.body.textContent ?? '').not.toMatch(/wave/i)
  })

  it('keeps the sail changes drawn and stops them being editable', async () => {
    // ADR 0014's rule verbatim: an earlier step's answer stays visible, dimmed, with no hit target —
    // so a sea state can be placed against the sail change it went with.
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await next(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Mainsail' }))
    await user.click(screen.getByRole('button', { name: 'Full' }))

    const onItsOwnStep = screen.getByTestId('marker-entry-1')
    expect(onItsOwnStep).toHaveStyle({ opacity: '1', cursor: 'pointer' })

    await next(user)

    const locked = screen.getByTestId('marker-entry-1')
    expect(locked).toBeInTheDocument()
    expect(locked).toHaveStyle({ opacity: '0.45', cursor: 'default' })
    // And the step says which gesture is live, once, above both charts.
    expect(screen.getByText('Tap to place a sea state')).toBeInTheDocument()
  })
})

describe('what Review says the sailor said', () => {
  it('states “not recorded” for a step that was skipped', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await toReview(user)

    expect(screen.getByText('Sail plan not recorded')).toBeInTheDocument()
    expect(screen.getByText('Sea state not recorded')).toBeInTheDocument()
  })

  it('states the entries it will send', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await pickFile(user)
    await next(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Mainsail' }))
    await user.click(screen.getByRole('button', { name: 'One reef' }))
    await next(user, 2)

    expect(screen.getByText('Mainsail · One reef')).toBeInTheDocument()
    expect(screen.getByText('Sea state not recorded')).toBeInTheDocument()
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

    render(
      <RaceUploadWizard stageRecording={stage} submitRace={submit} inventory={INVENTORY} />
    )
    await pickFile(user)

    expect(screen.getByText(/no Date column/)).toBeInTheDocument()
    // No stack, because there is nothing to draw, and Next has nothing to advance to.
    expect(screen.queryByRole('img', { name: /GPS track/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

describe('a failure that took the staged bytes with it', () => {
  /** The wizard with a submit that fails the way a post-move failure fails. */
  function mountFailing(start_over: boolean) {
    const stage = jest.fn<Promise<{ ok: true; staged: StagedRecording }>, [FormData]>(async () => ({
      ok: true as const,
      staged: stagedOf(),
    }))
    const submit = jest.fn<Promise<SubmitRaceResult>, [SubmitRaceInput]>(async () => ({
      ok: false as const,
      message: 'The race could not be saved: no race, no recording and no row was written.',
      start_over,
    }))

    render(
      <RaceUploadWizard stageRecording={stage} submitRace={submit} inventory={INVENTORY} />
    )
    return { submit }
  }

  it('sends the sailor back to the file picker instead of re-arming a save that cannot work', async () => {
    // The sequence this shipped broken in: the transaction failed *after* the bytes had moved to
    // their permanent path (ADR 0013), the wizard left Save live on Review, and the second press
    // came back "the staged bytes are gone" — because there was nothing at the staging path any
    // more. A failure past the move is terminal for that upload and the wizard has to say so.
    const user = userEvent.setup({ delay: null })
    const { submit } = mountFailing(true)

    await pickFile(user)
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(submit).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/no race, no recording and no row was written/)).toBeInTheDocument()

    // Back at step 0: the charts are gone with the staged upload they were drawn from, and there is
    // no Save to press a second time.
    expect(screen.queryByRole('img', { name: /GPS track/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save race' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('qtVlm CSV export')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('leaves a fixable failure exactly where it was, so the sailor can fix it and save again', async () => {
    // The other half of the same flag. A window refusal or an unticked duplicate box happens before
    // anything moved, and throwing the sailor back to the picker over one would be this wizard
    // punishing them for a thing they can correct in one gesture.
    const user = userEvent.setup({ delay: null })
    const { submit } = mountFailing(false)

    await pickFile(user)
    await toReview(user)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(screen.getByRole('img', { name: /GPS track/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit).toHaveBeenCalledTimes(2)
  })
})
