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

/**
 * Format Date object to HH:MM time string
 * @param date - Date object to format
 * @returns Time string in HH:MM format (e.g., "19:42")
 */
export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5)
}
