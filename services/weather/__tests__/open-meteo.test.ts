/**
 * Open-Meteo weather model service tests
 * Tests cache behavior, staleness detection, and API integration
 */

import { fetchGFS, fetchHRRR, clearCache } from '../open-meteo'
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

describe('fetchHRRR', () => {
  beforeEach(() => {
    clearCache()
    ;(global.fetch as jest.Mock).mockReset()
  })

  describe('Cache behavior', () => {
    it('should fetch from API when cache is empty', async () => {
      // Mock Open-Meteo API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T20:00:00Z'],
            wind_speed_10m: [12.5],
            wind_direction_10m: [270],
            wind_gusts_10m: [18.0],
          },
        }),
      })

      const result = await fetchHRRR(DEFAULT_FORECAST_LOCATION)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.open-meteo.com'),
        expect.any(Object)
      )
      expect(result.modelId).toBe('hrrr')
      expect(result.forecastPoints).toHaveLength(1)
      expect(result.forecastPoints[0].windSpeed).toBe(12.5)
      expect(result.forecastPoints[0].windDirection).toBe(270)
    })

    it('should return cached data when cache is valid', async () => {
      // Mock Open-Meteo API response
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T20:00:00Z', '2026-05-26T21:00:00Z'],
            wind_speed_10m: [12.5, 14.0],
            wind_direction_10m: [270, 275],
            wind_gusts_10m: [18.0, 19.5],
          },
        }),
      })

      // First call populates cache
      const firstResult = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Second call should return cached data (no additional API call)
      const secondResult = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call

      expect(secondResult).toBeDefined()
      expect(secondResult.modelId).toBe('hrrr')
      expect(secondResult.location).toEqual(DEFAULT_FORECAST_LOCATION)
      expect(secondResult.forecastPoints).toHaveLength(2)
    })
  })

  describe('Staleness detection', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-05-26T20:00:00Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should set 15-minute expiration when data is stale', async () => {
      // Mock stale data (first forecast is 2 hours old)
      // HRRR updates every 1 hour + 30 minute buffer = 90 minutes threshold
      // 2 hours (120 min) > 90 minutes = STALE
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T18:00:00Z', '2026-05-26T19:00:00Z'],
            wind_speed_10m: [12.5, 14.0],
            wind_direction_10m: [270, 275],
            wind_gusts_10m: [18.0, 19.5],
          },
        }),
      })

      const result = await fetchHRRR(DEFAULT_FORECAST_LOCATION)

      // First fetch should succeed
      expect(result.forecastPoints).toHaveLength(2)

      // Advance time by 14 minutes (still within 15-minute retry window)
      jest.advanceTimersByTime(14 * 60 * 1000)

      // Second call should return cached data (no new API call)
      const cachedResult = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call

      // Advance time by 2 more minutes (total 16 minutes, past retry window)
      jest.advanceTimersByTime(2 * 60 * 1000)

      // Mock fresh data for retry
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T20:15:00Z'],
            wind_speed_10m: [16.0],
            wind_direction_10m: [280],
            wind_gusts_10m: [22.0],
          },
        }),
      })

      // Third call should trigger new API call (past retry window)
      const retryResult = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(2) // New API call made
      expect(retryResult.forecastPoints[0].windSpeed).toBe(16.0)
    })

    it('should use normal cache expiration when data is fresh', async () => {
      // Mock fresh data (first forecast is 30 minutes old)
      // HRRR: 1 hour + 30 minute buffer = 90 minutes threshold
      // 30 minutes < 90 minutes = FRESH
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-26T19:30:00Z'],
            wind_speed_10m: [12.5],
            wind_direction_10m: [270],
            wind_gusts_10m: [18.0],
          },
        }),
      })

      const result = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
      expect(result.forecastPoints).toHaveLength(1)

      // Advance time by 20 minutes (still before next HRRR run at 21:00 UTC)
      jest.advanceTimersByTime(20 * 60 * 1000)

      // Should still return cached data (expires at next model run, not 15 min)
      const cachedResult = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })
})
