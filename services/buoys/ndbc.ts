import type {
  BuoyData,
  BuoyDataResult,
  DataSourceStatus,
  BuoyHistoryData,
  WindDataPoint,
} from '@/types'
import { getServiceClient } from '@/lib/supabase/service'

// Status thresholds (how to label data freshness)
const STATUS_THRESHOLDS = {
  ONLINE: 30 * 60 * 1000, // 30 minutes (NDBC updates every 10 minutes)
  RECENT: 60 * 60 * 1000, // 60 minutes
  STALE: 150 * 60 * 1000, // 150 minutes (2.5 hours)
}

// Buoy station configurations
const BUOY_CONFIGS = {
  CHII2: {
    stationId: 'CHII2',
    name: 'Harrison Dever Crib',
    windMeasurementHeight: 85, // feet above water
    location: {
      latitude: 41.87,
      longitude: -87.59,
    },
    adjustmentNote:
      'Wind measured at 85ft typically reads 20-30% higher than surface',
  },
  '45198': {
    stationId: '45198',
    name: 'Purdue Buoy',
    windMeasurementHeight: 3, // approximate surface level
    location: {
      latitude: 41.89,
      longitude: -87.6,
    },
    adjustmentNote: 'Surface-level measurements',
  },
}

/**
 * Calculate data source status based on data timestamp staleness
 * Status should reflect how old the actual measurement is, not when we fetched it
 */
function calculateStatus(
  dataTimestamp: string | undefined,
  hasError: boolean
): DataSourceStatus {
  if (hasError && !dataTimestamp) {
    return 'error'
  }

  if (!dataTimestamp) {
    return 'offline'
  }

  const now = Date.now()
  const dataTime = new Date(dataTimestamp).getTime()
  const ageMs = now - dataTime

  if (ageMs < STATUS_THRESHOLDS.ONLINE) {
    return 'online'
  } else if (ageMs < STATUS_THRESHOLDS.RECENT) {
    return 'recent'
  } else if (ageMs < STATUS_THRESHOLDS.STALE) {
    return 'stale'
  } else {
    return 'offline'
  }
}

/**
 * Unit conversions (preserving raw data integrity)
 */
function metersPerSecondToKnots(ms: number): number {
  return ms * 1.94384
}

// Removed parseNDBCResponse and apiResponseToBuoyData - now using history parser as single source of truth

/**
 * Extract latest BuoyData from BuoyHistoryData
 * Converts the most recent wind data point to full BuoyData format
 */
function extractLatestFromHistory(historyData: BuoyHistoryData): BuoyDataResult {
  if (!historyData.history || historyData.history.length === 0) {
    return {
      data: null,
      status: historyData.status,
      fetchedAt: historyData.fetchedAt,
      error: historyData.error || 'No data available',
    }
  }

  const latestPoint = historyData.history[0]
  const config = BUOY_CONFIGS[historyData.buoyId as keyof typeof BUOY_CONFIGS]

  const buoyData: BuoyData = {
    buoyId: historyData.buoyId,
    name: historyData.name,
    timestamp: latestPoint.timestamp,
    windSpeed: latestPoint.spd,
    windDirection: latestPoint.dir,
    windGust: undefined, // History data only has speed/direction
    waveHeight: undefined,
    wavePeriod: undefined,
    airTemp: undefined,
    waterTemp: undefined,
    pressure: undefined,
    metadata: {
      station: config?.stationId || historyData.buoyId,
      source: 'ndbc',
      location: config?.location || { latitude: 0, longitude: 0 },
      windMeasurementHeight: config?.windMeasurementHeight || 0,
      adjustmentNote: config?.adjustmentNote || '',
    },
  }

  return {
    data: buoyData,
    status: historyData.status,
    fetchedAt: historyData.fetchedAt,
  }
}

/**
 * Fetch CHII2 buoy data from NDBC
 * Now uses history endpoint as single source of truth
 */
export async function fetchCHII2(options?: { bypassCache?: boolean }): Promise<BuoyDataResult> {
  const historyData = await fetchCHII2History(options)
  return extractLatestFromHistory(historyData)
}

// Removed scrapeIISEAGrant - TODO: implement if needed in future

/**
 * Check if Purdue Buoy is in operational season (May-October)
 */
function isPurdueSeason(): boolean {
  const now = new Date()
  const month = now.getMonth() // 0-indexed: 0=Jan, 4=May, 9=Oct
  return month >= 4 && month <= 9 // May (4) through October (9)
}

/**
 * Fetch Purdue Buoy (45198) data with primary/fallback strategy
 * Now uses history endpoint as single source of truth
 *
 * Strategy:
 * 1. Try IISEAGrant scrape (currently scaffolded, returns null with warning)
 * 2. Fall back to NDBC station 45198 history
 * 3. Handle seasonal offline gracefully (May-October operational)
 */
export async function fetchPurdueBuoy(options?: { bypassCache?: boolean }): Promise<BuoyDataResult> {
  const historyData = await fetchPurdueBuoyHistory(options)

  // Check if in operational season
  const isOperationalSeason = isPurdueSeason()

  // If history fetch failed and we're out of season, provide context
  if (!historyData.history && !isOperationalSeason) {
    return {
      data: null,
      status: 'offline',
      fetchedAt: historyData.fetchedAt,
      error: 'Purdue Buoy is seasonal (May-October only)',
    }
  }

  return extractLatestFromHistory(historyData)
}

/**
 * Clear history cache for testing
 */
export function clearCache(): void {
  clearHistoryCache()
}

/**
 * Parse all historical data rows from NDBC text file
 * Returns array of data points from most recent to oldest
 */
function parseNDBCHistoricalRows(
  text: string
): Array<{ timestamp: Date; windSpeed: number; windDirection: number }> {
  const lines = text.trim().split('\n')

  if (lines.length < 3) {
    return []
  }

  const headers = lines[0].split(/\s+/)
  const dataPoints: Array<{ timestamp: Date; windSpeed: number; windDirection: number }> = []

  // Skip header lines (0 and 1), parse data rows starting at line 2
  for (let i = 2; i < lines.length; i++) {
    const dataLine = lines[i].split(/\s+/)

    if (dataLine.length < headers.length) {
      continue
    }

    const data: Record<string, string> = {}
    headers.forEach((header, index) => {
      data[header] = dataLine[index]
    })

    // Extract timestamp
    const year = data['#YY'] || data['YY']
    const month = data['MM']
    const day = data['DD']
    const hour = data['hh']
    const minute = data['mm']

    if (!year || !month || !day || !hour || !minute) {
      continue
    }

    const timestamp = new Date(
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00Z`
    )

    // Parse wind data
    const windDirectionRaw = data['WDIR']
    const windSpeedRaw = data['WSPD']

    if (
      !windDirectionRaw ||
      windDirectionRaw === 'MM' ||
      windDirectionRaw === '999' ||
      !windSpeedRaw ||
      windSpeedRaw === 'MM' ||
      windSpeedRaw === '99.0'
    ) {
      continue
    }

    const windDirection = parseFloat(windDirectionRaw)
    const windSpeed = metersPerSecondToKnots(parseFloat(windSpeedRaw))

    if (isNaN(windDirection) || isNaN(windSpeed)) {
      continue
    }

    dataPoints.push({ timestamp, windSpeed, windDirection })
  }

  return dataPoints
}

// REMOVED: aggregateToHourly() and filterToTenMinuteIntervals()
// NDBC already provides 10-minute interval data - no bucketing needed
// Store absolute timestamps to prevent drift

// History cache
const historyCache: Map<
  string,
  { data: BuoyHistoryData; fetchedAt: number }
> = new Map()

const HISTORY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes (same as live data cache)

/**
 * Fetch buoy historical data from NDBC
 * Returns wind data with absolute timestamps (no bucketing - NDBC already provides 10-min intervals)
 */
async function fetchBuoyHistory(
  stationId: keyof typeof BUOY_CONFIGS,
  options?: { bypassCache?: boolean }
): Promise<BuoyHistoryData> {
  const cacheKey = `${stationId}-history`
  const now = Date.now()

  // Check cache first (unless bypass is requested)
  const cached = historyCache.get(cacheKey)
  if (!options?.bypassCache && cached && now - cached.fetchedAt < HISTORY_CACHE_TTL) {
    return cached.data
  }

  // Fetch historical data
  try {
    const config = BUOY_CONFIGS[stationId]
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${config.stationId}.txt`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Layline Sailing Dashboard (contact: layline@sailing.app)',
      },
    })

    if (!response.ok) {
      throw new Error(`NDBC API error: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()
    const parsedData = parseNDBCHistoricalRows(text)

    if (parsedData.length === 0) {
      throw new Error('No historical data available')
    }

    // Filter to 72-hour window
    const cutoffTime = new Date(now - 72 * 60 * 60 * 1000)
    const recentData = parsedData.filter((p) => p.timestamp >= cutoffTime)

    // Convert to WindDataPoint[] with ISO timestamps
    const history: WindDataPoint[] = recentData.map((p) => ({
      timestamp: p.timestamp.toISOString(),
      spd: Math.round(p.windSpeed * 10) / 10,
      dir: Math.round(p.windDirection),
    }))

    // Calculate status based on most recent data point timestamp
    const latestTimestamp = history.length > 0 ? history[0].timestamp : undefined
    const status = calculateStatus(latestTimestamp, false)

    const historyData: BuoyHistoryData = {
      buoyId: config.stationId,
      name: config.name,
      history,
      status,
      fetchedAt: new Date(now).toISOString(),
    }

    // Cache the result
    historyCache.set(cacheKey, { data: historyData, fetchedAt: now })

    return historyData
  } catch (error) {
    // Return null history on error
    const historyData: BuoyHistoryData = {
      buoyId: BUOY_CONFIGS[stationId].stationId,
      name: BUOY_CONFIGS[stationId].name,
      history: null,
      status: 'error',
      fetchedAt: new Date(now).toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    return historyData
  }
}

/**
 * Fetch CHII2 historical data
 */
export async function fetchCHII2History(options?: { bypassCache?: boolean }): Promise<BuoyHistoryData> {
  return fetchBuoyHistory('CHII2', options)
}

/**
 * Fetch Purdue Buoy historical data from Supabase (primary) with NDBC fallback
 */
export async function fetchPurdueBuoyHistory(options?: { bypassCache?: boolean }): Promise<BuoyHistoryData> {
  const cacheKey = '45198-history'
  const now = Date.now()

  const cached = historyCache.get(cacheKey)
  if (!options?.bypassCache && cached && now - cached.fetchedAt < HISTORY_CACHE_TTL) {
    return cached.data
  }

  const supabaseResult = await fetchPurdueFromSupabase(now)
  if (supabaseResult) {
    historyCache.set(cacheKey, { data: supabaseResult, fetchedAt: now })
    return supabaseResult
  }

  return fetchBuoyHistory('45198', options)
}

interface PurdueBuoyRow {
  timestamp: string
  wind_speed: number
  wind_direction: number | null
}

async function fetchPurdueFromSupabase(now: number): Promise<BuoyHistoryData | null> {
  try {
    const supabase = getServiceClient()
    const cutoff = new Date(now - 72 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('purdue_buoy_readings')
      .select('timestamp, wind_speed, wind_direction')
      .gt('timestamp', cutoff)
      .not('wind_speed', 'is', null)
      .order('timestamp', { ascending: false })

    if (error) throw error
    if (!data || data.length === 0) return null

    const rows = data as unknown as PurdueBuoyRow[]
    const history: WindDataPoint[] = rows.map((row) => ({
      timestamp: new Date(row.timestamp).toISOString(),
      spd: Math.round(metersPerSecondToKnots(row.wind_speed) * 10) / 10,
      dir: row.wind_direction ?? 0,
    }))

    const latestTimestamp = history[0].timestamp
    const status = calculateStatus(latestTimestamp, false)

    return {
      buoyId: '45198',
      name: 'Purdue Buoy',
      history,
      status,
      fetchedAt: new Date(now).toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Clear history cache for testing
 */
export function clearHistoryCache(): void {
  historyCache.clear()
}
