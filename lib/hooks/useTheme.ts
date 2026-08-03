'use client'

import { useState, useEffect, useCallback } from 'react'
import { getTimes } from 'suncalc'
import type { ThemePreference, ResolvedTheme } from '@/types'

export type { ThemePreference, ResolvedTheme }

const STORAGE_KEY = 'layline-theme-preference'
const NAVY_PIER_LAT = 41.89
const NAVY_PIER_LNG = -87.60
const REEVALUATE_INTERVAL_MS = 60_000

function isNightTime(): boolean {
  const now = new Date()
  const times = getTimes(now, NAVY_PIER_LAT, NAVY_PIER_LNG)
  const dawn = times.dawn ?? times.sunrise ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6)
  const dusk = times.dusk ?? times.sunset ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20)
  return now < dawn || now > dusk
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'nightvision') return 'nightvision'
  if (preference === 'solar') return 'solar'
  return isNightTime() ? 'nightvision' : 'solar'
}

function applyThemeClass(theme: ResolvedTheme): void {
  if (theme === 'nightvision') {
    document.documentElement.classList.add('theme-nightvision')
  } else {
    document.documentElement.classList.remove('theme-nightvision')
  }
}

export function useTheme(): {
  theme: ResolvedTheme
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'auto'
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'solar' || stored === 'nightvision' || stored === 'auto') {
      return stored
    }
    return 'auto'
  })

  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(preference))

  const setPreference = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref)
    setPreferenceState(pref)
  }, [])

  useEffect(() => {
    const resolved = resolveTheme(preference)
    setTheme(resolved)
    applyThemeClass(resolved)
  }, [preference])

  useEffect(() => {
    if (preference !== 'auto') return

    const interval = setInterval(() => {
      const resolved = resolveTheme(preference)
      setTheme(resolved)
      applyThemeClass(resolved)
    }, REEVALUATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [preference])

  return { theme, preference, setPreference }
}
