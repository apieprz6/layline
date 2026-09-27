'use client'

/**
 * PROTOTYPE — LAY-144, Variant A: "the mockup, raised".
 *
 * The Claude Design mockup's shape taken at face value and finished: one
 * collapsible Filters panel with an active-count badge and Clear, six labelled
 * chip rows inside it. Three things the mockup did not have:
 *
 *  1. Chips are MULTI-select. The mockup allowed one value per dimension and
 *     treated re-tapping as "clear". ADR 0026 needs multi-select ("unless Unknown
 *     is also selected"), and "Medium OR Heavy" is a question a sailor actually has.
 *  2. Every chip carries its own row count, recomputed against the other five
 *     dimensions, so narrowing shows its cost before it is paid.
 *  3. "Not recorded" is a chip in the row, wearing the repo's existing hatch
 *     treatment so it reads as a statement about the record, not about the water.
 *
 * Writes the filter to the URL on EVERY tap — the literal reading of ADR 0026.
 * Feel the latency; that is what this variant is for.
 */

import { useState } from 'react'
import { radius, spacing } from '@/lib/utils/design'
import {
  ARCHIVE_SPAN,
  DIMENSIONS,
  NOT_RECORDED,
  NOTE_ONLY,
  activeDimensions,
  bucketCounts,
  clearDimension,
  matchStats,
  selected,
  toggleBucket,
  type Bucket,
  type Dimension,
  type PrototypeFilter,
} from './model'
import { StatsStrip } from './shared'

export const VARIANT_A_NAME = 'Disclosure panel, URL per tap'

type Props = {
  filter: PrototypeFilter
  onChange: (next: PrototypeFilter) => void
  onClear: () => void
  pending: boolean
}

export default function VariantA({ filter, onChange, onClear, pending }: Props) {
  const [open, setOpen] = useState(true)
  const [customOpen, setCustomOpen] = useState(filter.range !== null)
  const active = activeDimensions(filter)
  const stats = matchStats(filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
      <StatsStrip stats={stats} pending={pending} />

      {/* The mockup's Filters bar, verbatim in spirit: icon, label, badge, Clear, chevron. */}
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-raised)',
            border: '1px solid var(--surface-border)',
            borderRadius: radius('md'),
            borderBottomLeftRadius: open ? 0 : radius('md'),
            borderBottomRightRadius: open ? 0 : radius('md'),
            padding: '10px 12px',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Filters
            </span>
            {active.length > 0 && (
              <span
                style={{
                  background: 'var(--blue-muted)',
                  borderRadius: radius('full'),
                  padding: '1px 7px',
                  fontSize: 9,
                  color: 'var(--text-accent)',
                  fontWeight: 700,
                }}
              >
                {active.length}
              </span>
            )}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {active.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  setCustomOpen(false)
                  onClear()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    setCustomOpen(false)
                    onClear()
                  }
                }}
                style={{ fontSize: 10.5, color: 'var(--text-accent)', fontWeight: 600 }}
              >
                Clear
              </span>
            )}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease-out' }}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {open && (
          <div
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
              borderTop: 'none',
              borderBottomLeftRadius: radius('md'),
              borderBottomRightRadius: radius('md'),
              padding: spacing(3),
              display: 'flex',
              flexDirection: 'column',
              gap: spacing(3),
            }}
          >
            {DIMENSIONS.map((dim) => (
              <ChipRow
                key={dim.id}
                dim={dim}
                filter={filter}
                onChange={onChange}
                onClearDim={() => onChange(clearDimension(filter, dim.id))}
                customOpen={customOpen}
                setCustomOpen={setCustomOpen}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stand-in for whatever the screen actually draws. */}
      <ResultPlaceholder stats={stats} />
    </div>
  )
}

function ChipRow({
  dim,
  filter,
  onChange,
  onClearDim,
  customOpen,
  setCustomOpen,
}: {
  dim: Dimension
  filter: PrototypeFilter
  onChange: (next: PrototypeFilter) => void
  onClearDim: () => void
  customOpen: boolean
  setCustomOpen: (v: boolean) => void
}) {
  const counts = bucketCounts(filter, dim.id)
  const picked = selected(filter, dim.id)
  const isDate = dim.id === 'date'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {dim.label}
        </span>
        {(picked.length > 0 || (isDate && filter.range)) && (
          <button
            type="button"
            onClick={onClearDim}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 9.5,
              color: 'var(--text-accent)',
              cursor: 'pointer',
              font: 'inherit',
              fontWeight: 600,
            }}
          >
            Any
          </button>
        )}
      </div>

      <div role="group" aria-label={dim.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dim.buckets.map((b) => (
          <Chip
            key={b.id}
            bucket={b}
            on={picked.includes(b.id)}
            rows={counts[b.id]?.rows ?? 0}
            onPress={() => onChange(toggleBucket(filter, dim.id, b.id))}
          />
        ))}
        {isDate && (
          <button
            type="button"
            onClick={() => setCustomOpen(!customOpen)}
            aria-pressed={customOpen || filter.range !== null}
            style={{
              padding: '5px 10px',
              borderRadius: radius('full'),
              border: `1px ${filter.range ? 'solid' : 'dashed'} ${
                filter.range ? 'var(--blue-muted-40)' : 'var(--surface-border)'
              }`,
              background: filter.range ? 'var(--blue-muted)' : 'none',
              color: filter.range ? 'var(--text-accent)' : 'var(--text-secondary)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {filter.range ? `${filter.range.from} → ${filter.range.to}` : 'Exact dates…'}
          </button>
        )}
      </div>

      {isDate && customOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            padding: spacing(2),
            background: 'var(--surface-elevated)',
            border: '1px solid var(--surface-border)',
            borderRadius: radius('sm'),
          }}
        >
          <input
            type="date"
            aria-label="From"
            min={ARCHIVE_SPAN.from}
            max={ARCHIVE_SPAN.to}
            value={filter.range?.from ?? ARCHIVE_SPAN.from}
            onChange={(e) =>
              onChange({
                ...filter,
                date: [],
                range: { from: e.target.value, to: filter.range?.to ?? ARCHIVE_SPAN.to },
              })
            }
            style={dateInputStyle}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>→</span>
          <input
            type="date"
            aria-label="To"
            min={ARCHIVE_SPAN.from}
            max={ARCHIVE_SPAN.to}
            value={filter.range?.to ?? ARCHIVE_SPAN.to}
            onChange={(e) =>
              onChange({
                ...filter,
                date: [],
                range: { from: filter.range?.from ?? ARCHIVE_SPAN.from, to: e.target.value },
              })
            }
            style={dateInputStyle}
          />
        </div>
      )}

      {dim.id === 'sail' && (
        <p style={{ fontSize: 9.5, color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
          <em>Note only</em> is a Sail Configuration that names no Sail Definition — the boat flew
          something this Crossover Chart has no word for.
        </p>
      )}
    </div>
  )
}

const dateInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: radius('sm'),
  color: 'var(--input-fg)',
  padding: '5px 7px',
  fontSize: 10.5,
  fontFamily: 'var(--font-mono)',
}

function Chip({
  bucket,
  on,
  rows,
  onPress,
}: {
  bucket: Bucket
  on: boolean
  rows: number
  onPress: () => void
}) {
  const empty = rows === 0
  const record = bucket.aboutTheRecord === true

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={empty && !on}
      aria-pressed={on}
      title={empty ? 'No rows in the archive match this' : `${rows} rows`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: radius('full'),
        border: `1px ${record ? 'dashed' : 'solid'} ${
          on ? 'var(--blue-muted-40)' : 'var(--surface-border)'
        }`,
        // The hatch is `NotRecorded`'s, so a bucket about the record keeps reading
        // as one even once it is selected and tinted blue.
        background: on
          ? 'var(--blue-muted)'
          : record
            ? 'repeating-linear-gradient(135deg, var(--surface-divider) 0 4px, transparent 4px 8px)'
            : 'none',
        color: on ? 'var(--text-accent)' : 'var(--text-secondary)',
        fontSize: 10.5,
        fontWeight: 600,
        fontStyle: record ? 'italic' : 'normal',
        fontFamily: 'var(--font-body)',
        cursor: empty && !on ? 'not-allowed' : 'pointer',
        opacity: empty && !on ? 0.45 : 1,
      }}
    >
      {bucket.label}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 500,
          fontStyle: 'normal',
          color: on ? 'var(--text-accent)' : 'var(--text-muted)',
        }}
      >
        {rows}
      </span>
    </button>
  )
}

function ResultPlaceholder({ stats }: { stats: ReturnType<typeof matchStats> }) {
  return (
    <div
      style={{
        border: '1px dashed var(--surface-border)',
        borderRadius: radius('md'),
        padding: spacing(4),
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-secondary)' }}>
        Polar chart goes here
      </div>
      <div style={{ marginTop: 4 }}>
        {stats.rows} matched rows would be plotted over the target curves.
      </div>
    </div>
  )
}

export { NOT_RECORDED, NOTE_ONLY }
