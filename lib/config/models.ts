/**
 * Weather model configuration
 * Defines update schedules, forecast horizons, and staleness thresholds
 * for supported numerical weather prediction models
 */

import type { ModelId } from '@/types'

/**
 * Configuration for a single weather model
 */
export interface ModelConfig {
  modelId: ModelId
  name: string
  updateFrequencyHours: number // How often the model runs (e.g., every 6 hours)
  forecastHorizonHours: number // How far ahead the model predicts (e.g., 120 hours = 5 days)
  runTimes: string[] // UTC times when model runs (e.g., ['00:00', '06:00', '12:00', '18:00'])
  stalenessBufferMinutes: number // Grace period before marking data stale (accounts for processing delays)
}

/**
 * Weather model configurations
 * Maps model IDs to their configuration parameters
 */
export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  /**
   * NOAA Global Forecast System (GFS)
   * - Global coverage
   * - 384-hour (16 day) forecast horizon
   * - 6-hour update cycle (00z, 06z, 12z, 18z)
   * - Good for overall synoptic patterns
   */
  gfs: {
    modelId: 'gfs',
    name: 'NOAA GFS',
    updateFrequencyHours: 6,
    forecastHorizonHours: 384,
    runTimes: ['00:00', '06:00', '12:00', '18:00'],
    stalenessBufferMinutes: 120, // 2 hours buffer for processing delays
  },

  /**
   * NOAA High-Resolution Rapid Refresh (HRRR)
   * - Regional coverage (North America)
   * - 48-hour forecast horizon
   * - 1-hour update cycle (hourly)
   * - Best for short-term Lake Michigan forecasts
   */
  hrrr: {
    modelId: 'hrrr',
    name: 'NOAA HRRR',
    updateFrequencyHours: 1,
    forecastHorizonHours: 48,
    runTimes: [
      '00:00',
      '01:00',
      '02:00',
      '03:00',
      '04:00',
      '05:00',
      '06:00',
      '07:00',
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
      '20:00',
      '21:00',
      '22:00',
      '23:00',
    ],
    stalenessBufferMinutes: 30, // 30 minutes buffer (faster processing)
  },

  /**
   * European Centre for Medium-Range Weather Forecasts (ECMWF)
   * - Global coverage
   * - 240-hour (10 day) forecast horizon
   * - 12-hour update cycle (00z, 12z)
   * - Generally considered most accurate global model
   */
  ecmwf: {
    modelId: 'ecmwf',
    name: 'ECMWF',
    updateFrequencyHours: 12,
    forecastHorizonHours: 240,
    runTimes: ['00:00', '12:00'],
    stalenessBufferMinutes: 180, // 3 hours buffer (longer processing time)
  },
}

/**
 * Get configuration for a weather model
 */
export function getModelConfig(modelId: ModelId): ModelConfig {
  return MODEL_CONFIGS[modelId]
}

/**
 * Calculate the next model run time
 * @param modelId - Weather model identifier
 * @param currentTime - Current time (defaults to now)
 * @returns Date of next model run in UTC
 */
export function getNextRunTime(modelId: ModelId, currentTime: Date): Date {
  const config = getModelConfig(modelId)
  const now = new Date(currentTime)

  // Parse run times and find the next one
  for (const runTime of config.runTimes) {
    const [hours, minutes] = runTime.split(':').map(Number)

    const candidate = new Date(now)
    candidate.setUTCHours(hours, minutes, 0, 0)

    // If this run time is in the future, it's the next run
    if (candidate > now) {
      return candidate
    }
  }

  // All run times today are in the past, return first run tomorrow
  const [hours, minutes] = config.runTimes[0].split(':').map(Number)
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(hours, minutes, 0, 0)

  return tomorrow
}

/**
 * Calculate cache expiration time (when next model run occurs)
 * @param modelId - Weather model identifier
 * @param currentTime - Current time (defaults to now)
 * @returns Unix timestamp in milliseconds when cache should expire
 */
export function getCacheExpiration(modelId: ModelId, currentTime: Date): number {
  const nextRun = getNextRunTime(modelId, currentTime)
  return nextRun.getTime()
}

/**
 * Check if forecast data is stale based on first forecast time
 * @param firstForecastTime - ISO timestamp of first forecast data point
 * @param modelId - Weather model identifier
 * @returns true if data is stale (older than expected with buffer), false otherwise
 */
export function isDataStale(firstForecastTime: string, modelId: ModelId): boolean {
  const config = getModelConfig(modelId)
  const forecastDate = new Date(firstForecastTime)
  const now = new Date()

  // Calculate how long ago this forecast was generated
  const ageMs = now.getTime() - forecastDate.getTime()
  const ageMinutes = ageMs / (1000 * 60)

  // Data is stale if it's older than update frequency + staleness buffer
  const staleThresholdMinutes = config.updateFrequencyHours * 60 + config.stalenessBufferMinutes

  return ageMinutes > staleThresholdMinutes
}
