/**
 * 72 hours of synthetic station history for the browser test harness beside this file. Not
 * production data.
 *
 * Synthetic because the real feeds can't be made to hold still: NDBC's live CHII2 and 45198 files
 * decide for themselves whether this hour has a gust or a wave reading, and the one state the
 * browser suite has to see, a station that measures waves with no current reading, is exactly the
 * one live data offers only by luck. Each figure is a function of its own timestamp, so a reload
 * draws the same picture.
 */

import type { StationCapability, WindDataPoint } from '@/types'

/** How long `missing` blanks the latest gust and wave readings for. */
export const HARNESS_MISSING_MINUTES = 150

const CADENCE_MINUTES = 10
const TOTAL_MINUTES = 72 * 60

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const round1 = (v: number): number => Math.round(v * 10) / 10

/**
 * Newest first, like the real fetch. A quantity the station can't measure is null throughout;
 * with `missing`, a quantity it can is null for the latest {@link HARNESS_MISSING_MINUTES}.
 */
export function harnessHistory(
  serverTime: number,
  capability: StationCapability,
  missing: boolean
): WindDataPoint[] {
  const latest = Math.floor(serverTime / (CADENCE_MINUTES * 60_000)) * CADENCE_MINUTES * 60_000
  const out: WindDataPoint[] = []

  for (let m = 0; m <= TOTAL_MINUTES; m += CADENCE_MINUTES) {
    const t = latest - m * 60_000
    const h = t / 3_600_000
    const minute = Math.floor(t / 60_000)
    const blanked = missing && m < HARNESS_MISSING_MINUTES
    const hasWaves = capability.waves && !blanked

    const spd = round1(11 + 4 * Math.sin(h / 5) + 2 * noise(minute))
    const dir = Math.round((230 + 25 * Math.sin(h / 11) + 8 * noise(minute + 1) + 360) % 360)

    out.push({
      timestamp: new Date(t).toISOString(),
      spd,
      dir,
      gust: capability.gust && !blanked ? round1(spd + 1.5 + spd * 0.35 * noise(minute + 2)) : null,
      waveHeight: hasWaves ? round1(1.9 + 1.1 * Math.sin(h / 7) + 0.25 * noise(minute + 7)) : null,
      wavePeriod: hasWaves ? round1(4.5 + 1.2 * Math.sin(h / 9) + 0.4 * noise(minute + 3)) : null,
      waveDir: hasWaves ? Math.round((dir + 15) % 360) : null,
    })
  }
  return out
}
