/**
 * The same flow, entered from the other side of the parse: a stored race being corrected.
 *
 * What is tested here is only what differs from filing a race, because everything else is the same code
 * and `RaceFlow.test.tsx` already drives it. The differences are the ticket's own: the File step is
 * absent, the sections are a set rather than a sequence, one Save commits the lot with no Review gate in
 * front of it, the two window refusals are the ones a sailor met uploading, and the flow says which mode
 * it is in and leaves by way of the race rather than a new-race confirmation.
 *
 * The sharpest of them is what a moved window does *not* do (ADR 0010 Amendment 1). An amendment's
 * annotation times are Testimony about when something happened, so moving the window cannot rewrite one
 * and cannot drop one that ends up outside — and both facts are visible in the payload rather than
 * inferred, which is why the assertions here are mostly on what `amendRace` was handed.
 *
 * Nothing here can reach the Recording, and that is asserted as the shape of the payload: eleven keys,
 * none of them a row, a filename, a hash or a byte. The flow has no field for a recorded value, so the
 * only way one could travel is a new key, and a new key fails this.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { raceChartSeries } from '@/services/recordings/chart-series'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type {
  AmendRaceInput,
  AmendRaceResult,
  CrossoverChartChoice,
  RaceAmendment,
  RaceBoatSetupChoices,
  TranscriptionChannels,
  TranscriptionRow,
} from '@/types'
import RaceFlow from '../RaceFlow'
import { AMEND_SECTIONS, SECTION_LABELS, type Section } from '../sections'

/** Where the flow said to go. One mock, cleared between tests, so a push is attributable. */
const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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

/** A row a minute apart from 19:00, the way the Transcription stores them. */
function row(index: number): TranscriptionRow {
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
    row_index: index,
    date_verbatim: at,
    row_time: at,
    extras: null,
  }
}

const ROWS = [row(0), row(1), row(2), row(3), row(4)]

/**
 * Both Crossover Chart Versions the boat has, newest first.
 *
 * The race below records v1, which came into force in January and was superseded in July. That is the
 * ordinary case for an archive entered backwards, and it is what the amend flow has to keep selected:
 * the sails standing on this race are named in v1's words (ADR 0012, ADR 0023).
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
      { number: 3, label: 'Main + A2' },
    ],
  },
]

const BOAT_SETUP: RaceBoatSetupChoices = {
  polar: [
    { version_id: 'polar-v2', version_number: 2, effective_from: '2026-07-01' },
    { version_id: 'polar-v1', version_number: 1, effective_from: '2026-02-10' },
  ],
  rig_tune: [
    {
      version_id: 'tune-v3',
      version_number: 3,
      effective_from: '2026-04-20',
      bands: [
        { band_id: 'v3-light', low_kt: 0, high_kt: 8, is_base: false, label: 'Light' },
        { band_id: 'v3-base', low_kt: 8, high_kt: 12, is_base: true, label: 'Base' },
      ],
    },
  ],
  instrument_calibration: [
    { version_id: 'cal-v1', version_number: 1, effective_from: '2026-01-02' },
  ],
}

/**
 * The stored race, as `readRaceAmendment` hands it over.
 *
 * Its window is 19:01 → 19:03, so the recording has a row before the start and a row after the finish
 * for the window to be widened onto — a window cropped to itself could not be. Its sail entry sits at
 * 19:00, *outside* the stored window and legitimately so: the sails were set before the start
 * (ADR 0010).
 */
function amendmentOf(overrides: Partial<RaceAmendment> = {}): RaceAmendment {
  return {
    race_id: 'race-77',
    title: 'Wednesday 3',
    window_start: '2026-06-03T19:01:00',
    window_finish: '2026-06-03T19:03:00',
    series: raceChartSeries(
      {
        rows: [...ROWS],
        first_row_time: ROWS[0].row_time,
        last_row_time: ROWS[ROWS.length - 1].row_time,
      },
      assessRowQuality([...ROWS])
    ),
    setup: {
      polar_version_id: 'polar-v1',
      crossover_chart_version_id: 'chart-v1',
      rig_tune_version_id: 'tune-v3',
      instrument_calibration_version_id: null,
      rig_tune_band_id: 'v3-base',
    },
    sails: [{ at: '2026-06-03T19:00:00', definition_number: 3, note: 'set on the way out' }],
    sea_state: [{ at: '2026-06-03T19:02:00', sea_state: 'moderate' }],
    ...overrides,
  }
}

/** The flow in amend mode, and the call its one action saw. */
function mountAmend({
  race = {},
  charts = CHARTS,
  boatSetup = BOAT_SETUP,
  section = 'window',
  result = { ok: true },
}: {
  race?: Partial<RaceAmendment>
  charts?: CrossoverChartChoice[] | null
  boatSetup?: RaceBoatSetupChoices | null
  section?: Section
  result?: AmendRaceResult
} = {}) {
  const amend = jest.fn<Promise<AmendRaceResult>, [AmendRaceInput]>(async () => result)

  render(
    <RaceFlow
      mode={{ kind: 'amend', race: amendmentOf(race), amendRace: amend, section }}
      charts={charts}
      boatSetup={boatSetup}
    />
  )

  return { amend }
}

/** The upload flow, for the one comparison this file makes: what the mode line says in each. */
function mountUpload(): void {
  render(
    <RaceFlow
      mode={{
        kind: 'upload',
        stageRecording: jest.fn(),
        submitRace: jest.fn(),
      }}
      charts={CHARTS}
      boatSetup={BOAT_SETUP}
    />
  )
}

/** A bound typed straight in, as one change — a controlled field never sees a half-typed time. */
function setBound(label: 'Start' | 'Finish', value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function goTo(
  user: ReturnType<typeof userEvent.setup>,
  section: Exclude<Section, 'file' | 'review'>
): Promise<void> {
  await user.click(screen.getByRole('button', { name: SECTION_LABELS[section] }))
}

beforeEach(() => {
  push.mockClear()
})

describe('which of the two flows this is', () => {
  it('names the race being corrected, and the section it is on', () => {
    // AC 11. The two modes are one component, so a sailor amending is looking at the screen they last
    // saw while filing — and the difference between correcting a race and making a second one from the
    // same log is the whole difference this line has to carry.
    mountAmend({ section: 'sails' })

    expect(screen.getByRole('heading', { name: 'Amend a race' })).toBeInTheDocument()
    expect(screen.getByTestId('flow-mode')).toHaveTextContent('Editing Wednesday 3 · Sails')
  })

  it('falls back to the race’s day where it has no title, rather than to nothing', () => {
    mountAmend({ race: { title: null } })

    // The day as the archive states it elsewhere — `wallClockDay`, the recording's own digits.
    expect(screen.getByTestId('flow-mode')).toHaveTextContent('Editing Jun 3 · Window')
  })

  it('says which mode it is in when it is the other one too', () => {
    // The same assertion in the other mode, because "states its mode" is only true if both do.
    mountUpload()

    expect(screen.getByRole('heading', { name: 'Upload a race' })).toBeInTheDocument()
    expect(screen.getByTestId('flow-mode')).toHaveTextContent('New race · step 1 of 5')
  })

  it('leaves by way of the race, not by way of a new-race confirmation', async () => {
    // AC 11's second half. There is no race to be shown as newly filed; the race already exists, and
    // whether the correction took is visible on its own page.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    await user.click(screen.getByRole('button', { name: 'Back to the race' }))

    expect(push).toHaveBeenCalledWith('/boat-performance/races/race-77')
  })

  it('goes back to the race after a save, and never to a fresh flow', async () => {
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend()

    await user.click(screen.getByRole('button', { name: 'Save amendment' }))

    expect(amend).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/boat-performance/races/race-77')
  })
})

describe('five sections, in no order at all', () => {
  it('offers exactly the five, and no File step among them', async () => {
    // AC 1 and AC 2. The File step is *absent* rather than disabled: the rows come from a stored
    // Transcription, so there is nothing here that could offer to replace one (AC 8).
    mountAmend()

    const tabs = within(screen.getByTestId('amend-sections')).getAllByRole('button')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Window',
      'Sails',
      'Sea state',
      'Boat Setup',
      'Title',
    ])
    expect(AMEND_SECTIONS).not.toContain('file')
    expect(screen.queryByLabelText('qtVlm CSV export')).not.toBeInTheDocument()
  })

  it('opens on the section the chip that was tapped belongs to', () => {
    mountAmend({ section: 'setup' })

    expect(screen.getByTestId('boat-setup-review')).toBeInTheDocument()
    expect(screen.getByText('What was the boat set up as?')).toBeInTheDocument()
  })

  it('reaches every section from every other, in an order no sequence allows', async () => {
    // AC 2, AC 3. Backwards through the tab row and then across it: Title before Window, Sea state
    // before Sails. A stepper would refuse every one of these moves.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    await goTo(user, 'title')
    expect(screen.getByLabelText('Title')).toHaveValue('Wednesday 3')

    await goTo(user, 'sea')
    expect(screen.getByText('What was the water doing?')).toBeInTheDocument()

    await goTo(user, 'setup')
    expect(screen.getByTestId('boat-setup-review')).toBeInTheDocument()

    await goTo(user, 'sails')
    expect(screen.getByText('What was up, and when?')).toBeInTheDocument()

    await goTo(user, 'window')
    expect(screen.getByLabelText('Start')).toHaveValue('2026-06-03T19:01')
  })

  it('offers the save from every section, with no Review to have reached first', async () => {
    // AC 3. There is no Next anywhere, and the Save is not gated on a section: an amendment is one
    // save, and a sailor who only came to fix the title does not walk the window to commit it.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()

    for (const section of ['sails', 'sea', 'setup', 'title', 'window'] as const) {
      await goTo(user, section)
      expect(screen.getByRole('button', { name: 'Save amendment' })).toBeEnabled()
    }
  })

  it('has no Delete on it, in any section', async () => {
    // AC 12. Deleting a race is not a way of correcting one, and it stays on the race's own page where
    // what is about to be destroyed is in front of the sailor.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    for (const section of AMEND_SECTIONS) {
      await user.click(screen.getByRole('button', { name: SECTION_LABELS[section] }))
      expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    }
  })
})

describe('one save, for the whole amendment', () => {
  it('sends every section’s answer at once, including the sections nobody opened', async () => {
    // AC 3, AC 4. Five sections, one call. The sections left alone send back exactly what they were
    // read as, which is the only shape in which a list can be *replaced* without a section it was not
    // edited on silently emptying it.
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend()

    await user.click(screen.getByRole('button', { name: 'Save amendment' }))

    expect(amend).toHaveBeenCalledTimes(1)
    expect(amend.mock.calls[0][0]).toEqual({
      race_id: 'race-77',
      window_start: '2026-06-03T19:01:00',
      window_finish: '2026-06-03T19:03:00',
      title: 'Wednesday 3',
      crossover_chart_version_id: 'chart-v1',
      polar_version_id: 'polar-v1',
      rig_tune_version_id: 'tune-v3',
      instrument_calibration_version_id: null,
      rig_tune_band_id: 'v3-base',
      sails: [{ at: '2026-06-03T19:00:00', definition_number: 3, note: 'set on the way out' }],
      sea_state: [{ at: '2026-06-03T19:02:00', sea_state: 'moderate' }],
    })
  })

  it('carries edits made in three different sections in that one call', async () => {
    // The case two calls would half-apply: the window moved, a sail taken off because it is now on the
    // wrong side of the start, and the title corrected. That is *one* correction (ADR 0010 Amendment 1).
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend()

    setBound('Start', '2026-06-03T19:02')

    await goTo(user, 'sails')
    await user.click(screen.getByRole('button', { name: /Main \+ A2/ }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await goTo(user, 'title')
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Wednesday 3, race 2')

    await user.click(screen.getByRole('button', { name: 'Save amendment' }))

    expect(amend).toHaveBeenCalledTimes(1)
    expect(amend.mock.calls[0][0].window_start).toBe('2026-06-03T19:02:00')
    expect(amend.mock.calls[0][0].sails).toEqual([])
    expect(amend.mock.calls[0][0].title).toBe('Wednesday 3, race 2')
    // Untouched, and sent anyway: the list replaces what is stored, so an omission would delete it.
    expect(amend.mock.calls[0][0].sea_state).toEqual([
      { at: '2026-06-03T19:02:00', sea_state: 'moderate' },
    ])
  })

  it('sends nothing about the recording, because there is nothing here that could', async () => {
    // AC 8, as the shape of the payload. The Transcription is what the file said and an amendment is
    // what the sailor said about it: there is no field here for a recorded value, so a key for one
    // could only arrive by being added, and adding one fails this.
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend()

    await user.click(screen.getByRole('button', { name: 'Save amendment' }))

    expect(Object.keys(amend.mock.calls[0][0]).sort()).toEqual([
      'crossover_chart_version_id',
      'instrument_calibration_version_id',
      'polar_version_id',
      'race_id',
      'rig_tune_band_id',
      'rig_tune_version_id',
      'sails',
      'sea_state',
      'title',
      'window_finish',
      'window_start',
    ])
  })

  it('asks for no change reason anywhere in the flow', async () => {
    // AC 4. `updated_at` is the whole history (AC 5), and asking a single-handed archivist to justify
    // correcting their own answer about their own boat would only stop it being corrected.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    for (const section of AMEND_SECTIONS) {
      await user.click(screen.getByRole('button', { name: SECTION_LABELS[section] }))
      expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/why.*chang/i)).not.toBeInTheDocument()
    }
  })

  it('keeps the sailor where they were when the save is refused, and says why', async () => {
    // Nothing was staged and nothing moved, so the race stands exactly as it did: the sentence names
    // the thing to fix and the same Save is still there to press again.
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend({
      section: 'title',
      result: { ok: false, message: 'Only an admin can amend a race.' },
    })

    await user.click(screen.getByRole('button', { name: 'Save amendment' }))

    expect(amend).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByText('Only an admin can amend a race.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save amendment' })).toBeEnabled()
  })
})

describe('the two window refusals, in the words the upload flow uses', () => {
  it('refuses a finish that is not after its start, and blocks the save', async () => {
    // AC 6. The same function says this in both modes, so the sentence is the one a sailor met filing
    // the race — and the database refuses it again either way.
    mountAmend()

    setBound('Start', '2026-06-03T20:00')

    expect(screen.getByText(/The finish has to come after the start/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save amendment' })).toBeDisabled()
  })

  it('refuses a window holding no recorded row, and blocks the save', async () => {
    mountAmend()

    setBound('Finish', '2026-06-03T22:00')
    setBound('Start', '2026-06-03T21:00')

    expect(screen.getByText(/no recorded rows between those two times/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save amendment' })).toBeDisabled()
  })

  it('blocks the save from a section the refusal is not even on', async () => {
    // Amending has no order, so a refusal standing on the window has to reach the Save from the Title
    // section too — otherwise the one gate the upload flow puts in front of its Save would be missing
    // through this door for anyone who navigated away from it.
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend()

    setBound('Start', '2026-06-03T20:00')
    await goTo(user, 'title')

    expect(screen.getByRole('button', { name: 'Save amendment' })).toBeDisabled()
    expect(amend).not.toHaveBeenCalled()
  })
})

describe('moving the window', () => {
  it('leaves every annotation time exactly where it was placed, and keeps the ones now outside', async () => {
    // AC 7, and the reason the flow has no recompute step at all: the entries are Testimony about when
    // something happened, and the window is a claim about which stretch was the race. Moving the second
    // cannot rewrite the first, and an entry outside it is not wrong — the sails were set before the
    // start. Read-time resolution takes the latest entry at or before a row, falling back to the
    // earliest, so an entry before the whole window is exactly what makes the first row resolvable.
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend()

    // The start dragged past both stored entries and the finish out to the last row.
    setBound('Start', '2026-06-03T19:03')
    setBound('Finish', '2026-06-03T19:04')

    await user.click(screen.getByRole('button', { name: 'Save amendment' }))

    const sent = amend.mock.calls[0][0]
    expect(sent.window_start).toBe('2026-06-03T19:03:00')
    expect(sent.window_finish).toBe('2026-06-03T19:04:00')
    expect(sent.sails).toEqual([
      { at: '2026-06-03T19:00:00', definition_number: 3, note: 'set on the way out' },
    ])
    expect(sent.sea_state).toEqual([{ at: '2026-06-03T19:02:00', sea_state: 'moderate' }])
  })

  it('says so on the section, so a sailor is not guessing what a move costs', () => {
    // The prose is the amendment's own: filing a race has nothing yet placed for a move to threaten.
    mountAmend()

    expect(
      screen.getByText(/an entry that ends up outside the window is kept rather than dropped/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Row Quality, Coverage and Gap Seconds are worked out again/)
    ).toBeInTheDocument()
  })

  it('still shows an entry outside the window on the Title section’s summary', async () => {
    // AC 7 as the sailor sees it: kept means listed, not merely stored.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    setBound('Start', '2026-06-03T19:03')
    setBound('Finish', '2026-06-03T19:04')
    await goTo(user, 'title')

    expect(screen.getByText(/Main \+ A2/)).toBeInTheDocument()
  })
})

describe('the Boat Setup section', () => {
  it('keeps the superseded Versions the race records, rather than the ones in force now', async () => {
    // ADR 0012: a pointer is resolved by id and never by date. The boat is on Polar v2 now; this race
    // was sailed under v1, and the section that offered v2 as the answer would be inventing one.
    const user = userEvent.setup({ delay: null })
    mountAmend()

    await goTo(user, 'setup')

    expect(
      within(screen.getByRole('group', { name: 'Polar' })).getByRole('button', { pressed: true })
    ).toHaveTextContent('v1')
    expect(
      within(screen.getByRole('group', { name: 'Rig Tune' })).getByRole('button', { pressed: true })
    ).toHaveTextContent('v3')
    expect(
      within(screen.getByRole('group', { name: 'Wind Band' })).getByRole('button', { pressed: true })
    ).toHaveTextContent('Base')
    // Not recorded, and stated as such: the archive has one Calibration Version and this race names
    // none, which is an answer rather than a gap to be filled in (ADR 0008).
    expect(
      within(screen.getByRole('group', { name: 'Instrument Calibration' })).getByRole('button', {
        pressed: true,
      })
    ).toHaveTextContent('Not recorded')
  })

  it('refuses the section when the Versions could not be read, instead of drawing “None to name”', async () => {
    // The trap LAY-113 left signposted: the reader answers null for a read that *failed*, not for a
    // boat with no Versions. Four empty pickers would tell a sailor their boat owns no Polar, and the
    // Save is right there to make that reading permanent — so the section says which of the two it is
    // and offers nothing.
    const user = userEvent.setup({ delay: null })
    const { amend } = mountAmend({ boatSetup: null })

    await goTo(user, 'setup')

    expect(screen.queryByText('None to name')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Polar' })).not.toBeInTheDocument()
    expect(screen.getByText(/could not be read just now/)).toBeInTheDocument()

    // And the save still carries all five exactly as the race records them.
    await user.click(screen.getByRole('button', { name: 'Save amendment' }))
    expect(amend.mock.calls[0][0].polar_version_id).toBe('polar-v1')
    expect(amend.mock.calls[0][0].rig_tune_band_id).toBe('v3-base')
  })

  it('is a section of its own, because there is no Review for it to sit on', async () => {
    const user = userEvent.setup({ delay: null })
    mountAmend()

    await goTo(user, 'setup')

    expect(screen.getByTestId('boat-setup-review')).toBeInTheDocument()
    expect(screen.queryByText(/this really is a second race from the same log/)).not.toBeInTheDocument()
  })
})

describe('the sails section, amending', () => {
  it('keeps the entries the race already records, named in its own chart’s words', () => {
    mountAmend({ section: 'sails' })

    expect(screen.getByRole('button', { name: /Main \+ A2/ })).toBeInTheDocument()
    // v1 is the Version the race records and the one the entry's number is meaningful in, even though
    // v2 is newer and in force now.
    expect(
      within(screen.getByRole('group', { name: 'Named in Crossover Chart' })).getByRole('button', {
        pressed: true,
      })
    ).toHaveTextContent('v1')
  })

  it('promises nothing about what the race page will say when there is no chart to name a sail in', () => {
    // Filing a race, an unnameable sail plan means the page will say the plan was not recorded.
    // Amending, the plan already stored is untouched, and saying otherwise would read as a threat to
    // erase it.
    mountAmend({ section: 'sails', charts: null })

    expect(
      screen.getByText(/The sail plan this race already records is untouched/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/its page will say the sail plan was not recorded/)).not.toBeInTheDocument()
  })
})
