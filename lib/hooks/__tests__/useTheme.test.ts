import { renderHook, act } from '@testing-library/react'
import { useTheme, useThemeRuntime, useThemeSync } from '../useTheme'
import { resetThemeStore } from '@/lib/theme/store'
import { AFTER_DAWN, AFTER_DUSK, mockSunTimes } from '@/lib/theme/__tests__/sunTimes'

jest.mock('suncalc')
/** The screen the runtime is on: only `/auth/callback` changes what it does. */
let pathname = '/'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))
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
    pathname = '/'
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

  describe('useThemeRuntime', () => {
    // From the root layout, so that a tab opened cold on a screen outside
    // `app/(app)/` — `/station/[buoyId]` — themes itself without a routing action
    // first mounting the chrome.
    it('adopts the preference on the Profile with no chrome to say who the sailor is', async () => {
      mockSunTimes({ isNight: false })
      readThemePreference.mockResolvedValue('nightvision')

      await act(async () => {
        renderHook(() => useThemeRuntime())
      })

      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
    })

    it('crosses twilight on a screen the chrome never wrapped', () => {
      mockSunTimes({ isNight: false })

      renderHook(() => useThemeRuntime())

      jest.setSystemTime(AFTER_DUSK)
      act(() => {
        jest.advanceTimersByTime(60_000)
      })

      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
    })

    it('asks the Profile once when the chrome is mounted as well', async () => {
      mockSunTimes({ isNight: false })
      readThemePreference.mockResolvedValue('nightvision')

      await act(async () => {
        renderHook(() => {
          useThemeRuntime()
          useThemeSync(A_SAILOR)
        })
      })

      expect(readThemePreference).toHaveBeenCalledTimes(1)
    })

    it('asks nothing at all when a chrome in the same commit says Guest', async () => {
      mockSunTimes({ isNight: false })

      await act(async () => {
        renderHook(() => {
          useThemeRuntime()
          useThemeSync(null)
        })
      })

      expect(readThemePreference).not.toHaveBeenCalled()
    })

    it('themes the sign-in handshake screen without asking the Profile', async () => {
      // `/auth/callback` is outside `app/(app)/` as well, but the browser is still
      // exchanging the code there: the server would answer for nobody, and the
      // request would refresh auth cookies alongside the one writing them.
      mockSunTimes({ isNight: true })
      pathname = '/auth/callback'

      await act(async () => {
        renderHook(() => useThemeRuntime())
      })

      expect(readThemePreference).not.toHaveBeenCalled()
      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
    })

    it('asks once the sailor is named, after the handshake screen routed onward', async () => {
      // `CompleteSignIn` calls `router.replace`, so there is no document load: this
      // same module state meets the chrome, which is the first thing in the tab that
      // knows who signed in.
      mockSunTimes({ isNight: false })
      readThemePreference.mockResolvedValue('nightvision')
      pathname = '/auth/callback'

      const runtime = renderHook(() => useThemeRuntime())

      pathname = '/'
      await act(async () => {
        runtime.rerender()
        renderHook(() => useThemeSync(A_SAILOR))
      })

      expect(readThemePreference).toHaveBeenCalledTimes(1)
      expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
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
