import { CALIBRATION_CHANNELS, formatFigure } from '@/lib/boat/calibration'
import type {
  CalibrationEvent,
  CalibrationFieldChange,
  CalibrationLogEntry,
  InstrumentCalibrationPayload,
  InstrumentCalibrationVersion,
} from '@/types'

/**
 * The **Calibration Log** — assembled when read, and stored nowhere.
 *
 * One timeline over two sources: the **Calibration Events** somebody wrote down, and
 * the **Instrument Calibration** Versions, each rendered as what it changed. No fact
 * is held twice, so no two representations of one change can disagree (ADR 0005).
 *
 * It has no current pointer, even though the artifact does. "What is the boat set to
 * now" is answered by the current Version and never by reading back through this.
 *
 * Pure: it reads two arrays and returns a third, mutating neither.
 */

/** The two figures a channel may carry, in the order the form asks for them. */
const FIELDS = ['multiplier', 'offset'] as const

/**
 * What moved between two Versions.
 *
 * `previous` is `null` for the first Version, which yields every figure with
 * `from: null` — there was no previous figure, and that is not a previous figure of
 * zero. A figure that appears or vanishes is reported for the same reason: a diff
 * that quietly skipped it would say the Version changed nothing while it plainly
 * did.
 */
export function calibrationDiff(
  previous: InstrumentCalibrationPayload | null,
  next: InstrumentCalibrationPayload
): CalibrationFieldChange[] {
  const changes: CalibrationFieldChange[] = []

  for (const channel of CALIBRATION_CHANNELS) {
    for (const field of FIELDS) {
      const to = next[channel]?.[field] ?? null
      const from = previous === null ? null : previous[channel]?.[field] ?? null

      // Absent on both sides — every channel without a multiplier, on every Version.
      if (from === null && to === null) continue
      if (from === to) continue

      changes.push({ channel, field, from, to })
    }
  }

  return changes
}

/**
 * One change, in a sentence: `'AWA offset 2° → 1°'`.
 *
 * Here rather than in the component because it is the diff *read back*, and a figure
 * must render identically in the Log and in the form it was typed into — hence
 * `formatFigure` for both sides rather than a local `toFixed`.
 */
export function describeChange({ channel, field, from, to }: CalibrationFieldChange): string {
  const what = `${channel} ${field}`
  const figure = (value: number): string => formatFigure(channel, field, value)

  if (from === null) {
    // Absent on both sides is never produced — `calibrationDiff` skips it — but the
    // type permits it, and naming it beats inventing a number for either side.
    return to === null ? `${what} not recorded` : `${what} set to ${figure(to)}`
  }

  // Only reachable for a multiplier, and only where the Version before it had one.
  // Said rather than skipped: a Version that lost a figure did not change nothing.
  if (to === null) return `${what} no longer set (was ${figure(from)})`

  return `${what} ${figure(from)} → ${figure(to)}`
}

/** Newest first: the top of the screen is what the boat is closest to running now. */
function byDateDescending(a: CalibrationLogEntry, b: CalibrationLogEntry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1

  // Same calendar date. A Version mint reads above an Event of that date: the numbers
  // went into the box *because* of the act, so the consequence sits on top of it.
  if (a.entry !== b.entry) return a.entry === 'version' ? -1 : 1

  // Two of a kind on one date, ordered by when each was written into Layline — the
  // only other fact either one carries about sequence.
  const written = (entry: CalibrationLogEntry) =>
    entry.entry === 'version' ? entry.version.recorded_at : entry.event.created_at

  const [left, right] = [written(a), written(b)]
  if (left !== right) return left < right ? 1 : -1

  // Identical to the second. Fall back to the id so the order is at least stable
  // between two renders of the same data.
  const id = (entry: CalibrationLogEntry) =>
    entry.entry === 'version' ? entry.version.id : entry.event.id

  return id(a) < id(b) ? 1 : -1
}

/**
 * The Log, newest first.
 *
 * Diffs are computed in **mint order** — ascending `version_number` — and not in date
 * order, because a correction may give a later Version an earlier `effective_from`
 * and its diff is still against the Version before it. The timeline is then sorted by
 * date, so the two orderings stay separate rather than one standing in for the other.
 *
 * @param versions Every Version of the artifact, in any order.
 * @param events Every Calibration Event against it, in any order.
 */
export function buildCalibrationLog(
  versions: InstrumentCalibrationVersion[],
  events: CalibrationEvent[]
): CalibrationLogEntry[] {
  const minted = [...versions].sort((a, b) => a.version_number - b.version_number)

  const entries: CalibrationLogEntry[] = minted.map((version, index) => ({
    entry: 'version',
    date: version.effective_from,
    version,
    changes: calibrationDiff(index === 0 ? null : minted[index - 1].payload, version.payload),
    isFirst: index === 0,
  }))

  for (const event of events) {
    entries.push({ entry: 'event', date: event.occurred_on, event })
  }

  return entries.sort(byDateDescending)
}
