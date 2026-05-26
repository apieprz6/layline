/**
 * Weather model configuration tests
 * Validates model config structure and timing logic
 */

import { MODEL_CONFIGS, type ModelConfig } from '@/lib/config/models'
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
})
