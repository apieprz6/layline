import type { WindDataPoint } from '@/types'
import { getMinutesAgo } from './time'

export type TimeScale = '30m' | '1h' | '6h' | '24h' | '72h'

export interface TimeScaleConfig {
  minutes: number
  label: string
  ticks: number[]
}

// Time scale configurations with tick intervals for radial rings
export const TIME_SCALES: Record<TimeScale, TimeScaleConfig> = {
  '30m': {
    minutes: 30,
    label: 'Last 30 min',
    ticks: [0, 5, 10, 15, 20, 25, 30],
  },
  '1h': {
    minutes: 60,
    label: 'Last hour',
    ticks: [0, 15, 30, 45, 60],
  },
  '6h': {
    minutes: 360,
    label: 'Last 6 hours',
    ticks: [0, 60, 120, 180, 240, 300, 360],
  },
  '24h': {
    minutes: 1440,
    label: 'Last 24 hours',
    ticks: [0, 240, 480, 720, 960, 1200, 1440],
  },
  '72h': {
    minutes: 4320,
    label: 'Last 72 hours',
    ticks: [0, 720, 1440, 2160, 2880, 3600, 4320],
  },
} as const

/**
 * Filter wind history data to a specific time window
 * @param fullHistory - All available wind data points with absolute timestamps
 * @param scale - Time scale to filter to ('30m', '1h', '6h', '24h', '72h')
 * @param referenceTime - Reference time for calculating age (defaults to current time)
 * @returns Filtered data points within the time window
 */
export function windowData(
  fullHistory: WindDataPoint[] | undefined | null,
  scale: TimeScale,
  referenceTime: Date = new Date()
): WindDataPoint[] {
  if (!fullHistory) {
    return []
  }
  const maxMinutes = TIME_SCALES[scale].minutes
  return fullHistory.filter(point => {
    const minsAgo = getMinutesAgo(point.timestamp, referenceTime)
    return minsAgo <= maxMinutes
  })
}
