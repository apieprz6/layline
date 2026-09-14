'use client'

import type { ReactElement } from 'react'
import { signInWithGoogle } from '@/lib/account/browserAuth'
import CallbackScreen, { BackToTheWeather, filledActionStyle } from './CallbackScreen'

interface SignInDidNotFinishProps {
  /** A path on this origin, already guarded by the route: where the retry aims. */
  next: string
}

function AlertMark(): ReactElement {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}

/**
 * Every non-success that is neither the **Refused Stranger** nor Google's Cancel
 * button: the handshake broke, and nothing on the URL says why in words a sailor
 * should read (ADR 0021). Whatever Supabase wrote is in the log.
 *
 * It says less than the refusal on purpose. Guessing at a cause — a stale link, a
 * clock, a cookie — would be inventing one, and the sailor's next move is the same
 * whichever it was.
 *
 * Unlike the refusal, this one *can* usefully be retried, so it is the one arm
 * that offers it: the button re-runs the same handshake the **Auth Sheet** runs,
 * aimed back at the screen the sailor started from. That is why this is a Client
 * Component while the refusal is not. It does **not** reopen the sheet and the
 * sheet gains no error region — its one failure mode is still shown here, on its
 * own route.
 */
export default function SignInDidNotFinish({ next }: SignInDidNotFinishProps): ReactElement {
  return (
    <CallbackScreen
      heading="Sign-in didn't finish"
      mark={<AlertMark />}
      testId="sign-in-did-not-finish"
      action={
        <>
          <button
            type="button"
            style={filledActionStyle}
            onClick={() => {
              // Nothing to await on the happy path: the SDK navigates the browser
              // to Google. Caught rather than `void`ed all the same — with no
              // Supabase configured, `createClient()` throws, and a button that
              // does nothing on a screen that already says something went wrong
              // would be the second failure in a row nobody records.
              signInWithGoogle(next).catch((thrown: unknown) => {
                console.error('Sign-in: the retry never reached Google:', thrown)
              })
            }}
          >
            Try signing in again
          </button>
          <BackToTheWeather prominence="quiet" />
        </>
      }
    >
      Something went wrong on the way back from Google.
    </CallbackScreen>
  )
}
