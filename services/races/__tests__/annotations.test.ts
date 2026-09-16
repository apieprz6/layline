/**
 * What an Annotation is allowed to be, and where a tap puts one.
 *
 * An Annotation is Testimony (ADR 0008, ADR 0010): neither measured nor computed, so nothing here
 * fills a gap in with a plausible value. That shows up as three properties this suite is the record
 * of — nothing is pre-selected, an empty list is legal and means the race is not remembered, and a
 * new entry inherits the *previous* entry rather than a default.
 *
 * Placement is ADR 0014's: a tap snaps to a row the recording actually has, and a time already
 * taken steps forward one row, because `(race_id, at)` is unique and two entries a second apart are
 * not something a sailor meant to say.
 *
 * Resolution is ADR 0010's, and it happens *here* rather than on a row: the entry in force is the
 * latest at or before the row's time, falling back to the earliest. Nothing in this module writes
 * an annotation onto a Recording Row.
 */

import {
  SEA_STATES,
  annotationInForce,
  byTime,
  entryInForce,
  newSailEntry,
  newSeaStateEntry,
  noteText,
  placeAnnotationTime,
  refuseAnnotations,
  refuseEntryTimes,
  refuseSailEntry,
  refuseSeaStateEntry,
  sailEntriesToSubmit,
  sailWithNote,
  seaStateEntriesToSubmit,
} from '@/services/races/annotations'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { SailEntryDraft, SeaStateEntryDraft } from '@/types'

/** 19:00:00 to 19:04:00 at a minute's cadence, as everywhere else in these suites. */
const ROWS = [0, 1, 2, 3, 4].map((minute) => wallClockSeconds('2026-06-03T19:00:00') + minute * 60)

const at = (stamp: string): number => wallClockSeconds(stamp)

/** The numbers one Crossover Chart Version defines. Not 1..n: the chart numbers its own sails. */
const DEFINED = [1, 2, 3, 7]

const sailEntry = (parts: Partial<SailEntryDraft>): SailEntryDraft => ({
  key: 'k',
  at: ROWS[0],
  definition_number: 1,
  note: '',
  ...parts,
})

describe('where a tap puts an entry', () => {
  it('snaps to the nearest row the recording actually has', () => {
    // 19:01:20 is not a recorded time. A sailor tapping there means "about then", and the entry has
    // to land on a row so the marker sits where they tapped rather than between two samples.
    expect(placeAnnotationTime(ROWS, at('2026-06-03T19:01:20'), [])).toBe(at('2026-06-03T19:01:00'))
  })

  it('steps forward one row when the row it landed on is already taken', () => {
    // `race_sail_entries` is UNIQUE (race_id, at), so a second entry on the same row is a database
    // error after the bytes have moved. Stepping forward is also what a sailor tapping the same
    // place twice means: another change, just after the last one.
    expect(placeAnnotationTime(ROWS, at('2026-06-03T19:01:00'), [ROWS[1]])).toBe(ROWS[2])
  })

  it('keeps stepping while the next row is taken too', () => {
    expect(placeAnnotationTime(ROWS, ROWS[1], [ROWS[1], ROWS[2], ROWS[3]])).toBe(ROWS[4])
  })

  it('steps backwards when there is no free row after the tap', () => {
    // A tap at the end of a busy race still has to land somewhere, and the row before it is nearer
    // to what was meant than a refusal is useful.
    expect(placeAnnotationTime(ROWS, ROWS[4], [ROWS[3], ROWS[4]])).toBe(ROWS[2])
  })

  it('has nowhere to put an entry when every row is taken', () => {
    expect(placeAnnotationTime(ROWS, ROWS[2], ROWS)).toBeNull()
  })

  it('has nowhere to put an entry when the recording has no rows', () => {
    // Unreachable through the wizard — the parse refuses a file with no rows — but the alternative
    // to null here is an entry at the epoch.
    expect(placeAnnotationTime([], ROWS[0], [])).toBeNull()
  })
})

describe('what a new entry starts as', () => {
  it('starts with nothing selected, whatever was up before it', () => {
    // Nothing is carried forward any more, and that is ADR 0023's doing rather than an omission. A
    // Sail Configuration is now one Definition, so a new entry *is* the change: seeding it with the
    // previous Definition would pre-select the sail the sailor is about to replace, and an entry
    // saved unchanged would be testimony that nothing happened at a time somebody said it did.
    const entries = [sailEntry({ key: 'a', at: ROWS[0], definition_number: 3 })]

    expect(newSailEntry(ROWS[2], 'b')).toEqual({
      key: 'b',
      at: ROWS[2],
      definition_number: null,
      note: '',
    })
    // And the earlier entry is untouched by the reading of it.
    expect(entries[0].definition_number).toBe(3)
  })

  it('starts a sea state entry with nothing stated', () => {
    expect(newSeaStateEntry(ROWS[0], 'a')).toEqual({ key: 'a', at: ROWS[0], sea_state: null })
  })
})

describe('what a half-finished entry is refused for', () => {
  it('refuses an entry that says nothing at all', () => {
    // `sail_entry_says_something` says the same thing in the database. This is the sentence the
    // sailor reads instead of the CHECK's name.
    const refusal = refuseSailEntry(sailEntry({ definition_number: null, note: '' }))

    expect(refusal).toContain('sail')
  })

  it('refuses “something else” with no note, because the note is the whole of what it said', () => {
    expect(refuseSailEntry(sailEntry({ definition_number: null, note: '   ' }))).toContain('note')
  })

  it('accepts an entry that names a Definition', () => {
    expect(refuseSailEntry(sailEntry({ definition_number: 7, note: '' }))).toBeNull()
  })

  it('accepts an entry that is nothing but a note', () => {
    // The chart does not name everything the boat has ever flown, and a race sailed under the
    // delivery main is still a race worth remembering (ADR 0023).
    expect(
      refuseSailEntry(sailEntry({ definition_number: null, note: 'the old delivery main' }))
    ).toBeNull()
  })

  it('accepts a note beside a Definition', () => {
    expect(refuseSailEntry(sailEntry({ definition_number: 2, note: 'jib was blown out' }))).toBeNull()
  })

  it('refuses a sea state entry with nothing stated', () => {
    expect(refuseSeaStateEntry({ key: 'a', at: ROWS[0], sea_state: null })).toContain('water')
  })

  it('accepts a sea state entry that says what the water was doing', () => {
    expect(refuseSeaStateEntry({ key: 'a', at: ROWS[0], sea_state: 'calm' })).toBeNull()
  })

  it('refuses two entries at one time, which is what a tap avoids and a typed time can reach', () => {
    // Placement steps forward off a taken row, so a tap cannot collide. The datetime field and the
    // nudges can — and `UNIQUE (race_id, at)` fires inside the transaction, after the bytes have
    // moved (ADR 0013), so the wizard has to be able to ask first.
    const collided = [sailEntry({ key: 'a' }), sailEntry({ key: 'b' })]

    expect(refuseEntryTimes(collided)).toContain('same time')
  })

  it('accepts a list whose times are all its own, and an empty one', () => {
    expect(refuseEntryTimes([sailEntry({ key: 'a', at: ROWS[0] }), sailEntry({ key: 'b', at: ROWS[1] })])).toBeNull()
    expect(refuseEntryTimes([])).toBeNull()
  })
})

describe('resolution, which happens at read and never on a row', () => {
  const entries = [
    sailEntry({ key: 'b', at: ROWS[3], definition_number: 3 }),
    sailEntry({ key: 'a', at: ROWS[1], definition_number: 2 }),
  ]

  it('resolves to the latest entry at or before the time', () => {
    expect(entryInForce(entries, ROWS[2])?.key).toBe('a')
    expect(entryInForce(entries, ROWS[4])?.key).toBe('b')
  })

  it('counts an entry exactly on the time as in force', () => {
    expect(entryInForce(entries, ROWS[3])?.key).toBe('b')
  })

  it('falls back to the earliest entry for a row before any of them', () => {
    // The sails were up before the sailor got round to saying so. The earliest testimony is the
    // best answer for the first rows of the race, and it is still testimony.
    expect(entryInForce(entries, ROWS[0])?.key).toBe('a')
  })

  it('resolves to nothing at all when the list is empty', () => {
    expect(entryInForce([], ROWS[0])).toBeNull()
  })

  it('resolves stamps the same way, for a page reading stored annotations', () => {
    const stored = [
      { at: '2026-06-03 19:03:00', sea_state: 'moderate' as const },
      { at: '2026-06-03 19:01:00', sea_state: 'calm' as const },
    ]

    expect(annotationInForce(stored, '2026-06-03T19:02:00')?.sea_state).toBe('calm')
    expect(annotationInForce(stored, '2026-06-03T19:00:00')?.sea_state).toBe('calm')
    expect(annotationInForce(stored, '2026-06-03T19:04:00')?.sea_state).toBe('moderate')
  })

  it('orders a list by time, earliest first, whatever order it was built in', () => {
    expect(byTime(entries).map((entry) => entry.key)).toEqual(['a', 'b'])
  })

  it('leaves the given list alone', () => {
    const held = [sailEntry({ key: 'b', at: ROWS[3] }), sailEntry({ key: 'a', at: ROWS[1] })]
    byTime(held)
    expect(held.map((entry) => entry.key)).toEqual(['b', 'a'])
  })
})

describe('what gets sent', () => {
  it('sends stamps in the recording own naive frame, earliest first', () => {
    const entries = [
      sailEntry({ key: 'b', at: ROWS[3], definition_number: 7 }),
      sailEntry({ key: 'a', at: ROWS[1], definition_number: 2 }),
    ]

    expect(sailEntriesToSubmit(entries)).toEqual([
      { at: '2026-06-03T19:01:00', definition_number: 2, note: null },
      { at: '2026-06-03T19:03:00', definition_number: 7, note: null },
    ])
  })

  it('sends a blank note as no note, and trims the one that was written', () => {
    // `sail_entry_note_non_empty` refuses '' outright, and a note wrapped in the spaces a phone
    // keyboard added is the note the sailor wrote.
    expect(
      sailEntriesToSubmit([
        sailEntry({ key: 'a', at: ROWS[0], definition_number: null, note: '  delivery main ' }),
        sailEntry({ key: 'b', at: ROWS[1], definition_number: 2, note: '   ' }),
      ])
    ).toEqual([
      { at: '2026-06-03T19:00:00', definition_number: null, note: 'delivery main' },
      { at: '2026-06-03T19:01:00', definition_number: 2, note: null },
    ])
  })

  it('sends an empty list as an empty list', () => {
    // Submitting with nothing annotated is legal, and the race's page will say the sail plan was
    // not recorded (ADR 0010).
    expect(sailEntriesToSubmit([])).toEqual([])
    expect(seaStateEntriesToSubmit([])).toEqual([])
  })

  it('refuses to send a half-finished entry', () => {
    // The wizard will not arm Save while one exists, so reaching this is a bug rather than a
    // sailor's mistake — and a silently dropped entry would be testimony thrown away.
    expect(() =>
      sailEntriesToSubmit([sailEntry({ definition_number: null, note: '' })])
    ).toThrow(/sail/i)
  })

  it('sends sea state entries as stamps, earliest first', () => {
    const entries: SeaStateEntryDraft[] = [
      { key: 'b', at: ROWS[2], sea_state: 'rough' },
      { key: 'a', at: ROWS[0], sea_state: 'slight' },
    ]

    expect(seaStateEntriesToSubmit(entries)).toEqual([
      { at: '2026-06-03T19:00:00', sea_state: 'slight' },
      { at: '2026-06-03T19:02:00', sea_state: 'rough' },
    ])
  })
})

describe('what the server refuses, because a Server Action is a public endpoint', () => {
  const good = { at: '2026-06-03T19:01:00', definition_number: 1, note: null }

  it('accepts two empty lists', () => {
    expect(refuseAnnotations([], [], DEFINED)).toBeNull()
  })

  it('accepts stated testimony', () => {
    expect(
      refuseAnnotations([good], [{ at: '2026-06-03T19:00:00', sea_state: 'calm' }], DEFINED)
    ).toBeNull()
  })

  it('refuses an entry that says neither a Definition nor a note', () => {
    expect(
      refuseAnnotations([{ ...good, definition_number: null }], [], DEFINED)
    ).toContain('sail')
  })

  it('accepts an entry that is only a note', () => {
    expect(
      refuseAnnotations([{ ...good, definition_number: null, note: 'delivery main' }], [], DEFINED)
    ).toBeNull()
  })

  it('refuses a note that is nothing but whitespace', () => {
    // `sail_entry_note_non_empty`, and a submission is not a draft: '   ' reaching here means
    // something other than the wizard sent it.
    expect(
      refuseAnnotations([{ ...good, definition_number: null, note: '   ' }], [], DEFINED)
    ).toContain('sail')
  })

  it('refuses a Definition the chosen Version never defined', () => {
    // `race_sail_entries_definition_fkey` is a composite key, so this is refused at insert too —
    // after the bytes have moved, which is the reason to ask first (ADR 0013).
    expect(refuseAnnotations([{ ...good, definition_number: 4 }], [], DEFINED)).toContain(
      'Crossover Chart'
    )
  })

  it('refuses a Definition number that is not a whole number', () => {
    expect(refuseAnnotations([{ ...good, definition_number: 1.5 }], [], DEFINED)).toContain(
      'Crossover Chart'
    )
  })

  it('refuses any sail at all when the Race names no Crossover Chart Version', () => {
    // No vocabulary, nothing to say a sail in. The RPC raises the same refusal, and
    // `races_id_crossover_chart_version_key` makes it structural.
    expect(refuseAnnotations([good], [], null)).toContain('Crossover Chart')
  })

  it('still accepts an empty sail list when the Race names no Version', () => {
    expect(refuseAnnotations([], [{ at: good.at, sea_state: 'calm' }], null)).toBeNull()
  })

  it('refuses two entries of one kind at the same time', () => {
    // UNIQUE (race_id, at), and the wizard's stepping-forward is what normally makes it impossible.
    expect(
      refuseAnnotations([good, { ...good, definition_number: 2 }], [], DEFINED)
    ).toContain('same time')
  })

  it('allows a sail entry and a sea state entry at the same time', () => {
    expect(refuseAnnotations([good], [{ at: good.at, sea_state: 'slight' }], DEFINED)).toBeNull()
  })

  it('refuses a time that is not a stamp in the recording clock', () => {
    expect(refuseAnnotations([{ ...good, at: '2026-06-03T19:01:00Z' }], [], DEFINED)).toContain(
      'clock'
    )
  })

  it('refuses a Sea State that is not one of the four', () => {
    expect(
      refuseAnnotations([], [{ at: good.at, sea_state: 'choppy' as unknown as 'calm' }], DEFINED)
    ).toContain('Sea State')
  })
})

describe('the words on the chips', () => {
  it('offers the four Sea States, with the heights that distinguish them', () => {
    expect(SEA_STATES.map((each) => each.value)).toEqual(['calm', 'slight', 'moderate', 'rough'])
    expect(SEA_STATES.map((each) => each.height)).toEqual(['0–1 ft', '1–2 ft', '2–3 ft', '3+ ft'])
  })

  it('never calls it a wave state', () => {
    const words = SEA_STATES.map((each) => each.label)
    expect(words.join(' ').toLowerCase()).not.toContain('wave')
  })
})

describe('one answer about a note, for the three shapes it arrives in', () => {
  it('reads blank, absent and whitespace as the same nothing', () => {
    // A draft's note is a bound string, a stored row's is nullable, and each was asked its own way.
    // The three have to agree, because `sail_entry_note_non_empty` refuses the empty string and
    // `sail_entry_says_something` then fires on an entry the wizard believed was finished.
    expect(noteText('')).toBe('')
    expect(noteText(null)).toBe('')
    expect(noteText(undefined)).toBe('')
    expect(noteText('   ')).toBe('')
  })

  it('keeps the words and drops the keyboard’s spaces', () => {
    expect(noteText('  jib was blown out ')).toBe('jib was blown out')
  })

  it('states a sail and its note in one order, with one separator', () => {
    // The wizard says this about a draft and the race page about a stored entry. They may disagree
    // about where the label came from; they may not disagree about the shape.
    expect(sailWithNote('Main + Jib 1', 'jib was blown out')).toBe(
      'Main + Jib 1 · jib was blown out'
    )
    expect(sailWithNote('Main + Jib 1', '')).toBe('Main + Jib 1')
  })
})
