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
 * Then the one thing on the page that is a write. The page itself is a read and is open to every
 * signed-in sailor (ADR 0019); delete is not, so the affordance has to be absent for a viewer rather
 * than merely refused when pressed — a button that always answers "only an admin can" is a worse
 * screen than no button, and `deleteRace` refuses a viewer regardless.
 */

import { render, screen } from '@testing-library/react'
import type { RaceAnnotations, RaceDetail } from '@/types'
import RaceDetailView from '../RaceDetailView'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

const EMPTY: RaceAnnotations = { sails: [], sea_state: [] }

function raceOf(annotations: RaceAnnotations = EMPTY): RaceDetail {
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
        reef: 'full',
        sails: [
          { key: 'main', label: 'Mainsail' },
          { key: 'j2', label: 'Jib 2' },
        ],
      },
      {
        at: '2026-06-03T19:42:00',
        reef: 'reef-1',
        sails: [{ key: 'main', label: 'Mainsail' }],
      },
    ],
    sea_state: [{ at: '2026-06-03T19:05:00', sea_state: 'moderate' }],
  }

  it('states every entry, in the words the sailor chose, at the time they gave', () => {
    renderRace(raceOf(annotated))

    // The first entry is not special and is not labelled as an initial value: it is one of two
    // changes, and what was up at any moment is resolved from the list at read (ADR 0010).
    expect(screen.getByText('Mainsail + Jib 2 · Full')).toBeInTheDocument()
    expect(screen.getByText('Mainsail · One reef')).toBeInTheDocument()
    // Before the window opens, because the sails were set before the start.
    expect(screen.getByText('18:55')).toBeInTheDocument()
    expect(screen.getByText('19:42')).toBeInTheDocument()

    expect(screen.getByText('Moderate · 2–3 ft')).toBeInTheDocument()
    expect(screen.queryByText(/not recorded/i)).not.toBeInTheDocument()
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

describe('who the page offers the delete to', () => {
  it('offers it to an admin', () => {
    renderRace(raceOf(), true)

    expect(screen.getByTestId('race-delete-open')).toBeInTheDocument()
  })

  it('shows a viewer no delete affordance at all', () => {
    renderRace(raceOf())

    expect(screen.queryByTestId('race-delete-open')).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    // The race itself reads exactly the same for them, annotations and all.
    expect(screen.getByText('Wednesday night')).toBeInTheDocument()
    expect(screen.getByText('06-03-26-wed.csv')).toBeInTheDocument()
  })
})
