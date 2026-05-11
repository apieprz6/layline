import type { MinuteDataPoint } from '@/types'

export type TimeScale = '30m' | '1h' | '6h' | '24h' | '72h'

// Map scale IDs to minutes
const SCALE_MINUTES: Record<TimeScale, number> = {
  '30m': 30,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  '72h': 4320,
}

/**
 * Filter wind history data to a specific time window
 * @param fullHistory - All available wind data points
 * @param scale - Time scale to filter to ('30m', '1h', '6h', '24h', '72h')
 * @returns Filtered data points within the time window
 */
export function windowData(
  fullHistory: MinuteDataPoint[] | undefined | null,
  scale: TimeScale
): MinuteDataPoint[] {
  if (!fullHistory) {
    return []
  }
  const maxMinutes = SCALE_MINUTES[scale]
  return fullHistory.filter(point => point.minsAgo <= maxMinutes)
}
