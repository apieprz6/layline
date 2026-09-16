/**
 * The two questions a Server Action asks before it writes a Race, wherever the Race came from.
 *
 * Filing a race and amending one are the same flow with the File step taken out (ADR 0010 Amendment
 * 1), and that has to hold on the server too: a window refusal a sailor met while uploading and did
 * not meet while amending would be a second, laxer set of rules reachable by a different door. So both
 * actions ask these, and they ask them of this module rather than each keeping a copy.
 *
 * Neither is the authority. The database refuses both again — `races_window_ordered` and the deferred
 * `races_window_intersects_rows` for the window, `race_sail_entries_definition_fkey` for a Definition
 * number — and that is what makes the refusal true. These exist so a sailor is answered with the
 * sentence written for them in `race-window.ts` or `annotations.ts` instead of a constraint name, and
 * so a request that did not come from the flow at all is answered the same way.
 */

import type { createClient } from '@/lib/supabase/server'
import { raceWindowSeconds, refuseRaceWindow } from '@/services/recordings/race-window'

/**
 * Every Sail Definition number the Race's own Crossover Chart Version defines.
 *
 * Four answers under three states, and they are separate because they call for different sentences.
 * `known` with `numbers` is the vocabulary, and `known` with `numbers: null` is *this race records no
 * chart Version* — legitimate (ADR 0012), and a race in which no Sail Configuration can exist.
 * `unknown` is a read that succeeded and found nothing: `mint_boat_setup_version` refuses a Crossover
 * Chart Version that defines no sail, so no Version legitimately has an empty vocabulary and the id
 * names no Version this account can read. `unreadable` is a failed read, which says nothing about the
 * pointer either way and so is only fatal where a sail depends on it.
 *
 * Read for the Version the sailor named, not for the chart in force now. A Version superseded last
 * winter is exactly what an archived race from the summer before names its sails in (ADR 0012).
 */
export type ChartVocabulary =
  | { state: 'known'; numbers: number[] | null }
  | { state: 'unknown' }
  | { state: 'unreadable' }

export async function chartDefinitionNumbers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  versionId: string | null
): Promise<ChartVocabulary> {
  if (versionId === null) return { state: 'known', numbers: null }

  const { data, error } = await supabase
    .from('crossover_sail_definitions')
    .select('number')
    .eq('version_id', versionId)
    .returns<{ number: number }[]>()

  if (error) {
    console.error('Race: the chart’s Sail Definitions could not be read:', error.message)
    return { state: 'unreadable' }
  }

  const numbers = (data ?? []).map((row) => row.number)

  return numbers.length > 0 ? { state: 'known', numbers } : { state: 'unknown' }
}

/**
 * The window's two refusals, re-asked against the recording's own row times.
 *
 * The two, and only the two (ADR 0009): a finish that is not after its start, and a window holding no
 * recorded row. `rowSeconds` is every row of the recording and not the rows inside the old window —
 * the point of an amendment is often to reach rows the stored window excludes.
 */
export function raceWindowRefusal(
  window: { window_start: string; window_finish: string },
  rowSeconds: readonly number[]
): string | null {
  let seconds: ReturnType<typeof raceWindowSeconds>

  try {
    seconds = raceWindowSeconds(window)
  } catch {
    return 'Those are not two times in this recording’s own clock. Set the window again.'
  }

  return refuseRaceWindow(seconds, rowSeconds)?.message ?? null
}
