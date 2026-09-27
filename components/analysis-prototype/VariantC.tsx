'use client'

/**
 * PROTOTYPE — LAY-144, Variant C: "rail + coverage ledger".
 *
 * Refuses the disclosure panel. A horizontally scrolling rail of one menu chip per
 * dimension sits under the title and never hides; each chip says what it is
 * narrowed to and opens a small popover of its buckets. Nothing is ever more than
 * one tap away and the filter never covers the chart.
 *
 * Its answers to the ticket's three questions:
 *  1. `When` opens a timeline of the thirteen Races rather than a bucket list —
 *     tap the first and last Race you care about. Months are a shortcut above it.
 *     A date range is continuous, so it gets a continuous control.
 *  2. "Not recorded" is NOT a chip and NOT a bucket. It is one switch in a
 *     permanent coverage ledger under the rail: "Include rows with nothing
 *     recorded". The ledger states, always, how much of what you are looking at
 *     rests on unannotated rows — the thing a chip in a collapsed panel hides.
 *  3. Never touches the URL. Pure client state, instant. The trade the other two
 *     variants pay for is linkability; this one shows what that buys.
 */

import { useState } from 'react'
import { radius, spacing } from '@/lib/utils/design'
import {
  DIMENSIONS,
  NOT_RECORDED,
  NOTE_ONLY,
  RACES,
  bucketCounts,
  clearDimension,
  dimension,
  matchStats,
  selected,
  summarise,
  toggleBucket,
  type DimensionId,
  type PrototypeFilter,
} from './model'
import { CoverageLedger } from './shared'

export const VARIANT_C_NAME = 'Inline rail, client-only'

type Props = {
  filter: PrototypeFilter
  onChange: (next: PrototypeFilter) => void
  onClear: () => void
}

/** The two buckets that are about the record, across every dimension that has one. */
const RECORD_BUCKETS: Array<[DimensionId, string]> = [
  ['sea', NOT_RECORDED],
  ['sail', NOT_RECORDED],
  ['sail', NOTE_ONLY],
]

export default function VariantC({ filter, onChange, onClear }: Props) {
  const [open, setOpen] = useState<DimensionId | null>(null)
  const stats = matchStats(filter)

  /**
   * One switch standing in for three buckets. Off means: on every dimension that
   * has a record bucket, select all the real values and none of the record ones.
   */
  const excluding = RECORD_BUCKETS.every(([dim, bucket]) => {
    const picked = selected(filter, dim)
    return picked.length > 0 && !picked.includes(bucket)
  })

  const setExcluding = (next: boolean) => {
    let f = filter
    for (const dim of ['sea', 'sail'] as DimensionId[]) {
      if (next) {
        const real = dimension(dim)
          .buckets.filter((b) => b.aboutTheRecord !== true)
          .map((b) => b.id)
        const keep = selected(filter, dim).filter((id) => real.includes(id))
        f = { ...f, [dim]: keep.length ? keep : real } as PrototypeFilter
      } else {
        // Back to untouched for that dimension unless real values were narrowed,
        // in which case re-admit the record buckets alongside them.
        const picked = selected(f, dim)
        const record = dimension(dim)
          .buckets.filter((b) => b.aboutTheRecord === true)
          .map((b) => b.id)
        const real = dimension(dim)
          .buckets.filter((b) => b.aboutTheRecord !== true)
          .map((b) => b.id)
        f =
          picked.length === real.length
            ? (clearDimension(f, dim) as PrototypeFilter)
            : ({ ...f, [dim]: [...picked, ...record] } as PrototypeFilter)
      }
    }
    onChange(f)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
      {/* The rail. Scrolls sideways; bleeds to the screen edges so it reads as scrollable. */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: `2px ${spacing(4)}`,
          margin: `0 -${spacing(4)}`,
          scrollbarWidth: 'none',
        }}
      >
        {DIMENSIONS.map((dim) => {
          const narrowed = selected(filter, dim.id).length > 0 || (dim.id === 'date' && filter.range !== null)
          return (
            <button
              key={dim.id}
              type="button"
              onClick={() => setOpen(open === dim.id ? null : dim.id)}
              aria-expanded={open === dim.id}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: radius('full'),
                border: `1px solid ${narrowed ? 'var(--blue-500)' : 'var(--surface-border)'}`,
                background: narrowed ? 'var(--blue-muted)' : 'var(--surface-raised)',
                color: narrowed ? 'var(--text-accent)' : 'var(--text-secondary)',
                fontSize: 10.5,
                fontWeight: narrowed ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{dim.label}:</span>
              {summarise(filter, dim.id)}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )
        })}
      </div>

      {open && (
        <Popover
          dim={open}
          filter={filter}
          onChange={onChange}
          onClose={() => setOpen(null)}
          onClearDim={() => onChange(clearDimension(filter, open))}
        />
      )}

      <CoverageLedger stats={stats} />

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing(2),
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={!excluding}
          onChange={(e) => setExcluding(!e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--blue-500)' }}
        />
        Include rows with nothing recorded
      </label>

      <div
        style={{
          border: '1px dashed var(--surface-border)',
          borderRadius: radius('md'),
          padding: spacing(5),
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: 'var(--text-accent)' }}>
          {stats.avgPct === null ? '—' : `${stats.avgPct}%`}
        </div>
        Polar chart goes here
      </div>

      {(selected(filter, 'wind').length > 0 || stats.rows < stats.totalRows) && (
        <button
          type="button"
          onClick={onClear}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: '1px solid var(--surface-border)',
            borderRadius: radius('full'),
            padding: '5px 12px',
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          Back to the whole archive
        </button>
      )}
    </div>
  )
}

function Popover({
  dim,
  filter,
  onChange,
  onClose,
  onClearDim,
}: {
  dim: DimensionId
  filter: PrototypeFilter
  onChange: (f: PrototypeFilter) => void
  onClose: () => void
  onClearDim: () => void
}) {
  const d = dimension(dim)
  const counts = bucketCounts(filter, dim)
  const picked = selected(filter, dim)

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--blue-muted-40)',
        borderRadius: radius('md'),
        boxShadow: 'var(--shadow-md)',
        padding: spacing(3),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2) }}>
        <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          {d.label}
        </span>
        <span style={{ display: 'flex', gap: spacing(3) }}>
          <button type="button" onClick={onClearDim} style={linkStyle}>
            Any
          </button>
          <button type="button" onClick={onClose} style={linkStyle}>
            Done
          </button>
        </span>
      </div>

      {dim === 'date' ? (
        <RaceTimeline filter={filter} onChange={onChange} />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {d.buckets
            // The record buckets are governed by the ledger switch, not by chips.
            .filter((b) => b.aboutTheRecord !== true)
            .map((b) => {
              const on = picked.includes(b.id)
              const rows = counts[b.id]?.rows ?? 0
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onChange(toggleBucket(filter, dim, b.id))}
                  disabled={rows === 0 && !on}
                  aria-pressed={on}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 11px',
                    borderRadius: radius('full'),
                    border: `1px solid ${on ? 'var(--blue-500)' : 'var(--surface-border)'}`,
                    background: on ? 'var(--blue-500)' : 'var(--surface-elevated)',
                    color: on ? '#fff' : 'var(--text-secondary)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: on ? 600 : 500,
                    cursor: rows === 0 && !on ? 'not-allowed' : 'pointer',
                    opacity: rows === 0 && !on ? 0.45 : 1,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {b.label}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, opacity: 0.75 }}>{rows}</span>
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
}

/**
 * The thirteen Races on a line, tap-to-tap. A continuous dimension gets a
 * continuous control; the months above it are the shortcut, not the vocabulary.
 */
function RaceTimeline({
  filter,
  onChange,
}: {
  filter: PrototypeFilter
  onChange: (f: PrototypeFilter) => void
}) {
  const [anchor, setAnchor] = useState<string | null>(null)
  const range = filter.range

  const press = (day: string) => {
    if (anchor === null) {
      setAnchor(day)
      onChange({ ...filter, date: [], range: { from: day, to: day } })
    } else {
      const from = anchor <= day ? anchor : day
      const to = anchor <= day ? day : anchor
      setAnchor(null)
      onChange({ ...filter, date: [], range: { from, to } })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dimension('date').buckets.map((b) => {
          const on = filter.date.includes(b.id)
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(toggleBucket(filter, 'date', b.id))}
              aria-pressed={on}
              style={{
                padding: '5px 10px',
                borderRadius: radius('full'),
                border: `1px solid ${on ? 'var(--blue-500)' : 'var(--surface-border)'}`,
                background: on ? 'var(--blue-500)' : 'var(--surface-elevated)',
                color: on ? '#fff' : 'var(--text-secondary)',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              {b.label}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
        {anchor ? 'Now tap the last race to include.' : 'Or tap the first and last race to include.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {RACES.map((race) => {
          const day = race.start.slice(0, 10)
          const inRange = range !== null && day >= range.from && day <= range.to
          return (
            <button
              key={race.id}
              type="button"
              onClick={() => press(day)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing(2),
                padding: '5px 8px',
                borderRadius: radius('sm'),
                border: '1px solid transparent',
                borderColor: inRange ? 'var(--blue-muted-40)' : 'transparent',
                background: inRange ? 'var(--blue-muted)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--font-body)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: inRange ? 'var(--blue-500)' : 'var(--surface-border)',
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-muted)' }}>
                {day.slice(5)}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 10.5,
                  color: inRange ? 'var(--text-accent)' : 'var(--text-secondary)',
                  fontWeight: inRange ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {race.title}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                {race.rows}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
