'use client'

import { createContext, useContext } from 'react'

/**
 * How a screen asks for the **Auth Sheet**: one function, and nothing else.
 *
 * A **Locked Entry**'s invitation lives on a *page*, and the sheet is mounted in
 * the *layout* (ADR 0016) — and a Next layout cannot pass props to a page, which
 * is the same wall ADR 0018 hit when it moved the **Account** resolve upward.
 * That ADR's answer was a route-group layout and a prop, because an Account is
 * data the server owns and a client provider "cannot unlock a screen".
 *
 * This is not that. It is a request to open a piece of chrome: known only in the
 * browser, with nothing for a server to resolve and nothing to unlock. So it
 * travels the only way left.
 *
 * Deliberately *only* the opener — nothing reads whether the sheet is open, and
 * the signed-in sailor does not pass through here. The Account is still resolved
 * once on the server and handed down as a prop.
 */
const AuthSheetOpenerContext = createContext<(() => void) | null>(null)

/** Wraps the screens that may open the sheet. `AppLayout` is the only caller. */
export const AuthSheetOpener = AuthSheetOpenerContext.Provider

/**
 * Opens the **Auth Sheet** over the screen the sailor is on.
 *
 * Throws rather than no-oping when there is no opener above it: a padlock with
 * nowhere to send anyone is the one thing ADR 0015 forbids, and a silent button
 * is exactly that dead end wearing a disguise.
 */
export function useOpenAuthSheet(): () => void {
  const open = useContext(AuthSheetOpenerContext)

  if (!open) {
    throw new Error(
      'useOpenAuthSheet: no AuthSheetOpener above this component. The Auth Sheet is mounted in app/(app)/layout.tsx, so only a screen inside that route group can open it.'
    )
  }

  return open
}
