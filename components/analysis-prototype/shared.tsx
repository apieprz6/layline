'use client'

/**
 * PROTOTYPE — LAY-144. The two read-outs more than one variant wanted.
 * Nothing structural lives here; each variant still owns its own layout.
 */

import { radius, spacing } from '@/lib/utils/design'
import type { MatchStats } from './model'

/** The mockup's three-tile strip, with "Points shown" made honest about races too. */
export function StatsStrip({ stats, pending }: { stats: MatchStats; pending: boolean }) {
  return (
    <div style={{ display: 'flex', gap: spacing(2), opacity: pending ? 0.55 : 1, transition: 'opacity 120ms' }}>
      <Tile label="Avg of target" value={stats.avgPct === null ? '—' : `${stats.avgPct}%`} accent />
      <Tile label="Rows shown" value={`${stats.rows}`} sub={`/${stats.totalRows}`} />
      <Tile label="Races" value={`${stats.races}`} sub={`/${stats.totalRaces}`} />
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: '10px 12px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 18,
          fontWeight: 700,
          color: accent ? 'var(--text-accent)' : 'var(--text-primary)',
          marginTop: 2,
        }}
      >
        {value}
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
    </div>
  )
}

/**
 * Variant C's thesis in one component: say out loud how much of what is on screen
 * rests on rows nobody annotated, permanently, rather than hiding it in a chip.
 */
export function CoverageLedger({ stats }: { stats: MatchStats }) {
  const pct = (n: number) => (stats.rows === 0 ? 0 : Math.round((n / stats.rows) * 100))
  const lines: string[] = []
  if (stats.notRecordedRows.sea > 0)
    lines.push(`${stats.notRecordedRows.sea} (${pct(stats.notRecordedRows.sea)}%) have no Sea state recorded`)
  if (stats.notRecordedRows.sail > 0)
    lines.push(`${stats.notRecordedRows.sail} (${pct(stats.notRecordedRows.sail)}%) have no Sail Configuration recorded`)

  return (
    <div
      style={{
        border: '1px solid var(--surface-border)',
        borderLeft: '3px solid var(--state-warning)',
        borderRadius: radius('sm'),
        background: 'var(--surface-elevated)',
        padding: `${spacing(2)} ${spacing(3)}`,
        fontSize: 10.5,
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
        {stats.rows} rows · {stats.races} of {stats.totalRaces} races
      </div>
      {lines.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>Every row shown carries both annotations.</div>
      ) : (
        lines.map((l) => (
          <div key={l} style={{ color: 'var(--text-muted)' }}>
            Of those, {l}.
          </div>
        ))
      )}
    </div>
  )
}
