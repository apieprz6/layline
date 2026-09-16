'use client'

import { useThemeRuntime } from '@/lib/hooks/useTheme'

/**
 * Runs the theme store on every screen. Renders nothing.
 *
 * A component only because the root layout is a Server Component and a hook has to
 * be called from a client one. It goes in the root layout rather than the chrome
 * because the chrome is not on every route: `/station/[buoyId]` sits outside
 * `app/(app)/`, and a tab opened cold on a station screen ran no store at all — no
 * preference from the sailor's **Profile**, no twilight crossing — until a routing
 * action took them into the group.
 *
 * It does not subscribe: nothing here reads the theme, so a change re-renders the
 * screens that display it and not the whole app. The chrome keeps `useThemeSync`,
 * which is a different job — saying *who* the sailor is, from the server-resolved
 * **Account** it already holds (ADR 0018).
 */
export default function ThemeRuntime(): null {
  useThemeRuntime()
  return null
}
