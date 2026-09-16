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
function renderRace(race: RaceDetail, canDelete = false): void {
  render(<RaceDetailView race={race} canDelete={canDelete} deleteRace={deleteRace} />)
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
