import { renderHook, act } from '@testing-library/react'
import { useTheme, useThemeSync } from '../useTheme'
import { resetThemeStore } from '@/lib/theme/store'
import { AFTER_DAWN, AFTER_DUSK, mockSunTimes } from '@/lib/theme/__tests__/sunTimes'

jest.mock('suncalc')
jest.mock('@/lib/theme/actions', () => ({
  readThemePreference: jest.fn(),
  saveThemePreference: jest.fn(),
}))

const { readThemePreference, saveThemePreference } = jest.requireMock('@/lib/theme/actions')

const A_SAILOR = '11111111-1111-1111-1111-111111111111'

describe('useTheme', () => {
  let localStorageStore: Record<string, string> = {}

  beforeEach(() => {
    jest.clearAllMocks()
    localStorageStore = {}
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageStore[key] ?? null
    )
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => { localStorageStore[key] = value }
    )
    document.documentElement.className = ''
    readThemePreference.mockResolvedValue(null)
    saveThemePreference.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    // The preference now lives in a module store shared by every instance, so a test
    // has to open a fresh tab rather than just unmount a component.
    resetThemeStore()
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

      jest.setSystemTime(AFTER_DUSK)

      act(() => {
        jest.advanceTimersByTime(60_000)
      })

      expect(result.current.theme).toBe('nightvision')
    })
  })

  describe('two instances mounted at once (LAY-128)', () => {
    it('shows one instance the preference the other set', () => {
      mockSunTimes({ isNight: false })
      const chrome = renderHook(() => useTheme())
      const settings = renderHook(() => useTheme())

      act(() => {
        settings.result.current.setPreference('nightvision')
      })

      expect(chrome.result.current.preference).toBe('nightvision')
      expect(chrome.result.current.theme).toBe('nightvision')
    })

    it('stops the instance that was on auto re-asserting time-based theming', () => {
      // The bug: the chrome's instance kept `auto` and its 60-second interval, so at
      // the next dawn it re-resolved to solar and took the class the sailor had asked
      // for back off the document.
      mockSunTimes({ isNight: true })
      const chrome = renderHook(() => useTheme())
      const settings = renderHook(() => useTheme())
      expect(chrome.result.current.preference).toBe('auto')

      act(() => {
        settings.result.current.setPreference('nightvision')
      })

      jest.setSystemTime(AFTER_DAWN)
      act(() => {
        jest.advanceTimersByTime(60_000 * 60 * 48)
      })

      expect(chrome.result.current.preference).toBe('nightvision')
      expect(chrome.result.current.theme).toBe('nightvision')
      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
    })

    it('keeps an explicit solar through the following dusk', () => {
      mockSunTimes({ isNight: false })
      const chrome = renderHook(() => useTheme())
      const settings = renderHook(() => useTheme())

      act(() => {
        settings.result.current.setPreference('solar')
      })

      jest.setSystemTime(AFTER_DUSK)
      act(() => {
        jest.advanceTimersByTime(60_000 * 60 * 48)
      })

      expect(chrome.result.current.theme).toBe('solar')
      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(false)
    })

    it('leaves an instance that unmounts unable to break the one that stays', () => {
      mockSunTimes({ isNight: false })
      const chrome = renderHook(() => useTheme())
      const settings = renderHook(() => useTheme())

      act(() => {
        settings.result.current.setPreference('nightvision')
      })
      settings.unmount()

      jest.setSystemTime(AFTER_DAWN)
      act(() => {
        jest.advanceTimersByTime(60_000 * 60 * 48)
      })

      expect(chrome.result.current.preference).toBe('nightvision')
    })
  })

  describe('useThemeSync', () => {
    it('adopts the preference on the sailor’s Profile over a stale localStorage', async () => {
      mockSunTimes({ isNight: false })
      localStorageStore['layline-theme-preference'] = 'solar'
      readThemePreference.mockResolvedValue('nightvision')

      const reader = renderHook(() => useTheme())
      await act(async () => {
        renderHook(() => useThemeSync(A_SAILOR))
      })

      expect(reader.result.current.preference).toBe('nightvision')
    })

    it('reads nothing for a Guest', async () => {
      mockSunTimes({ isNight: false })

      await act(async () => {
        renderHook(() => useThemeSync(null))
      })

      expect(readThemePreference).not.toHaveBeenCalled()
    })

    it('starts the store without subscribing to it', () => {
      // The chrome uses no part of the theme — it only needs the class on the
      // document and the twilight timer running — so it must not re-render every
      // time the theme changes.
      mockSunTimes({ isNight: true })

      const { result } = renderHook(() => useThemeSync(null))

      expect(result.current).toBeUndefined()
      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
    })

    it('re-reads the Profile when the signed-in sailor changes', async () => {
      mockSunTimes({ isNight: false })

      const sync = renderHook(({ userId }) => useThemeSync(userId), {
        initialProps: { userId: null as string | null },
      })
      await act(async () => {
        sync.rerender({ userId: A_SAILOR })
      })

      expect(readThemePreference).toHaveBeenCalledTimes(1)
    })
  })
})
