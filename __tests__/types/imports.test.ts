/**
 * Type import verification tests
 * Ensures all new types are properly exported and importable via path alias
 */

import type {
  ModelId,
  ForecastLocation,
  ForecastPoint,
  WeatherModelResult,
  WeatherModelCacheEntry,
} from '@/types'

describe('Type Imports', () => {
  describe('ModelId type', () => {
    it('should allow valid model IDs', () => {
      const gfs: ModelId = 'gfs'
      const hrrr: ModelId = 'hrrr'
      const ecmwf: ModelId = 'ecmwf'

      expect(gfs).toBe('gfs')
      expect(hrrr).toBe('hrrr')
      expect(ecmwf).toBe('ecmwf')
    })
  })

  describe('ForecastLocation interface', () => {
    it('should be constructible with required fields', () => {
      const location: ForecastLocation = {
        latitude: 41.8528333,
        longitude: -87.55683333,
        name: 'Test Location',
      }

      expect(location.latitude).toBe(41.8528333)
      expect(location.longitude).toBe(-87.55683333)
      expect(location.name).toBe('Test Location')
    })
  })

  describe('ForecastPoint interface', () => {
    it('should be constructible with required fields', () => {
      const point: ForecastPoint = {
        timestamp: '2026-05-21T18:00:00Z',
        windSpeed: 12,
        windDirection: 180,
      }

      expect(point.timestamp).toBe('2026-05-21T18:00:00Z')
      expect(point.windSpeed).toBe(12)
      expect(point.windDirection).toBe(180)
    })

    it('should accept optional fields', () => {
      const point: ForecastPoint = {
        timestamp: '2026-05-21T18:00:00Z',
        windSpeed: 12,
        windDirection: 180,
        windGust: 18,
        temperature: 68,
        pressure: 1013,
      }

      expect(point.windGust).toBe(18)
      expect(point.temperature).toBe(68)
      expect(point.pressure).toBe(1013)
    })
  })

  describe('WeatherModelResult interface', () => {
    it('should be constructible with all fields', () => {
      const result: WeatherModelResult = {
        modelId: 'gfs',
        location: {
          latitude: 41.8528333,
          longitude: -87.55683333,
          name: 'Test Location',
        },
        forecastPoints: [
          {
            timestamp: '2026-05-21T18:00:00Z',
            windSpeed: 12,
            windDirection: 180,
          },
        ],
        generatedAt: '2026-05-21T12:00:00Z',
        fetchedAt: '2026-05-21T12:05:00Z',
        status: 'online',
      }

      expect(result.modelId).toBe('gfs')
      expect(result.forecastPoints).toHaveLength(1)
      expect(result.status).toBe('online')
    })
  })

  describe('WeatherModelCacheEntry interface', () => {
    it('should be constructible with data and timestamp', () => {
      const entry: WeatherModelCacheEntry = {
        data: {
          modelId: 'hrrr',
          location: {
            latitude: 41.8528333,
            longitude: -87.55683333,
            name: 'Test Location',
          },
          forecastPoints: [],
          generatedAt: '2026-05-21T12:00:00Z',
          fetchedAt: '2026-05-21T12:05:00Z',
          status: 'offline',
        },
        expiresAt: Date.now(),
      }

      expect(entry.data.modelId).toBe('hrrr')
      expect(typeof entry.expiresAt).toBe('number')
    })
  })
})
