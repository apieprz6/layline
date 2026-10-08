/**
 * One synthetic Race, for the browser suite alone.
 *
 * **This is not seeding the archive.** The owner's season reaches Layline one upload at a time
 * through the finished UI, and nothing in this repo imports it — that rule stands, and the real
 * archive is measured in Jest (`components/boat/instrument-tuning/__tests__/archive-charts.test.tsx`
 * and the two suites in `services/analysis/__tests__/`), over the owner's own recordings, through
 * the same services this fixture feeds.
 *
 * What a browser can answer and Jest cannot is whether a tap on a nine-pixel heading bin at 390px
 * reaches a hydrated handler. That needs a hydrated page, a hydrated page needs a Race in the local
 * database, and the local database has none. So this writes exactly one, titled so nobody could
 * mistake it for testimony, and `e2e/archive.teardown.ts` removes it again.
 *
 * ## What the track is built to produce
 *
 * Six legs of ten rows at a 30-second cadence, laid out so each of the three checks has something
 * to measure rather than so the boat sails plausibly:
 *
 * - **Six heading bins** with a figure, from six different `CTW`, each a different distance from
 *   its `COG` — so the compass curve has a shape and thirty bins are honestly hatched.
 * - **Two Tack Pairs**, one upwind and one downwind, leaning opposite ways — which is the archive's
 *   own finding and the case the Tack Dial exists to make visible.
 * - **A speed spread over 4 kt** with a U-shaped gap from 1:1, so the fit clears ADR 0027's spread
 *   gate and the gap view has a U the straight line cannot follow.
 *
 * Every row varies its speed, so no run of rows is **Frozen**; every `SOG` is above the Low-Speed
 * threshold and above the checks' own stricter 3.5 kt gate, so none is excluded for speed. The
 * `TWA` sign and zone changes at the leg boundaries are real maneuvers and are *meant* to be —
 * their **Maneuver Windows** are what leave each leg a segment rather than a continuous beat.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'

/** Fixed, so a second run replaces the first rather than adding another. */
export const FIXTURE_RECORDING_ID = '5e2e0000-0000-4000-8000-000000000001'
export const FIXTURE_RACE_ID = '5e2e0000-0000-4000-8000-000000000002'
export const FIXTURE_EVENT_HDG_ID = '5e2e0000-0000-4000-8000-000000000003'
export const FIXTURE_EVENT_STW_ID = '5e2e0000-0000-4000-8000-000000000004'

export const FIXTURE_RACE_TITLE = 'E2E fixture — synthetic, not a real race'
export const FIXTURE_FILENAME = 'e2e-fixture-synthetic.csv'

/** The day the fixture's one `HDG` act was performed — before the Race, so the Race sits after it. */
export const FIXTURE_HDG_ACT_DATE = '2026-08-01'
/** And one act on the paddlewheel, so the `STW` chart's rail has a rule of its own to draw. */
export const FIXTURE_STW_ACT_DATE = '2026-08-02'

const START = '2026-08-05 18:00:00'
const CADENCE_SECONDS = 30
const ROWS_PER_LEG = 10

interface Leg {
  /** Compass heading, as `CTW`. */
  ctw: number
  /** Degrees `CTW` reads high of `COG` — the deviation the compass chart measures. */
  errorDeg: number
  /** `AWA (calc)` unsigned, 0..360: under 50 or over 110 upwind/downwind, between them reaching. */
  awa: number
  /** `TWA`, signed negative to port. What the maneuver detector reads. */
  twa: number
}

const LEGS: Leg[] = [
  // A starboard beat, then a port one: one upwind Tack Pair, port holding 10° wider.
  { ctw: 10, errorDeg: 12, awa: 40, twa: 40 },
  { ctw: 290, errorDeg: -9, awa: 320, twa: -40 },
  // Bear away, then gybe: one downwind pair, starboard holding 20° wider — the opposite lean.
  { ctw: 200, errorDeg: -3, awa: 200, twa: -160 },
  { ctw: 120, errorDeg: 2, awa: 160, twa: 160 },
  // Two more beats, for two more heading bins.
  { ctw: 20, errorDeg: 11, awa: 42, twa: 42 },
  { ctw: 300, errorDeg: -8, awa: 318, twa: -42 },
]

/** One row of the fixture Transcription, by the `recording_rows` column names. */
export interface FixtureRow {
  recording_id: string
  row_index: number
  date_verbatim: string
  row_time: string
  latitude: string
  longitude: string
  cog: string
  sog: string
  stw: string
  ctw: string
  twa: string
  tws: string
  awa_calc: string
}

/** `2026-08-05 18:00:00` plus `seconds`, by arithmetic on the clock and never through a `Date`. */
function at(seconds: number): string {
  const [date, clock] = START.split(' ')
  const [hours, minutes, secs] = clock.split(':').map(Number)
  const total = hours * 3600 + minutes * 60 + secs + seconds

  const part = (value: number): string => String(value).padStart(2, '0')
  return `${date} ${part(Math.floor(total / 3600))}:${part(Math.floor(total / 60) % 60)}:${part(total % 60)}`
}

/** 0..360, by the same explicit double-mod the services use — JS `%` is remainder, not modulo. */
function normalise(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * The gap the GPS reads above the paddlewheel at a boat speed: a U, as the archive's own is.
 *
 * About +0.45 kt down at 3–4 kt, near zero through the middle, and back up at the top end — which
 * is the shape a single straight line through the scatter cannot follow, and the reason the gap
 * view exists at all.
 */
function gapAt(stw: number): number {
  if (stw < 4.5) return 0.45
  if (stw < 6.5) return 0.06
  return 0.38
}

export function fixtureRows(): FixtureRow[] {
  const rows: FixtureRow[] = []

  LEGS.forEach((leg, legIndex) => {
    for (let step = 0; step < ROWS_PER_LEG; step += 1) {
      const index = legIndex * ROWS_PER_LEG + step
      // Climbing through the whole recording, so the fit has over 4 kt of spread and no two
      // consecutive rows are verbatim identical — which is what a Dropout is detected from.
      const stw = 3.6 + index * 0.08
      const sog = stw + gapAt(stw)

      rows.push({
        recording_id: FIXTURE_RECORDING_ID,
        row_index: index + 1,
        date_verbatim: at(index * CADENCE_SECONDS),
        row_time: at(index * CADENCE_SECONDS),
        latitude: (41.8528333 + index * 0.0002).toFixed(7),
        longitude: (-87.55683333 + index * 0.0002).toFixed(8),
        cog: normalise(leg.ctw - leg.errorDeg).toFixed(1),
        sog: sog.toFixed(2),
        stw: stw.toFixed(2),
        ctw: leg.ctw.toFixed(1),
        twa: leg.twa.toFixed(1),
        tws: (12 + step * 0.1).toFixed(1),
        awa_calc: leg.awa.toFixed(1),
      })
    }
  })

  return rows
}

export function fixtureRecording(uploadedBy: string): {
  id: string
  filename: string
  content_sha256: string
  source_columns: string[]
  date_order: 'MDY'
  trailing_newline: boolean
  row_count: number
  first_row_time: string
  last_row_time: string
  uploaded_by: string
} {
  const rows = fixtureRows()

  return {
    id: FIXTURE_RECORDING_ID,
    filename: FIXTURE_FILENAME,
    // Not a hash of anything: no bytes were ever uploaded for this, and pretending otherwise would
    // put a plausible-looking digest on a file that does not exist.
    content_sha256: 'e2e-fixture-no-bytes-were-stored-for-this-recording',
    source_columns: ['Date', 'Longitude', 'Latitude', 'COG', 'SOG', 'STW', 'CTW', 'TWA', 'TWS', 'AWA (calc)'],
    date_order: 'MDY',
    trailing_newline: true,
    row_count: rows.length,
    first_row_time: rows[0].row_time,
    last_row_time: rows[rows.length - 1].row_time,
    uploaded_by: uploadedBy,
  }
}

/** The Race Window: the whole recording, so nothing is clipped and the legs are all measured. */
export function fixtureRaceWindow(): { window_start: string; window_finish: string } {
  const rows = fixtureRows()
  return { window_start: rows[0].row_time, window_finish: rows[rows.length - 1].row_time }
}

/* ------------------------------------------------------------------ writing it, and removing it */

/**
 * Here rather than in `archive.setup.ts` because Playwright refuses to let one test file import
 * another, and the teardown needs the same two functions the setup does.
 */
function assertLocalSupabase(supabaseUrl: string): void {
  const { hostname } = new URL(supabaseUrl)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(
      `The archive fixture refuses to run against a non-local Supabase URL (${supabaseUrl}). ` +
        'It writes a Race into the archive — it must never be able to reach a hosted project.'
    )
  }
}

/** The service-role client, or a loud failure. The rows are written with no browser in the loop. */
export function archiveWriter(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'The archive fixture needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — ' +
        'see .env.local.example.'
    )
  }
  assertLocalSupabase(supabaseUrl)

  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Deletes the fixture, by its own four ids and nothing else.
 *
 * One `DELETE` against `recordings` empties the Race and its rows with it — the cascade
 * `docs/testing/race-delete-cascade.md` verified — but the two Calibration Events hang off the
 * Instrument Calibration artifact rather than off the recording, so they go by id too.
 */
export async function removeFixture(writer: SupabaseClient): Promise<void> {
  const { error: eventsError } = await writer
    .from('calibration_events')
    .delete()
    .in('id', [FIXTURE_EVENT_HDG_ID, FIXTURE_EVENT_STW_ID])
  if (eventsError) throw eventsError

  const { error } = await writer.from('recordings').delete().eq('id', FIXTURE_RECORDING_ID)
  if (error) throw error
}
