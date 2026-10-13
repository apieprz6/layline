import type { WindDataPointWithOffset } from '@/types'

/** The secondary readings a station may or may not have at a given moment. */
export type SecondaryField = 'gust' | 'waveHeight'

/**
 * What a station said about one quantity at the displayed moment.
 *
 * `point` is the displayed point when it carries the reading. When it doesn't, `point` is null
 * and `lastAt` is when the most recent earlier reading was, or null if there was none in the
 * data at all. The older value itself is never handed back: shown as if current it would be a
 * plausible number standing in for a missing one (ADR 0008).
 */
export interface Reading {
  point: WindDataPointWithOffset | null
  lastAt: Date | null
}

export function readingAt(
  data: WindDataPointWithOffset[],
  at: WindDataPointWithOffset | undefined,
  field: SecondaryField
): Reading {
  if (!at) return { point: null, lastAt: null }
  if (at[field] != null) return { point: at, lastAt: null }

  let last: WindDataPointWithOffset | null = null
  for (const p of data) {
    if (p.minsAgo < at.minsAgo || p[field] == null) continue
    if (!last || p.minsAgo < last.minsAgo) last = p
  }
  return { point: null, lastAt: last ? new Date(last.timestamp) : null }
}
