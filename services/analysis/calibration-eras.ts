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
 *
 * ## Why here, and not beside the Log in `lib/boat/`
 *
 * For a while it was both: LAY-156 wrote a builder in `lib/boat/calibrationLog.ts` while LAY-157
 * wrote this one, on branches neither of which could see the other, and the two auto-merged into
 * one repo (LAY-163). This is the survivor, and this is its one home.
 *
 * An Era *is* a projection of the Log, which is the argument for living beside it — but the Log is
 * a record of what happened to the boat and an Era is a decision about how to read that record.
 * It exists only to partition figures; all three of its consumers are Instrument Tuning checks in
 * this directory (`paddlewheel.ts`, `compass-deviation.ts`, `awa-asymmetry.ts`); and the day grain
 * it cuts boundaries at is an analysis judgement about what a recorded act can be trusted to say,
 * not something the Log asserts. Keeping it here also keeps the dependency one-way — this module
 * reads `lib/boat`, and `lib/boat` carries no export that only an analysis has a use for.
 */

import type { CalibrationChannel, CalibrationEra, CalibrationLogEntry } from '@/types'

/**
 * Whether a Log entry is an act on this channel, and so a boundary for it.
 *
 * An Event says which channels it touched; a Version says so by what its diff moved. The first
 * Version's diff is every figure it set, which makes it a boundary too — before it, the figures in
 * the box were whatever they were and nobody wrote them down.
 */
function touches(entry: CalibrationLogEntry, channel: CalibrationChannel): boolean {
  return entry.entry === 'event'
    ? entry.event.channels.includes(channel)
    : entry.changes.some((change) => change.channel === channel)
}

/**
 * An Era's identity, so a chart can key a series on one.
 *
 * Private, because there is one producer. It was exported from `lib/boat/calibrationLog.ts` for as
 * long as there were two, since a key is only useful while both spell it the same way (LAY-163).
 */
function eraKey(channel: CalibrationChannel, fromDate: string | null): string {
  return `${channel}:${fromDate ?? 'opening'}`
}

/**
 * The day out of a naive stamp, which is the grain every Log entry is dated at.
 *
 * Named for the day rather than for the calendar date, so it does not read as a second home for
 * `lib/utils/calendarDate.ts`'s concept — that module validates and formats one, this one slices a
 * day off a stamp the parser has already validated.
 */
export function dayOf(stamp: string): string {
  return stamp.slice(0, 10)
}

/**
 * One channel's Eras, oldest first, over the whole of recorded time.
 *
 * The first Era opens on nothing: it is the stretch before anything was written down, and it exists
 * even where the Log's first entry is the Version that first recorded the channel's figures, since
 * a Race sailed before that Version was minted was still sailed under *some* configuration — just
 * one nobody recorded. A channel with no Log entry at all has exactly one Era, unbounded both ways,
 * which is the state the Instrument Tuning screen ships in.
 *
 * Every Era the Log implies is returned, including one holding no Race: an Era the sailor can see
 * exists and that nothing was measured in reads differently from an Era that is missing, the same
 * way the **Analysis Filter**'s empty buckets show disabled rather than vanishing. (`byEra` below
 * drops the empty ones, for its own stated reason; the Eras themselves are all here.)
 *
 * A boundary is a **day**, not an entry and not a stamp: `dayOf` normalises every entry date, so a
 * Version minted the same day as the Event that prompted it is one act on the instrument rather
 * than two Eras an hour apart, and so `withinEra` may compare a Race's wall-clock stamp against a
 * bound that is always `YYYY-MM-DD`. Two acts on one day are therefore one boundary, and the Era
 * names both.
 */
export function calibrationEras(
  log: readonly CalibrationLogEntry[],
  channel: CalibrationChannel
): CalibrationEra[] {
  const onChannel = log.filter((entry) => touches(entry, channel))
  const boundaries = [...new Set(onChannel.map((entry) => dayOf(entry.date)))].sort()

  return [null, ...boundaries].map((from_date, index) => ({
    key: eraKey(channel, from_date),
    channel,
    from_date,
    until_date: boundaries[index] ?? null,
    // In the Log's own order, which puts a Version above the Event of its date.
    opened_by: onChannel.filter((entry) => dayOf(entry.date) === from_date),
  }))
}

/**
 * Whether something dated `date` falls in this Era: `from_date` inclusive, `until_date` exclusive.
 *
 * The one place the rule is written — `eraOf` and `byEra` both ask this, so an Era cannot answer
 * one of them and not the other. `date` may be a calendar date or a wall-clock stamp, and either
 * is read at the **day**: a Race Window is a time but a recorded act is a day, so the time of day
 * cannot decide which side of a boundary a Race falls on. Nobody wrote down the hour the compass
 * was swung.
 *
 * Compared as `YYYY-MM-DD` text, which sorts chronologically, and never as a `Date`: an offset is a
 * claim about a timezone nothing here made. Both sides are in the **Recording**'s own frame.
 */
export function withinEra(date: string, era: CalibrationEra): boolean {
  const day = dayOf(date)

  if (era.from_date !== null && day < era.from_date) return false
  return era.until_date === null || day < era.until_date
}

/** The Era a date falls in, or null where the Eras given do not cover it. */
export function eraOf(eras: readonly CalibrationEra[], date: string): CalibrationEra | null {
  return eras.find((era) => withinEra(date, era)) ?? null
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
  const grouped = new Map<string, Item[]>()

  for (const item of items) {
    const era = eraOf(eras, dateOf(item))
    if (era === null) continue
    grouped.set(era.key, [...(grouped.get(era.key) ?? []), item])
  }

  return eras.flatMap((era) => {
    const its = grouped.get(era.key)
    return its === undefined ? [] : [{ era, items: its }]
  })
}
