import type { ReactElement } from 'react'
import CallbackScreen, { BackToTheWeather } from './CallbackScreen'

/**
 * A key, not a warning triangle. The sailor is outside a door somebody else
 * holds the key to, which is the whole situation.
 */
function KeyMark(): ReactElement {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3M18 5l2.5 2.5M15.5 7.5 18 10" />
    </svg>
  )
}

/**
 * The **Refused Stranger**: someone who tapped Continue with Google without an
 * **Account** waiting for them. Sign-ups are closed (ADR 0019), so Supabase
 * refuses the address with `error_code=signup_disabled`, and because that lands
 * on `/auth/callback` rather than in the **Auth Sheet**, this is where they read
 * about it — full screen, where the error already is (ADR 0021).
 *
 * Three things it deliberately does not do:
 *
 * - **It names no address.** The URL carries none, so saying which Google account
 *   was refused would mean inventing one — AGENTS.md's rule about a missing wind
 *   reading, applied to an email.
 * - **It shows nothing Supabase wrote.** "Signups not allowed for this instance"
 *   is developer language about a Supabase instance, addressed to a sailor who
 *   was invited by name. The route logs it verbatim instead.
 * - **It does not offer to try again.** The same Google account would be refused
 *   identically; what changes the outcome is the owner adding the address, so the
 *   only action here is the way out.
 */
export default function RefusedStranger(): ReactElement {
  return (
    <CallbackScreen
      heading="You are not on the crew list yet"
      mark={<KeyMark />}
      testId="refused-stranger"
      action={<BackToTheWeather />}
    >
      Layline accounts are made by the boat’s owner. Ask them to add the Google address you just
      used, then sign in again.
    </CallbackScreen>
  )
}
