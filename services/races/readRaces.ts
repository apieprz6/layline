import { createClient } from '@/lib/supabase/server'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { RaceListEntry } from '@/types'

/**
 * The archive, newest race first, for Boat performance's **Races** tab.
 *
 * No Account is passed in and no Role is consulted: `races` and `recordings` both have a SELECT
 * policy for `authenticated` with no Role test, because Role governs writes only (ADR 0019). So a
 * viewer's list is an admin's list, and the anon key with no session simply returns nothing — which
 * is why the page turns a Guest away before calling this rather than relying on it to (ADR 0015).
 *
 * Ordered by `window_start` descending, which `races_window_start_idx` exists for. That is the
 * race's own date and not the upload's: backfilling thirteen seasons in an afternoon would
 * otherwise list them in the order somebody happened to type them.
 */

/**
 * The filename comes from the Recording, which is the immutable half of the split (ADR 0010) — so
 * this is a to-one embed and not a column that could drift from the file it names.
 */
const RACES_SELECT = 'id, title, window_start, window_finish, recordings!inner(filename)'

/** A row as PostgREST returns it: `recordings` is the to-one embed named above. */
interface RaceRow {
  id: string
  title: string | null
  window_start: string
  window_finish: string
  recordings: { filename: string }
}

/**
 * Every race in the archive, or an empty list.
 *
 * An empty list is what a failed read returns as well as what an empty archive returns, and the two
 * are deliberately the same here: the tab's empty state says no race has been uploaded, which is
 * true either way, and the reason for a failure belongs in the log rather than on a screen a sailor
 * can do nothing about. A partial list is never returned — a race missing from a list of races is a
 * worse answer than a list that is honestly empty.
 */
export async function readRaces(): Promise<RaceListEntry[]> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Races: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return []
  }

  const { data, error } = await supabase
    .from('races')
    .select(RACES_SELECT)
    .order('window_start', { ascending: false })
    .returns<RaceRow[]>()

  if (error) {
    console.error('Races: read failed:', error.message)
    return []
  }

  try {
    return (data ?? []).map((race) => ({
      id: race.id,
      title: race.title,
      window_start: race.window_start,
      window_finish: race.window_finish,
      filename: race.recordings.filename,
      // In the recording's own naive frame, with no conversion in either direction: both bounds
      // are `timestamp` columns and PostgREST renders them with no offset, which is the same
      // digits the file wrote.
      window_seconds:
        wallClockSeconds(race.window_finish) - wallClockSeconds(race.window_start),
    }))
  } catch (thrown: unknown) {
    // A stamp the wall clock cannot read means the column holds something Layline did not write —
    // a fractional second, or an offset. Refusing the whole list is right: the alternative is a
    // list with a race silently missing from it.
    console.error(
      'Races: a window is not a naive wall-clock stamp:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return []
  }
}
