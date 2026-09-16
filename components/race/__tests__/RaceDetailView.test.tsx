/**
 * What a race's page says the sailor said, including when they said nothing.
 *
 * Two properties, and both are ADR 0010's: Testimony is stated as given — every entry, earliest
 * first, with no initial value beside the list and nothing resolved onto a row — and an annotation
 * that was never given is stated as **not recorded**, in a treatment nothing else on the page uses.
 *
 * The second half is the load-bearing one. A silent section reads as a race with no sail changes, and
 * "nobody wrote it down" is a different fact from "nothing changed".
 */

import { render, screen } from '@testing-library/react'
import type { RaceAnnotations, RaceDetail } from '@/types'
import RaceDetailView from '../RaceDetailView'

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

describe('a race nobody annotated', () => {
  it('says the sail plan and the sea state were not recorded', () => {
    render(<RaceDetailView race={raceOf()} />)

    expect(screen.getByText(/nobody wrote down which sails were up/)).toBeInTheDocument()
    expect(screen.getByText(/nobody wrote down what the water was doing/)).toBeInTheDocument()
  })

  it('draws “not recorded” as unlike a stated value as it can', () => {
    // Italic, dashed and hatched: the one thing missing Testimony must never be mistaken for is an
    // answer somebody gave (ADR 0008).
    render(<RaceDetailView race={raceOf()} />)

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
    render(<RaceDetailView race={raceOf(annotated)} />)

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
    render(
      <RaceDetailView
        race={raceOf({
          sails: [
            {
              at: '2026-06-03T19:00:00',
              definition_number: null,
              label: null,
              note: 'delivery main, no headsail',
            },
          ],
          sea_state: [],
        })}
      />
    )

    expect(screen.getByText('delivery main, no headsail')).toBeInTheDocument()
    expect(screen.queryByText(/nobody wrote down which sails were up/)).not.toBeInTheDocument()
  })

  it('never says it matched anything to a wind reading', () => {
    // The mockup's "Auto-matched to wind readings" is fiction, and there is no `source` on an
    // annotation to distinguish an automatic one from a stated one — every one of them is stated.
    render(<RaceDetailView race={raceOf(annotated)} />)

    expect(document.body.textContent ?? '').not.toMatch(/auto-matched|automatic/i)
  })

  it('carries the day on an entry from another one, so a distance race reads right', () => {
    render(
      <RaceDetailView
        race={raceOf({
          sails: [],
          sea_state: [{ at: '2026-06-04T01:12:00', sea_state: 'rough' }],
        })}
      />
    )

    expect(screen.getByText('Jun 4 · 01:12')).toBeInTheDocument()
  })
})
