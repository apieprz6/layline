'use client'

import type { KeyboardEvent, ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'

interface SectionTab<T extends string> {
  id: T
  label: string
}

interface SectionTabsProps<T extends string> {
  /** The section's name — the same string as its drawer row. */
  title: string
  tabs: readonly SectionTab<T>[]
  activeTab: T
  onSelect: (id: T) => void
}

/** The id a tab's panel has to carry, so the two can point at each other. */
export function tabPanelId(tab: string): string {
  return `panel-${tab}`
}

function tabId(tab: string): string {
  return `tab-${tab}`
}

/**
 * A section's header: its name, and its tabs underlined beneath it.
 *
 * Lifted out of `WindDataContent`, which had the only instance of this chrome,
 * when Boat performance needed the second one. ADR 0016 calls Wind Data's two
 * tabs — one working, one deliberate empty state — the precedent for Boat
 * performance's Races and Overall, and sharing the component is what keeps that
 * true as either section changes.
 *
 * The tabs are a real tablist rather than a row of buttons, which the lift is what
 * made affordable: one place to own `aria-controls`, the roving tabindex and the
 * arrow keys. Each caller owes its panel `role="tabpanel"` and `id={tabPanelId(…)}`.
 */
export default function SectionTabs<T extends string>({
  title,
  tabs,
  activeTab,
  onSelect,
}: SectionTabsProps<T>): ReactElement {
  /**
   * Left/Right move *and* select, which is the pattern for a tablist whose panels
   * are already rendered — there is nothing to fetch, so nothing to defer.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return

    event.preventDefault()
    const current = tabs.findIndex((tab) => tab.id === activeTab)
    const next = tabs[(current + step + tabs.length) % tabs.length]
    onSelect(next.id)
    document.getElementById(tabId(next.id))?.focus()
  }

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--surface-border)',
        padding: `${spacing(4)} ${spacing(4)} 0`,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '16px',
          fontWeight: 'var(--weight-bold)',
          color: 'var(--text-primary)',
          marginBottom: spacing(3),
        }}
      >
        {title}
      </h1>

      <div
        role="tablist"
        aria-label={title}
        onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: 0 }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              role="tab"
              aria-selected={isActive}
              aria-controls={tabPanelId(tab.id)}
              // One stop for the whole tablist: Tab reaches the selected tab, the
              // arrows move between them.
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                padding: '7px 0',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 150ms',
                letterSpacing: '0.01em',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
