import type { SailChoice } from '@/types'

/**
 * Which of the boat's sails a picker may offer, which is a question about a date and not about now.
 *
 * Pure, and in its own module rather than beside `readSails`, because the wizard is a client component
 * and `readSails` reaches for the server's Supabase client. A shared module would pull `next/headers`
 * into the browser bundle.
 */

/**
 * The sails a race on this day could have been flying, plus any already named.
 *
 * A sail retired on the 1st was flown on the 31st, so the picker for a race in August offers what
 * was in the locker in August. Already-chosen sails are kept regardless: a set that has been stated
 * is testimony, and a chip that vanished from under it would be a set the sailor could no longer
 * read or unpick.
 *
 * `day` is a calendar date in the recording's own frame — `YYYY-MM-DD`, the first ten characters of
 * a stamp — compared as text, which is what an ISO date sorts as anyway.
 */
export function sailsAvailableOn(
  sails: readonly SailChoice[],
  day: string,
  chosenIds: readonly string[] = []
): SailChoice[] {
  return sails.filter(
    (sail) =>
      sail.retired_on === null || sail.retired_on >= day || chosenIds.includes(sail.id)
  )
}
