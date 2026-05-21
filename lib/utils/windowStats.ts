/**
 * Window statistics utility module
 * Aggregate statistical calculations for wind data within a time window
 */

import type { WindDataPointWithOffset, WindowStats } from '@/types'

// Re-export for convenience
export type { WindowStats }

/**
 * Calculate aggregate statistics for a window of wind data points
 * Uses vector averaging for direction to handle wraparound correctly
 *
 * @param points - Array of wind data points with time offsets
 * @returns WindowStats object or null if insufficient data (< 3 points)
 */
export function calculateWindowStats(points: WindDataPointWithOffset[]): WindowStats | null {
  if (points.length < 3) return null

  // Vector averaging for direction (handles wraparound)
  let sumSin = 0
  let sumCos = 0
  let sumSpd = 0
  let minSpd = Infinity
  let maxSpd = -Infinity

  for (const p of points) {
    const rad = (p.dir * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
    sumSpd += p.spd

    if (p.spd < minSpd) minSpd = p.spd
    if (p.spd > maxSpd) maxSpd = p.spd
  }

  const avgSin = sumSin / points.length
  const avgCos = sumCos / points.length

  // Convert back to degrees
  const avgRad = Math.atan2(avgSin, avgCos)
  let meanDir = (avgRad * 180) / Math.PI

  // Normalize to 0-360
  if (meanDir < 0) {
    meanDir += 360
  }
  if (meanDir >= 360) {
    meanDir -= 360
  }

  const meanSpd = sumSpd / points.length

  // Calculate veer/back spread (max angular deviation around mean)
  let maxDeviation = 0
  for (const p of points) {
    let deviation = p.dir - meanDir
    // Normalize to [-180, 180]
    while (deviation > 180) deviation -= 360
    while (deviation < -180) deviation += 360
    maxDeviation = Math.max(maxDeviation, Math.abs(deviation))
  }

  return {
    meanDir: Math.round(meanDir),
    meanSpd,
    spdMin: minSpd,
    spdMax: maxSpd,
    spread: maxDeviation * 2, // Full spread (both directions)
    count: points.length,
  }
}
