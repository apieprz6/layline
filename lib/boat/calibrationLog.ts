import { CALIBRATION_CHANNELS, formatFigure } from '@/lib/boat/calibration'
import type {
  CalibrationChannel,
  CalibrationEra,
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

/**
 * Whether this entry is an act on this channel, and so a boundary of its **Calibration Eras**.
 *
 * An Event says which channels it touched; a Version says so by what its diff moved. The first
 * Version's diff is every figure it set, which makes it a boundary too — before it, the figures
 * in the box were whatever they were and nobody wrote them down.
 */
export function touchesChannel(entry: CalibrationLogEntry, channel: CalibrationChannel): boolean {
  return entry.entry === 'event'
    ? entry.event.channels.includes(channel)
    : entry.changes.some((change) => change.channel === channel)
}

/**
 * One channel's **Calibration Eras**, oldest first, over the whole of recorded time.
 *
 * Every Era the Log implies is returned, including one holding no Race: an Era the sailor can see
 * exists and that nothing was measured in reads differently from an Era that is missing, the same
 * way the **Analysis Filter**'s empty buckets show disabled rather than vanishing.
 *
 * Eras are never inferred from the data (ADR 0027) — a Log with nothing in it yields exactly one
 * Era, which is the state the Instrument Tuning screen ships in.
 */
export function calibrationEras(
  log: readonly CalibrationLogEntry[],
  channel: CalibrationChannel
): CalibrationEra[] {
  const acts = log.filter((entry) => touchesChannel(entry, channel))

  // Two acts on one date are one boundary. Two would open an Era of zero width, which no Race can
  // sit in and no chart can mark, so they are grouped and the Era names both.
  const dates = [...new Set(acts.map((entry) => entry.date))].sort()
  const eras: CalibrationEra[] = [
    {
      key: eraKey(channel, null),
      channel,
      from_date: null,
      until_date: dates[0] ?? null,
      opened_by: [],
    },
  ]

  dates.forEach((date, index) => {
    eras.push({
      key: eraKey(channel, date),
      channel,
      from_date: date,
      until_date: dates[index + 1] ?? null,
      // In the Log's own order, which puts a Version above the Event of its date.
      opened_by: acts.filter((entry) => entry.date === date),
    })
  })

  return eras
}

/**
 * An Era's identity, so a chart can key a series on one.
 *
 * Here rather than inline in either producer because there are two of them
 * (`services/analysis/calibration-eras.ts` is the other) and a key is only useful while both spell
 * it the same way. One home for the format is the smaller half of that problem; the other half is
 * that there are two producers at all, which is LAY-163's.
 */
export function eraKey(channel: CalibrationChannel, fromDate: string | null): string {
  return `${channel}:${fromDate ?? 'opening'}`
}

/**
 * Whether something dated `date` falls in this Era: `from_date` inclusive, `until_date` exclusive.
 *
 * Compared as text, which is why both a calendar date (`2026-08-01`) and a wall-clock stamp
 * (`2026-08-01 10:00:00`) answer correctly — a stamp sorts after the date it falls on and before
 * the next one. Both are in the **Recording**'s own frame, and neither is ever a `Date`: an offset
 * is a claim about a timezone nothing here made.
 */
export function withinEra(date: string, era: CalibrationEra): boolean {
  if (era.from_date !== null && date < era.from_date) return false
  return era.until_date === null || date < era.until_date
}
