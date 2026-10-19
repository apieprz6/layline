/**
 * How a screen opens the **Auth Sheet** it cannot reach. The sheet is mounted in `AppLayout`
 * (ADR 0016), and a page gets no prop from a layout, so a page's own Sign in asks through a
 * window event that `AppLayout` listens for.
 *
 * It carries no identity and unlocks nothing, which is what ADR 0018's "no React context"
 * guards: the server still decides who is signed in, and signing in still lands through
 * `/auth/callback`. Signing in lands back on the screen that asked.
 *
 * Not `?signin=<route>`, the redirect's way in: `AppLayout` reads that once per pathname, so a
 * screen putting it on its own URL would open nothing. See ADR 0018's LAY-191 amendment.
 */

const EVENT = 'layline:ask-to-sign-in'

export function askToSignIn(): void {
  window.dispatchEvent(new Event(EVENT))
}

/** Subscribes `AppLayout` to the ask. Returns the unsubscribe, for an effect's cleanup. */
export function onAskToSignIn(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
