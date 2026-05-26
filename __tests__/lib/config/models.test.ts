/**
 * Weather model configuration tests
 * Validates model config structure and timing logic
 */

import { MODEL_CONFIGS, type ModelConfig, getModelConfig, getNextRunTime, getCacheExpiration, isDataStale } from '@/lib/config/models'
import type { ModelId } from '@/types'

describe('Model Configuration', () => {
  const modelIds: ModelId[] = ['gfs', 'hrrr', 'ecmwf']

  describe('MODEL_CONFIGS', () => {
    it('should have configurations for all three models', () => {
      expect(Object.keys(MODEL_CONFIGS)).toHaveLength(3)
      expect(MODEL_CONFIGS).toHaveProperty('gfs')
      expect(MODEL_CONFIGS).toHaveProperty('hrrr')
      expect(MODEL_CONFIGS).toHaveProperty('ecmwf')
    })

    modelIds.forEach((modelId) => {
      describe(`${modelId.toUpperCase()} model`, () => {
        let config: ModelConfig

        beforeAll(() => {
          config = MODEL_CONFIGS[modelId]
        })

        it('should have all required fields', () => {
          expect(config).toHaveProperty('modelId')
          expect(config).toHaveProperty('name')
          expect(config).toHaveProperty('updateFrequencyHours')
          expect(config).toHaveProperty('forecastHorizonHours')
          expect(config).toHaveProperty('runTimes')
          expect(config).toHaveProperty('stalenessBufferMinutes')
        })

        it('should have matching modelId', () => {
          expect(config.modelId).toBe(modelId)
        })

        it('should have a descriptive name', () => {
          expect(config.name).toBeTruthy()
          expect(typeof config.name).toBe('string')
          expect(config.name.length).toBeGreaterThan(0)
        })

        it('should have valid update frequency', () => {
          expect(config.updateFrequencyHours).toBeGreaterThan(0)
          expect(config.updateFrequencyHours).toBeLessThanOrEqual(24)
          expect(Number.isInteger(config.updateFrequencyHours)).toBe(true)
        })

        it('should have valid forecast horizon', () => {
          expect(config.forecastHorizonHours).toBeGreaterThan(0)
          expect(config.forecastHorizonHours).toBeGreaterThanOrEqual(24) // At least 1 day ahead
          expect(Number.isInteger(config.forecastHorizonHours)).toBe(true)
        })

        it('should have forecast horizon greater than update frequency', () => {
          expect(config.forecastHorizonHours).toBeGreaterThan(config.updateFrequencyHours)
        })

        it('should have valid run times', () => {
          expect(Array.isArray(config.runTimes)).toBe(true)
          expect(config.runTimes.length).toBeGreaterThan(0)

          // Each run time should be in HH:MM format and valid UTC time
          config.runTimes.forEach((runTime) => {
            expect(runTime).toMatch(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
            const [hours, minutes] = runTime.split(':').map(Number)
            expect(hours).toBeGreaterThanOrEqual(0)
            expect(hours).toBeLessThan(24)
            expect(minutes).toBeGreaterThanOrEqual(0)
            expect(minutes).toBeLessThan(60)
          })
        })

        it('should have run times matching update frequency', () => {
          const expectedRunsPerDay = 24 / config.updateFrequencyHours
          expect(config.runTimes.length).toBe(expectedRunsPerDay)
        })

        it('should have valid staleness buffer', () => {
          expect(config.stalenessBufferMinutes).toBeGreaterThan(0)
          expect(config.stalenessBufferMinutes).toBeLessThan(config.updateFrequencyHours * 60)
          expect(Number.isInteger(config.stalenessBufferMinutes)).toBe(true)
        })
      })
    })
  })

  describe('Model-specific configurations', () => {
    it('GFS should have 6-hour updates', () => {
      expect(MODEL_CONFIGS.gfs.updateFrequencyHours).toBe(6)
    })

    it('HRRR should have 1-hour updates', () => {
      expect(MODEL_CONFIGS.hrrr.updateFrequencyHours).toBe(1)
    })

    it('ECMWF should have 12-hour updates', () => {
      expect(MODEL_CONFIGS.ecmwf.updateFrequencyHours).toBe(12)
    })

    it('HRRR should have shortest forecast horizon (18-48h regional model)', () => {
      expect(MODEL_CONFIGS.hrrr.forecastHorizonHours).toBeLessThan(MODEL_CONFIGS.gfs.forecastHorizonHours)
      expect(MODEL_CONFIGS.hrrr.forecastHorizonHours).toBeLessThan(MODEL_CONFIGS.ecmwf.forecastHorizonHours)
    })

    it('GFS and ECMWF should have multi-day forecast horizons', () => {
      expect(MODEL_CONFIGS.gfs.forecastHorizonHours).toBeGreaterThanOrEqual(120) // At least 5 days
      expect(MODEL_CONFIGS.ecmwf.forecastHorizonHours).toBeGreaterThanOrEqual(120)
    })
  })

  describe('getModelConfig', () => {
    it('should return GFS configuration', () => {
      const config = getModelConfig('gfs')

      expect(config.modelId).toBe('gfs')
      expect(config.name).toBe('NOAA GFS')
      expect(config.updateFrequencyHours).toBe(6)
      expect(config.forecastHorizonHours).toBe(384)
      expect(config.runTimes).toEqual(['00:00', '06:00', '12:00', '18:00'])
      expect(config.stalenessBufferMinutes).toBe(120)
    })

    it('should return HRRR configuration', () => {
      const config = getModelConfig('hrrr')

      expect(config.modelId).toBe('hrrr')
      expect(config.name).toBe('NOAA HRRR')
      expect(config.updateFrequencyHours).toBe(1)
      expect(config.forecastHorizonHours).toBe(48)
      expect(config.runTimes).toHaveLength(24) // Hourly
      expect(config.stalenessBufferMinutes).toBe(30)
    })

    it('should return ECMWF configuration', () => {
      const config = getModelConfig('ecmwf')

      expect(config.modelId).toBe('ecmwf')
      expect(config.name).toBe('ECMWF')
      expect(config.updateFrequencyHours).toBe(12)
      expect(config.forecastHorizonHours).toBe(240)
      expect(config.runTimes).toEqual(['00:00', '12:00'])
      expect(config.stalenessBufferMinutes).toBe(180)
    })
  })

  describe('getNextRunTime', () => {
    describe('GFS (6-hour cycle)', () => {
      it('should return next run when current time is before first run', () => {
        // Current time: 2026-05-26 02:00 UTC (between 00:00 and 06:00 run)
        const currentTime = new Date('2026-05-26T02:00:00Z')
        const nextRun = getNextRunTime('gfs', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-26T06:00:00.000Z')
      })

      it('should return next run when current time is between runs', () => {
        // Current time: 2026-05-26 14:30 UTC (between 12:00 and 18:00 run)
        const currentTime = new Date('2026-05-26T14:30:00Z')
        const nextRun = getNextRunTime('gfs', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-26T18:00:00.000Z')
      })

      it('should rollover to next day when past last run', () => {
        // Current time: 2026-05-26 20:00 UTC (after 18:00 run)
        const currentTime = new Date('2026-05-26T20:00:00Z')
        const nextRun = getNextRunTime('gfs', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-27T00:00:00.000Z')
      })

      it('should handle UTC midnight rollover', () => {
        // Current time: 2026-05-26 23:59 UTC (just before midnight)
        const currentTime = new Date('2026-05-26T23:59:00Z')
        const nextRun = getNextRunTime('gfs', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-27T00:00:00.000Z')
      })
    })

    describe('HRRR (1-hour cycle)', () => {
      it('should return next hour for hourly model', () => {
        // Current time: 2026-05-26 14:30 UTC
        const currentTime = new Date('2026-05-26T14:30:00Z')
        const nextRun = getNextRunTime('hrrr', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-26T15:00:00.000Z')
      })

      it('should rollover to next day at 23:30', () => {
        // Current time: 2026-05-26 23:30 UTC
        const currentTime = new Date('2026-05-26T23:30:00Z')
        const nextRun = getNextRunTime('hrrr', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-27T00:00:00.000Z')
      })
    })

    describe('ECMWF (12-hour cycle)', () => {
      it('should return 12:00 when current time is in morning', () => {
        // Current time: 2026-05-26 08:00 UTC
        const currentTime = new Date('2026-05-26T08:00:00Z')
        const nextRun = getNextRunTime('ecmwf', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-26T12:00:00.000Z')
      })

      it('should return next day 00:00 when current time is after 12:00', () => {
        // Current time: 2026-05-26 15:00 UTC
        const currentTime = new Date('2026-05-26T15:00:00Z')
        const nextRun = getNextRunTime('ecmwf', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-27T00:00:00.000Z')
      })
    })

    describe('Boundary cases', () => {
      it('should handle exact run time', () => {
        // Current time: exactly 12:00 UTC
        const currentTime = new Date('2026-05-26T12:00:00Z')
        const nextRun = getNextRunTime('gfs', currentTime)

        // Should return next run (18:00), not the current one
        expect(nextRun.toISOString()).toBe('2026-05-26T18:00:00.000Z')
      })

      it('should handle milliseconds after run time', () => {
        // Current time: 12:00:00.001 UTC (1ms after run)
        const currentTime = new Date('2026-05-26T12:00:00.001Z')
        const nextRun = getNextRunTime('gfs', currentTime)

        expect(nextRun.toISOString()).toBe('2026-05-26T18:00:00.000Z')
      })
    })
  })

  describe('getCacheExpiration', () => {
    it('should return Unix timestamp for next run time', () => {
      // Current time: 2026-05-26 14:00 UTC
      const currentTime = new Date('2026-05-26T14:00:00Z')
      const expiration = getCacheExpiration('gfs', currentTime)

      // Next GFS run is 18:00 UTC
      const expectedTimestamp = new Date('2026-05-26T18:00:00Z').getTime()
      expect(expiration).toBe(expectedTimestamp)
    })

    it('should return numeric timestamp', () => {
      const currentTime = new Date('2026-05-26T14:00:00Z')
      const expiration = getCacheExpiration('hrrr', currentTime)

      expect(typeof expiration).toBe('number')
      expect(expiration).toBeGreaterThan(currentTime.getTime())
    })

    it('should handle UTC rollover correctly', () => {
      // Current time: 2026-05-26 23:30 UTC (after last GFS run at 18:00)
      const currentTime = new Date('2026-05-26T23:30:00Z')
      const expiration = getCacheExpiration('gfs', currentTime)

      // Should expire at next day 00:00 UTC
      const expectedTimestamp = new Date('2026-05-27T00:00:00Z').getTime()
      expect(expiration).toBe(expectedTimestamp)
    })

    it('should work for all three models', () => {
      const currentTime = new Date('2026-05-26T08:00:00Z')

      const gfsExpiration = getCacheExpiration('gfs', currentTime)
      const hrrrExpiration = getCacheExpiration('hrrr', currentTime)
      const ecmwfExpiration = getCacheExpiration('ecmwf', currentTime)

      // All should be in the future
      expect(gfsExpiration).toBeGreaterThan(currentTime.getTime())
      expect(hrrrExpiration).toBeGreaterThan(currentTime.getTime())
      expect(ecmwfExpiration).toBeGreaterThan(currentTime.getTime())

      // HRRR expires soonest (hourly runs)
      expect(hrrrExpiration).toBeLessThan(gfsExpiration)

      // At 08:00 UTC, both GFS and ECMWF next run at 12:00
      expect(gfsExpiration).toBe(ecmwfExpiration)
    })

    it('should show different expiration times when runs diverge', () => {
      // Current time: 2026-05-26 13:00 UTC
      // GFS next run: 18:00 (5 hours)
      // ECMWF next run: 00:00 next day (11 hours)
      const currentTime = new Date('2026-05-26T13:00:00Z')

      const gfsExpiration = getCacheExpiration('gfs', currentTime)
      const ecmwfExpiration = getCacheExpiration('ecmwf', currentTime)

      expect(gfsExpiration).toBeLessThan(ecmwfExpiration)
      expect(gfsExpiration).toBe(new Date('2026-05-26T18:00:00Z').getTime())
      expect(ecmwfExpiration).toBe(new Date('2026-05-27T00:00:00Z').getTime())
    })
  })

  describe('isDataStale', () => {
    beforeEach(() => {
      // Mock current time to make tests deterministic
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    describe('GFS (2-hour staleness buffer)', () => {
      it('should return false when data is fresh (within buffer)', () => {
        // Current time: 2026-05-26 13:00 UTC
        jest.setSystemTime(new Date('2026-05-26T13:00:00Z'))

        // First forecast time: 2026-05-26 12:00 UTC (1 hour old)
        // GFS update frequency: 6 hours + 2 hour buffer = 8 hours
        // 1 hour < 8 hours = NOT stale
        const firstForecastTime = '2026-05-26T12:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'gfs')
        expect(isStale).toBe(false)
      })

      it('should return false when data is exactly at buffer threshold', () => {
        // Current time: 2026-05-26 20:00 UTC
        jest.setSystemTime(new Date('2026-05-26T20:00:00Z'))

        // First forecast time: 2026-05-26 12:00 UTC (8 hours old)
        // GFS: 6 hours + 2 hour buffer = 8 hours
        // 8 hours = 8 hours = exactly at threshold = NOT stale
        const firstForecastTime = '2026-05-26T12:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'gfs')
        expect(isStale).toBe(false)
      })

      it('should return true when data exceeds buffer', () => {
        // Current time: 2026-05-26 20:01 UTC
        jest.setSystemTime(new Date('2026-05-26T20:01:00Z'))

        // First forecast time: 2026-05-26 12:00 UTC (8 hours 1 minute old)
        // GFS: 6 hours + 2 hour buffer = 8 hours
        // 8h 1m > 8 hours = STALE
        const firstForecastTime = '2026-05-26T12:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'gfs')
        expect(isStale).toBe(true)
      })
    })

    describe('HRRR (30-minute staleness buffer)', () => {
      it('should return false when data is fresh', () => {
        // Current time: 2026-05-26 14:30 UTC
        jest.setSystemTime(new Date('2026-05-26T14:30:00Z'))

        // First forecast time: 2026-05-26 14:00 UTC (30 minutes old)
        // HRRR: 1 hour + 30 minute buffer = 90 minutes
        // 30 min < 90 min = NOT stale
        const firstForecastTime = '2026-05-26T14:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'hrrr')
        expect(isStale).toBe(false)
      })

      it('should return true when data exceeds buffer', () => {
        // Current time: 2026-05-26 15:31 UTC
        jest.setSystemTime(new Date('2026-05-26T15:31:00Z'))

        // First forecast time: 2026-05-26 14:00 UTC (91 minutes old)
        // HRRR: 1 hour + 30 minute buffer = 90 minutes
        // 91 min > 90 min = STALE
        const firstForecastTime = '2026-05-26T14:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'hrrr')
        expect(isStale).toBe(true)
      })
    })

    describe('ECMWF (3-hour staleness buffer)', () => {
      it('should return false when data is fresh', () => {
        // Current time: 2026-05-26 14:00 UTC
        jest.setSystemTime(new Date('2026-05-26T14:00:00Z'))

        // First forecast time: 2026-05-26 12:00 UTC (2 hours old)
        // ECMWF: 12 hours + 3 hour buffer = 15 hours
        // 2 hours < 15 hours = NOT stale
        const firstForecastTime = '2026-05-26T12:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'ecmwf')
        expect(isStale).toBe(false)
      })

      it('should return true when data exceeds buffer', () => {
        // Current time: 2026-05-27 03:01 UTC
        jest.setSystemTime(new Date('2026-05-27T03:01:00Z'))

        // First forecast time: 2026-05-26 12:00 UTC (15 hours 1 minute old)
        // ECMWF: 12 hours + 3 hour buffer = 15 hours
        // 15h 1m > 15 hours = STALE
        const firstForecastTime = '2026-05-26T12:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'ecmwf')
        expect(isStale).toBe(true)
      })
    })

    describe('Edge cases', () => {
      it('should handle data from future (clock skew)', () => {
        // Current time: 2026-05-26 14:00 UTC
        jest.setSystemTime(new Date('2026-05-26T14:00:00Z'))

        // First forecast time: 2026-05-26 15:00 UTC (1 hour in future)
        const firstForecastTime = '2026-05-26T15:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'gfs')
        // Negative age means data is from future = NOT stale
        expect(isStale).toBe(false)
      })

      it('should handle very old data', () => {
        // Current time: 2026-05-26 14:00 UTC
        jest.setSystemTime(new Date('2026-05-26T14:00:00Z'))

        // First forecast time: 2026-05-25 14:00 UTC (24 hours old)
        const firstForecastTime = '2026-05-25T14:00:00Z'

        const isStale = isDataStale(firstForecastTime, 'gfs')
        // 24 hours > 8 hours = STALE
        expect(isStale).toBe(true)
      })
    })
  })
})
