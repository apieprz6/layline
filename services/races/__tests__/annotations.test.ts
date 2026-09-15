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
  REEF_STATES,
  SEA_STATES,
  annotationInForce,
  byTime,
  carriedConfiguration,
  entryInForce,
  newSailEntry,
  newSeaStateEntry,
  placeAnnotationTime,
  refuseAnnotations,
  refuseEntryTimes,
  refuseSailEntry,
  refuseSeaStateEntry,
  sailEntriesToSubmit,
  seaStateEntriesToSubmit,
  toggleSail,
} from '@/services/races/annotations'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { SailEntryDraft, SeaStateEntryDraft } from '@/types'

/** 19:00:00 to 19:04:00 at a minute's cadence, as everywhere else in these suites. */
const ROWS = [0, 1, 2, 3, 4].map((minute) => wallClockSeconds('2026-06-03T19:00:00') + minute * 60)

const at = (stamp: string): number => wallClockSeconds(stamp)

/** The boat's own sails, in inventory order, by id. */
const INVENTORY = ['id-main', 'id-jib-1', 'id-jib-2', 'id-A2', 'id-A3', 'id-A4']

const sailEntry = (parts: Partial<SailEntryDraft>): SailEntryDraft => ({
  key: 'k',
  at: ROWS[0],
  sail_ids: ['id-main'],
  reef: 'full',
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
  it('carries the previous configuration forward, so one swap is two chip taps', () => {
    const entries = [
      sailEntry({ key: 'a', at: ROWS[0], sail_ids: ['id-main', 'id-jib-2'], reef: 'full' }),
    ]

    const placed = newSailEntry(entries, ROWS[2], 'b')

    expect(placed.sail_ids).toEqual(['id-main', 'id-jib-2'])
    expect(placed.reef).toBe('full')
  })

  it('carries the entry in force, not the last one in the array', () => {
    const entries = [
      sailEntry({ key: 'b', at: ROWS[3], sail_ids: ['id-main', 'id-A2'], reef: 'reef-1' }),
      sailEntry({ key: 'a', at: ROWS[0], sail_ids: ['id-main', 'id-jib-2'], reef: 'full' }),
    ]

    // Placed between the two, so the previous configuration is the 19:00 one — whatever order the
    // list happens to be held in.
    expect(newSailEntry(entries, ROWS[1], 'c').sail_ids).toEqual(['id-main', 'id-jib-2'])
  })

  it('copies the set rather than sharing it, so editing the new entry cannot rewrite the old one', () => {
    const first = sailEntry({ key: 'a', at: ROWS[0], sail_ids: ['id-main'], reef: 'full' })
    const second = newSailEntry([first], ROWS[1], 'b')

    second.sail_ids.push('id-A2')

    expect(first.sail_ids).toEqual(['id-main'])
  })

  it('starts the first entry with nothing selected at all', () => {
    // The mockup's index-based pre-selection is the same failure as `ndbc.ts:395`'s
    // `wind_direction ?? 0`: a value nobody stated, indistinguishable from one somebody did.
    const first = newSailEntry([], ROWS[0], 'a')

    expect(first.sail_ids).toEqual([])
    expect(first.reef).toBeNull()
  })

  it('carries nothing into an entry placed before every other one', () => {
    // There is no previous configuration to inherit, and the *next* one is not testimony about the
    // time before it.
    const entries = [sailEntry({ key: 'a', at: ROWS[3], sail_ids: ['id-main'], reef: 'reef-1' })]

    expect(newSailEntry(entries, ROWS[0], 'b')).toMatchObject({ sail_ids: [], reef: null })
  })

  it('starts a sea state entry with nothing stated', () => {
    expect(newSeaStateEntry(ROWS[0], 'a')).toEqual({ key: 'a', at: ROWS[0], sea_state: null })
  })

  it('carries nothing from an empty list', () => {
    expect(carriedConfiguration([], ROWS[0])).toEqual({ sail_ids: [], reef: null })
  })
})

describe('a Sail Configuration is a set', () => {
  it('adds a sail in inventory order however it was tapped', () => {
    // The chips read main, jib, kite. A set stored in tap order would render as A2 + main on one
    // entry and main + A2 on the next, which reads as two different sail plans.
    expect(toggleSail(['id-A2'], 'id-main', INVENTORY)).toEqual(['id-main', 'id-A2'])
  })

  it('removes a sail that is already up', () => {
    expect(toggleSail(['id-main', 'id-A2'], 'id-A2', INVENTORY)).toEqual(['id-main'])
  })

  it('never holds the same sail twice', () => {
    expect(toggleSail(['id-main'], 'id-main', INVENTORY)).toEqual([])
  })

  it('leaves the given set alone', () => {
    const held = ['id-main']
    toggleSail(held, 'id-A2', INVENTORY)
    expect(held).toEqual(['id-main'])
  })
})

describe('what a half-finished entry is refused for', () => {
  it('refuses a sail entry that names no sails', () => {
    // The database says so too, at commit, through `race_sail_entries_non_empty`. This is the
    // sentence the sailor reads instead of the trigger's.
    const refusal = refuseSailEntry(sailEntry({ sail_ids: [] }))

    expect(refusal).toContain('sail')
  })

  it('refuses a sail entry that does not say whether the main was reefed', () => {
    expect(refuseSailEntry(sailEntry({ reef: null }))).toContain('main')
  })

  it('reports the missing sails before the missing Reef State', () => {
    expect(refuseSailEntry(sailEntry({ sail_ids: [], reef: null }))).toContain('sail')
  })

  it('accepts an entry naming the main alone', () => {
    // A Sail Configuration may be as small as the main: CONTEXT.md, and 08-26-26-beer-can's
    // sixth change.
    expect(refuseSailEntry(sailEntry({ sail_ids: ['id-main'], reef: 'full' }))).toBeNull()
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
    sailEntry({ key: 'b', at: ROWS[3], sail_ids: ['id-main', 'id-A2'], reef: 'full' }),
    sailEntry({ key: 'a', at: ROWS[1], sail_ids: ['id-main', 'id-jib-2'], reef: 'full' }),
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
      sailEntry({ key: 'b', at: ROWS[3], sail_ids: ['id-main'], reef: 'reef-1' }),
      sailEntry({ key: 'a', at: ROWS[1], sail_ids: ['id-main', 'id-jib-2'], reef: 'full' }),
    ]

    expect(sailEntriesToSubmit(entries)).toEqual([
      { at: '2026-06-03T19:01:00', reef: 'full', sail_ids: ['id-main', 'id-jib-2'] },
      { at: '2026-06-03T19:03:00', reef: 'reef-1', sail_ids: ['id-main'] },
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
    expect(() => sailEntriesToSubmit([sailEntry({ reef: null })])).toThrow(/reef|main/i)
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
  const good = { at: '2026-06-03T19:01:00', reef: 'full' as const, sail_ids: ['id-main'] }

  it('accepts two empty lists', () => {
    expect(refuseAnnotations([], [], INVENTORY)).toBeNull()
  })

  it('accepts stated testimony', () => {
    expect(
      refuseAnnotations([good], [{ at: '2026-06-03T19:00:00', sea_state: 'calm' }], INVENTORY)
    ).toBeNull()
  })

  it('refuses an entry naming no sails', () => {
    expect(refuseAnnotations([{ ...good, sail_ids: [] }], [], INVENTORY)).toContain('sail')
  })

  it('refuses a sail that is not in the boat inventory', () => {
    // `race_sail_entry_sails.sail_id` is a foreign key, so this is refused at insert too — after
    // the bytes have moved, which is the reason to ask first.
    expect(refuseAnnotations([{ ...good, sail_ids: ['id-someone-elses'] }], [], INVENTORY)).toContain(
      'inventory'
    )
  })

  it('refuses the same sail twice in one entry', () => {
    expect(refuseAnnotations([{ ...good, sail_ids: ['id-main', 'id-main'] }], [], INVENTORY)).toContain(
      'twice'
    )
  })

  it('refuses two entries of one kind at the same time', () => {
    // UNIQUE (race_id, at), and the wizard's stepping-forward is what normally makes it impossible.
    expect(refuseAnnotations([good, { ...good, sail_ids: ['id-jib-1'] }], [], INVENTORY)).toContain(
      'same time'
    )
  })

  it('allows a sail entry and a sea state entry at the same time', () => {
    expect(
      refuseAnnotations([good], [{ at: good.at, sea_state: 'slight' }], INVENTORY)
    ).toBeNull()
  })

  it('refuses a time that is not a stamp in the recording clock', () => {
    expect(refuseAnnotations([{ ...good, at: '2026-06-03T19:01:00Z' }], [], INVENTORY)).toContain(
      'clock'
    )
  })

  it('refuses a Reef State that is not one of the two', () => {
    expect(
      refuseAnnotations(
        [{ ...good, reef: 'reef-2' as unknown as typeof good.reef }],
        [],
        INVENTORY
      )
    ).toContain('Reef State')
  })

  it('refuses a Sea State that is not one of the four', () => {
    expect(
      refuseAnnotations(
        [],
        [{ at: good.at, sea_state: 'choppy' as unknown as 'calm' }],
        INVENTORY
      )
    ).toContain('Sea State')
  })
})

describe('the words on the chips', () => {
  it('offers the four Sea States, with the heights that distinguish them', () => {
    expect(SEA_STATES.map((each) => each.value)).toEqual(['calm', 'slight', 'moderate', 'rough'])
    expect(SEA_STATES.map((each) => each.height)).toEqual(['0–1 ft', '1–2 ft', '2–3 ft', '3+ ft'])
  })

  it('never calls it a wave state', () => {
    const words = [...SEA_STATES.map((each) => each.label), ...REEF_STATES.map((each) => each.label)]
    expect(words.join(' ').toLowerCase()).not.toContain('wave')
  })

  it('offers the two Reef States', () => {
    expect(REEF_STATES.map((each) => each.value)).toEqual(['full', 'reef-1'])
  })
})
