/**
 * Location configuration for weather forecasts
 * Defines standard locations used throughout the application
 */

import type { ForecastLocation } from '@/types'

/**
 * Columbia Yacht Club Race Circle location
 * Primary racing area off Navy Pier, Lake Michigan
 *
 * Coordinates: 41.8528333°N, 87.55683333°W
 * Approximately 2.5 nautical miles offshore from Navy Pier
 */
export const COLYC_RACE_CIRCLE: ForecastLocation = {
  latitude: 41.8528333,
  longitude: -87.55683333,
  name: 'COLYC Race Circle',
}

/**
 * Default location for weather forecasts
 * Points to the primary race circle location
 */
export const DEFAULT_FORECAST_LOCATION: ForecastLocation = COLYC_RACE_CIRCLE
