/**
 * Open-Meteo weather model service
 * Fetches forecast data from Open-Meteo API with caching and staleness detection
 */

import type {
  ForecastLocation,
  WeatherModelResult,
  WeatherModelCacheEntry,
  ForecastPoint,
} from '@/types'
import { getCacheExpiration, isDataStale } from '@/lib/config/models'

// In-memory cache
const cache: Map<string, WeatherModelCacheEntry> = new Map()

// Model ID to Open-Meteo API name mapping
const MODEL_API_NAMES: Record<string, string> = {
  gfs: 'gfs_global',
  hrrr: 'hrrr_conus',
  ecmwf: 'ecmwf_ifs04',
}

/**
 * Generate cache key for a model and location
 */
function getCacheKey(modelId: string, location: ForecastLocation): string {
  return `${modelId}:${location.latitude}:${location.longitude}`
}

/**
 * Parse Open-Meteo API response into forecast points
 * Filters out points with null wind speed or direction
 */
function parseOpenMeteoResponse(response: {
  hourly: {
    time: string[]
    wind_speed_10m: (number | null)[]
    wind_direction_10m: (number | null)[]
    wind_gusts_10m?: (number | null)[]
  }
}): ForecastPoint[] {
  const { time, wind_speed_10m, wind_direction_10m, wind_gusts_10m } =
    response.hourly
  const points: ForecastPoint[] = []

  for (let i = 0; i < time.length; i++) {
    const speed = wind_speed_10m[i]
    const direction = wind_direction_10m[i]

    // Filter out null values
    if (speed === null || direction === null) {
      continue
    }

    points.push({
      timestamp: time[i],
      windSpeed: speed,
      windDirection: direction,
      windGust: wind_gusts_10m?.[i] ?? undefined,
    })
  }

  return points
}

/**
 * Validate location coordinates
 */
function validateLocation(location: ForecastLocation): void {
  if (location.latitude < -90 || location.latitude > 90) {
    throw new Error(
      `Invalid latitude: ${location.latitude}. Must be between -90 and 90.`
    )
  }
  if (location.longitude < -180 || location.longitude > 180) {
    throw new Error(
      `Invalid longitude: ${location.longitude}. Must be between -180 and 180.`
    )
  }
}

/**
 * Fetch GFS weather model forecast
 */
export async function fetchGFS(
  location: ForecastLocation
): Promise<WeatherModelResult> {
  // Validate coordinates
  validateLocation(location)

  const modelId = 'gfs'
  const cacheKey = getCacheKey(modelId, location)
  const now = Date.now()

  // Check cache
  const cached = cache.get(cacheKey)
  if (cached && now < cached.fetchedAt) {
    return cached.data
  }

  // Fetch from Open-Meteo API with error handling
  try {
    const apiName = MODEL_API_NAMES[modelId]
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', location.latitude.toString())
    url.searchParams.set('longitude', location.longitude.toString())
    url.searchParams.set(
      'hourly',
      'wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    )
    url.searchParams.set('wind_speed_unit', 'kn')
    url.searchParams.set('models', apiName)

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Layline Sailing Dashboard (contact: layline@sailing.app)',
      },
    })

    if (!response.ok) {
      throw new Error(
        `Open-Meteo API error: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const forecastPoints = parseOpenMeteoResponse(data)

    const result: WeatherModelResult = {
      modelId: 'gfs',
      location,
      forecastPoints,
      generatedAt:
        forecastPoints.length > 0 ? forecastPoints[0].timestamp : new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    }

    // Determine cache expiration based on staleness
    let expiration: number
    if (forecastPoints.length > 0 && isDataStale(forecastPoints[0].timestamp, modelId)) {
      // Data is stale - set 15-minute retry window
      expiration = now + 15 * 60 * 1000
    } else {
      // Data is fresh - expire at next model run
      expiration = getCacheExpiration(modelId, new Date())
    }

    cache.set(cacheKey, {
      data: result,
      fetchedAt: expiration,
    })

    return result
  } catch (error) {
    // Return error result (mirrors buoy pattern - no throwing)
    return {
      modelId: 'gfs',
      location,
      forecastPoints: [],
      generatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    }
  }
}

/**
 * Fetch ECMWF weather model forecast
 */
export async function fetchECMWF(
  location: ForecastLocation
): Promise<WeatherModelResult> {
  // Validate coordinates
  validateLocation(location)

  const modelId = 'ecmwf'
  const cacheKey = getCacheKey(modelId, location)
  const now = Date.now()

  // Check cache
  const cached = cache.get(cacheKey)
  if (cached && now < cached.fetchedAt) {
    return cached.data
  }

  // Fetch from Open-Meteo API with error handling
  try {
    const apiName = MODEL_API_NAMES[modelId]
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', location.latitude.toString())
    url.searchParams.set('longitude', location.longitude.toString())
    url.searchParams.set(
      'hourly',
      'wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    )
    url.searchParams.set('wind_speed_unit', 'kn')
    url.searchParams.set('models', apiName)

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Layline Sailing Dashboard (contact: layline@sailing.app)',
      },
    })

    if (!response.ok) {
      throw new Error(
        `Open-Meteo API error: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const forecastPoints = parseOpenMeteoResponse(data)

    const result: WeatherModelResult = {
      modelId: 'ecmwf',
      location,
      forecastPoints,
      generatedAt:
        forecastPoints.length > 0 ? forecastPoints[0].timestamp : new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    }

    // Determine cache expiration based on staleness
    let expiration: number
    if (forecastPoints.length > 0 && isDataStale(forecastPoints[0].timestamp, modelId)) {
      // Data is stale - set 15-minute retry window
      expiration = now + 15 * 60 * 1000
    } else {
      // Data is fresh - expire at next model run
      expiration = getCacheExpiration(modelId, new Date())
    }

    cache.set(cacheKey, {
      data: result,
      fetchedAt: expiration,
    })

    return result
  } catch (error) {
    // Return error result (mirrors buoy pattern - no throwing)
    return {
      modelId: 'ecmwf',
      location,
      forecastPoints: [],
      generatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    }
  }
}

/**
 * Clear cache for testing
 */
export function clearCache(): void {
  cache.clear()
}
