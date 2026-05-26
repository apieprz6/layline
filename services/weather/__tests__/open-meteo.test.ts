/**
 * Open-Meteo weather model service tests
 * Tests cache behavior, staleness detection, and API integration
 */

import { fetchWeatherModel, fetchGFS, fetchHRRR, fetchECMWF } from '../open-meteo'
import { setCacheAdapter, InMemoryWeatherCache } from '../cache'
import { DEFAULT_FORECAST_LOCATION } from '@/lib/config/locations'
import type { ModelId } from '@/types'

// Mock fetch globally
global.fetch = jest.fn()

// Model test scenarios with specific configurations
const modelScenarios = [
  {
    modelId: 'gfs' as ModelId,
    name: 'GFS',
    apiName: 'gfs_global',
    updateFrequencyHours: 6,
    stalenessBufferMinutes: 120,
    staleThresholdMinutes: 6 * 60 + 120, // 8 hours
    fetchFunction: fetchGFS,
  },
  {
    modelId: 'hrrr' as ModelId,
    name: 'HRRR',
    apiName: 'hrrr_conus',
    updateFrequencyHours: 1,
    stalenessBufferMinutes: 30,
    staleThresholdMinutes: 1 * 60 + 30, // 90 minutes
    fetchFunction: fetchHRRR,
  },
  {
    modelId: 'ecmwf' as ModelId,
    name: 'ECMWF',
    apiName: 'ecmwf_ifs04',
    updateFrequencyHours: 12,
    stalenessBufferMinutes: 180,
    staleThresholdMinutes: 12 * 60 + 180, // 15 hours
    fetchFunction: fetchECMWF,
  },
]

describe.each(modelScenarios)(
  'Weather model: $name',
  ({ modelId, name, apiName, staleThresholdMinutes, fetchFunction }) => {
    beforeEach(() => {
      // Reset cache before each test
      setCacheAdapter(new InMemoryWeatherCache())
      // Reset fetch mock
      ;(global.fetch as jest.Mock).mockReset()
    })

    describe('Cache behavior', () => {
      it('should return cached data when cache is valid', async () => {
        // Use current time for fresh data
        const now = new Date()
        const oneHourLater = new Date(now.getTime() + 3600000)

        // Mock Open-Meteo API response
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: [now.toISOString(), oneHourLater.toISOString()],
              wind_speed_10m: [10.5, 12.3],
              wind_direction_10m: [180, 185],
              wind_gusts_10m: [15.2, 16.1],
            },
          }),
        })

        // First call populates cache
        const firstResult = await fetchFunction(DEFAULT_FORECAST_LOCATION)
        expect(global.fetch).toHaveBeenCalledTimes(1)

        // Second call should return cached data (no additional API call)
        const secondResult = await fetchFunction(DEFAULT_FORECAST_LOCATION)
        expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call

        expect(secondResult).toBeDefined()
        expect(secondResult.modelId).toBe(modelId)
        expect(secondResult.location).toEqual(DEFAULT_FORECAST_LOCATION)
        expect(secondResult.forecastPoints).toHaveLength(2)
        expect(secondResult.status).toBe('online')
      })

      it('should fetch from API when cache is empty', async () => {
        // Use current time for fresh data
        const now = new Date()

        // Mock Open-Meteo API response
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: [now.toISOString()],
              wind_speed_10m: [10.5],
              wind_direction_10m: [180],
              wind_gusts_10m: [15.2],
            },
          }),
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(global.fetch).toHaveBeenCalledTimes(1)
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('api.open-meteo.com'),
          expect.any(Object)
        )
        expect(result.modelId).toBe(modelId)
        expect(result.forecastPoints).toHaveLength(1)
        expect(result.forecastPoints[0].windSpeed).toBe(10.5)
        expect(result.forecastPoints[0].windDirection).toBe(180)
        expect(result.status).toBe('online')
      })

      it('should use correct Open-Meteo API model name', async () => {
        const now = new Date()

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: [now.toISOString()],
              wind_speed_10m: [10.5],
              wind_direction_10m: [180],
            },
          }),
        })

        await fetchFunction(DEFAULT_FORECAST_LOCATION)

        const callUrl = (global.fetch as jest.Mock).mock.calls[0][0]
        expect(callUrl).toContain(`models=${apiName}`)
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

      it('should mark data as stale when exceeding staleness threshold', async () => {
        // Calculate stale timestamp (before staleness threshold)
        const staleMinutes = staleThresholdMinutes + 30 // 30 min past threshold
        const staleDate = new Date(Date.now() - staleMinutes * 60 * 1000)

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: [staleDate.toISOString(), new Date(staleDate.getTime() + 3600000).toISOString()],
              wind_speed_10m: [10.5, 12.3],
              wind_direction_10m: [180, 185],
            },
          }),
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.status).toBe('stale')
        expect(result.forecastPoints).toHaveLength(2)
      })

      it('should mark data as online when within staleness threshold', async () => {
        // Calculate fresh timestamp (within staleness threshold)
        const freshMinutes = staleThresholdMinutes - 30 // 30 min before threshold
        const freshDate = new Date(Date.now() - freshMinutes * 60 * 1000)

        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: [freshDate.toISOString(), new Date(freshDate.getTime() + 3600000).toISOString()],
              wind_speed_10m: [10.5, 12.3],
              wind_direction_10m: [180, 185],
            },
          }),
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.status).toBe('online')
        expect(result.forecastPoints).toHaveLength(2)
      })
    })

    describe('Null value filtering', () => {
      it('should filter out forecast points with null wind speed', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z', '2026-05-26T14:00:00Z'],
              wind_speed_10m: [10.5, null, 12.3],
              wind_direction_10m: [180, 185, 190],
              wind_gusts_10m: [15.2, 16.1, 17.0],
            },
          }),
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.forecastPoints).toHaveLength(2)
        expect(result.forecastPoints[0].windSpeed).toBe(10.5)
        expect(result.forecastPoints[1].windSpeed).toBe(12.3)
      })

      it('should filter out forecast points with null wind direction', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            hourly: {
              time: ['2026-05-26T12:00:00Z', '2026-05-26T13:00:00Z', '2026-05-26T14:00:00Z'],
              wind_speed_10m: [10.5, 11.2, 12.3],
              wind_direction_10m: [180, null, 190],
              wind_gusts_10m: [15.2, 16.1, 17.0],
            },
          }),
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.forecastPoints).toHaveLength(2)
        expect(result.forecastPoints[0].windDirection).toBe(180)
        expect(result.forecastPoints[1].windDirection).toBe(190)
      })

      it('should handle null wind gust values', async () => {
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

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.forecastPoints).toHaveLength(2)
        expect(result.forecastPoints[0].windGust).toBe(15.2)
        expect(result.forecastPoints[1].windGust).toBeUndefined()
      })
    })

    describe('Error handling', () => {
      it('should return error result on API failure', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.status).toBe('error')
        expect(result.error).toContain('Open-Meteo API error')
        expect(result.forecastPoints).toHaveLength(0)
        expect(result.modelId).toBe(modelId)
      })

      it('should return error result on network error', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.status).toBe('error')
        expect(result.error).toBe('Network error')
        expect(result.forecastPoints).toHaveLength(0)
      })

      it('should return error result for malformed JSON', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON')
          },
        })

        const result = await fetchFunction(DEFAULT_FORECAST_LOCATION)

        expect(result.status).toBe('error')
        expect(result.error).toContain('Invalid JSON')
      })
    })
  }
)

describe('Coordinate validation', () => {
  beforeEach(() => {
    setCacheAdapter(new InMemoryWeatherCache())
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('should return error for latitude above 90', async () => {
    const invalidLocation = {
      latitude: 91,
      longitude: -87.55683333,
      name: 'Invalid Location',
    }

    const result = await fetchWeatherModel('gfs', invalidLocation)

    expect(result.status).toBe('error')
    expect(result.error).toContain('Invalid latitude')
    expect(result.forecastPoints).toHaveLength(0)
  })

  it('should return error for latitude below -90', async () => {
    const invalidLocation = {
      latitude: -91,
      longitude: -87.55683333,
      name: 'Invalid Location',
    }

    const result = await fetchWeatherModel('gfs', invalidLocation)

    expect(result.status).toBe('error')
    expect(result.error).toContain('Invalid latitude')
  })

  it('should return error for longitude above 180', async () => {
    const invalidLocation = {
      latitude: 41.8528333,
      longitude: 181,
      name: 'Invalid Location',
    }

    const result = await fetchWeatherModel('gfs', invalidLocation)

    expect(result.status).toBe('error')
    expect(result.error).toContain('Invalid longitude')
  })

  it('should return error for longitude below -180', async () => {
    const invalidLocation = {
      latitude: 41.8528333,
      longitude: -181,
      name: 'Invalid Location',
    }

    const result = await fetchWeatherModel('gfs', invalidLocation)

    expect(result.status).toBe('error')
    expect(result.error).toContain('Invalid longitude')
  })

  it('should accept valid boundary coordinates', async () => {
    const validBoundaryLocation = {
      latitude: 90,
      longitude: 180,
      name: 'North Pole Edge',
    }

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-05-26T12:00:00Z'],
          wind_speed_10m: [10.5],
          wind_direction_10m: [180],
        },
      }),
    })

    const result = await fetchWeatherModel('gfs', validBoundaryLocation)

    expect(result.status).not.toBe('error')
    expect(result.forecastPoints).toHaveLength(1)
  })
})

describe('Model-specific wrapper functions', () => {
  beforeEach(() => {
    setCacheAdapter(new InMemoryWeatherCache())
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('fetchGFS should call fetchWeatherModel with gfs modelId', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-05-26T12:00:00Z'],
          wind_speed_10m: [10.5],
          wind_direction_10m: [180],
        },
      }),
    })

    const result = await fetchGFS(DEFAULT_FORECAST_LOCATION)
    expect(result.modelId).toBe('gfs')
  })

  it('fetchHRRR should call fetchWeatherModel with hrrr modelId', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-05-26T12:00:00Z'],
          wind_speed_10m: [10.5],
          wind_direction_10m: [180],
        },
      }),
    })

    const result = await fetchHRRR(DEFAULT_FORECAST_LOCATION)
    expect(result.modelId).toBe('hrrr')
  })

  it('fetchECMWF should call fetchWeatherModel with ecmwf modelId', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-05-26T12:00:00Z'],
          wind_speed_10m: [10.5],
          wind_direction_10m: [180],
        },
      }),
    })

    const result = await fetchECMWF(DEFAULT_FORECAST_LOCATION)
    expect(result.modelId).toBe('ecmwf')
  })
})
