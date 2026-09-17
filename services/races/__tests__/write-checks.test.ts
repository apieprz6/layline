/**
 * The two questions both race-writing actions ask, and the reason they ask them of one module.
 *
 * Filing a race and amending one are the same flow with the File step taken out (ADR 0010 Amendment 1),
 * and that has to hold on the server too: a window refusal a sailor met while uploading and did not meet
 * while amending would be a second, laxer rule reachable through a different door. So what is tested
 * here is the *content* of each refusal — the sentence, word for word — because the sentence is what
 * both callers promise to say, and `[raceId]/__tests__/actions.test.ts` asserts these same words come
 * back out of `amendRace`.
 *
 * Neither check is the authority. `races_window_ordered`, the deferred `races_window_intersects_rows`
 * and `race_sail_entries_definition_fkey` refuse all of this again in the database. These exist so a
 * sailor is answered with a sentence rather than a constraint name.
 */

import { chartDefinitionNumbers, raceWindowRefusal } from '../write-checks'

/** Five rows a minute apart from 19:00, in the recording's own naive frame. */
const ROW_SECONDS = [0, 1, 2, 3, 4].map(
  (minute) => Date.UTC(2026, 5, 3, 19, minute, 0) / 1000
)

function windowOf(start: string, finish: string): { window_start: string; window_finish: string } {
  return { window_start: start, window_finish: finish }
}

describe('raceWindowRefusal', () => {
  it('passes a window with rows in it', () => {
    expect(
      raceWindowRefusal(windowOf('2026-06-03T19:01:00', '2026-06-03T19:03:00'), ROW_SECONDS)
    ).toBeNull()
  })

  it('refuses a finish that is not after its start, and says which handle to move', () => {
    // The words are the claim. Both actions hand this sentence straight to the sailor, so a rewording
    // here is a rewording in both places at once — which is the point of there being one place.
    expect(
      raceWindowRefusal(windowOf('2026-06-03T19:03:00', '2026-06-03T19:01:00'), ROW_SECONDS)
    ).toBe(
      'The finish has to come after the start. Drag the right-hand handle later, or type a finish ' +
        'time further on.'
    )
  })

  it('refuses a finish equal to its start, which is a window holding no time at all', () => {
    expect(
      raceWindowRefusal(windowOf('2026-06-03T19:01:00', '2026-06-03T19:01:00'), ROW_SECONDS)
    ).toMatch(/^The finish has to come after the start/)
  })

  it('refuses a window with no recorded row in it, and says to widen rather than blaming the file', () => {
    expect(
      raceWindowRefusal(windowOf('2026-06-03T21:00:00', '2026-06-03T22:00:00'), ROW_SECONDS)
    ).toBe(
      'There are no recorded rows between those two times, so there is no race in there to save. ' +
        'Widen the window until the track lights up.'
    )
  })

  it('accepts a window over rows the stored one excluded, which is what amending is for', () => {
    // Asked against every row of the recording and not the rows inside the old window. A list cropped
    // to the stored window would refuse exactly the correction a sailor opened the flow to make.
    expect(
      raceWindowRefusal(windowOf('2026-06-03T18:59:00', '2026-06-03T19:01:00'), ROW_SECONDS)
    ).toBeNull()
  })

  it('refuses a stamp that is not a time in the recording’s own clock', () => {
    // An offset, a fractional second, or a half-typed field arriving from something that is not the
    // flow. Refused as a bad request rather than thrown, because a throw here reads as a broken archive.
    expect(raceWindowRefusal(windowOf('2026-06-03T19:01:00+05:00', 'later'), ROW_SECONDS)).toBe(
      'Those are not two times in this recording’s own clock. Set the window again.'
    )
  })

  it('refuses every window over a recording with no rows to be in', () => {
    expect(raceWindowRefusal(windowOf('2026-06-03T19:01:00', '2026-06-03T19:03:00'), [])).toMatch(
      /no recorded rows between those two times/
    )
  })
})

/** A `crossover_sail_definitions` that answers one query, and remembers which Version was asked for. */
function client(options: { rows?: { number: number }[]; error?: { message: string } } = {}) {
  const asked: unknown[] = []
  const tables: string[] = []

  const supabase = {
    from: (table: string) => {
      tables.push(table)
      return {
        select: () => ({
          eq: (_column: string, value: unknown) => {
            asked.push(value)
            return {
              returns: async () =>
                options.error
                  ? { data: null, error: options.error }
                  : { data: options.rows ?? [], error: null },
            }
          },
        }),
      }
    },
  }

  return {
    supabase: supabase as unknown as Parameters<typeof chartDefinitionNumbers>[0],
    asked,
    tables,
  }
}

describe('chartDefinitionNumbers', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('answers “no Version, no vocabulary” without asking the database anything', async () => {
    // A race that records no Crossover Chart Version is legitimate (ADR 0012) — nine races in this
    // archive predate every chart the boat has — and it is a race in which no sail can be named.
    const fake = client()

    expect(await chartDefinitionNumbers(fake.supabase, null)).toEqual({
      state: 'known',
      numbers: null,
    })
    expect(fake.tables).toEqual([])
  })

  it('reads the Version the Race names, not the chart in force now', async () => {
    // ADR 0012: a pointer is resolved by id and never by date. A superseded Version is exactly what an
    // archived race is stated in, and reading the current chart's numbers instead would refuse the
    // sails the race actually flew.
    const fake = client({ rows: [{ number: 1 }, { number: 3 }, { number: 7 }] })

    expect(await chartDefinitionNumbers(fake.supabase, 'chart-v1')).toEqual({
      state: 'known',
      numbers: [1, 3, 7],
    })
    expect(fake.asked).toEqual(['chart-v1'])
    expect(fake.tables).toEqual(['crossover_sail_definitions'])
  })

  it('calls a Version with no Definitions unknown, because no Version legitimately has none', async () => {
    // `mint_boat_setup_version` refuses a Crossover Chart Version that defines no sail, so an empty
    // vocabulary from a read that succeeded means the id names no Version this account can read.
    const fake = client({ rows: [] })

    expect(await chartDefinitionNumbers(fake.supabase, 'chart-nope')).toEqual({ state: 'unknown' })
  })

  it('keeps a failed read distinct from both, and says so in the log', async () => {
    // The distinction the two callers need: a failed read says nothing about the pointer either way, so
    // it is only fatal where a sail depends on it. Folded into `unknown` it would tell a sailor their
    // chart Version had been deleted.
    const fake = client({ error: { message: 'connection reset' } })

    expect(await chartDefinitionNumbers(fake.supabase, 'chart-v1')).toEqual({ state: 'unreadable' })
    expect(consoleError).toHaveBeenCalledWith(
      'Race: the chart’s Sail Definitions could not be read:',
      'connection reset'
    )
  })
})
