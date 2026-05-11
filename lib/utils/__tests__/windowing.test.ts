import { windowData } from '../windowing'
import type { MinuteDataPoint } from '@/types'

describe('windowData - Time Scale Filtering', () => {
  // Sample data covering 120 minutes (2 hours)
  const sampleData: MinuteDataPoint[] = [
    { minsAgo: 0, spd: 12, dir: 220 },    // now
    { minsAgo: 10, spd: 13, dir: 225 },
    { minsAgo: 20, spd: 11, dir: 215 },
    { minsAgo: 30, spd: 14, dir: 230 },
    { minsAgo: 40, spd: 12, dir: 220 },
    { minsAgo: 50, spd: 15, dir: 235 },
    { minsAgo: 60, spd: 13, dir: 225 },   // 1 hour ago
    { minsAgo: 70, spd: 14, dir: 230 },
    { minsAgo: 80, spd: 12, dir: 220 },
    { minsAgo: 90, spd: 11, dir: 215 },
    { minsAgo: 100, spd: 13, dir: 225 },
    { minsAgo: 110, spd: 12, dir: 220 },
    { minsAgo: 120, spd: 14, dir: 230 },  // 2 hours ago
  ]

  describe('30m scale', () => {
    it('returns only points within last 30 minutes', () => {
      const result = windowData(sampleData, '30m')

      expect(result).toHaveLength(4)
      expect(result[0].minsAgo).toBe(0)
      expect(result[1].minsAgo).toBe(10)
      expect(result[2].minsAgo).toBe(20)
      expect(result[3].minsAgo).toBe(30)

      // Verify all points are within 30 minutes
      result.forEach(point => {
        expect(point.minsAgo).toBeLessThanOrEqual(30)
      })
    })
  })

  describe('1h scale', () => {
    it('returns only points within last 60 minutes', () => {
      const result = windowData(sampleData, '1h')

      expect(result).toHaveLength(7)
      expect(result[result.length - 1].minsAgo).toBe(60)

      // Verify all points are within 60 minutes
      result.forEach(point => {
        expect(point.minsAgo).toBeLessThanOrEqual(60)
      })
    })
  })

  describe('6h scale', () => {
    it('returns only points within last 360 minutes', () => {
      const extendedData: MinuteDataPoint[] = [
        ...sampleData,
        { minsAgo: 180, spd: 10, dir: 210 },
        { minsAgo: 360, spd: 11, dir: 220 },
        { minsAgo: 400, spd: 12, dir: 225 }, // Beyond 6h
      ]

      const result = windowData(extendedData, '6h')

      expect(result).toHaveLength(15)
      result.forEach(point => {
        expect(point.minsAgo).toBeLessThanOrEqual(360)
      })
    })
  })

  describe('24h scale', () => {
    it('returns only points within last 1440 minutes', () => {
      const extendedData: MinuteDataPoint[] = [
        ...sampleData,
        { minsAgo: 720, spd: 10, dir: 210 },  // 12 hours ago
        { minsAgo: 1440, spd: 11, dir: 220 }, // 24 hours ago
        { minsAgo: 1500, spd: 12, dir: 225 }, // Beyond 24h
      ]

      const result = windowData(extendedData, '24h')

      expect(result).toHaveLength(15)
      result.forEach(point => {
        expect(point.minsAgo).toBeLessThanOrEqual(1440)
      })
    })
  })

  describe('72h scale', () => {
    it('returns all points within last 4320 minutes', () => {
      const extendedData: MinuteDataPoint[] = [
        ...sampleData,
        { minsAgo: 2000, spd: 10, dir: 210 },
        { minsAgo: 4320, spd: 11, dir: 220 }, // 72 hours ago
        { minsAgo: 4400, spd: 12, dir: 225 }, // Beyond 72h
      ]

      const result = windowData(extendedData, '72h')

      expect(result).toHaveLength(15)
      result.forEach(point => {
        expect(point.minsAgo).toBeLessThanOrEqual(4320)
      })
    })
  })

  describe('edge cases', () => {
    it('returns empty array when input is empty', () => {
      const result = windowData([], '1h')
      expect(result).toEqual([])
    })

    it('returns empty array when no points within time window', () => {
      const futureData: MinuteDataPoint[] = [
        { minsAgo: 100, spd: 10, dir: 210 },
        { minsAgo: 120, spd: 11, dir: 220 },
      ]
      const result = windowData(futureData, '30m')
      expect(result).toEqual([])
    })

    it('preserves original data structure', () => {
      const result = windowData(sampleData, '1h')
      expect(result[0]).toHaveProperty('minsAgo')
      expect(result[0]).toHaveProperty('spd')
      expect(result[0]).toHaveProperty('dir')
    })
  })
})
