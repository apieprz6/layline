import type { ReactElement } from 'react'
import FilterPrototype from '@/components/analysis-prototype/FilterPrototype'
import {
  fromSearchParams,
  isVariantKey,
  type VariantKey,
} from '@/components/analysis-prototype/model'

export const dynamic = 'force-dynamic'

/**
 * PROTOTYPE ROUTE — LAY-144 ("Design the shared six-dimension filter UI and its
 * missing-annotation behavior"). **Throwaway.** Delete this directory and
 * `components/analysis-prototype/` once the ticket is answered; the winning design
 * gets written properly, not promoted from here.
 *
 * Three variants of the shared **Analysis Filter** on `?variant=A|B|C`, hosted
 * under `/boat-performance` so they are judged against the app's real chrome,
 * type and density rather than in a vacuum.
 *
 * Reads the filter from `searchParams` the way ADR 0026 says a real screen will.
 *
 * **Deliberately NOT behind the sign-in guard**, unlike every real screen in this
 * group. The local Supabase stack has no Google provider enabled and ADR 0020
 * leaves no other door, so a guard here would make the prototype unopenable on
 * the machine it exists to be judged on. Safe only because this route is
 * throwaway and never merges; anything that ships uses `signInFirst`.
 */
export default async function FilterPrototypePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  const params = await searchParams
  const raw = Array.isArray(params.variant) ? params.variant[0] : params.variant
  const variant: VariantKey = isVariantKey(raw) ? raw : 'A'

  return <FilterPrototype variant={variant} initialFilter={fromSearchParams(params)} />
}
