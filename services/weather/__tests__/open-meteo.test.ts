/**
 * Open-Meteo weather model service tests
 * Tests cache behavior, staleness detection, and API integration
 */

import { fetchGFS, fetchECMWF, clearCache } from '../open-meteo'
import { DEFAULT_FORECAST_LOCATION } from '@/lib/config/locations'
import type { WeatherModelResult } from '@/types'

// Mock fetch globally
global.fetch = jest.fn()

describe('fetchGFS', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearCache()
    // Reset fetch mock
    ;(global.fetch as jest.Mock).mockReset()
  })

  describe('Cache behavior', () => {
    it('should return cached data when cache is valid', async () => {
      // Mock Open-Meteo API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z'],
            wind_speed_10m: [10.5, 12.3],
            wind_direction_10m: [180, 185],
            wind_gusts_10m: [15.2, 16.1],
          },
        }),
      })

      // First call populates cache
      const firstResult = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Second call should return cached data (no additional API call)
      const secondResult = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call

      expect(secondResult).toBeDefined()
      expect(secondResult.modelId).toBe('gfs')
      expect(secondResult.location).toEqual(DEFAULT_FORECAST_LOCATION)
      expect(secondResult.forecastPoints).toHaveLength(2)
    })

    it('should fetch from API when cache is empty', async () => {
      // Mock Open-Meteo API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z'],
            wind_speed_10m: [10.5],
            wind_direction_10m: [180],
            wind_gusts_10m: [15.2],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.open-meteo.com'),
        expect.any(Object)
      )
      expect(result.modelId).toBe('gfs')
      expect(result.forecastPoints).toHaveLength(1)
      expect(result.forecastPoints[0].windSpeed).toBe(10.5)
      expect(result.forecastPoints[0].windDirection).toBe(180)
    })
  })

  describe('Staleness detection', () => {
    beforeEach(() => {
      // Mock current time to make tests deterministic
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-05-26T20:00:00Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should set 15-minute expiration when data is stale', async () => {
      // Mock stale data (first forecast is 10 hours old)
      // GFS updates every 6 hours + 2 hour buffer = 8 hours threshold
      // 10 hours > 8 hours = STALE
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T10:00:00Z', '2026-05-26T11:00:00Z'],
            wind_speed_10m: [10.5, 12.3],
            wind_direction_10m: [180, 185],
            wind_gusts_10m: [15.2, 16.1],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      // First fetch should succeed
      expect(result.forecastPoints).toHaveLength(2)

      // Advance time by 14 minutes (still within 15-minute retry window)
      jest.advanceTimersByTime(14 * 60 * 1000)

      // Second call should return cached data (no new API call)
      const cachedResult = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call

      // Advance time by 2 more minutes (total 16 minutes, past retry window)
      jest.advanceTimersByTime(2 * 60 * 1000)

      // Mock fresh data for retry
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T20:15:00Z'],
            wind_speed_10m: [15.0],
            wind_direction_10m: [190],
            wind_gusts_10m: [20.0],
          },
        }),
      })

      // Third call should trigger new API call (past retry window)
      const retryResult = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(2) // New API call made
      expect(retryResult.forecastPoints[0].windSpeed).toBe(15.0)
    })

    it('should use normal cache expiration when data is fresh', async () => {
      // Mock fresh data (first forecast is 1 hour old)
      // GFS: 6 hours + 2 hour buffer = 8 hours threshold
      // 1 hour < 8 hours = FRESH
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T19:00:00Z'],
            wind_speed_10m: [10.5],
            wind_direction_10m: [180],
            wind_gusts_10m: [15.2],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(result.forecastPoints).toHaveLength(1)

      // Advance time by 3 hours (still before next GFS run at 00:00 UTC)
      jest.advanceTimersByTime(3 * 60 * 60 * 1000)

      // Should still return cached data (expires at next model run, not 15 min)
      const cachedResult = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Null filtering', () => {
    it('should exclude forecast points with null wind speed', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z', '2026-05-26T14:00:00Z'],
            wind_speed_10m: [10.5, null, 15.0],
            wind_direction_10m: [180, 185, 190],
            wind_gusts_10m: [15.2, 16.1, 20.0],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      // Should only have 2 points (index 1 filtered out due to null speed)
      expect(result.forecastPoints).toHaveLength(2)
      expect(result.forecastPoints[0].windSpeed).toBe(10.5)
      expect(result.forecastPoints[1].windSpeed).toBe(15.0)
    })

    it('should exclude forecast points with null wind direction', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z', '2026-05-26T14:00:00Z'],
            wind_speed_10m: [10.5, 12.3, 15.0],
            wind_direction_10m: [180, null, 190],
            wind_gusts_10m: [15.2, 16.1, 20.0],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.forecastPoints).toHaveLength(2)
      expect(result.forecastPoints[0].windDirection).toBe(180)
      expect(result.forecastPoints[1].windDirection).toBe(190)
    })

    it('should exclude forecast points with both null speed and direction', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z', '2026-05-26T14:00:00Z'],
            wind_speed_10m: [10.5, null, 15.0],
            wind_direction_10m: [180, null, 190],
            wind_gusts_10m: [15.2, null, 20.0],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.forecastPoints).toHaveLength(2)
    })

    it('should handle null gust values gracefully', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z'],
            wind_speed_10m: [10.5, 12.3],
            wind_direction_10m: [180, 185],
            wind_gusts_10m: [15.2, null],
          },
        }),
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.forecastPoints).toHaveLength(2)
      expect(result.forecastPoints[0].windGust).toBe(15.2)
      expect(result.forecastPoints[1].windGust).toBeUndefined()
    })
  })

  describe('Coordinate validation', () => {
    it('should reject latitude above 90', async () => {
      const invalidLocation = {
        latitude: 91,
        longitude: -87.55683333,
        name: 'Invalid Location',
      }

      await expect(fetchGFS(invalidLocation)).rejects.toThrow('Invalid latitude')
    })

    it('should reject latitude below -90', async () => {
      const invalidLocation = {
        latitude: -91,
        longitude: -87.55683333,
        name: 'Invalid Location',
      }

      await expect(fetchGFS(invalidLocation)).rejects.toThrow('Invalid latitude')
    })

    it('should reject longitude above 180', async () => {
      const invalidLocation = {
        latitude: 41.8528333,
        longitude: 181,
        name: 'Invalid Location',
      }

      await expect(fetchGFS(invalidLocation)).rejects.toThrow('Invalid longitude')
    })

    it('should reject longitude below -180', async () => {
      const invalidLocation = {
        latitude: 41.8528333,
        longitude: -181,
        name: 'Invalid Location',
      }

      await expect(fetchGFS(invalidLocation)).rejects.toThrow('Invalid longitude')
    })

    it('should accept valid boundary coordinates', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z'],
            wind_speed_10m: [10.5],
            wind_direction_10m: [180],
            wind_gusts_10m: [15.2],
          },
        }),
      })

      const boundaryLocation = {
        latitude: 90,
        longitude: 180,
        name: 'North Pole Edge',
      }

      const result = await fetchGFS(boundaryLocation)
      expect(result.location).toEqual(boundaryLocation)
    })
  })

  describe('Error handling', () => {
    it('should return error result when API returns 404', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.modelId).toBe('gfs')
      expect(result.forecastPoints).toEqual([])
      expect(result.fetchedAt).toBeDefined()
    })

    it('should return error result when API returns 500', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.modelId).toBe('gfs')
      expect(result.forecastPoints).toEqual([])
    })

    it('should return error result when fetch throws exception', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network failure')
      )

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.modelId).toBe('gfs')
      expect(result.forecastPoints).toEqual([])
    })

    it('should return error result when response JSON is invalid', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)

      expect(result.modelId).toBe('gfs')
      expect(result.forecastPoints).toEqual([])
    })
  })
})

describe('fetchECMWF', () => {
  beforeEach(() => {
    clearCache()
    ;(global.fetch as jest.Mock).mockReset()
  })

  describe('Basic API integration', () => {
    it('should fetch ECMWF forecast from Open-Meteo API', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z'],
            wind_speed_10m: [10.5, 12.3],
            wind_direction_10m: [180, 185],
            wind_gusts_10m: [15.2, 16.1],
          },
        }),
      })

      const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.open-meteo.com'),
        expect.any(Object)
      )
      expect(result.modelId).toBe('ecmwf')
      expect(result.forecastPoints).toHaveLength(2)
      expect(result.forecastPoints[0].windSpeed).toBe(10.5)
      expect(result.forecastPoints[0].windDirection).toBe(180)
    })

    it('should map model ID to ecmwf_ifs04 for Open-Meteo', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z'],
            wind_speed_10m: [10.5],
            wind_direction_10m: [180],
            wind_gusts_10m: [15.2],
          },
        }),
      })

      await fetchECMWF(DEFAULT_FORECAST_LOCATION)

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
      expect(callUrl).toContain('models=ecmwf_ifs04')
    })
  })

  describe('ECMWF-specific staleness detection', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-05-26T16:00:00Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should detect stale data with 12-hour update + 3-hour buffer', async () => {
      // Mock stale data (first forecast is 16 hours old)
      // ECMWF updates every 12 hours + 3 hour buffer = 15 hours threshold
      // 16 hours > 15 hours = STALE
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T00:00:00Z', '2026-05-26T01:00:00Z'],
            wind_speed_10m: [10.5, 12.3],
            wind_direction_10m: [180, 185],
            wind_gusts_10m: [15.2, 16.1],
          },
        }),
      })

      const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(result.forecastPoints).toHaveLength(2)

      // Advance time by 14 minutes (within 15-minute retry window)
      jest.advanceTimersByTime(14 * 60 * 1000)

      // Should return cached data
      const cachedResult = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Advance time by 2 more minutes (past retry window)
      jest.advanceTimersByTime(2 * 60 * 1000)

      // Mock fresh data
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T16:15:00Z'],
            wind_speed_10m: [15.0],
            wind_direction_10m: [190],
            wind_gusts_10m: [20.0],
          },
        }),
      })

      // Should trigger new API call
      const retryResult = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(retryResult.forecastPoints[0].windSpeed).toBe(15.0)
    })

    it('should use normal cache expiration for fresh ECMWF data', async () => {
      // Mock fresh data (first forecast is 2 hours old)
      // ECMWF: 12 hours + 3 hour buffer = 15 hours threshold
      // 2 hours < 15 hours = FRESH
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T14:00:00Z'],
            wind_speed_10m: [10.5],
            wind_direction_10m: [180],
            wind_gusts_10m: [15.2],
          },
        }),
      })

      const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(result.forecastPoints).toHaveLength(1)

      // Advance time by 5 hours (still before next ECMWF run at 00:00 UTC)
      jest.advanceTimersByTime(5 * 60 * 60 * 1000)

      // Should still return cached data
      const cachedResult = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cache behavior', () => {
    it('should return cached ECMWF data when cache is valid', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z'],
            wind_speed_10m: [10.5, 12.3],
            wind_direction_10m: [180, 185],
            wind_gusts_10m: [15.2, 16.1],
          },
        }),
      })

      // First call populates cache
      const firstResult = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Second call should return cached data
      const secondResult = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      expect(secondResult.modelId).toBe('ecmwf')
      expect(secondResult.forecastPoints).toHaveLength(2)
    })

    it('should use separate cache entries for ECMWF and GFS', async () => {
      // Mock ECMWF response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z'],
            wind_speed_10m: [10.5],
            wind_direction_10m: [180],
            wind_gusts_10m: [15.2],
          },
        }),
      })

      const ecmwfResult = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
      expect(ecmwfResult.modelId).toBe('ecmwf')

      // Mock GFS response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T12:00:00Z'],
            wind_speed_10m: [20.0],
            wind_direction_10m: [200],
            wind_gusts_10m: [25.0],
          },
        }),
      })

      const gfsResult = await fetchGFS(DEFAULT_FORECAST_LOCATION)
      expect(gfsResult.modelId).toBe('gfs')

      // Both should have made API calls (not sharing cache)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error handling', () => {
    it('should return error result when ECMWF API fails', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)

      expect(result.modelId).toBe('ecmwf')
      expect(result.forecastPoints).toEqual([])
      expect(result.fetchedAt).toBeDefined()
    })

    it('should return error result when network fails', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network failure')
      )

      const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)

      expect(result.modelId).toBe('ecmwf')
      expect(result.forecastPoints).toEqual([])
    })
  })
})
