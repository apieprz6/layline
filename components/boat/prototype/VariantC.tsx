/**
 * PROTOTYPE — throwaway (LAY-174). See ./README.md.
 *
 * C — Feed + FAB: no tabs, no toolbar button either. "This season" becomes a
 * horizontally-scrollable strip that's always in view at the top (a peek, not a
 * tab), and "Upload a race" is a floating action button fixed to the bottom-right
 * of the viewport — reachable from anywhere, deliberately away from the top of the
 * list. Races render as a grid of compact horizontal rows (mark + two-line detail)
 * that wraps into multiple columns on wide viewports.
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

export default function VariantC({ races, canWrite, overall }: VariantProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)', position: 'relative' }}>
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

      <div
        style={{
          display: 'flex',
          gap: spacing(3),
          overflowX: 'auto',
          padding: spacing(4),
          borderBottom: '1px solid var(--surface-border)',
        }}
      >
        {Array.isArray(overall) ? (
          overall.map((node, index) => (
            <div key={index} style={{ flex: '1 1 260px', minWidth: '260px' }}>
              {node}
            </div>
          ))
        ) : (
          <div style={{ flex: '1 1 260px', minWidth: '260px' }}>{overall}</div>
        )}
      </div>

      <div style={{ padding: spacing(4) }}>
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: spacing(2),
            }}
          >
            {races.map((race) => (
              <li key={race.id}>
                <Link
                  href={`/boat-performance/races/${race.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing(3),
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: spacing(3),
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ fontSize: '20px', lineHeight: 1 }}>⛵</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {race.title ?? 'Untitled race'}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-accent)',
                      }}
                    >
                      {wallClockWindow(race.window_start, race.window_finish)}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {describeDuration(race.window_seconds)} · {race.filename}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && (
        <Link
          href="/boat-performance/upload"
          aria-label="Upload a race"
          style={{
            position: 'fixed',
            bottom: spacing(6),
            right: spacing(6),
            zIndex: 900,
            display: 'flex',
            alignItems: 'center',
            gap: spacing(2),
            padding: '14px 18px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Upload a race
        </Link>
      )}
    </div>
  )
}
