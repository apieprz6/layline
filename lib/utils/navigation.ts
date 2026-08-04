import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

const INTERNAL_NAV_KEY = 'layline:internal-nav'

/**
 * Call before router.push() to mark that the destination was reached
 * via internal app navigation (safe to router.back() from).
 */
export function markInternalNavigation(): void {
  sessionStorage.setItem(INTERNAL_NAV_KEY, '1')
}

/**
 * Navigate back within the app. If the user arrived via internal navigation,
 * uses router.back() to return to the previous page. Otherwise falls back to
 * the provided fallback path (defaults to home) to avoid leaving the app.
 */
export function safeBack(router: AppRouterInstance, fallback = '/'): void {
  const cameFromApp = sessionStorage.getItem(INTERNAL_NAV_KEY)
  sessionStorage.removeItem(INTERNAL_NAV_KEY)
  if (cameFromApp) {
    router.back()
  } else {
    router.push(fallback)
  }
}
