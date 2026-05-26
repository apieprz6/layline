/**
 * Open-Meteo weather model service
 * Fetches forecast data from Open-Meteo API with caching and staleness detection
 */

import type {
  ForecastLocation,
  WeatherModelResult,
  WeatherModelCacheEntry,
  ForecastPoint,
  ModelId,
  DataSourceStatus,
} from '@/types'
import { getModelConfig, getCacheExpiration, isDataStale } from '@/lib/config/models'
import { getCacheAdapter } from './cache'

/**
 * Generate cache key for a model and location
 */
function getCacheKey(modelId: ModelId, location: ForecastLocation): string {
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
 * Returns error message if invalid, null if valid
 */
function validateLocation(location: ForecastLocation): string | null {
  if (location.latitude < -90 || location.latitude > 90) {
    return `Invalid latitude: ${location.latitude}. Must be between -90 and 90.`
  }
  if (location.longitude < -180 || location.longitude > 180) {
    return `Invalid longitude: ${location.longitude}. Must be between -180 and 180.`
  }
  return null
}

/**
 * Calculate data source status based on staleness
 */
function calculateStatus(
  forecastPoints: ForecastPoint[],
  modelId: ModelId,
  hasError: boolean
): DataSourceStatus {
  if (hasError && forecastPoints.length === 0) return 'error'
  if (forecastPoints.length === 0) return 'offline'

  const isStale = isDataStale(forecastPoints[0].timestamp, modelId)
  return isStale ? 'stale' : 'online'
}

/**
 * Fetch weather model forecast from Open-Meteo API
 * Unified implementation for all supported models (GFS, HRRR, ECMWF)
 */
export async function fetchWeatherModel(
  modelId: ModelId,
  location: ForecastLocation
): Promise<WeatherModelResult> {
  // Validate coordinates
  const validationError = validateLocation(location)
  if (validationError) {
    return {
      modelId,
      location,
      forecastPoints: [],
      generatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      status: 'error',
      error: validationError,
    }
  }

  const cache = getCacheAdapter()
  const cacheKey = getCacheKey(modelId, location)
  const now = Date.now()

  // Check cache
  const cached = cache.get(cacheKey)
  if (cached) {
    return cached.data
  }

  // Fetch from Open-Meteo API with error handling
  try {
    const config = getModelConfig(modelId)
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', location.latitude.toString())
    url.searchParams.set('longitude', location.longitude.toString())
    url.searchParams.set(
      'hourly',
      'wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    )
    url.searchParams.set('wind_speed_unit', 'kn')
    url.searchParams.set('models', config.openMeteoApiName)

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
    const status = calculateStatus(forecastPoints, modelId, false)

    const result: WeatherModelResult = {
      modelId,
      location,
      forecastPoints,
      generatedAt:
        forecastPoints.length > 0 ? forecastPoints[0].timestamp : new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      status,
    }

    // Determine cache expiration based on staleness
    let expiration: number
    if (status === 'stale') {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      modelId,
      location,
      forecastPoints: [],
      generatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      status: 'error',
      error: errorMessage,
    }
  }
}

/**
 * Fetch GFS weather model forecast
 * Thin wrapper around fetchWeatherModel for backward compatibility
 */
export async function fetchGFS(
  location: ForecastLocation
): Promise<WeatherModelResult> {
  return fetchWeatherModel('gfs', location)
}

/**
 * Fetch HRRR weather model forecast
 * Thin wrapper around fetchWeatherModel for backward compatibility
 */
export async function fetchHRRR(
  location: ForecastLocation
): Promise<WeatherModelResult> {
  return fetchWeatherModel('hrrr', location)
}

/**
 * Fetch ECMWF weather model forecast
 * Thin wrapper around fetchWeatherModel for backward compatibility
 */
export async function fetchECMWF(
  location: ForecastLocation
): Promise<WeatherModelResult> {
  return fetchWeatherModel('ecmwf', location)
}

/**
 * Clear cache for testing
 * @deprecated Use setCacheAdapter() from './cache' for testing instead
 */
export function clearCache(): void {
  getCacheAdapter().clear()
}
