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

/**
 * A reading's age in whole minutes, floored: the one rule behind the **Station Row**'s
 * "12m ago" and the **MCP Server**'s `current_conditions` Staleness, so the two can
 * never state different ages for the same reading (ADR 0042).
 */
export function observationAgeMinutes(timestamp: string, currentTime: number): number {
  return Math.floor((currentTime - new Date(timestamp).getTime()) / 60000)
}

/**
 * How long ago a reading was taken, as a **Station Row** prints it
 * (e.g. "just now", "12m ago", "1h ago", "2d ago").
 *
 * Whole units, floored: a reading 92 minutes old is "1h ago". Shared with the
 * **MCP Server**'s `current_conditions`, so Claude states the same age the
 * dashboard does (ADR 0042).
 */
export function formatRelativeTime(timestamp: string, currentTime: number): string {
  const diffMin = observationAgeMinutes(timestamp, currentTime)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}
