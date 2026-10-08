/**
 * The owner's own Boat Setup files, where a suite can find them.
 *
 * The boat's ORC certificate and its Crossover Chart are not vendored into this repo any more than
 * its recordings are (`services/recordings/__tests__/archive.ts`), and for the same reason — so
 * every suite that reads them finds them here and skips loudly when it cannot. Point
 * `LAYLINE_BOAT_SETUP_DIR` at a checkout of `Handsome-Pete` to run those suites anywhere;
 * otherwise this looks for that repository beside the checkout, which is where it sits on the
 * owner's machine.
 *
 * Not a `.test.ts`, so Jest collects the suites and not this.
 *
 * 🚨 **Call `ownPolar`/`ownCrossoverChart` from inside a test body, never from a `describe`
 * callback.** Jest executes a `describe.skip` body at collection time — only the `it`s inside it
 * are skipped — so a read at describe scope runs on a machine without these files and takes the
 * whole suite down with it instead of skipping. `describeBoatSetup` cannot protect what runs
 * before its tests do. A memoised accessor evaluated on first use is the pattern that works; see
 * `archive-targets.test.ts`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseCrossoverDefinitionsFile } from '@/services/boat/crossoverDefinitionsFile'
import { parseCrossoverGridFile } from '@/services/boat/crossoverGridFile'
import { parsePolarFile } from '@/services/boat/polarFile'
import type { CrossoverChartPayload, PolarPayload } from '@/types'

const POLAR_FILE = join('polars', 'HandsomePete_2026_ORC_final.pol')
const GRID_FILE = join('sail-selection', 'HandsomePete_2026.sailselect')
const DEFINITIONS_FILE = join('sail-selection', 'HandsomePete_2026.saildef')

/** Where the boat's own files are, or null. */
function findBoatSetup(): string | null {
  const named = process.env.LAYLINE_BOAT_SETUP_DIR
  if (named) {
    // Someone who set this asked for these suites to run. Skipping a typo'd path would report all
    // green for the one claim they were trying to check — so the files are required to be there,
    // and the complaint names the one that is not.
    if (!existsSync(join(named, POLAR_FILE))) {
      throw new Error(
        `LAYLINE_BOAT_SETUP_DIR is set to ${named}, which holds no ${POLAR_FILE}. Point it at a ` +
          'checkout of Handsome-Pete, or unset it to let the search find one beside this repo.'
      )
    }
    return named
  }

  // Up from the checkout — which may be a worktree several levels down — until the sibling
  // repository turns up or the root does.
  let at = process.cwd()
  for (;;) {
    const candidate = join(at, 'Handsome-Pete')
    if (existsSync(join(candidate, POLAR_FILE))) return candidate

    const up = dirname(at)
    if (up === at) return null
    at = up
  }
}

const root = findBoatSetup()

if (root === null) {
  console.warn(
    "Skipping the Boat Setup suites: the owner's own Polar and Crossover Chart were not found. " +
      'Set LAYLINE_BOAT_SETUP_DIR to a checkout of Handsome-Pete, or check it out beside this repo.'
  )
}

/** `describe` where the boat's files are to hand, `describe.skip` where they are not. */
export const describeBoatSetup = root === null ? describe.skip : describe

function contentsOf(relative: string): string {
  // Reached only by a suite that read these files outside a test body — see the warning at the
  // top. Said in words, because the alternative is a `TypeError` about a null `path` argument
  // pointing at a `readFileSync` call that is not where the mistake is.
  if (root === null) {
    throw new Error(
      `the owner's Boat Setup files were not found, so ${relative} cannot be read. A suite that ` +
        'reads them must do so inside a test body, so that `describeBoatSetup` can skip it: a ' +
        'describe callback runs even when the describe is skipped.'
    )
  }

  return readFileSync(join(root, relative), 'utf8')
}

/** The boat's own 2026 ORC certificate, as a payload. A refusal throws. */
export function ownPolar(): PolarPayload {
  const outcome = parsePolarFile(contentsOf(POLAR_FILE))
  if (!outcome.ok) throw new Error(`${POLAR_FILE} was refused as ${outcome.reason}`)
  return outcome.payload
}

/**
 * The boat's own Crossover Chart — both halves, as one payload.
 *
 * Assembled here rather than run through `validateCrossoverChartPayload`, because the write gate
 * refuses one thing this file still says: two of its labels use "Reaching Spin" for the sail ADR
 * 0023 renamed the A3, and the admin corrects that in the file rather than Layline rewriting it.
 * These suites are about *reading* a stored chart, which is held to the structure alone and not to
 * the naming policy, for exactly the reason `crossoverPayload.ts` gives.
 */
export function ownCrossoverChart(): CrossoverChartPayload {
  const grid = parseCrossoverGridFile(contentsOf(GRID_FILE))
  if (!grid.ok) throw new Error(`${GRID_FILE} was refused as ${grid.reason}: ${grid.message}`)

  const definitions = parseCrossoverDefinitionsFile(contentsOf(DEFINITIONS_FILE))
  if (!definitions.ok) {
    throw new Error(`${DEFINITIONS_FILE} was refused as ${definitions.reason}`)
  }

  return {
    twa_axis: grid.grid.twa_axis,
    tws_axis: grid.grid.tws_axis,
    cells: grid.grid.cells,
    sail_definitions: definitions.definitions,
  }
}
