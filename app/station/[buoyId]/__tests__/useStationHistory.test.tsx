import { renderHook, act } from '@testing-library/react'
import type { BuoyHistoryData, WindDataPoint } from '@/types'
import { useStationHistory } from '../useStationHistory'

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }))

import useSWR from 'swr'
const mockUseSWR = useSWR as jest.Mock

const WINDOW_MS = 5 * 60 * 1000

function samples(count = 3): WindDataPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 10 * 60 * 1000).toISOString(),
    spd: 12,
    dir: 245,
  }))
}

function reading(buoyId: string, overrides: Partial<BuoyHistoryData> = {}): BuoyHistoryData {
  return {
    buoyId,
    name: buoyId === 'CHII2' ? 'Harrison Dever Crib' : 'Purdue Buoy',
    history: samples(),
    status: 'online',
    fetchedAt: new Date().toISOString(),
    ...overrides,
  } as BuoyHistoryData
}

/** A poll that has not answered yet. */
function pending(mutate = jest.fn()): jest.Mock {
  return mockUseSWR.mockReturnValue({ data: undefined, mutate, isValidating: false })
}

function answered(buoys: BuoyHistoryData[], mutate = jest.fn()): void {
  mockUseSWR.mockReturnValue({
    data: { buoys, fetchedAt: new Date().toISOString() },
    mutate,
    isValidating: false,
  })
}

describe('useStationHistory', () => {
  const seed = { data: samples(5), fetchedAt: new Date().toISOString() }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hands back the server render until a poll answers', () => {
    pending()

    const { result } = renderHook(() => useStationHistory('CHII2', seed))

    expect(result.current.data).toBe(seed.data)
    expect(result.current.fetchedAt).toBe(seed.fetchedAt)
  })

  it('adopts a polled reading, so the screen leaves the cached render behind', () => {
    const polled = reading('CHII2', { fetchedAt: '2026-09-16T15:30:00.000Z' })
    answered([polled, reading('45198')])

    const { result } = renderHook(() => useStationHistory('CHII2', seed))

    expect(result.current.data).toBe(polled.history)
    expect(result.current.fetchedAt).toBe('2026-09-16T15:30:00.000Z')
  })

  it('takes this station and not the other one', () => {
    const purdue = reading('45198', { fetchedAt: '2026-09-16T15:31:00.000Z' })
    answered([reading('CHII2'), purdue])

    const { result } = renderHook(() => useStationHistory('45198', seed))

    expect(result.current.data).toBe(purdue.history)
  })

  it('keeps the reading it has when a poll comes back empty for this station', () => {
    // A chart on screen is worth more than the newest possible answer: a single bad
    // round trip should not blank 72 hours of history.
    answered([reading('CHII2', { history: null, status: 'error', error: 'NDBC 503' })])

    const { result } = renderHook(() => useStationHistory('CHII2', seed))

    expect(result.current.data).toBe(seed.data)
    expect(result.current.fetchedAt).toBe(seed.fetchedAt)
  })

  it('asks again when the reading it got is already past the window', () => {
    jest.useFakeTimers()
    try {
      const mutate = jest.fn()
      const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString()
      answered([reading('CHII2', { fetchedAt: stale })], mutate)

      renderHook(() => useStationHistory('CHII2', seed))

      expect(mutate).not.toHaveBeenCalled()

      // Past the window the Data Cache served what it had and refreshed behind the
      // request, so the fresh reading is a moment away — this screen asks for it.
      act(() => {
        jest.advanceTimersByTime(5 * 1000)
      })
      expect(mutate).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('gives up asking rather than polling forever behind a refresh that keeps failing', () => {
    jest.useFakeTimers()
    try {
      const mutate = jest.fn()
      // `fetchedAt` never moves — the refresh behind the read is failing every time.
      const stuck = new Date(Date.now() - 6 * 60 * 1000).toISOString()
      answered([reading('CHII2', { fetchedAt: stuck })], mutate)

      renderHook(() => useStationHistory('CHII2', seed))

      // A whole minute is twelve waits. It asks twice and gives up.
      act(() => {
        jest.advanceTimersByTime(60 * 1000)
      })

      expect(mutate).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('stops asking once a reading inside the window arrives', () => {
    jest.useFakeTimers()
    try {
      const mutate = jest.fn()
      answered([reading('CHII2', { fetchedAt: new Date().toISOString() })], mutate)

      renderHook(() => useStationHistory('CHII2', seed))

      act(() => {
        jest.advanceTimersByTime(60 * 1000)
      })

      expect(mutate).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('is willing to ask again the next time the reading goes stale', () => {
    jest.useFakeTimers()
    try {
      const mutate = jest.fn()
      const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString()
      answered([reading('CHII2', { fetchedAt: stale })], mutate)

      const { rerender } = renderHook(() => useStationHistory('CHII2', seed))
      act(() => {
        jest.advanceTimersByTime(60 * 1000)
      })
      expect(mutate).toHaveBeenCalledTimes(2)

      // The retry worked: a reading inside the window arrives.
      answered([reading('CHII2', { fetchedAt: new Date().toISOString() })], mutate)
      rerender()

      // Five minutes on, the poll brings back something stale again. The cap is
      // per stale reading, not for the life of the screen.
      answered([reading('CHII2', { fetchedAt: stale })], mutate)
      rerender()
      act(() => {
        jest.advanceTimersByTime(5 * 1000)
      })

      expect(mutate).toHaveBeenCalledTimes(3)
    } finally {
      jest.useRealTimers()
    }
  })

  it('polls on the freshness window and when the tab comes back', () => {
    pending()

    renderHook(() => useStationHistory('CHII2', seed))

    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/weather/buoys/history',
      expect.any(Function),
      expect.objectContaining({
        refreshInterval: WINDOW_MS,
        revalidateOnFocus: true,
      })
    )
  })

  it('refresh() asks straight away', () => {
    const mutate = jest.fn()
    pending(mutate)

    const { result } = renderHook(() => useStationHistory('CHII2', seed))
    act(() => {
      result.current.refresh()
    })

    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
