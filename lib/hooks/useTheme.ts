'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setThemePreference,
  subscribeToTheme,
  syncThemeWithAccount,
} from '@/lib/theme/store'
import type { ThemePreference, ResolvedTheme } from '@/types'

export type { ThemePreference, ResolvedTheme }

/**
 * The theme, for a screen that shows or changes it.
 *
 * Reads the one store in `lib/theme/store.ts` rather than holding its own copy, so
 * that however many instances are mounted they agree — a second instance still
 * holding `auto` used to undo an explicit choice at the next dawn (LAY-128). The
 * returned shape has not changed.
 *
 * `setPreference` is the store's own function, so it is referentially stable across
 * renders and safe in a dependency array.
 */
export function useTheme(): {
  theme: ResolvedTheme
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
} {
  const { theme, preference } = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  return { theme, preference, setPreference: setThemePreference }
}

/**
 * Keeps the theme running, for the chrome that owns no part of it.
 *
 * `AppLayout` used to call `useTheme()` and throw the result away, which is what
 * made it a second holder of the preference. This says what it actually wants: the
 * class on the document and the twilight timer running on every screen, without
 * subscribing — so the whole app does not re-render when the theme changes.
 *
 * The `userId` is the server-resolved **Account**'s, handed down as a prop
 * (ADR 0018); passing it here is what lets a preference chosen on another device
 * arrive, and what tells the store there is a **Profile** worth writing to. `null`
 * is a **Guest**, whose preference lives in `localStorage` alone.
 */
export function useThemeSync(userId: string | null): void {
  useEffect(() => {
    syncThemeWithAccount(userId)
  }, [userId])
}
