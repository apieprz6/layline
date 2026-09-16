import { render } from '@testing-library/react'
import ThemeRuntime from '../ThemeRuntime'
import { resetThemeStore } from '@/lib/theme/store'
import { mockSunTimes } from '@/lib/theme/__tests__/sunTimes'

jest.mock('suncalc')
jest.mock('next/navigation', () => ({
  usePathname: () => '/station/45198',
}))
jest.mock('@/lib/theme/actions', () => ({
  readThemePreference: jest.fn(() => Promise.resolve(null)),
  saveThemePreference: jest.fn(() => Promise.resolve({ ok: true })),
}))

describe('ThemeRuntime', () => {
  afterEach(() => {
    resetThemeStore()
    jest.useRealTimers()
    document.documentElement.className = ''
  })

  it('themes the document from a screen with no chrome, and shows nothing', () => {
    mockSunTimes({ isNight: true })

    const { container } = render(<ThemeRuntime />)

    expect(container).toBeEmptyDOMElement()
    expect(document.documentElement.classList.contains('theme-nightvision')).toBe(true)
  })
})
