import { carries, latestPoint, readingAt, shows } from '../stationReadings'
import type { WindDataPointWithOffset } from '@/types'

const point = (
  minsAgo: number,
  fields: Partial<WindDataPointWithOffset> = {}
): WindDataPointWithOffset => ({
  timestamp: new Date(Date.UTC(2026, 9, 13, 18, 0) - minsAgo * 60_000).toISOString(),
  spd: 12,
  dir: 220,
  minsAgo,
  ...fields,
})

describe('readingAt', () => {
  it('is the displayed point itself when it carries the reading', () => {
    const at = point(10, { gust: 18 })
    const data = [point(0, { gust: 20 }), at, point(20, { gust: 16 })]

    expect(readingAt(data, at, 'gust')).toEqual({ point: at, lastAt: null })
  })

  it('never carries an older value forward: a null reading is missing, with when the last one was', () => {
    const at = point(0, { waveHeight: null })
    const data = [at, point(10, { waveHeight: null }), point(20, { waveHeight: 2.1 }), point(30, { waveHeight: 2.4 })]

    expect(readingAt(data, at, 'waveHeight')).toEqual({
      point: null,
      lastAt: new Date(data[2].timestamp),
    })
  })

  it('treats an absent field the same as a null one', () => {
    const at = point(0)
    const data = [at, point(10, { gust: 15 })]

    expect(readingAt(data, at, 'gust')).toEqual({ point: null, lastAt: new Date(data[1].timestamp) })
  })

  it('looks back from the displayed moment, not forward from it', () => {
    const at = point(30, { gust: null })
    const data = [point(0, { gust: 20 }), point(10, { gust: 19 }), at]

    expect(readingAt(data, at, 'gust')).toEqual({ point: null, lastAt: null })
  })

  it('has nothing to say with nothing displayed', () => {
    expect(readingAt([point(0, { gust: 12 })], undefined, 'gust')).toEqual({ point: null, lastAt: null })
  })
})

describe('carries', () => {
  it('is true when any point has the field, even as null', () => {
    expect(carries([point(0, { waveHeight: null }), point(10)], 'waveHeight')).toBe(true)
  })

  it('is false when no point has the field at all', () => {
    expect(carries([point(0), point(10)], 'waveHeight')).toBe(false)
  })
})

describe('latestPoint', () => {
  it('is the observation at the reference time when there is one', () => {
    const data = [point(10), point(0), point(20)]

    expect(latestPoint(data)).toBe(data[1])
  })

  it('is otherwise the first the feed reports, which is its newest', () => {
    const data = [point(12), point(22)]

    expect(latestPoint(data)).toBe(data[0])
  })

  it('is undefined for an empty history', () => {
    expect(latestPoint([])).toBeUndefined()
  })
})

describe('shows', () => {
  const data = [point(0, { gust: null }), point(10, { gust: 18 })]

  it('is true only for a quantity the station measures and its history carries', () => {
    expect(shows({ gust: true, waves: true }, data, 'gust')).toBe(true)
    expect(shows({ gust: false, waves: true }, data, 'gust')).toBe(false)
    expect(shows({ gust: true, waves: true }, data, 'waveHeight')).toBe(false)
  })

  it('shows nothing when no capability is known', () => {
    expect(shows(undefined, data, 'gust')).toBe(false)
  })
})
