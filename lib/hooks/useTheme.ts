'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setThemePreference,
  startTheme,
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
 * Runs the theme on every screen, from the root layout.
 *
 * The chrome is not on every screen — `/station/[buoyId]` is outside `app/(app)/` —
 * and a tab opened cold on one of those ran no store at all: no preference from the
 * **Profile**, and no twilight crossing, until a routing action mounted the chrome.
 * The root layout is the one layout every route has, so this belongs there.
 *
 * `/auth/callback` is the one screen it starts the theme on without asking the
 * **Profile**. The browser is still exchanging the code there, so the server would
 * answer for nobody, and the question would put a request that refreshes auth cookies
 * alongside the one writing them. The sailor is about to be named — `CompleteSignIn`
 * routes onward without a document load, and the chrome asks then.
 */
export function useThemeRuntime(): void {
  const midHandshake = usePathname() === '/auth/callback'

  useEffect(() => {
    startTheme({ askProfile: !midHandshake })
  }, [midHandshake])
}

/**
 * Tells the store who is signed in, for the chrome that owns no part of the theme.
 *
 * `AppLayout` used to call `useTheme()` and throw the result away, which is what
 * made it a second holder of the preference. It subscribes to nothing now, so the
 * whole app does not re-render when the theme changes, and running the theme is no
 * longer its job either — `useThemeRuntime` does that from the root layout, which
 * every route reaches. What is left is the one thing only the chrome can say.
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
