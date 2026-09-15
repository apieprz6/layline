'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import EmptyState from '@/components/common/EmptyState'
import SectionTabs, { tabPanelId } from '@/components/common/SectionTabs'
import { spacing } from '@/lib/utils/design'
import { describeDuration } from '@/services/recordings/coverage'
import { wallClockWindow } from '@/services/recordings/wall-clock'
import type { RaceListEntry } from '@/types'

type Tab = 'races' | 'overall'

const TABS = [
  { id: 'races', label: 'Races' },
  { id: 'overall', label: 'Overall' },
] as const satisfies readonly { id: Tab; label: string }[]

interface BoatPerformanceContentProps {
  /** Newest first, as `readRaces` orders them. */
  races: RaceListEntry[]
  /** An admin, who may add one. Everyone signed in reads the same list (ADR 0019). */
  canWrite: boolean
}

/**
 * **Boat performance**: the archive on the Races tab, and Overall still waiting for its engine.
 *
 * The list states a **duration** and never a row count. A duration can be held against a sailor's
 * memory of the afternoon; "6,337 rows" cannot be held against anything, and counts a dead feed's
 * verbatim copies as evidence (ADR 0009). The race's own page states how much of that duration was
 * actually recorded.
 *
 * A race with no title shows its window and says so. An untitled race is normal (ADR 0010), and
 * generating "Race on Sep 4" here would be Layline writing Testimony the sailor withheld.
 *
 * **Overall** is empty because the engine that would fill it does not exist — Wind Data's Model
 * Forecast tab exactly, and not a loading state (ADR 0016).
 */
export default function BoatPerformanceContent({
  races,
  canWrite,
}: BoatPerformanceContentProps): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('races')

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <SectionTabs
        title="Boat performance"
        tabs={TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      <div role="tabpanel" id={tabPanelId(activeTab)} style={{ padding: spacing(4) }}>
        {activeTab === 'races' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
            {canWrite && (
              <Link
                href="/boat-performance/upload"
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: 7,
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-fg)',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Upload a race
              </Link>
            )}

            {races.length === 0 ? (
              <EmptyState
                mark="⛵"
                title="No races uploaded yet"
                detail="Races appear here once one has been logged, newest first."
              />
            ) : (
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing(2),
                }}
              >
                {races.map((race) => (
                  <li key={race.id}>
                    <Link
                      href={`/boat-performance/races/${race.id}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: spacing(1),
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--surface-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: spacing(3),
                        textDecoration: 'none',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 'var(--text-base)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {race.title ?? 'Untitled race'}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text-accent)',
                        }}
                      >
                        {wallClockWindow(race.window_start, race.window_finish)}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {describeDuration(race.window_seconds)} · {race.filename}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <EmptyState
            mark="📈"
            title="Season figures coming soon"
            detail="Counts and sums across the whole archive will be summarised here."
          />
        )}
      </div>
    </div>
  )
}
