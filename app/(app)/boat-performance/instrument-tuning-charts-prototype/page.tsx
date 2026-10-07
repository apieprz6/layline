import { Suspense, type ReactElement } from 'react'
import { Host } from '@/components/boat/prototype-lay149/Host'
import Switcher from '@/components/boat/prototype-lay149/Switcher'
import { VARIANT_NAMES, type Channel, type VariantKey } from '@/components/boat/prototype-lay149/data'

/**
 * PROTOTYPE — LAY-149. **Throwaway. Delete with the branch.**
 *
 * Three variants of the charts behind the Instrument Tuning cards, switchable via
 * `?variant=A|B|C`; `?view=tile` shows each variant's per-Race tile; `?open=hdg|awa|stw` opens a
 * sheet on load. Driven by the real archive via `charts.json`. Not auth-gated, like LAY-147's.
 */
export const dynamic = 'force-dynamic'

const KEYS = Object.keys(VARIANT_NAMES) as VariantKey[]
const NAMES: Record<string, string> = VARIANT_NAMES

export default async function InstrumentTuningChartsPrototypePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  const params = await searchParams
  const asked = typeof params.variant === 'string' ? params.variant.toUpperCase() : 'A'
  const key: VariantKey = (KEYS as string[]).includes(asked) ? (asked as VariantKey) : 'A'
  const view = params.view === 'tile' ? 'tile' : 'screen'
  const open = (['hdg', 'awa', 'stw'] as const).find((c) => c === params.open) ?? null
  const race = typeof params.race === 'string' ? params.race : '08-22-26-glr'

  return (
    <>
      <Host key={`${key}-${view}-${open}`} variant={key} view={view} open={open as Channel | null} raceId={race} />
      <Suspense fallback={null}>
        <Switcher variants={KEYS} names={NAMES} current={key} view={view} />
      </Suspense>
    </>
  )
}
