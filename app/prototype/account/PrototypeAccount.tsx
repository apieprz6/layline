'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See ./README.md.
 *
 * Wires `?variant=` and `?account=` to the three variants, inside the real app
 * chrome (`RaceHeader` plus whatever the route renders behind it) so the drawer
 * is judged against the app rather than against a blank page. The drawer opens
 * on load, because the drawer is the artifact.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RaceHeader from '@/components/dashboard/RaceHeader'
import PrototypeSwitcher from '@/components/prototype/PrototypeSwitcher'
import { useTheme } from '@/lib/hooks/useTheme'
import VariantA, { VARIANT_A_NAME } from './VariantA'
import VariantB, { VARIANT_B_NAME } from './VariantB'
import VariantC, { VARIANT_C_NAME } from './VariantC'
import { ACCOUNT_STATES, accountFor, type AccountStateKey } from './fixture'
import {
  REFUSAL_STATES,
  RefusalCallbackScreen,
  RefusalHarnessStrip,
  RefusalToast,
  type RefusalKey,
} from './RefusalA'

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME, Component: VariantA },
  { key: 'B', name: VARIANT_B_NAME, Component: VariantB },
  { key: 'C', name: VARIANT_C_NAME, Component: VariantC },
]

export default function PrototypeAccount({ children }: { children: React.ReactNode }): React.ReactElement {
  useTheme()
  const router = useRouter()
  const searchParams = useSearchParams()

  const variantKey = searchParams.get('variant') ?? 'A'
  const accountKey = (searchParams.get('account') ?? 'guest') as AccountStateKey
  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]
  const account = accountFor(accountKey)

  const [drawerOpen, setDrawerOpen] = useState(true)
  // The refused-stranger pass (LAY-120 has now seen the error). Drawn on A only.
  const refusal = (searchParams.get('refused') ?? 'none') as RefusalKey
  // The sheet lives in the URL so a sheet can be linked rather than described.
  // The in-sheet landing implies an open sheet, so it does not need `sheet=1` too.
  const sheetOpen = searchParams.get('sheet') === '1' || refusal === 'sheet'

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null) params.delete(key)
      else params.set(key, value)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const setAccount = useCallback(
    (key: AccountStateKey) => setParam('account', key),
    [setParam]
  )
  const setSheetOpen = useCallback(
    (open: boolean) => setParam('sheet', open ? '1' : null),
    [setParam]
  )
  const setRefusal = useCallback(
    (key: RefusalKey) => setParam('refused', key === 'none' ? null : key),
    [setParam]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (sheetOpen) setSheetOpen(false)
        else setDrawerOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sheetOpen, setSheetOpen])

  const Variant = variant.Component
  const onA = variant.key === 'A'
  // Landing 1 is a route of its own, so it replaces the app rather than sitting
  // over it — which is the point being drawn.
  const takesTheScreen = onA && refusal === 'callback'

  return (
    <div className="min-h-screen">
      {takesTheScreen ? (
        <RefusalCallbackScreen onBack={() => setRefusal('none')} />
      ) : (
        <>
          <RaceHeader onOpenMenu={() => setDrawerOpen(true)} />

          <div className="max-w-md mx-auto md:mx-0 md:max-w-none">{children}</div>

          <Variant
            account={account}
            drawerOpen={drawerOpen}
            onCloseDrawer={() => setDrawerOpen(false)}
            sheetOpen={sheetOpen}
            onOpenSheet={() => setSheetOpen(true)}
            onCloseSheet={() => setSheetOpen(false)}
            // Sign-out is a stub: nothing is signed in, so it just puts the harness
            // back to Guest.
            onSignOut={() => setAccount('guest')}
            refusal={onA ? refusal : 'none'}
          />

          {onA && refusal === 'toast' && <RefusalToast onDismiss={() => setRefusal('none')} />}
        </>
      )}

      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant.key}
        extra={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {ACCOUNT_STATES.map((state) => {
              const isCurrent = state.key === accountKey
              return (
                <button
                  key={state.key}
                  onClick={() => setAccount(state.key)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    fontWeight: isCurrent ? 700 : 500,
                    border: `1px solid ${isCurrent ? 'var(--blue-muted-40)' : 'var(--surface-border)'}`,
                    background: isCurrent ? 'var(--blue-muted)' : 'var(--surface-raised)',
                    color: isCurrent ? 'var(--text-accent)' : 'var(--text-secondary)',
                  }}
                >
                  {state.label}
                </button>
              )
            })}
            <button
              onClick={() => setDrawerOpen((open) => !open)}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-raised)',
                color: 'var(--text-secondary)',
              }}
            >
              {drawerOpen ? 'hide' : 'drawer'}
            </button>
          </div>
          {onA && <RefusalHarnessStrip refusal={refusal} />}
          {onA && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {REFUSAL_STATES.map((state) => {
                const isCurrent = state.key === refusal
                return (
                  <button
                    key={state.key}
                    onClick={() => setRefusal(state.key)}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontSize: '10px',
                      fontWeight: isCurrent ? 700 : 500,
                      border: `1px solid ${isCurrent ? 'var(--state-warning)' : 'var(--surface-border)'}`,
                      background: 'var(--surface-raised)',
                      color: isCurrent ? 'var(--state-warning)' : 'var(--text-secondary)',
                    }}
                  >
                    {state.label}
                  </button>
                )
              })}
            </div>
          )}
          </div>
        }
      />
    </div>
  )
}
