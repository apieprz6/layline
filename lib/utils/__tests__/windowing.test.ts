import { windowData, TIME_SCALES } from '../windowing'
import type { WindDataPoint } from '@/types'

describe('TIME_SCALES configuration', () => {
  it('has complete configuration for all time scales', () => {
    expect(TIME_SCALES['30m']).toEqual({
      minutes: 30,
      label: 'Last 30 min',
      ticks: [0, 5, 10, 15, 20, 25, 30],
    })

    expect(TIME_SCALES['1h']).toEqual({
      minutes: 60,
      label: 'Last hour',
      ticks: [0, 15, 30, 45, 60],
    })

    expect(TIME_SCALES['6h']).toEqual({
      minutes: 360,
      label: 'Last 6 hours',
      ticks: [0, 60, 120, 180, 240, 300, 360],
    })

    expect(TIME_SCALES['24h']).toEqual({
      minutes: 1440,
      label: 'Last 24 hours',
      ticks: [0, 240, 480, 720, 960, 1200, 1440],
    })

    expect(TIME_SCALES['72h']).toEqual({
      minutes: 4320,
      label: 'Last 72 hours',
      ticks: [0, 720, 1440, 2160, 2880, 3600, 4320],
    })
  })

  it('has ticks that start at 0 and end at minutes value', () => {
    Object.entries(TIME_SCALES).forEach(([, config]) => {
      expect(config.ticks[0]).toBe(0)
      expect(config.ticks[config.ticks.length - 1]).toBe(config.minutes)
    })
  })
})

describe('windowData - Time Scale Filtering', () => {
  // Reference time for all tests
  const now = new Date('2026-05-19T18:00:00Z')

  // Sample data covering 120 minutes (2 hours)
  const sampleData: WindDataPoint[] = [
    { timestamp: '2026-05-19T18:00:00Z', spd: 12, dir: 220 },    // now
    { timestamp: '2026-05-19T17:50:00Z', spd: 13, dir: 225 },    // 10 mins ago
    { timestamp: '2026-05-19T17:40:00Z', spd: 11, dir: 215 },    // 20 mins ago
    { timestamp: '2026-05-19T17:30:00Z', spd: 14, dir: 230 },    // 30 mins ago
    { timestamp: '2026-05-19T17:20:00Z', spd: 12, dir: 220 },    // 40 mins ago
    { timestamp: '2026-05-19T17:10:00Z', spd: 15, dir: 235 },    // 50 mins ago
    { timestamp: '2026-05-19T17:00:00Z', spd: 13, dir: 225 },    // 1 hour ago
    { timestamp: '2026-05-19T16:50:00Z', spd: 14, dir: 230 },    // 70 mins ago
    { timestamp: '2026-05-19T16:40:00Z', spd: 12, dir: 220 },    // 80 mins ago
    { timestamp: '2026-05-19T16:30:00Z', spd: 11, dir: 215 },    // 90 mins ago
    { timestamp: '2026-05-19T16:20:00Z', spd: 13, dir: 225 },    // 100 mins ago
    { timestamp: '2026-05-19T16:10:00Z', spd: 12, dir: 220 },    // 110 mins ago
    { timestamp: '2026-05-19T16:00:00Z', spd: 14, dir: 230 },    // 2 hours ago
  ]

  describe('30m scale', () => {
    it('returns only points within last 30 minutes', () => {
      const result = windowData(sampleData, '30m', now)

      expect(result).toHaveLength(4)
      expect(result[0].timestamp).toBe('2026-05-19T18:00:00Z')
      expect(result[1].timestamp).toBe('2026-05-19T17:50:00Z')
      expect(result[2].timestamp).toBe('2026-05-19T17:40:00Z')
      expect(result[3].timestamp).toBe('2026-05-19T17:30:00Z')

      // Verify all points are within 30 minutes from reference time
      result.forEach(point => {
        const minsAgo = (now.getTime() - new Date(point.timestamp).getTime()) / (60 * 1000)
        expect(minsAgo).toBeLessThanOrEqual(30)
      })
    })
  })

  describe('1h scale', () => {
    it('returns only points within last 60 minutes', () => {
      const result = windowData(sampleData, '1h', now)

      expect(result).toHaveLength(7)
      expect(result[result.length - 1].timestamp).toBe('2026-05-19T17:00:00Z')

      // Verify all points are within 60 minutes
      result.forEach(point => {
        const minsAgo = (now.getTime() - new Date(point.timestamp).getTime()) / (60 * 1000)
        expect(minsAgo).toBeLessThanOrEqual(60)
      })
    })
  })

  describe('6h scale', () => {
    it('returns only points within last 360 minutes', () => {
      const extendedData: WindDataPoint[] = [
        ...sampleData,
        { timestamp: '2026-05-19T15:00:00Z', spd: 10, dir: 210 },    // 180 mins ago
        { timestamp: '2026-05-19T12:00:00Z', spd: 11, dir: 220 },    // 360 mins ago
        { timestamp: '2026-05-19T11:20:00Z', spd: 12, dir: 225 },    // 400 mins ago (beyond 6h)
      ]

      const result = windowData(extendedData, '6h', now)

      expect(result).toHaveLength(15)
      result.forEach(point => {
        const minsAgo = (now.getTime() - new Date(point.timestamp).getTime()) / (60 * 1000)
        expect(minsAgo).toBeLessThanOrEqual(360)
      })
    })
  })

  describe('24h scale', () => {
    it('returns only points within last 1440 minutes', () => {
      const extendedData: WindDataPoint[] = [
        ...sampleData,
        { timestamp: '2026-05-19T06:00:00Z', spd: 10, dir: 210 },    // 12 hours ago
        { timestamp: '2026-05-18T18:00:00Z', spd: 11, dir: 220 },    // 24 hours ago
        { timestamp: '2026-05-18T17:00:00Z', spd: 12, dir: 225 },    // 1500 mins ago (beyond 24h)
      ]

      const result = windowData(extendedData, '24h', now)

      expect(result).toHaveLength(15)
      result.forEach(point => {
        const minsAgo = (now.getTime() - new Date(point.timestamp).getTime()) / (60 * 1000)
        expect(minsAgo).toBeLessThanOrEqual(1440)
      })
    })
  })

  describe('72h scale', () => {
    it('returns all points within last 4320 minutes', () => {
      const extendedData: WindDataPoint[] = [
        ...sampleData,
        { timestamp: '2026-05-18T08:40:00Z', spd: 10, dir: 210 },    // 2000 mins ago
        { timestamp: '2026-05-16T18:00:00Z', spd: 11, dir: 220 },    // 72 hours ago
        { timestamp: '2026-05-16T16:40:00Z', spd: 12, dir: 225 },    // 4400 mins ago (beyond 72h)
      ]

      const result = windowData(extendedData, '72h', now)

      expect(result).toHaveLength(15)
      result.forEach(point => {
        const minsAgo = (now.getTime() - new Date(point.timestamp).getTime()) / (60 * 1000)
        expect(minsAgo).toBeLessThanOrEqual(4320)
      })
    })
  })

  describe('edge cases', () => {
    it('returns empty array when input is empty', () => {
      const result = windowData([], '1h', now)
      expect(result).toEqual([])
    })

    it('returns empty array when no points within time window', () => {
      const oldData: WindDataPoint[] = [
        { timestamp: '2026-05-19T16:20:00Z', spd: 10, dir: 210 },    // 100 mins ago
        { timestamp: '2026-05-19T16:00:00Z', spd: 11, dir: 220 },    // 120 mins ago
      ]
      const result = windowData(oldData, '30m', now)
      expect(result).toEqual([])
    })

    it('preserves original data structure', () => {
      const result = windowData(sampleData, '1h', now)
      expect(result[0]).toHaveProperty('timestamp')
      expect(result[0]).toHaveProperty('spd')
      expect(result[0]).toHaveProperty('dir')
    })

    it('handles undefined data gracefully', () => {
      const result = windowData(undefined, '1h', now)
      expect(result).toEqual([])
    })

    it('handles null data gracefully', () => {
      const result = windowData(null, '1h', now)
      expect(result).toEqual([])
    })
  })
})
