import { calculateWindowStats } from '../windowStats'
import type { MinuteDataPoint } from '@/types'

describe('calculateWindowStats', () => {
  describe('Tracer bullet: vector averaging for direction', () => {
    it('averages 350° and 10° to 0°, not 180° (wraparound case)', () => {
      // Setup: Three points near north with wraparound
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 350 },
        { minsAgo: 10, spd: 10, dir: 0 },
        { minsAgo: 20, spd: 10, dir: 10 },
      ]

      const result = calculateWindowStats(points)

      // Vector averaging should give 0° (north), not arithmetic mean of 120°
      expect(result).not.toBeNull()
      expect(result!.meanDir).toBe(0)
    })
  })

  describe('Insufficient data handling', () => {
    it('returns null for fewer than 3 points', () => {
      const twoPoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 180 },
        { minsAgo: 10, spd: 12, dir: 190 },
      ]

      const result = calculateWindowStats(twoPoints)
      expect(result).toBeNull()
    })

    it('returns stats for exactly 3 points (boundary)', () => {
      const threePoints: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 180 },
        { minsAgo: 10, spd: 12, dir: 190 },
        { minsAgo: 20, spd: 11, dir: 185 },
      ]

      const result = calculateWindowStats(threePoints)
      expect(result).not.toBeNull()
      expect(result!.count).toBe(3)
    })

    it('returns null for empty array', () => {
      const result = calculateWindowStats([])
      expect(result).toBeNull()
    })
  })

  describe('Mean speed calculation', () => {
    it('calculates arithmetic mean of speeds', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 180 },
        { minsAgo: 10, spd: 12, dir: 180 },
        { minsAgo: 20, spd: 14, dir: 180 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // (10 + 12 + 14) / 3 = 12
      expect(result!.meanSpd).toBe(12)
    })

    it('handles decimal speeds correctly', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10.5, dir: 180 },
        { minsAgo: 10, spd: 11.5, dir: 180 },
        { minsAgo: 20, spd: 12.0, dir: 180 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // (10.5 + 11.5 + 12) / 3 = 11.333...
      expect(result!.meanSpd).toBeCloseTo(11.333, 2)
    })
  })

  describe('Speed range calculation', () => {
    it('calculates min and max speeds', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 8, dir: 180 },
        { minsAgo: 10, spd: 15, dir: 180 },
        { minsAgo: 20, spd: 12, dir: 180 },
        { minsAgo: 30, spd: 6, dir: 180 },
        { minsAgo: 40, spd: 18, dir: 180 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      expect(result!.spdMin).toBe(6)
      expect(result!.spdMax).toBe(18)
    })

    it('handles same speed for all points', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 180 },
        { minsAgo: 10, spd: 10, dir: 180 },
        { minsAgo: 20, spd: 10, dir: 180 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      expect(result!.spdMin).toBe(10)
      expect(result!.spdMax).toBe(10)
    })
  })

  describe('Veer/back spread calculation', () => {
    it('calculates full angular spread around mean direction', () => {
      // Mean direction will be 180°
      // Spread from 170° to 190° = 20° total spread
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 170 },
        { minsAgo: 10, spd: 10, dir: 180 },
        { minsAgo: 20, spd: 10, dir: 190 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // Max deviation is 10° (either direction), full spread = 20°
      expect(result!.spread).toBe(20)
    })

    it('handles wraparound in spread calculation', () => {
      // Mean direction will be ~0° (north)
      // Points at 350°, 0°, 10° → max deviation 10°, spread 20°
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 350 },
        { minsAgo: 10, spd: 10, dir: 0 },
        { minsAgo: 20, spd: 10, dir: 10 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      expect(result!.spread).toBe(20)
    })

    it('handles large oscillations correctly', () => {
      // Mean direction ~225° (SW)
      // Points swing from 180° to 270° = 90° total spread
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 180 },
        { minsAgo: 10, spd: 10, dir: 225 },
        { minsAgo: 20, spd: 10, dir: 270 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // Max deviation is 45° (either direction), full spread = 90°
      expect(result!.spread).toBe(90)
    })

    it('returns zero spread when all directions identical', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 180 },
        { minsAgo: 10, spd: 12, dir: 180 },
        { minsAgo: 20, spd: 14, dir: 180 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      expect(result!.spread).toBe(0)
    })
  })

  describe('Additional wraparound cases for direction', () => {
    it('averages 270° and 90° to 0° (wraps through north)', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 270 },
        { minsAgo: 10, spd: 10, dir: 0 },
        { minsAgo: 20, spd: 10, dir: 90 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // Vector average should be 0° (north)
      expect(result!.meanDir).toBe(0)
    })

    it('averages 90° and 270° to 180° (wraps through south)', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 90 },
        { minsAgo: 10, spd: 10, dir: 180 },
        { minsAgo: 20, spd: 10, dir: 270 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // Vector average should be 180° (south)
      expect(result!.meanDir).toBe(180)
    })

    it('handles directions clustered around 360°/0° boundary', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 10, dir: 359 },
        { minsAgo: 10, spd: 10, dir: 0 },
        { minsAgo: 20, spd: 10, dir: 1 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      // Should average to 0°, not some large number
      expect(result!.meanDir).toBe(0)
    })
  })

  describe('Complete calculation integration', () => {
    it('returns all fields with correct values for realistic data', () => {
      const points: MinuteDataPoint[] = [
        { minsAgo: 0, spd: 12.5, dir: 225 },
        { minsAgo: 10, spd: 14.0, dir: 230 },
        { minsAgo: 20, spd: 13.2, dir: 220 },
        { minsAgo: 30, spd: 11.8, dir: 235 },
        { minsAgo: 40, spd: 15.1, dir: 228 },
      ]

      const result = calculateWindowStats(points)
      expect(result).not.toBeNull()
      expect(result!.count).toBe(5)
      expect(result!.meanDir).toBeGreaterThanOrEqual(220)
      expect(result!.meanDir).toBeLessThanOrEqual(235)
      expect(result!.meanSpd).toBeCloseTo(13.32, 1)
      expect(result!.spdMin).toBe(11.8)
      expect(result!.spdMax).toBe(15.1)
      expect(result!.spread).toBeGreaterThan(0)
      expect(result!.spread).toBeLessThan(30)
    })
  })
})
