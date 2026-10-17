'use client'

import type { ReactElement } from 'react'
import { signInWithGoogle } from '@/lib/account/browserAuth'
import CallbackScreen, { BackToTheWeather, filledActionStyle } from '@/app/auth/callback/CallbackScreen'

interface ConsentSignInProps {
  /** This consent screen, `authorization_id` included, so Google's round trip ends back here. */
  next: string
}

/**
 * A **Guest** arriving from an MCP client. The same single door the **Auth Sheet** opens
 * (ADR 0020), aimed back at this screen: `/auth/callback` finishes the sign-in and returns here,
 * and a **Refused Stranger** is refused at the callback exactly as in the app.
 */
export default function ConsentSignIn({ next }: ConsentSignInProps): ReactElement {
  return (
    <CallbackScreen
      heading="Sign in to connect Layline"
      testId="consent-sign-in"
      action={
        <>
          <button
            type="button"
            style={filledActionStyle}
            onClick={() => {
              signInWithGoogle(next).catch((thrown: unknown) => {
                console.error('Consent: sign-in never reached Google:', thrown)
              })
            }}
          >
            Continue with Google
          </button>
          <BackToTheWeather prominence="quiet" />
        </>
      }
    >
      An assistant is asking to read Layline as you. Sign in with the Google account your crew
      login uses, then choose whether to allow it.
    </CallbackScreen>
  )
}
