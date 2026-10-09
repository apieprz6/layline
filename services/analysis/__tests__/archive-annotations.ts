/**
 * The owner's own **Testimony** about seven of the thirteen races, in Layline's vocabulary.
 *
 * The prior art's `raw-regatta-recordings/metadata.yaml` holds what the sailor remembers — which
 * sails were up and from when, and what the water was doing — and nothing in this repository reads
 * that file. Written out here for the same two reasons `ARCHIVE_RACE_WINDOWS` is
 * (`services/recordings/__tests__/archive.ts`): Layline has no YAML reader and will not grow one
 * for a fixture, since this reaches the database by a sailor typing it into the annotation wizard
 * and never by an importer — and every figure the archive suites pin is a figure *under exactly
 * these entries*, so a file that drifted underneath them would move the numbers without failing
 * anything.
 *
 * ## Two translations, both of them the hand re-entry ADR 0023 requires
 *
 * **The sails are named in the Crossover Chart's own words.** The prior art wrote a *set* —
 * `[main, jib-1]` — and ADR 0023 deleted that second vocabulary: a **Sail Configuration** names one
 * **Sail Definition** of the chart Version its Race points at, by that Definition's own label. The
 * labels below are this boat's `.saildef` verbatim, matched by hand, which is exactly the re-entry
 * that ADR says the archive's annotations cost. `reaching-spin` is the sail the ADR renamed the A3
 * and the chart file still calls `Reaching Spin`, so that is what it is called here.
 *
 * **The 26 Aug race flew mainsail alone**, which the chart has no Definition for. That entry
 * carries a note and no label — the **Note only** state (ADR 0029) — and never an invented
 * Definition. It is also why `Off-chart` exists as a **Cell Agreement** state at all.
 *
 * The three sea states the prior art wrote are its own words: `flat`, `light-chop` and `moderate`
 * map onto Layline's **Calm**, **Slight** and **Moderate** (`SEA_STATES`). Nothing is mapped onto
 * **Rough**, because nothing in this archive was.
 *
 * Six races carry **no entry of either kind**, which is not an omission in this fixture: they were
 * never annotated, half of the archive's Countable sailing is therefore unattributed, and that is
 * the fact the **Coverage Ledger** and the `Not recorded` buckets exist to state.
 *
 * Not a `.test.ts`, so Jest collects the suites and not this.
 */

import type { RaceAnnotations } from '@/types'

/** A Sail Configuration naming a Definition of this boat's chart. */
const sail = (at: string, label: string, definition_number: number) => ({
  at,
  definition_number,
  label,
  note: null,
})

/**
 * The 26 Aug mainsail-alone entry: a note, no Definition.
 *
 * Four rows of the archive, at TWS 3.0–3.6 kt — below the chart's own first column, so they have
 * no floor, no recommendation and no cell. Which is the measurement behind ADR 0030's finding that
 * this screen does *not* force a chart vocabulary entry for mainsail alone.
 */
const noteOnly = (at: string, note: string) => ({
  at,
  definition_number: null,
  label: null,
  note,
})

const EMPTY: RaceAnnotations = { sails: [], sea_state: [] }

/** Every annotation the archive carries, by recording stem. Earliest first, as stored. */
export const ARCHIVE_ANNOTATIONS: Readonly<Record<string, RaceAnnotations>> = {
  '06-03-26-beer-can': EMPTY,
  '06-06-26-nood': EMPTY,
  '06-07-26-nood': EMPTY,
  '06-20-26-chi-wauk': EMPTY,
  '06-26-26-chi-mi-chi': EMPTY,
  '07-01-26-beer-can': EMPTY,
  '07-22-26-beer-can': {
    sails: [
      sail('2026-07-22 19:00:00', 'Main + Jib 1', 1),
      sail('2026-07-22 19:22:00', 'Main + A2', 8),
    ],
    sea_state: [{ at: '2026-07-22 19:00:00', sea_state: 'moderate' }],
  },
  '07-29-26-beer-can': {
    sails: [
      sail('2026-07-29 19:00:00', 'Main + Jib 1', 1),
      sail('2026-07-29 19:18:30', 'Main + A2', 8),
    ],
    sea_state: [{ at: '2026-07-29 19:00:00', sea_state: 'slight' }],
  },
  '08-04-26-100-beer-can': {
    sails: [
      sail('2026-08-04 18:50:00', 'Main + A2', 8),
      sail('2026-08-04 19:16:00', 'Main + Jib 1', 1),
    ],
    sea_state: [{ at: '2026-08-04 18:50:00', sea_state: 'calm' }],
  },
  '08-22-26-glr': {
    sails: [
      sail('2026-08-22 11:05:00', 'Main + Jib 3', 3),
      sail('2026-08-22 11:29:00', 'Main + A2', 8),
      sail('2026-08-22 12:17:30', 'Main + Jib 3', 3),
    ],
    sea_state: [{ at: '2026-08-22 11:05:00', sea_state: 'moderate' }],
  },
  '08-26-26-beer-can': {
    sails: [
      sail('2026-08-26 19:00:00', 'Main + Jib 2', 2),
      sail('2026-08-26 19:11:00', 'Main + A2', 8),
      sail('2026-08-26 19:22:00', 'Main + Jib 2', 2),
      sail('2026-08-26 19:27:49', 'Main + Reaching Spin', 6),
      sail('2026-08-26 19:33:35', 'Main + Jib 2', 2),
      noteOnly('2026-08-26 19:43:49', 'Mainsail alone'),
      sail('2026-08-26 19:45:40', 'Main + Jib 1', 1),
    ],
    sea_state: [{ at: '2026-08-26 19:00:00', sea_state: 'calm' }],
  },
  '09-02-2026-beer-can': {
    sails: [sail('2026-09-02 19:00:00', 'Main + Jib 2', 2)],
    sea_state: [{ at: '2026-09-02 19:00:00', sea_state: 'calm' }],
  },
  '09-04-2026-chicago-st-joe': {
    sails: [
      sail('2026-09-04 18:50:00', 'Main + A2', 8),
      sail('2026-09-04 21:00:00', 'Main + Jib 1', 1),
    ],
    sea_state: [{ at: '2026-09-04 18:50:00', sea_state: 'calm' }],
  },
}

/** What a recording's Race was annotated with, by filename. Throws where there is no entry. */
export function archiveAnnotations(filename: string): RaceAnnotations {
  const stem = filename.replace(/\.csv$/, '')
  const annotations = ARCHIVE_ANNOTATIONS[stem]

  if (!annotations) {
    throw new Error(
      `no annotations recorded for ${stem}. The archive has grown; add its Testimony to ` +
        'ARCHIVE_ANNOTATIONS — an empty one if the race was never annotated — and re-measure the ' +
        'figures the archive suites pin.'
    )
  }

  return annotations
}
