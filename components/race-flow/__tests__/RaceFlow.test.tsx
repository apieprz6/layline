/**
 * The wizard, driven end to end against two stubs.
 *
 * The seams this exercises are the ones the ticket names rather than the ones that happen to be
 * easy: the chart stack is mounted once and the channel survives a step change, one window state
 * drives everything on screen, the two hard refusals block and everything else is a note, a duplicate
 * hash asks and then proceeds, and nothing at all is sent to the server before the last press.
 *
 * The two annotation steps are Testimony (ADR 0010), so what is tested about them is what nothing may
 * invent: nothing is pre-selected and no entry inherits the one before it, both steps are skippable and
 * two empty lists are a legal race, an entry that says nothing at all is refused, and an entry's time is
 * not bounded by the window.
 *
 * A sail is named by naming a Sail Definition of one Crossover Chart Version (ADR 0023), so the Version
 * is part of what the step is tested for: the default comes from the recording's own start time, it is
 * changeable, changing it clears what the old Version's numbers said, and with no Version the step is
 * closed and says which of the three reasons it is.
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
  CrossoverChartChoice,
  RaceBoatSetupChoices,
  StagedRecording,
  SubmitRaceInput,
  SubmitRaceResult,
  TranscriptionChannels,
  TranscriptionRow,
} from '@/types'
import RaceFlow from '../RaceFlow'
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
 * Both Crossover Chart Versions the boat has, newest first, as `readCrossoverChartChoices` orders them.
 *
 * Two of them, and the newer one is not the answer: every recording in these fixtures is June 3rd and
 * v2 comes into force on July 1st. That is the ordinary case for a hand-entered archive, and a picker
 * that offered only the current chart would make an honest answer unavailable.
 *
 * v1's Definition 7 is a sail no cell of the grid recommends — a storm jib the chart would never advise
 * — and it is offered anyway, because what the boat flew is not limited to what the chart advised.
 */
const CHARTS: CrossoverChartChoice[] = [
  {
    version_id: 'chart-v2',
    version_number: 2,
    effective_from: '2026-07-01',
    definitions: [
      { number: 1, label: 'Main + Jib 1' },
      { number: 5, label: 'Main + Code 0' },
    ],
  },
  {
    version_id: 'chart-v1',
    version_number: 1,
    effective_from: '2026-01-15',
    definitions: [
      { number: 1, label: 'Main + Jib 1' },
      { number: 2, label: 'Main reefed + Jib 3' },
      { number: 3, label: 'Main + A2' },
      { number: 7, label: 'Main + storm jib' },
    ],
  },
]

/**
 * The other three Version lists, shaped the way `readRaceBoatSetupChoices` returns them.
 *
 * Newest first, and again the newest is not the answer: every recording here is June 3rd, and each kind
 * has a Version that came into force after it. The Polar and the Rig Tune both have one in force on the
 * day and one that is not, so a default that resolved "the newest" rather than "the one in force then"
 * shows up as a wrong chip rather than as no chip at all.
 *
 * The Instrument Calibration has exactly one Version and it postdates the race, which is the case a
 * hand-entered archive is full of: the honest answer is *not recorded*, and there has to be no default.
 *
 * Rig Tune v3's bands are the ones the picker may offer while v3 is chosen, and v1's are not — bands do
 * not travel between Versions (ADR 0007), and each Version's ids are its own.
 */
const BOAT_SETUP: RaceBoatSetupChoices = {
  polar: [
    { version_id: 'polar-v2', version_number: 2, effective_from: '2026-07-01' },
    { version_id: 'polar-v1', version_number: 1, effective_from: '2026-02-10' },
  ],
  rig_tune: [
    {
      version_id: 'tune-v4',
      version_number: 4,
      effective_from: '2026-08-01',
      bands: [
        { band_id: 'v4-light', low_kt: 0, high_kt: 9, is_base: true, label: 'Light' },
        { band_id: 'v4-heavy', low_kt: 9, high_kt: null, is_base: false, label: null },
      ],
    },
    {
      version_id: 'tune-v3',
      version_number: 3,
      effective_from: '2026-04-20',
      // Ascending by `low_kt`, which is the order a band table is read in and the order the reader
      // hands them over in.
      bands: [
        { band_id: 'v3-light', low_kt: 0, high_kt: 8, is_base: false, label: 'Light' },
        { band_id: 'v3-base', low_kt: 8, high_kt: 12, is_base: true, label: 'Base' },
        { band_id: 'v3-heavy', low_kt: 12, high_kt: null, is_base: false, label: null },
      ],
    },
  ],
  instrument_calibration: [
    { version_id: 'cal-v1', version_number: 1, effective_from: '2026-09-01' },
  ],
}

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
function mount(
  staged: StagedRecording = stagedOf(),
  charts: CrossoverChartChoice[] | null = CHARTS,
  boatSetup: RaceBoatSetupChoices | null = BOAT_SETUP
) {
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
    <RaceFlow
      mode={{ kind: 'upload', stageRecording: stage, submitRace: submit }}
      charts={charts}
      boatSetup={boatSetup}
    />
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

  it('costs 18 actions for the archive’s worst case, seven sail changes', async () => {
    // ADR 0014 counted 24 here, and its own arithmetic was 1 file + 1 Next + 7 placements + 13 chip
    // taps + 2 Nexts. Thirteen chips was two-to-three per change because a Configuration was a *set*
    // of sails and a Reef State, and carry-forward is what made the set affordable. One sail
    // vocabulary makes a Configuration one sail (ADR 0023), so a change is one chip and inheriting
    // the previous entry would only pre-select the sail being replaced: 7 chips, not 13, and the
    // whole race costs 18. Amendment (LAY-130) to ADR 0014 records the retirement.
    //
    // The seven placements are the "+ Add one by time instead" button rather than seven taps on the
    // track: both place one entry in one action, and jsdom cannot deliver seven distinguishable tap
    // coordinates.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(stagedOf({ series: seriesOf(LONG_ROWS) }))

    let actions = 0

    await pickFile(user)
    actions += 1
    await next(user) // to Sails
    actions += 1

    /** One change: place it, then name the sail that was up from there. */
    const change = async (chip: string): Promise<void> => {
      await user.click(screen.getByRole('button', { name: '+ Add one by time instead' }))
      actions += 1
      await user.click(screen.getByRole('button', { name: chip }))
      actions += 1
    }

    await change('Main + Jib 1')
    await change('Main + A2') // kite up
    await change('Main + Jib 1') // and back
    await change('Main + A2')
    await change('Main + Jib 1')
    await change('Main reefed + Jib 3') // it came on to blow
    await change('Main + storm jib') // and kept coming

    await next(user, 2) // Sea state, Review
    actions += 2

    expect(actions).toBe(18)
    expect(screen.getByRole('button', { name: 'Save race' })).toBeEnabled()
    // Seven entries, all of them finished, or the count above bought nothing.
    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit.mock.calls[0][0].sails).toHaveLength(7)
    expect(submit.mock.calls[0][0].sails[6]).toEqual({
      at: '2026-06-03T19:06:00',
      definition_number: 7,
      note: null,
    })
    // Every one of them names a sail of the Version in force when the recording started.
    expect(submit.mock.calls[0][0].crossover_chart_version_id).toBe('chart-v1')
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

  it('offers the chosen Version’s whole vocabulary, with nothing selected at all', async () => {
    // The mockup pre-selects a configuration by index. That is the same failure as `ndbc.ts`'s
    // `wind_direction ?? 0`: a value nobody stated, indistinguishable from one somebody did.
    //
    // The whole vocabulary includes Definition 7, which no cell of v1's grid recommends. The chart
    // advising against a storm jib is not evidence that the boat did not fly one.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    for (const chip of [
      'Main + Jib 1',
      'Main reefed + Jib 3',
      'Main + A2',
      'Main + storm jib',
      'Something else',
    ]) {
      expect(screen.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'false')
    }
    // v2's own sail is not on offer: a Definition number means something inside one Version only.
    expect(screen.queryByRole('button', { name: 'Main + Code 0' })).not.toBeInTheDocument()
  })

  it('lays that vocabulary out for a 390px screen', async () => {
    // The old step was two chip rows of short tokens (`Jib 1`, `Full`); this one is a single row of
    // the chart's own sentences, and `Main reefed + Jib 3` is three times the width of `Jib 1`. So
    // the arithmetic is worth pinning rather than eyeballing: jsdom has no layout engine, and the
    // wizard is behind a session, so no browser has ever drawn this step.
    //
    // A chip is `7px 10px` of padding and a 1px border around 12px text (`--text-sm`). At a
    // conservative 0.62em average advance that is 22 + label × 7.44px, so the widest label the
    // boat's chart carries — `Main + Reaching Spin`, 20 characters — comes to ~171px. The step's
    // content is 390px less the section's 16px and the card's 12px on each side: 334px. One of
    // those chips fits with 160px to spare and two shorter ones share a line.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    const row = screen.getByRole('group', { name: 'Sail up' })

    // It wraps, so a Version with a dozen Definitions grows downward. A row that scrolled sideways
    // would hide the sail the boat actually flew behind a gesture nobody knows is there.
    expect(row).toHaveStyle({ display: 'flex', flexWrap: 'wrap' })

    const chips = within(row).getAllByRole('button')
    expect(chips.length).toBeGreaterThan(1)
    for (const chip of chips) {
      // No chip sets a width, a min-width or `nowrap`: a label longer than the screen breaks inside
      // the chip rather than pushing the step sideways.
      expect(chip.style.width).toBe('')
      expect(chip.style.minWidth).toBe('')
      expect(chip.style.whiteSpace).toBe('')
      expect(chip.style.padding).toBe('7px 10px')

      const widest = 22 + Math.max(20, (chip.textContent ?? '').length) * 7.44
      expect(widest).toBeLessThanOrEqual(390 - 2 * (16 + 12))
    }
  })

  it('carries nothing forward, because one Configuration is now one sail', async () => {
    // ADR 0014's carry-forward is retired here (Amendment, LAY-130). Inheriting the previous entry's
    // Definition would pre-select the very sail the sailor placed this entry to say came down — a
    // guess presented as a memory, and one that could record "nothing changed" at a time somebody
    // said it did.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    await user.click(screen.getByRole('button', { name: '+ Add one by time instead' }))
    await user.click(screen.getByRole('button', { name: 'Main + Jib 1' }))
    await user.click(screen.getByRole('button', { name: '+ Add one by time instead' }))

    expect(screen.getByRole('button', { name: 'Main + Jib 1' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('refuses an entry that says nothing at all, and will not go on', async () => {
    // `race_sail_entries_says_something` says the same thing at commit. This is the sentence instead
    // of it, and it names both ways out.
    const user = userEvent.setup({ delay: null })
    mount()

    await toSails(user)
    tapChart('first')

    expect(screen.getAllByText(/Say which sail was up/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Main + A2' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('makes “Something else” cost a note, and sends the note as the whole answer', async () => {
    // The chart names what the chart names, and the boat has flown things it does not. What must not
    // happen is an entry that claims something and says nothing: "not one of these" alone is not an
    // answer, so the note is the answer and it is required.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSails(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Something else' }))

    expect(screen.getByRole('button', { name: 'Something else' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.type(screen.getByLabelText('What was up, in your own words'), 'delivery main')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(submit.mock.calls[0][0].sails).toEqual([
      { at: '2026-06-03T19:00:00', definition_number: null, note: 'delivery main' },
    ])
  })

  it('sends a note alongside a named sail, because both are worth having', async () => {
    // "jib was blown out" belongs on the entry that says the A2 went up — which is why `note` is a
    // column beside the Definition and not a fallback for the want of one.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSails(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Main + A2' }))
    await user.type(screen.getByLabelText('Note, if there is anything to add'), 'jib was blown out')

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(submit.mock.calls[0][0].sails).toEqual([
      { at: '2026-06-03T19:00:00', definition_number: 3, note: 'jib was blown out' },
    ])
  })

  it('lets an entry sit before the window, because the sails were set before the start', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSails(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Main + Jib 1' }))
    await user.click(screen.getByRole('button', { name: /Earlier by 5 minutes/ }))

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    const input = submit.mock.calls[0][0]
    expect(input.window_start).toBe('2026-06-03T19:00:00')
    // Five minutes before the window opens, in the recording's own frame, with no offset applied.
    expect(input.sails).toEqual([{ at: '2026-06-03T18:55:00', definition_number: 1, note: null }])
  })

  it('names the sails in the Version in force when the recording started, not the newest', async () => {
    // The archive is hand-entered, so this is the ordinary case rather than the edge: the race is
    // June 3rd and v2 does not come into force until July. Resolving to "the current chart" would
    // rename a sail nobody renamed (ADR 0012).
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSails(user)

    expect(screen.getByRole('button', { name: /^v1/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^v2/ })).toHaveAttribute('aria-pressed', 'false')

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit.mock.calls[0][0].crossover_chart_version_id).toBe('chart-v1')
  })

  it('clears what the old Version’s numbers said when the Version changes, and says how many', async () => {
    // v1's 3 and v2's 3 are different sails, so carrying an entry across Versions would silently
    // rename what the sailor said. It is the same bargain `repoint_race_crossover_chart` strikes for a
    // Race already saved: state the cost, then pay it in one go.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()

    await toSails(user)
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Main + A2' }))

    await user.click(screen.getByRole('button', { name: /^v2/ }))

    expect(screen.getByText(/took off 1 sail entry/)).toBeInTheDocument()
    expect(screen.getByText(/No sail changes recorded/)).toBeInTheDocument()
    // And the vocabulary on offer is v2's own from here.
    tapChart('first')
    expect(screen.getByRole('button', { name: 'Main + Code 0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Main + A2' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Main + Code 0' }))
    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    const input = submit.mock.calls[0][0]
    expect(input.crossover_chart_version_id).toBe('chart-v2')
    expect(input.sails).toEqual([{ at: '2026-06-03T19:00:00', definition_number: 5, note: null }])
  })

  it('says so and offers nothing when the charts could not be read, and still saves', async () => {
    // Null is not "the boat has no chart", and neither is a sail plan: the race saves with the sails
    // not recorded rather than with a chip row that claims the boat can name none.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(stagedOf(), null)

    await toSails(user)
    expect(screen.getByText(/Crossover Charts could not be read/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '+ Add one by time instead' })
    ).not.toBeInTheDocument()
    // The gesture is off, but this is not the Review step: the strip must not claim the window is
    // being shown as saved when the sailor is standing on Sails.
    expect(screen.getByText('No chart to name a sail in')).toBeInTheDocument()
    expect(screen.queryByText('The window as saved')).not.toBeInTheDocument()

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))
    expect(submit.mock.calls[0][0].sails).toEqual([])
    expect(submit.mock.calls[0][0].crossover_chart_version_id).toBeNull()
  })

  it('names the fix when the boat has no Crossover Chart at all', async () => {
    // There is no separate list of sails to fall back on any more (ADR 0023), so the step says where
    // a vocabulary comes from rather than looking merely empty.
    const user = userEvent.setup({ delay: null })
    mount(stagedOf(), [])

    await toSails(user)

    expect(screen.getByText(/Upload a Crossover Chart under Boat/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '+ Add one by time instead' })
    ).not.toBeInTheDocument()
  })

  it('offers every Version when the recording is older than all of them, and opens on a pick', async () => {
    // Nothing is resolved silently: a recording from before the boat's first chart gets no default,
    // because there is no Version that was in force then and inventing one would be Layline saying
    // which words this race's sails were named in.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(stagedOf(), [CHARTS[0]])

    await toSails(user)

    expect(screen.getByText(/older than every Crossover Chart/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^v2/ })).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.queryByRole('button', { name: '+ Add one by time instead' })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^v2/ }))
    tapChart('first')
    await user.click(screen.getByRole('button', { name: 'Main + Code 0' }))

    await next(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save race' }))

    const input = submit.mock.calls[0][0]
    expect(input.crossover_chart_version_id).toBe('chart-v2')
    expect(input.sails).toEqual([{ at: '2026-06-03T19:00:00', definition_number: 5, note: null }])
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
    await user.click(screen.getByRole('button', { name: 'Main + Jib 1' }))

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
    await user.click(screen.getByRole('button', { name: 'Main reefed + Jib 3' }))
    await user.type(screen.getByLabelText('Note, if there is anything to add'), 'came on to blow')
    await next(user, 2)

    // The chosen Crossover Chart Version's own words, and the note beside them (ADR 0023).
    expect(screen.getByText('Main reefed + Jib 3 · came on to blow')).toBeInTheDocument()
    expect(screen.getByText('Sea state not recorded')).toBeInTheDocument()
  })
})

/**
 * The four Boat Setup answers Review asks for, beside the chart Version the Sails step already chose.
 *
 * They are pointers and nothing here is a copy (ADR 0012), so what is tested is which Version each one
 * *defaults* to and that every one can be moved off it. The default is the Version in force when the
 * recording started — not the newest, which is the trap a hand-entered archive walks into: three of these
 * fixtures have a Version postdating June 3rd, and a picker resolving "current" would name it.
 *
 * The Wind Band is not defaulted at all, and is the only one of the five that isn't. Which band the
 * turnbuckles were on is testimony only the sailor holds; the logged wind is evidence about the day, and
 * inferring the band from it would be Layline answering for them (ADR 0010).
 */
describe('the Boat Setup Review asks for', () => {
  /** The chips of one picker, by the label above them. */
  function picker(label: string) {
    return within(screen.getByRole('group', { name: label }))
  }

  async function toReviewFrom(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await pickFile(user)
    await toReview(user)
  }

  it('defaults each pointer to the Version in force when the recording started', async () => {
    const user = userEvent.setup({ delay: null })
    mount()
    await toReviewFrom(user)

    // Polar v1 from Feb 10th, not v2 from July 1st: the recording is June 3rd.
    expect(picker('Polar').getByRole('button', { name: /^v1/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Polar').getByRole('button', { name: /^v2/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    expect(picker('Rig Tune').getByRole('button', { name: /^v3/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    // One Instrument Calibration Version and it postdates the race, so the honest default is none of
    // them. Nothing is backdated onto a race that predates the artifact (ADR 0008).
    expect(picker('Instrument Calibration').getByRole('button', { name: 'Not recorded' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('leaves the Wind Band unanswered even with a Rig Tune defaulted', async () => {
    const user = userEvent.setup({ delay: null })
    mount()
    await toReviewFrom(user)

    expect(picker('Wind Band').getByRole('button', { name: 'Not recorded' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // And the wind that actually blew is stated beside it, as evidence rather than as an answer. Every
    // fixture row logs 11.4 kt.
    expect(screen.getByText('Logged wind averaged 11.4 kt over this window.')).toBeInTheDocument()
  })

  it('offers only that Rig Tune Version’s own bands, and closes the picker without one', async () => {
    const user = userEvent.setup({ delay: null })
    mount()
    await toReviewFrom(user)

    // v3 is defaulted, so these are v3's three bands and the fourth chip is "Not recorded".
    expect(picker('Wind Band').getAllByRole('button')).toHaveLength(4)
    expect(picker('Wind Band').getByRole('button', { name: /8–12 kt/ })).toBeInTheDocument()
    // v4's bands are not on offer while v3 is named. A band does not travel between Versions (ADR 0007)
    // and the composite key on `races` would refuse the pair anyway.
    expect(picker('Wind Band').queryByRole('button', { name: /9 kt and up/ })).not.toBeInTheDocument()

    await user.click(picker('Rig Tune').getByRole('button', { name: 'Not recorded' }))

    // Disabled and still there rather than gone: a row that vanished would not say why (ADR 0014).
    const gate = picker('Wind Band').getByRole('button', { name: 'Pick a Rig Tune Version first' })
    expect(gate).toBeDisabled()
  })

  it('drops a band the Rig Tune Version being moved to does not have', async () => {
    // AC 6, and the reason the two are one answer: v3's Base band is not a band of v4, so naming v4
    // has to let it go. Sent as a pair, the composite key would refuse the write outright.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()
    await toReviewFrom(user)

    await user.click(picker('Wind Band').getByRole('button', { name: /8–12 kt/ }))
    expect(picker('Wind Band').getByRole('button', { name: /8–12 kt/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await user.click(picker('Rig Tune').getByRole('button', { name: /^v4/ }))

    expect(picker('Wind Band').getByRole('button', { name: 'Not recorded' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // v4's own bands are what is on offer now.
    expect(picker('Wind Band').getByRole('button', { name: /0–9 kt/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save race' }))

    const sent = submit.mock.calls[0][0]
    expect(sent.rig_tune_version_id).toBe('tune-v4')
    expect(sent.rig_tune_band_id).toBeNull()
  })

  it('sends all five, as the sailor left them', async () => {
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()
    await toReviewFrom(user)

    await user.click(picker('Polar').getByRole('button', { name: /^v2/ }))
    await user.click(picker('Wind Band').getByRole('button', { name: /12 kt and up/ }))
    await user.click(
      picker('Instrument Calibration').getByRole('button', { name: /^v1/ })
    )

    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(submit.mock.calls[0][0]).toMatchObject({
      polar_version_id: 'polar-v2',
      // Chosen on the Sails step, and stated here rather than offered a second time.
      crossover_chart_version_id: 'chart-v1',
      rig_tune_version_id: 'tune-v3',
      instrument_calibration_version_id: 'cal-v1',
      rig_tune_band_id: 'v3-heavy',
    })
  })

  it('says a race with none of them set is still a race, and sends five nulls', async () => {
    // AC 2. Nine races in this archive predate every Boat Setup artifact the boat has, so "not
    // recorded" is not a degraded save — it is the ordinary one.
    const user = userEvent.setup({ delay: null })
    const { submit } = mount(stagedOf(), null, null)
    await toReviewFrom(user)

    const section = within(screen.getByTestId('boat-setup-review'))
    // Which of the two it is, said out loud: a failed read is not "the boat has no Versions".
    expect(section.getByText(/could not be read just now/)).toBeInTheDocument()
    expect(section.getAllByText('None to name')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Save race' }))

    expect(submit.mock.calls[0][0]).toMatchObject({
      polar_version_id: null,
      crossover_chart_version_id: null,
      rig_tune_version_id: null,
      instrument_calibration_version_id: null,
      rig_tune_band_id: null,
    })
  })

  it('states a band that disagrees with the logged wind, and saves anyway', async () => {
    // AC 7 at the wizard end: the sailor may well have tuned for the forecast rather than the breeze
    // that arrived, so this is a sentence and never a block (ADR 0009 keeps refusals to two).
    const user = userEvent.setup({ delay: null })
    const { submit } = mount()
    await toReviewFrom(user)

    // 11.4 kt logged, and the band tops out at 8.
    await user.click(picker('Wind Band').getByRole('button', { name: /0–8 kt/ }))

    // The sailor's own word for it first, because that is what they pressed, with the numbers behind it.
    expect(
      screen.getByText('Recorded in the Light band (0–8 kt); logged wind averaged 11.4 kt.')
    ).toBeInTheDocument()

    const save = screen.getByRole('button', { name: 'Save race' })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0].rig_tune_band_id).toBe('v3-light')
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
      <RaceFlow
        mode={{ kind: 'upload', stageRecording: stage, submitRace: submit }}
        charts={CHARTS}
        boatSetup={BOAT_SETUP}
      />
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
      <RaceFlow
        mode={{ kind: 'upload', stageRecording: stage, submitRace: submit }}
        charts={CHARTS}
        boatSetup={BOAT_SETUP}
      />
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
