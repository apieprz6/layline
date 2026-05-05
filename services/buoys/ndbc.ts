import type {
  BuoyData,
  BuoyDataResult,
  BuoyApiResponse,
  BuoyCacheEntry,
  DataSourceStatus,
} from '@/types'

// In-memory cache
const cache: Map<string, BuoyCacheEntry> = new Map()

// Status thresholds (in milliseconds)
const STATUS_THRESHOLDS = {
  ONLINE: 2 * 60 * 1000, // 2 minutes
  RECENT: 30 * 60 * 1000, // 30 minutes
  STALE: 120 * 60 * 1000, // 120 minutes
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
 * Calculate data source status based on staleness
 */
function calculateStatus(
  fetchedAt: number,
  hasData: boolean,
  hasError: boolean
): DataSourceStatus {
  if (hasError && !hasData) {
    return 'error'
  }

  if (!hasData) {
    return 'offline'
  }

  const now = Date.now()
  const ageMs = now - fetchedAt

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

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32
}

function hPaToMillibars(hPa: number): number {
  return hPa // hPa and mb are the same unit
}

/**
 * Parse NDBC real-time text format
 * Format: space-separated values, first two lines are headers
 * Missing data indicated by 'MM' or '999' depending on field
 */
function parseNDBCResponse(
  text: string,
  stationId: string
): BuoyApiResponse | null {
  const lines = text.trim().split('\n')

  if (lines.length < 3) {
    throw new Error('Invalid NDBC response: insufficient lines')
  }

  // Line 0: field names
  // Line 1: field units
  // Line 2+: data rows (most recent first)
  const headers = lines[0].split(/\s+/)
  const dataLine = lines[2].split(/\s+/)

  if (dataLine.length < headers.length) {
    throw new Error('Invalid NDBC response: data line too short')
  }

  // Build a map of field name to value
  const data: Record<string, string> = {}
  headers.forEach((header, index) => {
    data[header] = dataLine[index]
  })

  // Extract timestamp (required fields)
  const year = data['#YY'] || data['YY']
  const month = data['MM']
  const day = data['DD']
  const hour = data['hh']
  const minute = data['mm']

  if (!year || !month || !day || !hour || !minute) {
    throw new Error('Invalid NDBC response: missing timestamp fields')
  }

  // Construct ISO timestamp
  const timestamp = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00Z`

  // Parse wind direction (required, degrees)
  const windDirectionRaw = data['WDIR']
  if (!windDirectionRaw || windDirectionRaw === 'MM' || windDirectionRaw === '999') {
    throw new Error('Invalid NDBC response: missing wind direction')
  }
  const windDirection = parseFloat(windDirectionRaw)

  // Parse wind speed (required, m/s)
  const windSpeedRaw = data['WSPD']
  if (!windSpeedRaw || windSpeedRaw === 'MM' || windSpeedRaw === '99.0') {
    throw new Error('Invalid NDBC response: missing wind speed')
  }
  const windSpeed = parseFloat(windSpeedRaw)

  // Parse optional fields (lenient - return undefined if missing)
  const parseOptional = (field: string, invalidValues: string[]): number | undefined => {
    const value = data[field]
    if (!value || invalidValues.includes(value)) {
      return undefined
    }
    const parsed = parseFloat(value)
    return isNaN(parsed) ? undefined : parsed
  }

  const windGust = parseOptional('GST', ['MM', '99.0'])
  const waveHeight = parseOptional('WVHT', ['MM', '99.0'])
  const dominantWavePeriod = parseOptional('DPD', ['MM', '99'])
  const airTemp = parseOptional('ATMP', ['MM', '999.0'])
  const waterTemp = parseOptional('WTMP', ['MM', '999.0'])
  const pressure = parseOptional('PRES', ['MM', '9999.0'])

  return {
    stationId,
    timestamp,
    windDirection,
    windSpeed,
    windGust,
    waveHeight,
    dominantWavePeriod,
    airTemp,
    waterTemp,
    pressure,
  }
}

/**
 * Convert BuoyApiResponse to BuoyData with unit conversions and metadata
 */
function apiResponseToBuoyData(
  apiResponse: BuoyApiResponse,
  stationId: keyof typeof BUOY_CONFIGS
): BuoyData {
  const config = BUOY_CONFIGS[stationId]

  return {
    buoyId: apiResponse.stationId,
    name: config.name,
    timestamp: apiResponse.timestamp,
    windSpeed: metersPerSecondToKnots(apiResponse.windSpeed),
    windDirection: apiResponse.windDirection,
    windGust: apiResponse.windGust
      ? metersPerSecondToKnots(apiResponse.windGust)
      : undefined,
    waveHeight: apiResponse.waveHeight
      ? apiResponse.waveHeight * 3.28084 // meters to feet
      : undefined,
    wavePeriod: apiResponse.dominantWavePeriod,
    airTemp: apiResponse.airTemp
      ? celsiusToFahrenheit(apiResponse.airTemp)
      : undefined,
    waterTemp: apiResponse.waterTemp
      ? celsiusToFahrenheit(apiResponse.waterTemp)
      : undefined,
    pressure: apiResponse.pressure
      ? hPaToMillibars(apiResponse.pressure)
      : undefined,
    metadata: {
      station: config.stationId,
      source: 'ndbc',
      location: config.location,
      windMeasurementHeight: config.windMeasurementHeight,
      adjustmentNote: config.adjustmentNote,
    },
  }
}

/**
 * Fetch CHII2 buoy data from NDBC
 * Returns cached data if fresh (<2min), otherwise fetches new data
 */
export async function fetchCHII2(options?: {
  bypassCache?: boolean
}): Promise<BuoyDataResult> {
  return fetchBuoyData('CHII2', options)
}

/**
 * Scaffolded IISEAGrant scraper for Purdue Buoy
 * TODO: Implement HTML scraping from https://iiseagrant.org/45198/
 * Returns null and logs warning until implementation is complete
 */
async function scrapeIISEAGrant(): Promise<BuoyApiResponse | null> {
  console.warn('IISEAGrant scraping not implemented - falling back to NDBC')
  return null
}

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
 * Returns cached data if fresh (<2min), otherwise fetches new data
 *
 * Strategy:
 * 1. Try IISEAGrant scrape (currently scaffolded, returns null with warning)
 * 2. Fall back to NDBC station 45198
 * 3. Handle seasonal offline gracefully (May-October operational)
 */
export async function fetchPurdueBuoy(options?: {
  bypassCache?: boolean
}): Promise<BuoyDataResult> {
  const cacheKey = '45198'
  const now = Date.now()

  // Check cache first (unless bypass requested)
  if (!options?.bypassCache) {
    const cached = cache.get(cacheKey)
    if (cached) {
      const ageMs = now - cached.fetchedAt
      if (ageMs < STATUS_THRESHOLDS.ONLINE) {
        // Cache is fresh, return immediately
        return {
          data: cached.data,
          status: calculateStatus(cached.fetchedAt, true, false),
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
        }
      }
    }
  }

  // Check if in operational season
  const isOperationalSeason = isPurdueSeason()

  // Attempt IISEAGrant scrape first (currently scaffolded)
  try {
    const iisResponse = await scrapeIISEAGrant()

    if (iisResponse) {
      // IISEAGrant returned data - convert and cache
      const buoyData = apiResponseToBuoyData(iisResponse, '45198')
      cache.set(cacheKey, {
        data: buoyData,
        fetchedAt: now,
      })
      return {
        data: buoyData,
        status: 'online',
        fetchedAt: new Date(now).toISOString(),
      }
    }
  } catch (error) {
    console.warn('IISEAGrant fetch failed, falling back to NDBC:', error)
  }

  // Fall back to NDBC station 45198
  const ndbcResult = await fetchBuoyData('45198', options)

  // If NDBC failed and we're out of season, provide context
  if (!ndbcResult.data && !isOperationalSeason) {
    return {
      data: null,
      status: 'offline',
      fetchedAt: new Date(now).toISOString(),
      error: 'Purdue Buoy is seasonal (May-October only)',
    }
  }

  return ndbcResult
}

/**
 * Generic buoy data fetcher with caching
 */
async function fetchBuoyData(
  stationId: keyof typeof BUOY_CONFIGS,
  options?: { bypassCache?: boolean }
): Promise<BuoyDataResult> {
  const cacheKey = stationId
  const now = Date.now()

  // Check cache first (unless bypass requested)
  if (!options?.bypassCache) {
    const cached = cache.get(cacheKey)
    if (cached) {
      const ageMs = now - cached.fetchedAt
      if (ageMs < STATUS_THRESHOLDS.ONLINE) {
        // Cache is fresh, return immediately
        return {
          data: cached.data,
          status: calculateStatus(cached.fetchedAt, true, false),
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
        }
      }
    }
  }

  // Attempt live fetch
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
    const apiResponse = parseNDBCResponse(text, config.stationId)

    if (!apiResponse) {
      throw new Error('Failed to parse NDBC response')
    }

    const buoyData = apiResponseToBuoyData(apiResponse, stationId)

    // Update cache
    cache.set(cacheKey, {
      data: buoyData,
      fetchedAt: now,
    })

    return {
      data: buoyData,
      status: 'online',
      fetchedAt: new Date(now).toISOString(),
    }
  } catch (error) {
    // Fetch failed - return cached data if available
    const cached = cache.get(cacheKey)

    if (cached) {
      return {
        data: cached.data,
        status: calculateStatus(cached.fetchedAt, true, true),
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    // No cached data available
    return {
      data: null,
      status: 'error',
      fetchedAt: new Date(now).toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Clear cache for a specific buoy or all buoys
 */
export function clearCache(stationId?: keyof typeof BUOY_CONFIGS): void {
  if (stationId) {
    cache.delete(stationId)
  } else {
    cache.clear()
  }
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): Record<
  string,
  { hasCachedData: boolean; ageMs: number | null }
> {
  const now = Date.now()
  const status: Record<string, { hasCachedData: boolean; ageMs: number | null }> = {}

  Object.keys(BUOY_CONFIGS).forEach((stationId) => {
    const cached = cache.get(stationId)
    status[stationId] = {
      hasCachedData: !!cached,
      ageMs: cached ? now - cached.fetchedAt : null,
    }
  })

  return status
}
