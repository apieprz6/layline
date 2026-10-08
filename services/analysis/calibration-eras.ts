/**
 * **Calibration Eras**, one channel at a time, out of the **Calibration Log**.
 *
 * An Era is one stretch of an instrument's life over which a **Measured Offset** or an **Apparent
 * Wind Asymmetry** means one thing. Its boundaries are the acts somebody recorded — the channel's
 * own **Calibration Events** and the Instrument Calibration Versions that changed its figures —
 * read off the Log that already merges both (`lib/boat/calibrationLog.ts`), filtered to the one
 * channel. Derived per channel, so the `HDG` boundaries and the `STW` boundaries need not line up.
 *
 * **Never inferred from a step in the data.** Where nobody wrote the act down there is one Era and
 * an unexplained shift in it, because a boundary Layline invented would be Layline asserting that a
 * person did something to the boat. This is also what replaces the prior art's hand-maintained
 * `compass-calibrations.yaml`, and with it the failure mode where somebody forgets to edit it.
 */

import type { CalibrationChannel, CalibrationEra, CalibrationLogEntry } from '@/types'

/** Whether a Log entry is an act on this channel, and so a boundary for it. */
function touches(entry: CalibrationLogEntry, channel: CalibrationChannel): boolean {
  return entry.entry === 'event'
    ? entry.event.channels.includes(channel)
    : entry.changes.some((change) => change.channel === channel)
}

/** The calendar date out of a naive stamp, which is the grain every Log entry is dated at. */
export function calendarDate(stamp: string): string {
  return stamp.slice(0, 10)
}

/**
 * One channel's Eras, oldest first.
 *
 * The first Era opens on nothing: it is the stretch before anything was written down, and it exists
 * even where the Log's first entry is the Version that first recorded the channel's figures, since
 * a Race sailed before that Version was minted was still sailed under *some* configuration — just
 * one nobody recorded. A channel with no Log entry at all has exactly one Era, unbounded both ways.
 *
 * Dates are compared as `YYYY-MM-DD` text, which sorts chronologically, and a boundary is a date
 * rather than an entry: a Version minted the same day as the Event that prompted it is one act on
 * the instrument, not two Eras an hour apart.
 */
export function calibrationEras(
  log: readonly CalibrationLogEntry[],
  channel: CalibrationChannel
): CalibrationEra[] {
  const onChannel = log.filter((entry) => touches(entry, channel))
  const boundaries = [...new Set(onChannel.map((entry) => calendarDate(entry.date)))].sort()

  return [null, ...boundaries].map((from_date, index) => ({
    key: `${channel}:${from_date ?? 'opening'}`,
    channel,
    from_date,
    until_date: boundaries[index] ?? null,
    opened_by: onChannel.filter((entry) => calendarDate(entry.date) === from_date),
  }))
}

/** The Era a date falls in, or null where the Eras given do not cover it. */
export function eraOf(eras: readonly CalibrationEra[], date: string): CalibrationEra | null {
  const day = calendarDate(date)

  return (
    eras.find(
      (era) =>
        (era.from_date === null || day >= era.from_date) &&
        (era.until_date === null || day < era.until_date)
    ) ?? null
  )
}

/**
 * Each Era with the items dated inside it, oldest Era first.
 *
 * Eras holding nothing are dropped, not returned empty: an Era with no Race in it is a stretch of
 * the season nobody sailed, which is a different statement from a figure that could not be computed
 * and does not belong in the same list as one. An item whose date falls in no Era is dropped too,
 * which cannot happen for Eras from `calibrationEras` — they cover the whole timeline between them.
 */
export function byEra<Item>(
  eras: readonly CalibrationEra[],
  items: readonly Item[],
  dateOf: (item: Item) => string
): { era: CalibrationEra; items: Item[] }[] {
  return eras
    .map((era) => ({
      era,
      items: items.filter((item) => eraOf(eras, dateOf(item))?.key === era.key),
    }))
    .filter(({ items }) => items.length > 0)
}
