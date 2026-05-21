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
