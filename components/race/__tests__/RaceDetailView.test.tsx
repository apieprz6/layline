/**
 * What a race's page says the sailor said, what it offers to do about it, and to whom.
 *
 * Two properties of the Testimony, and both are ADR 0010's: it is stated as given — every entry,
 * earliest first, with no initial value beside the list and nothing resolved onto a row — and an
 * annotation that was never given is stated as **not recorded**, in a treatment nothing else on the
 * page uses.
 *
 * That second half is the load-bearing one. A silent section reads as a race with no sail changes, and
 * "nobody wrote it down" is a different fact from "nothing changed".
 *
 * Then what the boat *was*, which is the other half of a race and not part of its Testimony: the four
 * Version pointers and the Wind Band, each stated as the Version the Race holds and never resolved
 * afresh (ADR 0012). A pointer nobody set reads as not recorded, in the same treatment, because it is
 * the same fact — and the archive's oldest races have all five of them unset.
 *
 * Then the one thing on the page that is a write. The page itself is a read and is open to every
 * signed-in sailor (ADR 0019); delete is not, so the affordance has to be absent for a viewer rather
 * than merely refused when pressed — a button that always answers "only an admin can" is a worse
 * screen than no button, and `deleteRace` refuses a viewer regardless.
 */

import { render, screen, within } from '@testing-library/react'
import type { RaceAnnotations, RaceBoatSetup, RaceDetail } from '@/types'
import RaceDetailView from '../RaceDetailView'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

const EMPTY: RaceAnnotations = { sails: [], sea_state: [] }

/**
 * All five Boat Setup answers recorded, which is what a race entered by a boat that has the artifacts
 * looks like. Nine archive races have none of them, and that case is a describe of its own below.
 */
const SETUP: RaceBoatSetup = {
  polar: { version_id: 'polar-2', version_number: 2, effective_from: '2026-02-10' },
  crossover_chart: { version_id: 'chart-1', version_number: 1, effective_from: '2026-01-15' },
  rig_tune: { version_id: 'tune-3', version_number: 3, effective_from: '2026-04-20' },
  instrument_calibration: { version_id: 'cal-1', version_number: 1, effective_from: '2026-03-02' },
  band: { band_id: 'tune-3-base', low_kt: 8, high_kt: 12, is_base: true, label: 'Base' },
  logged_tws_mean: 11.4,
}

/** Nothing recorded: every pointer null, which is the ordinary state of the archive's oldest races. */
const NOTHING: RaceBoatSetup = {
  polar: null,
  crossover_chart: null,
  rig_tune: null,
  instrument_calibration: null,
  band: null,
  logged_tws_mean: null,
}

function raceOf(annotations: RaceAnnotations = EMPTY, boatSetup: RaceBoatSetup = SETUP): RaceDetail {
  return {
    id: 'race-1',
    title: 'Wednesday night',
    window_start: '2026-06-03T19:00:00',
    window_finish: '2026-06-03T20:30:00',
    recording: {
      id: 'recording-1',
      filename: '06-03-26-wed.csv',
      first_row_time: '2026-06-03T18:55:00',
      last_row_time: '2026-06-03T20:35:00',
      source_columns: ['Date', 'Latitude', 'Longitude', 'SOG'],
    },
    coverage: {
      window_seconds: 5400,
      lead_gap_seconds: 0,
      tail_gap_seconds: 0,
      live_seconds: 5400,
      frozen_seconds: 0,
      backwards_steps: 0,
      row_count: 91,
      median_interval_seconds: 60,
    },
    quality: {
      detector_version: 'test',
      low_speed_sog_knots: 2,
      dropout_min_rows: 3,
      dropout_channels: ['latitude', 'longitude'],
      rows: [],
    },
    findings: [],
    annotations,
    boat_setup: boatSetup,
  }
}

const deleteRace = jest.fn(async () => ({ ok: true as const, bytes_removed: true }))

/**
 * Every render carries the two delete props, because the page cannot be drawn without answering who
 * is looking at it. Only the last two tests care what the answer is.
 */
function renderRace(race: RaceDetail, canDelete = false, canAmend = canDelete): void {
  render(
    <RaceDetailView
      race={race}
      canDelete={canDelete}
      canAmend={canAmend}
      deleteRace={deleteRace}
    />
  )
}

describe('a race nobody annotated', () => {
  it('says the sail plan and the sea state were not recorded', () => {
    renderRace(raceOf())

    expect(screen.getByText(/nobody wrote down which sails were up/)).toBeInTheDocument()
    expect(screen.getByText(/nobody wrote down what the water was doing/)).toBeInTheDocument()
  })

  it('draws “not recorded” as unlike a stated value as it can', () => {
    // Italic, dashed and hatched: the one thing missing Testimony must never be mistaken for is an
    // answer somebody gave (ADR 0008).
    renderRace(raceOf())

    const missing = screen.getByText(/nobody wrote down which sails were up/)

    expect(missing).toHaveStyle({ fontStyle: 'italic' })
    expect(missing.style.border).toContain('dashed')
    expect(missing.style.background).toContain('repeating-linear-gradient')
  })
})

describe('a race the sailor annotated', () => {
  const annotated: RaceAnnotations = {
    sails: [
      {
        at: '2026-06-03T18:55:00',
        definition_number: 1,
        label: 'Main + Jib 2',
        note: null,
      },
      {
        at: '2026-06-03T19:42:00',
        definition_number: 2,
        label: 'Main reefed + Jib 3',
        note: 'kite was blown out',
      },
    ],
    sea_state: [{ at: '2026-06-03T19:05:00', sea_state: 'moderate' }],
  }

  it('states every entry in its own chart Version’s words, at the time the sailor gave', () => {
    renderRace(raceOf(annotated))

    // The words are the Crossover Chart Version's own, resolved against the Version this Race points
    // at and handed to the page already resolved (ADR 0023). Nothing here composes a sail name.
    expect(screen.getByText('Main + Jib 2')).toBeInTheDocument()
    // The first entry is not special and is not labelled as an initial value: it is one of two
    // changes, and what was up at any moment is resolved from the list at read (ADR 0010).
    expect(screen.getByText('Main reefed + Jib 3 · kite was blown out')).toBeInTheDocument()
    // Before the window opens, because the sails were set before the start.
    expect(screen.getByText('18:55')).toBeInTheDocument()
    expect(screen.getByText('19:42')).toBeInTheDocument()

    expect(screen.getByText('Moderate · 2–3 ft')).toBeInTheDocument()
    expect(screen.queryByText(/not recorded/i)).not.toBeInTheDocument()
  })

  it('states a note-only entry as what was written, and names no sail for it', () => {
    // The chart does not name everything the boat has ever flown, so an entry can be a note and
    // nothing else. Reaching for the nearest Definition's words would be the page deciding what was
    // up — which is the one thing a page about Testimony must not do.
    renderRace(
      raceOf({
        sails: [
          {
            at: '2026-06-03T19:00:00',
            definition_number: null,
            label: null,
            note: 'delivery main, no headsail',
          },
        ],
        sea_state: [],
      })
    )

    expect(screen.getByText('delivery main, no headsail')).toBeInTheDocument()
    expect(screen.queryByText(/nobody wrote down which sails were up/)).not.toBeInTheDocument()
  })

  it('never says it matched anything to a wind reading', () => {
    // The mockup's "Auto-matched to wind readings" is fiction, and there is no `source` on an
    // annotation to distinguish an automatic one from a stated one — every one of them is stated.
    renderRace(raceOf(annotated))

    expect(document.body.textContent ?? '').not.toMatch(/auto-matched|automatic/i)
  })

  it('carries the day on an entry from another one, so a distance race reads right', () => {
    renderRace(
      raceOf({
        sails: [],
        sea_state: [{ at: '2026-06-04T01:12:00', sea_state: 'rough' }],
      })
    )

    expect(screen.getByText('Jun 4 · 01:12')).toBeInTheDocument()
  })
})

describe('the Boat Setup the race was sailed under', () => {
  /** The Boat Setup facts, as the `<dl>` between the Sea state and the Coverage. */
  function facts() {
    return within(screen.getByTestId('boat-setup-facts'))
  }

  it('names each Version and links to the Version it names', () => {
    // AC 10. "Polar v2" has to be followable rather than taken on trust, so the reader can see the same
    // Version stated at the other end.
    renderRace(raceOf())

    expect(facts().getByRole('link', { name: 'v2' })).toHaveAttribute(
      'href',
      '/boat-management/polar/polar-2'
    )
    expect(facts().getAllByRole('link', { name: 'v1' })[0]).toHaveAttribute(
      'href',
      '/boat-management/crossover-chart/chart-1'
    )
    // The Rig Tune page selects by Version *number*, and the Instrument Calibration has one page for
    // the artifact with the Version it is showing stated on it.
    expect(facts().getByRole('link', { name: 'v3' })).toHaveAttribute(
      'href',
      '/boat-management/rig-tune?version=3'
    )
    expect(facts().getAllByRole('link', { name: 'v1' })[1]).toHaveAttribute(
      'href',
      '/boat-management/instrument-calibration'
    )
  })

  it('states the band in the band’s own words, under the Version it belongs to', () => {
    renderRace(raceOf())

    expect(facts().getByText('Base · 8–12 kt')).toBeInTheDocument()
    // No link of its own: a band has no page, and the Rig Tune link above lands on the table it is a
    // row of (ADR 0007).
    expect(facts().queryByRole('link', { name: /8–12/ })).not.toBeInTheDocument()
  })

  it('never resolves a pointer to the newest Version', () => {
    // AC 3, and the whole reason these are columns on `races`. The fixture names Polar v2 and Rig Tune
    // v3, and those are the only Versions the page is given — it reads no `current_version_id` and has
    // nothing to resolve with. What would fail here is a page that showed a Version the Race does not
    // hold.
    renderRace(raceOf())

    expect(facts().queryByText('v4')).not.toBeInTheDocument()
    expect(facts().queryByText('v5')).not.toBeInTheDocument()
  })

  it('reads “not recorded” for a race that names none of them', () => {
    // AC 2. Nine races in this archive predate every Boat Setup artifact the boat has, and nothing
    // backdates v1 onto them (ADR 0008).
    renderRace(raceOf(EMPTY, NOTHING))

    const missing = screen.getByText(/names no Polar, Crossover Chart, Rig Tune/)
    expect(missing).toBeInTheDocument()
    // The same treatment missing Testimony gets, because it is the same fact.
    expect(missing).toHaveStyle({ fontStyle: 'italic' })
    expect(missing.style.background).toContain('repeating-linear-gradient')
  })

  it('reads “not recorded” for the pointers that are unset and states the ones that are not', () => {
    renderRace(
      raceOf(EMPTY, {
        ...NOTHING,
        rig_tune: { version_id: 'tune-3', version_number: 3, effective_from: '2026-04-20' },
      })
    )

    expect(facts().getByRole('link', { name: 'v3' })).toBeInTheDocument()
    // Polar, Crossover Chart, Instrument Calibration and the Wind Band.
    expect(facts().getAllByText('Not recorded')).toHaveLength(4)
  })

  it('states a band that disagrees with the logged wind, among the findings and as a note', () => {
    // AC 7 at the read end. The comparison itself is `readRace`'s, derived over the window and stored
    // nowhere (ADR 0009) — what is this page's job is where the sentence lands: among the findings, at
    // note severity, with nothing about it that could refuse a save or an amendment.
    const race = raceOf(EMPTY, {
      ...SETUP,
      band: { band_id: 'tune-3-light', low_kt: 0, high_kt: 8, is_base: false, label: null },
    })

    renderRace({
      ...race,
      findings: [
        { severity: 'note', message: 'Recorded in the 0–8 kt band; logged wind averaged 11.4 kt.' },
      ],
    })

    expect(
      screen.getByText('Recorded in the 0–8 kt band; logged wind averaged 11.4 kt.')
    ).toBeInTheDocument()
    // Not one of the two refusals, and drawn as nothing that reads like one.
    expect(document.body.textContent ?? '').not.toMatch(/cannot be saved|refused/i)
  })
})

describe('who the page offers the delete to', () => {
  it('offers it to an admin', () => {
    renderRace(raceOf(), true)

    expect(screen.getByTestId('race-delete-open')).toBeInTheDocument()
  })

  it('shows a viewer no delete affordance at all', () => {
    renderRace(raceOf())

    expect(screen.queryByTestId('race-delete-open')).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    // The race itself reads exactly the same for them, annotations, Boat Setup and all.
    expect(screen.getByText('Wednesday night')).toBeInTheDocument()
    expect(screen.getByText('06-03-26-wed.csv')).toBeInTheDocument()
    expect(screen.getByTestId('boat-setup-facts')).toBeInTheDocument()
  })
})

describe('the way into the amendment', () => {
  /** The five chips, the section each one opens the flow at, and what each says it will amend. */
  const CHIPS = [
    ['amend-window', 'window', 'Amend the race window'],
    ['amend-title', 'title', 'Amend the race title'],
    ['amend-sails', 'sails', 'Amend the sails'],
    ['amend-sea', 'sea', 'Amend the sea state'],
    ['amend-setup', 'setup', 'Amend the boat setup'],
  ] as const

  it('gives every Testimony section a chip that opens the flow at that section', () => {
    // AC 2. The chip is the whole of what makes the sections a set rather than a sequence from here: a
    // sailor who came to fix the sea state lands on the sea state, and has not walked a window they had
    // no complaint about to get there.
    renderRace(raceOf(), true)

    for (const [testId, section] of CHIPS) {
      expect(screen.getByTestId(testId)).toHaveAttribute(
        'href',
        `/boat-performance/races/race-1/amend?section=${section}`
      )
    }
  })

  it('names what each chip amends, since five of them read "Amend" and a pencil says nothing aloud', () => {
    // The chips are told apart on screen by the line each sits on, which is nothing to a sailor
    // listening to the page. The visible word is inside the spoken name rather than replaced by it.
    renderRace(raceOf(), true)

    for (const [testId, , spoken] of CHIPS) {
      const chip = screen.getByTestId(testId)
      expect(chip).toHaveAccessibleName(spoken)
      expect(chip).toHaveTextContent('Amend')
    }
  })

  it('puts the title and window chips on the lines they amend, not in a row beneath the prose', () => {
    // What the placement answers: a pill reading "Window", three lines below the window and under a
    // paragraph about clocks, reads as a caption of something rather than a way to change anything.
    // Beside the line it amends, the chip's subject is already on the screen next to it.
    renderRace(raceOf(), true)

    const titleLine = screen.getByTestId('amend-title').parentElement as HTMLElement
    expect(within(titleLine).getByRole('heading', { level: 1 })).toHaveTextContent('Wednesday night')

    const windowLine = screen.getByTestId('amend-window').parentElement as HTMLElement
    expect(within(windowLine).getByText('Jun 3 · 19:00 – 20:30')).toBeInTheDocument()
  })

  it('offers no chip for the Transcription, because no section of the flow edits one', () => {
    // AC 8, on this page. The absence below the line is the same fact the line states — and `file` is
    // not one of the sections the route will accept either, so there is no URL to type instead.
    renderRace(raceOf(), true)

    expect(screen.queryByTestId('amend-file')).not.toBeInTheDocument()
    expect(screen.queryByTestId('amend-review')).not.toBeInTheDocument()
    expect(screen.getAllByTestId(/^amend-/)).toHaveLength(CHIPS.length)
  })

  it('shows a viewer no chip at all, the way it shows them no delete', () => {
    // The page is a read and every signed-in sailor may open it; amending is a write (ADR 0019). An
    // affordance that always answered "only an admin can" would be a worse screen than none.
    renderRace(raceOf())

    expect(screen.queryAllByTestId(/^amend-/)).toHaveLength(0)
    // And the race still reads whole, Testimony and Boat Setup and all.
    expect(screen.getByText('Wednesday night')).toBeInTheDocument()
    expect(screen.getByTestId('transcription-boundary')).toBeInTheDocument()
  })
})

describe('the line between what the sailor said and what the file said', () => {
  it('draws the boundary, and says which side is which', () => {
    // AC 9. The asymmetry above and below is the most important thing about this page and nothing else
    // on the screen would explain it: everything above is amendable Testimony, everything below is the
    // Transcription and the figures derived from it at read (ADR 0010, ADR 0009).
    renderRace(raceOf(), true)

    const boundary = screen.getByTestId('transcription-boundary')
    expect(boundary).toBeInTheDocument()
    expect(within(boundary).getByText('Below this line: the recording')).toBeInTheDocument()
    expect(boundary).toHaveTextContent(/None of it is editable, here or by any other path/)
    // AC 10 as the page states it: the three figures re-derive, so there is nothing to recompute.
    expect(boundary).toHaveTextContent(/amending the window above changes them with nothing to recompute/)
  })

  it('puts Row Quality and Gap Seconds on the recorded side of it', () => {
    // Both are measurements of the recording rather than claims about the race, which is why they are
    // below the line and why an amended window changes them without anything recomputing them.
    renderRace(raceOf(), true)

    const page = document.body.textContent ?? ''
    const line = page.indexOf('Below this line: the recording')
    expect(line).toBeGreaterThan(0)
    expect(page.indexOf('Coverage')).toBeGreaterThan(line)
    expect(page.indexOf('Row Quality')).toBeGreaterThan(line)
    // And the Testimony is on the sailor's side, above it.
    expect(page.indexOf('Sails')).toBeLessThan(line)
    expect(page.indexOf('Sea state')).toBeLessThan(line)
    expect(page.indexOf('Boat Setup')).toBeLessThan(line)
  })

  it('draws the line for a viewer too, because it is a fact about the archive', () => {
    renderRace(raceOf())

    expect(screen.getByTestId('transcription-boundary')).toHaveTextContent(
      /Everything above is what the sailor said/
    )
  })
})
