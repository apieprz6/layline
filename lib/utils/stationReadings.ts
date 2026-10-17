import type { SecondaryReading, StationCapability, WindDataPoint, WindDataPointWithOffset } from '@/types'

/** The secondary readings a station may or may not have at a given moment. */
export type SecondaryField = 'gust' | 'waveHeight'

/**
 * Whether this history says anything about `field` at all. A field absent from every point is a
 * fetch path that never reads it (Purdue's NDBC fallback reads no waves), which is not the same
 * fact as a station with no reading: the station page shows nothing for it, rather than "—".
 */
export function carries(data: WindDataPoint[], field: SecondaryField): boolean {
  return data.some((p) => p[field] !== undefined)
}

/**
 * Whether the station page shows `field` at all: the station measures it and this history carries
 * it. Where it shows, a missing reading is "—"; where it doesn't, nothing is drawn for it.
 */
export function shows(
  capability: StationCapability | undefined,
  data: WindDataPoint[],
  field: SecondaryField
): boolean {
  const measured = field === 'gust' ? capability?.gust : capability?.waves
  return (measured ?? false) && carries(data, field)
}

/** The reading at `at`, or when the last one before it was. See {@link SecondaryReading}. */
export function readingAt(
  data: WindDataPointWithOffset[],
  at: WindDataPointWithOffset | undefined,
  field: SecondaryField
): SecondaryReading {
  if (!at) return { point: null, lastAt: null }
  if (at[field] != null) return { point: at, lastAt: null }

  let last: WindDataPointWithOffset | null = null
  for (const p of data) {
    if (p.minsAgo < at.minsAgo || p[field] == null) continue
    if (!last || p.minsAgo < last.minsAgo) last = p
  }
  return { point: null, lastAt: last ? new Date(last.timestamp) : null }
}
