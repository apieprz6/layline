/**
 * Format a Date as HH:MM (24-hour time)
 */
export function formatTimeHHMM(date: Date): string {
  return date.toTimeString().slice(0, 5)
}

/**
 * Format time offset from live position
 * Examples: "now", "30m ago", "2.5h ago", "1.0d ago"
 */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = minutes / 60
  if (hours < 24) {
    // Show decimal only if needed
    const isWholeHour = Math.abs(hours - Math.round(hours)) < 0.01
    return isWholeHour ? `${Math.round(hours)}h ago` : `${hours.toFixed(1)}h ago`
  }

  const days = hours / 24
  return `${days.toFixed(1)}d ago`
}
