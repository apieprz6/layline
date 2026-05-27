/**
 * Location configuration tests
 * Validates race location coordinates and structure
 */

import { COLYC_RACE_CIRCLE, DEFAULT_FORECAST_LOCATION } from '@/lib/config/locations'

describe('Location Configuration', () => {
  describe('COLYC_RACE_CIRCLE', () => {
    it('should have correct coordinates for Navy Pier Racing Circle', () => {
      expect(COLYC_RACE_CIRCLE.latitude).toBe(41.8528333)
      expect(COLYC_RACE_CIRCLE.longitude).toBe(-87.55683333)
    })

    it('should have a descriptive name', () => {
      expect(COLYC_RACE_CIRCLE.name).toBe('COLYC Race Circle')
    })

    it('should be within Lake Michigan bounds', () => {
      // Lake Michigan approximate bounds: 41.5°N - 47.5°N, -88°W - -84.5°W
      expect(COLYC_RACE_CIRCLE.latitude).toBeGreaterThanOrEqual(41.5)
      expect(COLYC_RACE_CIRCLE.latitude).toBeLessThanOrEqual(47.5)
      expect(COLYC_RACE_CIRCLE.longitude).toBeGreaterThanOrEqual(-88)
      expect(COLYC_RACE_CIRCLE.longitude).toBeLessThanOrEqual(-84.5)
    })

    it('should match the ForecastLocation type structure', () => {
      expect(COLYC_RACE_CIRCLE).toHaveProperty('latitude')
      expect(COLYC_RACE_CIRCLE).toHaveProperty('longitude')
      expect(COLYC_RACE_CIRCLE).toHaveProperty('name')
      expect(typeof COLYC_RACE_CIRCLE.latitude).toBe('number')
      expect(typeof COLYC_RACE_CIRCLE.longitude).toBe('number')
      expect(typeof COLYC_RACE_CIRCLE.name).toBe('string')
    })
  })

  describe('DEFAULT_FORECAST_LOCATION', () => {
    it('should reference COLYC_RACE_CIRCLE', () => {
      expect(DEFAULT_FORECAST_LOCATION).toBe(COLYC_RACE_CIRCLE)
    })
  })
})
