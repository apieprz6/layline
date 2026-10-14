'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ReactElement, ReactNode } from 'react'
import type { RaceListEntry } from '@/types'
import PrototypeSwitcher from './prototype/PrototypeSwitcher'
import VariantA from './prototype/VariantA'
import VariantB from './prototype/VariantB'
import VariantC from './prototype/VariantC'

interface BoatPerformanceContentProps {
  /** Newest first, as `readRaces` orders them. */
  races: RaceListEntry[]
  /** An admin, who may add one. Everyone signed in reads the same list (ADR 0019). */
  canWrite: boolean
  /**
   * The Overall tab's own content, rendered on the server and passed in.
   *
   * A node rather than data, because what fills this tab is a read across the whole archive —
   * thousands of rows, scored — and the Races tab must not wait on it. The page wraps it in its
   * own `<Suspense>`, so the archive list paints and the season figures stream in behind it.
   */
  overall: ReactNode
}

/**
 * PROTOTYPE HARNESS — throwaway (LAY-174). See `components/boat/prototype/README.md`.
 *
 * This file is normally `BoatPerformanceContent` — the Races/Overall tabbed view. For
 * this prototype it is a `?variant=` switcher over three structurally different takes
 * on the same question: how to show Races and Overall without tabs, where "Upload a
 * race" goes, and how the race list behaves on a wide viewport. The original tabbed
 * version is one `git show main:…` away and is what main keeps once this is decided.
 */
const VARIANTS = [
  { key: 'A', name: 'Toolbar + grid' },
  { key: 'B', name: 'Sidebar rail + table' },
  { key: 'C', name: 'Feed + FAB' },
] as const

export default function BoatPerformanceContent({
  races,
  canWrite,
  overall,
}: BoatPerformanceContentProps): ReactElement {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const requested = searchParams.get('variant')
  const variant = VARIANTS.some((v) => v.key === requested) ? requested! : 'A'

  function setVariant(key: string): void {
    const params = new URLSearchParams(searchParams.toString())
    params.set('variant', key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      {variant === 'A' && <VariantA races={races} canWrite={canWrite} overall={overall} />}
      {variant === 'B' && <VariantB races={races} canWrite={canWrite} overall={overall} />}
      {variant === 'C' && <VariantC races={races} canWrite={canWrite} overall={overall} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </>
  )
}
