/**
 * Forecast location configuration
 * Defines geographic points for weather model forecasts
 */

import type { ForecastLocation } from '@/types'

/**
 * Primary forecast location for Wednesday night beer can races
 * COLYC Racing Circle on Lake Michigan
 */
export const COLYC_RACE_CIRCLE: ForecastLocation = {
  name: 'COLYC Race Circle',
  latitude: 41.8528333,
  longitude: -87.55683333,
  description: 'Wednesday night beer can races',
}

/**
 * Default forecast location
 * Used by weather model API endpoints when no location is specified
 */
export const DEFAULT_FORECAST_LOCATION = COLYC_RACE_CIRCLE
