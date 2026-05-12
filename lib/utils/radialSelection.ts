/**
 * Radial selection utilities for polar charts
 * Converts user touch/click coordinates to time-based data point selection
 */

import type { MinuteDataPoint } from '@/types'

/**
 * Find the data point closest to a given radius (time offset) on the polar chart
 *
 * Algorithm:
 * 1. Convert client coordinates to SVG coordinates (accounting for element bounds and viewBox)
 * 2. Calculate polar coordinates (radius and angle) from center of chart
 * 3. Convert radius (0-1 normalized) to time offset in minutes
 * 4. Find the data point with the closest `minsAgo` value to the calculated time offset
 *
 * @param clientX - Client X coordinate from pointer event
 * @param clientY - Client Y coordinate from pointer event
 * @param dataPoints - Array of minute data points
 * @param svgElement - SVG element reference (for coordinate conversion)
 * @param timeWindowMinutes - Total time window in minutes
 * @returns The data point closest to the selected radius, or null if no data available
 */
export function findPointByRadius(
  clientX: number,
  clientY: number,
  dataPoints: MinuteDataPoint[],
  svgElement: SVGSVGElement,
  timeWindowMinutes: number
): MinuteDataPoint | null {
  if (dataPoints.length === 0) return null
  if (timeWindowMinutes === 0) return null

  // Chart constants (must match PolarChart component)
  const SIZE = 360
  const PAD = 42
  const CENTER_X = SIZE / 2
  const CENTER_Y = SIZE / 2
  const R = (SIZE - PAD * 2) / 2

  // Convert client coordinates to SVG coordinates
  const rect = svgElement.getBoundingClientRect()
  const svgX = ((clientX - rect.left) / rect.width) * SIZE
  const svgY = ((clientY - rect.top) / rect.height) * SIZE

  // Calculate distance from center (radius)
  const dx = svgX - CENTER_X
  const dy = svgY - CENTER_Y
  const distanceFromCenter = Math.sqrt(dx * dx + dy * dy)

  // Normalize radius (0 = center, 1 = outer ring)
  const r01 = Math.min(1, Math.max(0, distanceFromCenter / R))

  // Convert radius to time offset
  // r01 = 1 - (minsAgo / timeWindowMinutes)
  // Therefore: minsAgo = (1 - r01) * timeWindowMinutes
  const targetMinsAgo = (1 - r01) * timeWindowMinutes

  // Find nearest data point by time offset
  let nearest = dataPoints[0]
  let minTimeDiff = Math.abs(nearest.minsAgo - targetMinsAgo)

  for (const point of dataPoints) {
    const timeDiff = Math.abs(point.minsAgo - targetMinsAgo)
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff
      nearest = point
    }
  }

  return nearest
}
