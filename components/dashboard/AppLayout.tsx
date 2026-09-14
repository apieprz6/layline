'use client'

import { useCallback, useState, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import RaceHeader from './RaceHeader'
import HamburgerMenu from './HamburgerMenu'
import AuthSheet from '@/components/auth/AuthSheet'
import { AuthSheetOpener } from '@/components/auth/authSheetOpener'
import { signInWithGoogle, signOutHere } from '@/lib/account/browserAuth'
import { useTheme } from '@/lib/hooks/useTheme'
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
  const pathname = usePathname()
  useTheme()

  // The client learns *when* the identity changed, never who it is.
  useRefreshOnIdentityChange()

  const openAuthSheet = useCallback(() => setSheetOpen(true), [])

  return (
    <div className="min-h-screen">
      <RaceHeader
        onOpenMenu={() => setMenuOpen(true)}
      />

      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        account={account}
        onSignIn={() => {
          // The drawer closes with the sheet opening: the round trip through
          // Google reloads the page anyway, so it would not survive to be
          // reopened, and the sheet is what the sailor is now looking at.
          setMenuOpen(false)
          setSheetOpen(true)
        }}
        onSignOut={() => {
          // No relocation — the sailor stays on the screen they are on
          // (ADR 0018). The auth event refreshes the chrome around them.
          void signOutHere()
        }}
      />

      {/* Mounted here, not in the dashboard, so it opens over whatever screen
          the sailor is on — including a Locked Entry (ADR 0016). */}
      <AuthSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onContinueWithGoogle={() => {
          // Nothing to await: the SDK navigates the browser to Google, and the
          // sailor comes back to this same screen through /auth/callback. The
          // query string goes with the path, because a screen the sailor set up —
          // a Target Time, a chosen station — is the screen they were on, not just
          // its route. Read off `window` rather than through `useSearchParams`,
          // which would subscribe the whole chrome to every query change.
          void signInWithGoogle(pathname + window.location.search)
        }}
      />

      {/* A **Locked Entry**'s screen is one of these children, and its invitation
          has to reach the sheet mounted above it. */}
      <AuthSheetOpener value={openAuthSheet}>
        <div className="max-w-md mx-auto md:mx-0 md:max-w-none">
          {children}
        </div>
      </AuthSheetOpener>
    </div>
  )
}
