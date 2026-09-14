/**
 * The owner's recordings, where a suite can find them.
 *
 * These thirteen qtVlm exports are the boat's real season and are not vendored into this repo, so
 * every suite that reads them finds them here and skips loudly when it cannot. Point
 * `LAYLINE_ARCHIVE_DIR` at a directory of exports to run those suites anywhere; otherwise this
 * looks for `Handsome-Pete/raw-regatta-recordings` beside the checkout, which is where they sit on
 * the owner's machine.
 *
 * Not a `.test.ts`, so Jest collects the suites and not this.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import type { RaceWindow } from '@/services/recordings/row-quality'
import type { Transcription } from '@/types'

/** Where the recordings are, or null. */
function findArchive(): string | null {
  const named = process.env.LAYLINE_ARCHIVE_DIR
  if (named) {
    // Someone who set this asked for these suites to run. Skipping a typo'd path would report
    // all green for the one claim they were trying to check.
    if (!existsSync(named)) {
      throw new Error(`LAYLINE_ARCHIVE_DIR is set to ${named}, which does not exist`)
    }
    return named
  }

  // Up from the checkout — which may be a worktree several levels down — until the sibling
  // repository turns up or the root does.
  let at = process.cwd()
  for (;;) {
    const candidate = join(at, 'Handsome-Pete', 'raw-regatta-recordings')
    if (existsSync(candidate)) return candidate

    const up = dirname(at)
    if (up === at) return null
    at = up
  }
}

const archive = findArchive()

/** Every export in the archive, sorted, or none when it could not be found. */
export const archiveFilenames: string[] = archive
  ? readdirSync(archive)
      .filter((name) => name.endsWith('.csv'))
      .sort()
  : []

if (archiveFilenames.length === 0) {
  console.warn(
    'Skipping the archive suites: no qtVlm exports found. Set LAYLINE_ARCHIVE_DIR to a ' +
      'directory of recordings, or check out Handsome-Pete/raw-regatta-recordings beside this repo.'
  )
}

/** `describe` where the archive is to hand, `describe.skip` where it is not. */
export const describeArchive = archiveFilenames.length > 0 ? describe : describe.skip

export function archiveBytes(filename: string): Buffer {
  return readFileSync(join(archive as string, filename))
}

/**
 * The bytes, not a string: this is the path an upload takes, so the hash is over what Storage
 * holds. A refusal throws, which is the assertion that every one of these files is storable —
 * including that no value in them is a form Postgres `numeric` would give back changed.
 */
export function transcribe(filename: string): { bytes: Buffer; transcription: Transcription } {
  const bytes = archiveBytes(filename)
  const outcome = parseQtvlmRecording(bytes)
  if (!outcome.ok) {
    throw new Error(`${filename} was refused as ${outcome.reason}: ${outcome.message}`)
  }
  return { bytes, transcription: outcome.transcription }
}

/**
 * The Race Window each recording was annotated with, verbatim from the prior art's
 * `raw-regatta-recordings/metadata.yaml`.
 *
 * Written out here rather than read from that file, for two reasons. Layline has no YAML reader
 * and will not grow one for a fixture: these windows reach the database by a sailor typing them
 * into the upload wizard, not by an importer. And every in-window figure pinned by these suites is
 * a figure *under exactly these bounds*, so a window that drifted underneath them would move the
 * numbers without failing anything.
 */
export const ARCHIVE_RACE_WINDOWS: Readonly<Record<string, RaceWindow>> = {
  '06-03-26-beer-can': {
    window_start: '2026-06-03 19:00:00',
    window_finish: '2026-06-03 19:51:00',
  },
  '06-06-26-nood': { window_start: '2026-06-06 11:45:00', window_finish: '2026-06-06 13:56:00' },
  '06-07-26-nood': { window_start: '2026-06-07 10:48:00', window_finish: '2026-06-07 13:31:00' },
  '06-20-26-chi-wauk': {
    window_start: '2026-06-20 15:50:00',
    window_finish: '2026-06-20 20:52:00',
  },
  '06-26-26-chi-mi-chi': {
    window_start: '2026-06-26 22:16:37',
    window_finish: '2026-06-27 03:42:00',
  },
  '07-01-26-beer-can': {
    window_start: '2026-07-01 19:00:00',
    window_finish: '2026-07-01 19:54:00',
  },
  '07-22-26-beer-can': {
    window_start: '2026-07-22 19:00:00',
    window_finish: '2026-07-22 19:38:00',
  },
  '07-29-26-beer-can': {
    window_start: '2026-07-29 19:00:00',
    window_finish: '2026-07-29 19:31:00',
  },
  '08-04-26-100-beer-can': {
    window_start: '2026-08-04 18:50:00',
    window_finish: '2026-08-04 19:51:00',
  },
  // The annotated finish is 1,155 seconds after the recording's last row, which is a note and
  // never a block: it is a legitimate race (ADR 0009).
  '08-22-26-glr': { window_start: '2026-08-22 11:05:00', window_finish: '2026-08-22 14:09:00' },
  '08-26-26-beer-can': {
    window_start: '2026-08-26 19:00:00',
    window_finish: '2026-08-26 20:46:00',
  },
  '09-02-2026-beer-can': {
    window_start: '2026-09-02 19:00:00',
    window_finish: '2026-09-02 19:20:00',
  },
  '09-04-2026-chicago-st-joe': {
    window_start: '2026-09-04 18:50:00',
    window_finish: '2026-09-05 08:30:30',
  },
}

/** The window a recording was annotated with, by filename. Throws where there is none. */
export function raceWindowFor(filename: string): RaceWindow {
  const stem = filename.replace(/\.csv$/, '')
  const window = ARCHIVE_RACE_WINDOWS[stem]
  if (!window) {
    throw new Error(
      `no Race Window recorded for ${stem}. The archive has grown; add its annotated bounds to ` +
        'ARCHIVE_RACE_WINDOWS and re-measure the figures the archive suites pin.'
    )
  }
  return window
}
