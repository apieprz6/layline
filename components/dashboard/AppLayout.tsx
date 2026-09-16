'use client'

import { useEffect, useState, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import RaceHeader from './RaceHeader'
import HamburgerMenu from './HamburgerMenu'
import AuthSheet from '@/components/auth/AuthSheet'
import { signInWithGoogle, signOutHere } from '@/lib/account/browserAuth'
import { relativePathOrHome } from '@/lib/account/nextPath'
import { useThemeSync } from '@/lib/hooks/useTheme'
import { useRefreshOnIdentityChange } from '@/lib/hooks/useRefreshOnIdentityChange'
import type { Account } from '@/types'

interface AppLayoutProps {
  children: ReactNode
  /**
   * Resolved once, on the server, in the route-group layout and handed down —
   * there is no context and no client-side fetch of the signed-in sailor
   * (ADR 0018). `null` is a **Guest**.
   */
  account: Account | null
}

export default function AppLayout({ children, account }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  /**
   * Where signing in should land, when that is somewhere other than here: the
   * section a **Locked Entry**'s Sign in belongs to, or the route a **Guest**
   * deep-linked to before being sent back here (ADR 0015).
   */
  const [signInDestination, setSignInDestination] = useState<string | null>(null)
  const pathname = usePathname()

  // The root layout runs the theme on every screen; what only the chrome can do is
  // say who the sailor is, from the **Account** it was handed. That is what lets a
  // preference chosen on another device arrive, and what makes a change made here
  // reach the **Profile** rather than this browser alone. It does not read the theme,
  // so a change does not re-render the whole app.
  useThemeSync(account?.userId ?? null)

  // The client learns *when* the identity changed, never who it is.
  useRefreshOnIdentityChange()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const asked = params.get('signin')
    if (!asked) return

    // Sanitised on the way in rather than on the way out: it arrives in a URL
    // anyone can write, and it ends up as a redirect target.
    //
    // Set from the effect body on purpose, against `set-state-in-effect`: the URL
    // is an external system that only exists after mount, and reading it during
    // render would either throw on the server or hydrate a sheet the server did
    // not draw. One extra render, on the one arrival a redirect sent here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount
    setSignInDestination(relativePathOrHome(asked))
    setSheetOpen(true)
    // Then taken back out of the URL — that one param only, since a Target Time
    // or a chosen station may be sitting beside it — so a reload or a Back does
    // not reopen a sheet the sailor has already dismissed.
    params.delete('signin')
    const rest = params.toString()
    window.history.replaceState(null, '', rest ? `${pathname}?${rest}` : pathname)
  }, [pathname])

  function closeSheet(): void {
    setSheetOpen(false)
    // The destination belongs to the offer that was taken up, not to the sailor:
    // dismissing it here and signing in from the drawer later should land where
    // *that* asked for.
    setSignInDestination(null)
  }

  return (
    <div className="min-h-screen">
      <RaceHeader
        onOpenMenu={() => setMenuOpen(true)}
      />

      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        account={account}
        onSignIn={(destination) => {
          // The drawer closes with the sheet opening: the round trip through
          // Google reloads the page anyway, so it would not survive to be
          // reopened, and the sheet is what the sailor is now looking at.
          setMenuOpen(false)
          // A **Locked Entry**'s Sign in names its own section, so the sailor
          // arrives at the thing they were offered rather than back here. The
          // account block's Sign in names nothing, and means "here".
          setSignInDestination(destination ?? null)
          setSheetOpen(true)
        }}
        onSignOut={() => {
          // No relocation — the sailor stays on the screen they are on
          // (ADR 0018). The auth event refreshes the chrome around them.
          void signOutHere()
        }}
      />

      {/* Mounted here, not in the dashboard, so it opens over whatever screen
          the sailor is on (ADR 0016). */}
      <AuthSheet
        isOpen={sheetOpen}
        onClose={closeSheet}
        onContinueWithGoogle={() => {
          // Nothing to await: the SDK navigates the browser to Google, and the
          // sailor comes back through /auth/callback — to the section they were
          // offered, if one was, and otherwise to this same screen. The query
          // string goes with the path, because a screen the sailor set up — a
          // Target Time, a chosen station — is the screen they were on, not just
          // its route. Read off `window` rather than through `useSearchParams`,
          // which would subscribe the whole chrome to every query change.
          void signInWithGoogle(signInDestination ?? pathname + window.location.search)
        }}
      />

      <div className="max-w-md mx-auto md:mx-0 md:max-w-none">
        {children}
      </div>
    </div>
  )
}
