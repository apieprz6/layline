/**
 * Format time offset in minutes to human-readable string
 * @param minutes - Minutes ago (positive number)
 * @returns Formatted string like "now", "−5m", "−1h", "−1.5h"
 */
export function formatTimeOffset(minutes: number): string {
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `−${Math.round(minutes)}m`

  const hours = minutes / 60
  // Treat values very close to whole hours as whole hours (within 0.01)
  if (Math.abs(hours - Math.round(hours)) < 0.01) {
    return `−${Math.round(hours)}h`
  }

  return `−${hours.toFixed(1)}h`
}
