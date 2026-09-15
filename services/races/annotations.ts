/**
 * What the sailor says about a race, as arithmetic — placed, carried, refused, resolved.
 *
 * An Annotation is **Testimony** (ADR 0008): neither measured nor computed, and the fourth class of
 * value in Layline precisely because nothing may stand in for it. So nothing in this module invents
 * one. Every entry is timestamped and the first is not special — there is no initial value beside a
 * list of changes, in the data or in the UI (ADR 0010) — an empty list is legal and means the race is
 * not remembered, and a new entry starts with nothing selected unless there is an earlier entry to
 * inherit from.
 *
 * Three layers ask these questions, which is why the answers are here rather than in the wizard: the
 * wizard, which will not arm Save while an entry is half-finished; the Server Action, which will not
 * write one, because a Server Action is a public endpoint; and the database, which refuses regardless
 * — `race_sail_entries_non_empty` at commit, `UNIQUE (race_id, at)` per kind, and a foreign key per
 * sail. Three enforcements, one set of rules, so the sentence the sailor reads cannot drift from the
 * constraint that would have fired.
 *
 * A draft works in absolute seconds of the recording's own naive frame, because that is the axis the
 * charts are tapped on; a submission works in stamps, because that is what a `timestamp` column
 * takes. Neither is bounded by the Race Window: the sails were set before the start.
 */

import { nearestRowIndex } from '@/services/recordings/race-window'
import { wallClockSeconds, wallClockStamp } from '@/services/recordings/wall-clock'
import type {
  ReefState,
  SailEntryDraft,
  SeaState,
  SeaStateEntryDraft,
  SubmitSailEntry,
  SubmitSeaStateEntry,
} from '@/types'

/**
 * The four Sea States, with the heights that tell them apart.
 *
 * Called Sea State everywhere — never a wave state — and the heights are here because "moderate" on
 * Lake Michigan means something specific to a sailor and nothing to anyone else. Roughly, and said
 * roughly: this is what the sailor remembers, not a measurement.
 */
export const SEA_STATES: readonly { value: SeaState; label: string; height: string }[] = [
  { value: 'calm', label: 'Calm', height: '0–1 ft' },
  { value: 'slight', label: 'Slight', height: '1–2 ft' },
  { value: 'moderate', label: 'Moderate', height: '2–3 ft' },
  { value: 'rough', label: 'Rough', height: '3+ ft' },
]

/**
 * The two Reef States the boat has.
 *
 * One reef point, so there are two states and no third to guess between. A Sail Configuration is a
 * set of sails *plus* one of these, which is why an entry that names sails but no Reef State is
 * half-finished rather than defaulted to `full`.
 */
export const REEF_STATES: readonly { value: ReefState; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'reef-1', label: 'One reef' },
]

const SEA_STATE_VALUES: readonly string[] = SEA_STATES.map((each) => each.value)
const REEF_VALUES: readonly string[] = REEF_STATES.map((each) => each.value)

/**
 * The two lookups every screen that states an annotation needs, in one place.
 *
 * They live here because a stored value whose label has gone missing is the one case worth agreeing
 * on: five call sites each writing `?? '—'` or `?? '?'` is five different answers to *this race says
 * something this build does not recognise*, and the wizard's summary once disagreed with the race
 * page about the same entry. The fallback is the stored value itself, which at least names what the
 * database holds and is the only honest thing left to say.
 */
export function seaStateLabel(value: SeaState | string): string {
  return SEA_STATES.find((each) => each.value === value)?.label ?? value
}

export function reefLabel(value: ReefState | string): string {
  return REEF_STATES.find((each) => each.value === value)?.label ?? value
}

/**
 * Where a tap puts an entry: the nearest recorded row, or the next free one after it.
 *
 * Snapping is ADR 0014's — a tap lands on a pixel and a pixel is a range of seconds, so the entry
 * goes on a time the file actually has and the marker sits under the thumb. Stepping forward is what
 * makes a second tap in the same place mean "another change, just after that one" instead of a
 * `UNIQUE (race_id, at)` violation raised after the bytes have already moved.
 *
 * Forward, then backward, then null. Forward first because a sailor tapping twice is describing
 * something that happened later; backward because the last row of a busy race still has to be
 * annotatable; null because with every row taken there is no honest time left, and an entry at a
 * time the recording does not have would be a time nobody tapped.
 *
 * Stepping is by row index rather than by clock, matching `nearestRowIndex`: file order is
 * chronological only while the recording's clock went forwards, and "the next row" is a fact about
 * the file either way.
 */
export function placeAnnotationTime(
  rowSeconds: readonly number[],
  seconds: number,
  taken: readonly number[]
): number | null {
  const nearest = nearestRowIndex(rowSeconds, seconds)
  if (nearest === -1) return null

  const isFree = (index: number): boolean => !taken.includes(rowSeconds[index])

  for (let index = nearest; index < rowSeconds.length; index += 1) {
    if (isFree(index)) return rowSeconds[index]
  }

  for (let index = nearest - 1; index >= 0; index -= 1) {
    if (isFree(index)) return rowSeconds[index]
  }

  return null
}

/**
 * A list by time, earliest first, as a copy.
 *
 * Entries are placed in whatever order the sailor remembers them, so nothing may assume the array is
 * ordered. A copy because both the wizard's list and the resolution below sort for their own reasons,
 * and sorting React state in place is a re-render that does not happen.
 */
export function byTime<T extends { at: number }>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => left.at - right.at)
}

/**
 * The entry in force at a time: the latest at or before it, falling back to the earliest.
 *
 * ADR 0010's resolution rule, and the whole of it. The fallback is the load-bearing half: the sails
 * were up before the sailor got round to saying so, so the first rows of a race resolve to the
 * earliest testimony rather than to nothing. It is still testimony — nobody invented it — and it is
 * computed here, at read, and never copied onto a Recording Row.
 */
export function entryInForce<T extends { at: number }>(
  entries: readonly T[],
  seconds: number
): T | null {
  const ordered = byTime(entries)
  if (ordered.length === 0) return null

  let inForce = ordered[0]
  for (const entry of ordered) {
    if (entry.at <= seconds) inForce = entry
  }

  return inForce
}

/**
 * The same rule, for annotations as they come back from the database.
 *
 * Stored `at` values are `timestamp` columns, so they arrive as stamps with a space rather than a
 * `T`; `wallClockSeconds` reads both and refuses anything carrying an offset.
 */
export function annotationInForce<T extends { at: string }>(
  entries: readonly T[],
  stamp: string
): T | null {
  const resolved = entryInForce(
    entries.map((entry) => ({ at: wallClockSeconds(entry.at), entry })),
    wallClockSeconds(stamp)
  )

  return resolved?.entry ?? null
}

/**
 * What a new entry at this time inherits: the configuration in force just before it.
 *
 * This is what makes a single sail change two chip taps rather than seven — drop the jib, hoist the
 * kite, and everything else about the boat stays as it was. Strictly *before*, and nothing at all
 * when there is no earlier entry: the next configuration is not testimony about the time before it,
 * and a first entry with sails already lit would be Layline saying what was up.
 */
export function carriedConfiguration(
  entries: readonly SailEntryDraft[],
  at: number
): { sail_ids: string[]; reef: ReefState | null } {
  const earlier = entries.filter((entry) => entry.at < at)
  const previous = entryInForce(earlier, at)

  // A fresh array, so editing the new entry's set cannot rewrite the entry it came from.
  return previous
    ? { sail_ids: [...previous.sail_ids], reef: previous.reef }
    : { sail_ids: [], reef: null }
}

/** A new Sail Configuration at `at`, inheriting whatever was up before it. */
export function newSailEntry(
  entries: readonly SailEntryDraft[],
  at: number,
  key: string
): SailEntryDraft {
  return { key, at, ...carriedConfiguration(entries, at) }
}

/**
 * A new Sea State reading at `at`, with nothing stated.
 *
 * Nothing is carried forward and nothing is pre-selected: the mockup seeds a new reading with
 * `slight`, which would be Layline remembering the water for the sailor.
 */
export function newSeaStateEntry(at: number, key: string): SeaStateEntryDraft {
  return { key, at, sea_state: null }
}

/**
 * A sail added to or removed from a Configuration, in inventory order.
 *
 * Inventory order rather than tap order, because a set held in tap order renders as “A2 + Main” on
 * one entry and “Main + A2” on the next, and a sailor reading their own list would see two sail
 * plans where there is one. A copy, for React's sake.
 */
export function toggleSail(
  sailIds: readonly string[],
  sailId: string,
  inventoryOrder: readonly string[]
): string[] {
  const next = sailIds.includes(sailId)
    ? sailIds.filter((each) => each !== sailId)
    : [...sailIds, sailId]

  return inventoryOrder.filter((each) => next.includes(each))
}

/**
 * Why this Sail Configuration cannot be saved yet, or null.
 *
 * The sails come first: an entry with neither is an entry nobody has started, and “say which sails
 * were up” is the question that has to be answered before the Reef State means anything.
 */
export function refuseSailEntry(entry: SailEntryDraft): string | null {
  if (entry.sail_ids.length === 0) {
    return 'Say which sails were up — a sail plan with nothing in it is not something to remember.'
  }

  if (entry.reef === null) {
    return 'Say whether the main was full or reefed.'
  }

  return null
}

/**
 * Why this drafted list cannot be saved yet, or null: two entries at one time.
 *
 * `placeAnnotationTime` steps off a taken row, so a tap cannot produce this. The datetime field and
 * the nudges can, and `UNIQUE (race_id, at)` fires inside the transaction — after the bytes have
 * moved (ADR 0013). One sentence about a collision the sailor can see beats a constraint name after a
 * failed save.
 */
export function refuseEntryTimes<T extends { at: number }>(entries: readonly T[]): string | null {
  const seen = new Set<number>()

  for (const entry of entries) {
    if (seen.has(entry.at)) {
      return 'Two entries are at the same time. Move one of them, or take it off.'
    }
    seen.add(entry.at)
  }

  return null
}

/** Why this Sea State reading cannot be saved yet, or null. */
export function refuseSeaStateEntry(entry: SeaStateEntryDraft): string | null {
  return entry.sea_state === null ? 'Say what the water was doing.' : null
}

/**
 * A drafted list as it gets sent: stamps, earliest first, nothing dropped.
 *
 * Throws on a half-finished entry rather than skipping it. The wizard will not arm Save while
 * `refuseSailEntry` has anything to say, so reaching this is a bug — and a silently dropped entry is
 * testimony thrown away, which is the one outcome worse than a failed save.
 */
export function sailEntriesToSubmit(entries: readonly SailEntryDraft[]): SubmitSailEntry[] {
  return byTime(entries).map((entry) => {
    const refusal = refuseSailEntry(entry)
    if (refusal || entry.reef === null) {
      throw new TypeError(`a Sail Configuration was sent half-finished: ${refusal ?? 'no reef'}`)
    }

    return { at: wallClockStamp(entry.at), reef: entry.reef, sail_ids: [...entry.sail_ids] }
  })
}

/** The same, for the Sea State. */
export function seaStateEntriesToSubmit(
  entries: readonly SeaStateEntryDraft[]
): SubmitSeaStateEntry[] {
  return byTime(entries).map((entry) => {
    if (entry.sea_state === null) {
      throw new TypeError('a Sea State reading was sent with nothing stated')
    }

    return { at: wallClockStamp(entry.at), sea_state: entry.sea_state }
  })
}

/**
 * Why this Testimony cannot be written, or null — asked of a payload, not of a draft.
 *
 * Every one of these is also a database constraint, and that is the point: the wizard cannot be the
 * thing that enforces them, because a Server Action is a public endpoint reachable without it. This
 * runs *before* the bytes move (ADR 0013), so a payload nobody's wizard produced is refused with a
 * sentence instead of leaving orphaned bytes behind a constraint name.
 *
 * Two empty lists are not a refusal. They are a race whose sails and water were not recorded, which
 * is legal and ordinary (ADR 0010).
 */
export function refuseAnnotations(
  sails: readonly SubmitSailEntry[],
  seaState: readonly SubmitSeaStateEntry[],
  inventorySailIds: readonly string[]
): string | null {
  const times = (kind: string, entries: readonly { at: string }[]): string | null => {
    const seen = new Set<string>()

    for (const entry of entries) {
      try {
        wallClockSeconds(entry.at)
      } catch {
        return `${entry.at} is not a time in this recording’s own clock.`
      }

      // Compared as seconds, so `19:01:00` and `19:01:00` written with a space and a `T` are the one
      // instant they are — which is what `UNIQUE (race_id, at)` would say about them at insert.
      const key = String(wallClockSeconds(entry.at))
      if (seen.has(key)) return `Two ${kind} entries are at the same time.`
      seen.add(key)
    }

    return null
  }

  const sailTimes = times('sail', sails)
  if (sailTimes) return sailTimes

  const seaTimes = times('sea state', seaState)
  if (seaTimes) return seaTimes

  for (const entry of sails) {
    if (entry.sail_ids.length === 0) {
      return 'A sail plan has to name at least one sail.'
    }

    if (new Set(entry.sail_ids).size !== entry.sail_ids.length) {
      return 'A sail plan names the same sail twice.'
    }

    for (const sailId of entry.sail_ids) {
      if (!inventorySailIds.includes(sailId)) {
        return 'A sail plan names a sail that is not in the boat’s inventory.'
      }
    }

    if (!REEF_VALUES.includes(entry.reef)) {
      return `${entry.reef} is not a Reef State.`
    }
  }

  for (const entry of seaState) {
    if (!SEA_STATE_VALUES.includes(entry.sea_state)) {
      return `${entry.sea_state} is not a Sea State.`
    }
  }

  return null
}
