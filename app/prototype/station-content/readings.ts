/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * What a module shows at the scrubbed/touched moment. A missing reading is
 * shown as missing, with when the last one was — never back-filled with the
 * last value as though it were current (ADR 0008).
 */

import type { ProtoPoint } from './fixtures'

export type ProtoPointWithOffset = ProtoPoint & { minsAgo: number }

type Field = 'gust' | 'waveHeight'

export interface Reading {
  point: ProtoPointWithOffset | null // the point carrying the reading, null if missing now
  lastAt: Date | null // when missing: time of the last reading before now
}

export function readingAt(
  data: ProtoPointWithOffset[],
  at: ProtoPointWithOffset | undefined,
  field: Field
): Reading {
  if (!at) return { point: null, lastAt: null }
  if (at[field] !== null) return { point: at, lastAt: null }

  let last: ProtoPointWithOffset | null = null
  for (const p of data) {
    if (p.minsAgo < at.minsAgo) continue
    if (p[field] === null) continue
    if (!last || p.minsAgo < last.minsAgo) last = p
  }
  return { point: null, lastAt: last ? new Date(last.timestamp) : null }
}

export function inWindow(
  data: ProtoPointWithOffset[],
  nowOffset: number,
  windowMinutes: number
): ProtoPointWithOffset[] {
  return data
    .filter((p) => p.minsAgo >= nowOffset && p.minsAgo <= nowOffset + windowMinutes)
    .sort((a, b) => b.minsAgo - a.minsAgo)
}

export function peakGust(points: ProtoPointWithOffset[]): number | null {
  let peak: number | null = null
  for (const p of points) if (p.gust !== null && (peak === null || p.gust > peak)) peak = p.gust
  return peak
}
