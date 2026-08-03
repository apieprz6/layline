import { renderHook, act } from '@testing-library/react'
import * as suncalc from 'suncalc'
import { useTheme } from '../useTheme'

jest.mock('suncalc')

const mockedSuncalc = suncalc as jest.Mocked<typeof suncalc>

function mockSunTimes({ isNight }: { isNight: boolean }) {
  const now = new Date('2026-07-15T12:00:00')
  jest.useFakeTimers({ now })

  const civilTwilightEnd = new Date('2026-07-15T21:00:00')
  const civilTwilightStart = new Date('2026-07-15T05:30:00')

  if (isNight) {
    jest.setSystemTime(new Date('2026-07-15T22:00:00'))
  }

  mockedSuncalc.getTimes.mockReturnValue({
    dawn: civilTwilightStart,
    dusk: civilTwilightEnd,
  } as ReturnType<typeof suncalc.getTimes>)
}

describe('useTheme', () => {
  let localStorageStore: Record<string, string> = {}

  beforeEach(() => {
    localStorageStore = {}
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageStore[key] ?? null
    )
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => { localStorageStore[key] = value }
    )
    document.documentElement.className = ''
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('auto mode with solar times', () => {
    it('returns nightvision when preference is auto and time is past civil twilight', () => {
      mockSunTimes({ isNight: true })

      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('nightvision')
    })

    it('returns solar when preference is auto and time is before civil twilight', () => {
      mockSunTimes({ isNight: false })

      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('solar')
    })
  })

  describe('explicit preference overrides', () => {
    it('returns nightvision when preference is nightvision regardless of time', () => {
      mockSunTimes({ isNight: false })
      localStorageStore['layline-theme-preference'] = 'nightvision'

      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('nightvision')
    })

    it('returns solar when preference is solar regardless of time', () => {
      mockSunTimes({ isNight: true })
      localStorageStore['layline-theme-preference'] = 'solar'

      const { result } = renderHook(() => useTheme())

      expect(result.current.theme).toBe('solar')
    })
  })

  describe('localStorage integration', () => {
    it('reads from localStorage on mount and falls back to auto when empty', () => {
      mockSunTimes({ isNight: false })

      const { result } = renderHook(() => useTheme())

      expect(localStorage.getItem).toHaveBeenCalledWith('layline-theme-preference')
      expect(result.current.preference).toBe('auto')
    })

    it('writes to localStorage when preference is changed via setter', () => {
      mockSunTimes({ isNight: false })

      const { result } = renderHook(() => useTheme())

      act(() => {
        result.current.setPreference('nightvision')
      })

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'layline-theme-preference',
        'nightvision'
      )
      expect(result.current.preference).toBe('nightvision')
    })
  })

  describe('DOM class management', () => {
    it('applies theme-nightvision class to document.documentElement when resolved theme is nightvision', () => {
      mockSunTimes({ isNight: true })

      renderHook(() => useTheme())

      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
    })

    it('removes theme-nightvision class when resolved theme is solar', () => {
      document.documentElement.classList.add('theme-nightvision')
      mockSunTimes({ isNight: false })

      renderHook(() => useTheme())

      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(false)
    })
  })

  describe('interval re-evaluation', () => {
    it('re-evaluates theme when the 1-minute interval fires', () => {
      mockSunTimes({ isNight: false })

      const { result } = renderHook(() => useTheme())
      expect(result.current.theme).toBe('solar')

      jest.setSystemTime(new Date('2026-07-15T22:00:00'))

      act(() => {
        jest.advanceTimersByTime(60_000)
      })

      expect(result.current.theme).toBe('nightvision')
    })
  })
})
