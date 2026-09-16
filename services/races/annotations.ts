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
 * — `sail_entry_says_something`, `UNIQUE (race_id, at)` per kind, and the composite key from
 * `(crossover_chart_version_id, definition_number)` into the chosen Version's Sail Definitions.
 * Three enforcements, one set of rules, so the sentence the sailor reads cannot drift from the
 * constraint that would have fired.
 *
 * A Sail Configuration names one Sail Definition of one Crossover Chart Version — the chart's own
 * vocabulary, and the only one Layline has (ADR 0023) — or, when the boat flew something the chart
 * does not name, a note instead.
 *
 * A draft works in absolute seconds of the recording's own naive frame, because that is the axis the
 * charts are tapped on; a submission works in stamps, because that is what a `timestamp` column
 * takes. Neither is bounded by the Race Window: the sails were set before the start.
 */

import { nearestRowIndex } from '@/services/recordings/race-window'
import { wallClockSeconds, wallClockStamp } from '@/services/recordings/wall-clock'
import type {
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

const SEA_STATE_VALUES: readonly string[] = SEA_STATES.map((each) => each.value)

/**
 * The lookup every screen that states a Sea State needs, in one place.
 *
 * It lives here because a stored value whose label has gone missing is the one case worth agreeing
 * on: five call sites each writing `?? '—'` or `?? '?'` is five different answers to *this race says
 * something this build does not recognise*, and the wizard's summary once disagreed with the race
 * page about the same entry. The fallback is the stored value itself, which at least names what the
 * database holds and is the only honest thing left to say.
 *
 * There is deliberately no equivalent for a sail. A Sail Configuration's words are the Crossover
 * Chart Version's own, read back from `crossover_sail_definitions` for the Version the Race points
 * at, and no table in this build could supply them (ADR 0023).
 */
export function seaStateLabel(value: SeaState | string): string {
  return SEA_STATES.find((each) => each.value === value)?.label ?? value
}

/**
 * A note as text: trimmed, and `''` where there is none.
 *
 * One answer to "is there a note", because the same fact arrives in three shapes — a draft's `note` is
 * a string the field is bound to, a stored row's is nullable, a payload's is nullable and already
 * trimmed — and each was being written its own way. The spaces a phone keyboard added are not the
 * note, and `sail_entry_note_non_empty` refuses the empty string outright, so *blank* and *absent*
 * have to mean the one thing everywhere or `sail_entry_says_something` fires on an entry the wizard
 * thought was finished.
 */
export function noteText(note: string | null | undefined): string {
  return note?.trim() ?? ''
}

/**
 * A sail's words with the note beside them: one order, one separator.
 *
 * Two screens say this about different things — the wizard about a draft, whose label comes from the
 * chosen Version's chips, and the race page about a stored entry, whose label was resolved at read.
 * What they must not do is disagree about the shape, which is the drift `seaStateLabel` above exists
 * to prevent for the Sea State. Neither one uses this for a note-only entry: that reads as what was
 * written and nothing else, because the nearest Definition's words would be Layline naming a sail the
 * sailor deliberately did not name (ADR 0023).
 */
export function sailWithNote(label: string, note: string): string {
  return note === '' ? label : `${label} · ${note}`
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
 * A new Sail Configuration at `at`, with nothing selected.
 *
 * Nothing is carried forward from the entry before it, and that is ADR 0023's doing rather than an
 * omission: a Configuration used to be a set of sails plus a Reef State, where inheriting turned a
 * single swap from seven chip taps into two. It is now one Sail Definition, so the new entry *is*
 * the change — seeding it with the previous Definition would pre-select the sail the sailor is about
 * to replace, and an entry saved unchanged would be testimony that nothing happened at a time
 * somebody said it did.
 */
export function newSailEntry(at: number, key: string): SailEntryDraft {
  return { key, at, definition_number: null, note: '' }
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
 * Why this Sail Configuration cannot be saved yet, or null.
 *
 * One refusal, because there is one thing to say: which sail was up. A Definition from the chart
 * answers it, and so does a note when the boat flew something the chart does not name — which is
 * why “Something else” with an empty note is still an entry nobody has started rather than a
 * separate mistake. `sail_entry_says_something` says the same thing at insert.
 */
export function refuseSailEntry(entry: SailEntryDraft): string | null {
  if (entry.definition_number === null && noteText(entry.note) === '') {
    return 'Say which sail was up — pick one from the chart, or pick “Something else” and write a note.'
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
    if (refusal) {
      throw new TypeError(`a Sail Configuration was sent half-finished: ${refusal}`)
    }

    const note = noteText(entry.note)

    return {
      at: wallClockStamp(entry.at),
      definition_number: entry.definition_number,
      // Null rather than '': a blank field is no note, and `sail_entry_note_non_empty` refuses the
      // empty string outright.
      note: note === '' ? null : note,
    }
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
 *
 * `definitionNumbers` is every number the Crossover Chart Version this Race points at defines — the
 * vocabulary the sails are named in — or **null** when the Race points at no Version at all. Null is
 * a legitimate answer (ADR 0012) and one in which no Sail Configuration can exist: with no chart
 * there is nothing to say a sail in, which is what `crossover_chart_version_id NOT NULL` and
 * `races_id_crossover_chart_version_key` make structural rather than documented.
 */
export function refuseAnnotations(
  sails: readonly SubmitSailEntry[],
  seaState: readonly SubmitSeaStateEntry[],
  definitionNumbers: readonly number[] | null
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

  if (definitionNumbers === null && sails.length > 0) {
    return 'A sail is named in a Crossover Chart Version’s own words, and this race records no Version.'
  }

  for (const entry of sails) {
    const note = noteText(entry.note)

    if (entry.definition_number === null && note === '') {
      return 'A Sail Configuration has to name a sail from the chart or say what was up instead.'
    }

    if (entry.definition_number !== null) {
      if (!Number.isInteger(entry.definition_number) || !definitionNumbers?.includes(entry.definition_number)) {
        return `${entry.definition_number} is not a sail this Crossover Chart Version defines.`
      }
    }
  }

  for (const entry of seaState) {
    if (!SEA_STATE_VALUES.includes(entry.sea_state)) {
      return `${entry.sea_state} is not a Sea State.`
    }
  }

  return null
}
