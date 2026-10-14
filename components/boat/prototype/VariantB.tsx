/**
 * PROTOTYPE — throwaway (LAY-174). See ./README.md.
 *
 * B — Sidebar rail + table: no tabs, "This season" becomes a persistent rail beside
 * the races rather than a thing you tab into. "Upload a race" sits in a toolbar row
 * above the table rather than pinned above the list. The race list becomes dense
 * table rows that use the full row width (title | window | duration | filename),
 * instead of stacked cards that leave the right half of a wide screen empty.
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

export default function VariantB({ races, canWrite, overall }: VariantProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
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
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing(4), padding: spacing(4) }}>
        <aside
          style={{
            flex: '1 1 260px',
            maxWidth: '340px',
            display: 'flex',
            flexDirection: 'column',
            gap: spacing(3),
          }}
        >
          <h2 style={sectionHeadingStyle}>This season</h2>
          {overall}
        </aside>

        <main style={{ flex: '3 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing(3),
            }}
          >
            <h2 style={sectionHeadingStyle}>
              Races
              {races.length > 0 && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--weight-regular)' }}>
                  {' '}
                  · {races.length}
                </span>
              )}
            </h2>

            {canWrite && (
              <Link
                href="/boat-performance/upload"
                style={{
                  padding: '8px 12px',
                  borderRadius: 7,
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-fg)',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Upload a race
              </Link>
            )}
          </div>

          {races.length === 0 ? (
            <EmptyState
              mark="⛵"
              title="No races uploaded yet"
              detail="Races appear here once one has been logged, newest first."
            />
          ) : (
            <div
              style={{
                border: '1px solid var(--surface-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              <div style={{ ...rowStyle, background: 'var(--surface-raised)' }}>
                <span style={{ ...colTitle, ...headerCell }}>Race</span>
                <span style={{ ...colWindow, ...headerCell }}>Window</span>
                <span style={{ ...colDuration, ...headerCell }}>Duration</span>
                <span style={{ ...colFile, ...headerCell }}>File</span>
              </div>

              {races.map((race, index) => (
                <Link
                  key={race.id}
                  href={`/boat-performance/races/${race.id}`}
                  style={{
                    ...rowStyle,
                    textDecoration: 'none',
                    borderTop: index === 0 ? 'none' : '1px solid var(--surface-border)',
                  }}
                >
                  <span
                    style={{
                      ...colTitle,
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-base)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {race.title ?? 'Untitled race'}
                  </span>
                  <span
                    style={{
                      ...colWindow,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-accent)',
                    }}
                  >
                    {wallClockWindow(race.window_start, race.window_finish)}
                  </span>
                  <span style={{ ...colDuration, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {describeDuration(race.window_seconds)}
                  </span>
                  <span
                    style={{
                      ...colFile,
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {race.filename}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

const sectionHeadingStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
  margin: 0,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing(3),
  padding: `${spacing(2)} ${spacing(3)}`,
}

const headerCell = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}

const colTitle = { flex: '2 1 160px', minWidth: 0 }
const colWindow = { flex: '0 0 170px' }
const colDuration = { flex: '0 0 90px' }
const colFile = { flex: '1 1 120px', minWidth: 0 }
