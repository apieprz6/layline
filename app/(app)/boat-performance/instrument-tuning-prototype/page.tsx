import { Suspense, type ReactElement } from 'react'
import OverallShell from '@/components/boat/prototype-lay147/OverallShell'
import PrototypeSwitcher from '@/components/boat/prototype-lay147/PrototypeSwitcher'
import * as A from '@/components/boat/prototype-lay147/VariantA'
import * as B from '@/components/boat/prototype-lay147/VariantB'
import * as C from '@/components/boat/prototype-lay147/VariantC'

/**
 * PROTOTYPE — LAY-147. **Throwaway. Delete with the branch.**
 *
 * Three variants of the Instrument Tuning screen on one route, switchable via `?variant=A|B|C`,
 * plus each variant's Overall-tab teaser via `?view=overall`. See
 * `components/boat/prototype-lay147/README.md` for what each variant is a position on.
 *
 * Sits inside the `(app)` route group so it gets the real header, drawer and dock, and so a
 * variant is judged at the density the rest of the app actually has. Deliberately **not**
 * auth-gated — every figure on it is invented, nothing is read and nothing is written, and making
 * the reviewer sign in first is friction a prototype has not earned. The real screen would gate
 * exactly like `/boat-performance` does.
 */
export const dynamic = 'force-dynamic'

const VARIANTS = { A, B, C } as const
type VariantKey = keyof typeof VARIANTS

const KEYS = Object.keys(VARIANTS) as VariantKey[]
const NAMES: Record<string, string> = { A: A.NAME, B: B.NAME, C: C.NAME }

export default async function InstrumentTuningPrototypePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  const params = await searchParams
  const asked = typeof params.variant === 'string' ? params.variant.toUpperCase() : 'A'
  const key: VariantKey = (KEYS as string[]).includes(asked) ? (asked as VariantKey) : 'A'
  const view = params.view === 'overall' ? 'overall' : 'screen'

  const variant = VARIANTS[key]
  const Teaser = variant.Teaser

  return (
    <>
      {view === 'overall' ? (
        <OverallShell
          note={variant.TEASER_NOTE}
          rowTeaser={variant.TEASER_PLACEMENT === 'row' ? <Teaser /> : undefined}
          cardTeaser={variant.TEASER_PLACEMENT === 'card' ? <Teaser /> : undefined}
        />
      ) : (
        <variant.Screen />
      )}

      <Suspense fallback={null}>
        <PrototypeSwitcher variants={KEYS} names={NAMES} current={key} view={view} />
      </Suspense>
    </>
  )
}
