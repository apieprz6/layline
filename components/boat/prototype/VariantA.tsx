/**
 * PROTOTYPE — throwaway (LAY-174). See ./README.md.
 *
 * A — Toolbar + grid: no tabs, "Upload a race" moves into the page header as a
 * toolbar action beside the title, and the race list becomes a responsive card
 * grid instead of a single-column stack.
 */

import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import EmptyState from '@/components/common/EmptyState'
import { spacing } from '@/lib/utils/design'
import { describeDuration } from '@/services/recordings/coverage'
import { wallClockWindow } from '@/services/recordings/wall-clock'
import type { RaceListEntry } from '@/types'

interface VariantProps {
  races: RaceListEntry[]
  canWrite: boolean
  overall: ReactNode
}

export default function VariantA({ races, canWrite, overall }: VariantProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing(3),
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: spacing(4),
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Boat performance
        </h1>

        {canWrite && (
          <Link
            href="/boat-performance/upload"
            style={{
              padding: '10px 14px',
              borderRadius: 7,
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-fg)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Upload a race
          </Link>
        )}
      </div>

      <div style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(6) }}>
        <section>
          <h2 style={sectionHeadingStyle}>This season</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: spacing(3),
            }}
          >
            {overall}
          </div>
        </section>

        <section>
          <h2 style={sectionHeadingStyle}>
            Races
            {races.length > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--weight-regular)' }}>
                {' '}
                · {races.length}
              </span>
            )}
          </h2>

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
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: spacing(3),
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
                      height: '100%',
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
        </section>
      </div>
    </div>
  )
}

const sectionHeadingStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
  margin: `0 0 ${spacing(2)} 0`,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}
