import { formatRelativeTime } from '@/lib/utils/timeFormatting'
import { TIME_SCALES, inWindow, withMinutesAgo, type TimeScale } from '@/lib/utils/windowing'
import { latestPoint, shows } from '@/lib/utils/stationReadings'
import { calculateWindowStats } from '@/lib/utils/windowStats'
import { isPurdueOutOfWater } from '@/services/buoys/ndbc'
import { purdueOutOfSeason, stationName } from './current-conditions'
import type {
  BuoyHistoryData,
  McpHistoryReading,
  McpStationHistory,
  McpStationOutOfSeason,
  McpWindowStats,
  WindDataPoint,
} from '@/types'

interface BuoyHistoryInput {
  station: 'CHII2' | '45198'
  /** `fetchCHII2History()` or `fetchPurdueBuoyHistory()`'s result, the one the station page renders. */
  history: BuoyHistoryData
  /** One of the station page's own time scales. */
  window: TimeScale
  now: Date
  /** `isPurdueSeason()`, passed in so a test can be in January. */
  purdueInSeason: boolean
}

/**
 * The station page for one station and one of its time scales, live, for the MCP `buoy_history`
 * tool.
 *
 * Pure, and holding no rule of its own (ADR 0042): the window, which secondary readings appear and
 * the Stats panel's figures all come from the functions the station page calls, over the same
 * cached history it renders. This only renames fields for a model and attaches provenance.
 */
export function buoyHistory({
  station,
  history,
  window,
  now,
  purdueInSeason,
}: BuoyHistoryInput): McpStationHistory | McpStationOutOfSeason {
  const data = history.history

  if (station === '45198' && isPurdueOutOfWater({ hasReadings: data !== null, inSeason: purdueInSeason })) {
    return purdueOutOfSeason(history.status)
  }

  const scale = TIME_SCALES[window]
  const aged = data ? withMinutesAgo(data, now) : null
  const points = aged ? inWindow(aged, scale.minutes, 0) : null
  const stats = points ? calculateWindowStats(points) : null
  const latest = aged ? latestPoint(aged) : undefined
  const showGust = data ? shows(history.metadata.capability, data, 'gust') : false
  const showWaves = data ? shows(history.metadata.capability, data, 'waveHeight') : false

  const reading = (p: WindDataPoint): McpHistoryReading => ({
    observedAt: p.timestamp,
    speedKnots: p.spd,
    directionDegreesTrue: p.dir,
    ...(showGust ? { gustKnots: p.gust ?? null } : {}),
    ...(showWaves ? { waveHeightFeet: p.waveHeight ?? null } : {}),
  })

  const windowStats: McpWindowStats | null = stats
    ? {
        derived: true,
        meanDirectionDegreesTrue: stats.meanDir,
        meanSpeedKnots: stats.meanSpd,
        speedMinKnots: stats.spdMin,
        speedMaxKnots: stats.spdMax,
        veerBackSpreadDegrees: stats.spread,
        readingCount: stats.count,
      }
    : null

  const metadata = history.metadata

  return {
    station,
    name: stationName(station),
    seasonal: station === '45198',
    dataStatus: history.status,
    fetchedAt: history.fetchedAt,
    latestObservedAt: latest?.timestamp ?? null,
    staleness: latest ? { label: formatRelativeTime(latest.timestamp, now.getTime()) } : null,
    window: { id: window, label: scale.label },
    // The readings exactly as the history holds them. CHII2's stay the 85 ft figures: the height
    // and the note travel beside them, and nothing here works out a surface figure (ADR 0008).
    readings: points ? points.map(reading) : null,
    windowStats,
    ...(history.error && !data ? { fetchError: history.error } : {}),
    anemometerHeightFeet: metadata.windMeasurementHeight,
    ...(metadata.adjustmentNote ? { note: metadata.adjustmentNote } : {}),
  }
}
