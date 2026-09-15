/**
 * What the race page offers, and to whom.
 *
 * The page itself is a read and is open to every signed-in sailor (ADR 0019). Delete is the one thing
 * on it that is not, so the affordance has to be absent for a viewer rather than merely refused when
 * pressed — a button that always answers "only an admin can" is a worse screen than no button, and
 * `deleteRace` refuses a viewer regardless.
 */

import { render, screen } from '@testing-library/react'
import type { RaceDetail } from '@/types'
import RaceDetailView from '../RaceDetailView'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

const RACE: RaceDetail = {
  id: '9a1b2c3d-0000-4000-8000-00000000aaaa',
  title: 'Verve Cup, race 2',
  window_start: '2026-08-22T18:30:00',
  window_finish: '2026-08-22T19:30:00',
  recording: {
    id: '9a1b2c3d-0000-4000-8000-00000000bbbb',
    filename: '08-22-26-glr.csv',
    first_row_time: '2026-08-22T18:00:00',
    last_row_time: '2026-08-22T19:45:00',
    source_columns: ['DATE', 'LONGITUDE', 'LATITUDE', 'SOG'],
  },
  coverage: {
    window_seconds: 3600,
    lead_gap_seconds: 0,
    tail_gap_seconds: 0,
    live_seconds: 3600,
    frozen_seconds: 0,
    backwards_steps: 0,
    row_count: 60,
    median_interval_seconds: 60,
  },
  quality: {
    detector_version: 'test',
    low_speed_sog_knots: 1,
    dropout_min_rows: 3,
    dropout_channels: ['latitude', 'longitude'],
    rows: [],
  },
  findings: [],
}

const deleteRace = jest.fn(async () => ({ ok: true as const, bytes_removed: true }))

describe('RaceDetailView', () => {
  it('offers the delete to an admin', () => {
    render(<RaceDetailView race={RACE} canDelete deleteRace={deleteRace} />)

    expect(screen.getByTestId('race-delete-open')).toBeInTheDocument()
  })

  it('shows a viewer no delete affordance at all', () => {
    render(<RaceDetailView race={RACE} canDelete={false} deleteRace={deleteRace} />)

    expect(screen.queryByTestId('race-delete-open')).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    // The race itself reads exactly the same for them.
    expect(screen.getByText('Verve Cup, race 2')).toBeInTheDocument()
    expect(screen.getByText('08-22-26-glr.csv')).toBeInTheDocument()
  })
})
