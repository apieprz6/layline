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
 * How far apart two observations can be before a chart stops drawing through the space between them.
 *
 * A buoy that went down for three hours and came back leaves two samples the charts would otherwise
 * join with one connector, which asserts a continuity nobody measured. Beyond this many minutes they
 * are separate stretches of a trace, not two ends of one.
 *
 * Fixed rather than derived from the observed cadence: this feed reports every 10 minutes, so a
 * median-times-four rule would be an indirect way of writing a constant. It lives beside TIME_SCALES
 * because the scales are what decide when it can fire at all — the 30m and 1h windows are narrower
 * than the threshold, so it is in practice a 6h/24h/72h rule and short dropouts stay bridged
 * everywhere. Accepted for now; worth revisiting against real outages.
 */
export const GAP_THRESHOLD_MINUTES = 60

/**
 * Whether two observations are too far apart in time for a chart to connect them.
 *
 * Takes ages rather than timestamps because that is what both charts already hold, and order-free
 * because neither chart agrees with the other about which end of its array is the newest.
 */
export function exceedsGapThreshold(minsAgoA: number, minsAgoB: number): boolean {
  return Math.abs(minsAgoA - minsAgoB) > GAP_THRESHOLD_MINUTES
}

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
