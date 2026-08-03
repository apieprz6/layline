'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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

  const [tick, setTick] = useState(0)

  // tick changes on interval to re-evaluate time-dependent resolveTheme()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => resolveTheme(preference), [preference, tick])

  const setPreference = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref)
    setPreferenceState(pref)
  }, [])

  useEffect(() => {
    if (theme === 'nightvision') {
      document.documentElement.classList.add('theme-nightvision')
    } else {
      document.documentElement.classList.remove('theme-nightvision')
    }
  }, [theme])

  useEffect(() => {
    if (preference !== 'auto') return

    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, REEVALUATE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [preference])

  return { theme, preference, setPreference }
}
