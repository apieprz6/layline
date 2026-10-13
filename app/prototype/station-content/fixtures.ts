/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Fixture gust and wave values, laid over the real 72h wind history so the
 * modules have something to draw. Real plumbing is LAY-170's (PR #133, in
 * review); these shapes mirror what it adds to `WindDataPoint` and
 * `BuoyMetadata`, copied here so this branch doesn't depend on that PR.
 *
 * Every number below is invented. Deterministic per timestamp, so a reload
 * draws the same picture.
 */

import type { WindDataPoint } from '@/types'

/** LAY-170's `StationCapability`, mirrored. */
export interface ProtoCapability {
  gust: boolean
  waves: boolean
}

/** LAY-170's `BuoyMetadata` additions, mirrored — only what the UI reads. */
export interface ProtoMetadata {
  windMeasurementHeight: number // feet above water
  adjustmentNote?: string
  capability: ProtoCapability
}

/** LAY-170's `WindDataPoint` additions, mirrored. Null = no reading at this moment. */
export interface ProtoPoint extends WindDataPoint {
  gust: number | null
  waveHeight: number | null // ft
  wavePeriod: number | null // s
  waveDir: number | null // degrees, direction waves come from
}

export const PROTO_METADATA: Record<string, ProtoMetadata> = {
  CHII2: {
    windMeasurementHeight: 85,
    // Today's string says "measured at 85ft" again; the height is already a field, so
    // the note only needs the claim. Recommended rewording for the build.
    adjustmentNote: 'Wind at this height typically reads 20–30% higher than at the surface.',
    capability: { gust: true, waves: false },
  },
  '45198': {
    windMeasurementHeight: 3,
    adjustmentNote: 'Surface-level measurements',
    capability: { gust: true, waves: true },
  },
}

/** How long the `?missing=1` fixture blanks the latest readings for. */
export const MISSING_MINUTES = 150

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export function withFixtures(
  data: WindDataPoint[],
  capability: ProtoCapability,
  missing: boolean,
  serverTime: number
): ProtoPoint[] {
  return data.map((p) => {
    const t = new Date(p.timestamp).getTime()
    const minute = Math.floor(t / 60000)
    const blanked = missing && serverTime - t < MISSING_MINUTES * 60000

    const gust =
      capability.gust && !blanked
        ? Math.round((p.spd + 1.5 + p.spd * 0.35 * noise(minute)) * 10) / 10
        : null

    const hours = t / 3600000
    const hasWaves = capability.waves && !blanked
    const waveHeight = hasWaves
      ? Math.round((1.9 + 1.1 * Math.sin(hours / 7) + 0.25 * noise(minute + 7)) * 10) / 10
      : null
    const wavePeriod = hasWaves
      ? Math.round((4.5 + 1.2 * Math.sin(hours / 9) + 0.4 * noise(minute + 3)) * 10) / 10
      : null
    const waveDir = hasWaves ? Math.round((p.dir + 15 + 360) % 360) : null

    return { ...p, gust, waveHeight, wavePeriod, waveDir }
  })
}

/**
 * Synthetic wind for when the real fetch comes back empty (Purdue is
 * seasonal, and a dev box may have no Supabase) — so the route always draws.
 */
export function syntheticWind(serverTime: number): WindDataPoint[] {
  const out: WindDataPoint[] = []
  for (let m = 0; m <= 72 * 60; m += 10) {
    const t = serverTime - m * 60000
    const h = t / 3600000
    out.push({
      timestamp: new Date(t).toISOString(),
      spd: Math.round((11 + 4 * Math.sin(h / 5) + 2 * noise(m)) * 10) / 10,
      dir: Math.round((230 + 25 * Math.sin(h / 11) + 8 * noise(m + 1) + 360) % 360),
    })
  }
  return out
}
