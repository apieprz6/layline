/**
 * PROTOTYPE — the two recordings on the switcher. Its own module because the switcher is a Client
 * Component and `prototype-data.ts` imports `node:fs`.
 *
 * Two races, picked by how hard they are to draw rather than by how they went.
 *
 * The default has every render state present at once inside 258 rows, which is what a variant has to
 * survive at 390px. The second is the Frozen obligation at full brutality: nearly half the feed is a
 * copy of the previous fix, so a variant that only rings Frozen points quietly draws a beautiful
 * track of a boat that was not transmitting.
 */

export const RACE_FILES = [
  { key: 'chi-wauk', file: '06-20-26-chi-wauk.csv', label: 'Chicago–Waukegan · every state at once' },
  { key: 'chi-stjoe', file: '09-04-2026-chicago-st-joe.csv', label: 'Chicago–St Joe · 47% frozen' },
] as const

export type RaceFileKey = (typeof RACE_FILES)[number]['key']
