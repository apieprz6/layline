'use client'

/**
 * PROTOTYPE — LAY-191. Throwaway. Three variants of a Connect Claude section on the real
 * /settings route, switchable via `?variant=A|B|C`, with `?auth=out` for the signed-out state.
 * Nothing here talks to Supabase; sign-in and revoke are stubs.
 */

import { Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { VARIANT_KEYS, type VariantKey } from './fixture'
import PrototypeSwitcher from './PrototypeSwitcher'
import VariantA from './VariantA'
import VariantB from './VariantB'
import VariantC from './VariantC'

function Switched() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = params.get('variant')
  const variant: VariantKey = VARIANT_KEYS.includes(raw as VariantKey) ? (raw as VariantKey) : 'A'
  const signedIn = params.get('auth') !== 'out'

  const go = (next: { variant?: VariantKey; signedIn?: boolean }) => {
    const q = new URLSearchParams(params.toString())
    q.set('variant', next.variant ?? variant)
    if (next.signedIn ?? signedIn) q.delete('auth')
    else q.set('auth', 'out')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }

  return (
    <>
      {variant === 'A' && <VariantA signedIn={signedIn} />}
      {variant === 'B' && <VariantB signedIn={signedIn} />}
      {variant === 'C' && <VariantC signedIn={signedIn} />}
      <PrototypeSwitcher
        current={variant}
        signedIn={signedIn}
        onSelect={(v) => go({ variant: v })}
        onToggleAuth={() => go({ signedIn: !signedIn })}
      />
    </>
  )
}

export default function ConnectClaudePrototype() {
  return (
    <Suspense fallback={null}>
      <Switched />
    </Suspense>
  )
}
