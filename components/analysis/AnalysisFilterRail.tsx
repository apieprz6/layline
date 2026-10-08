'use client'

import { useState, type CSSProperties, type ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import type { AnalysisArchiveRace } from '@/services/analysis/readArchive'
import {
  bucketCounts,
  clearDimension,
  isNarrowed,
  selectedBuckets,
  setDayRange,
  summariseDimension,
  toggleBucket,
} from '@/services/analysis/filter'
import type {
  AnalysisBucket,
  AnalysisDimension,
  AnalysisDimensionSpec,
  AnalysisFilter,
  MatchableRow,
} from '@/types'

interface AnalysisFilterRailProps {
  /** Which dimensions this screen offers, in rail order. */
  dimensions: readonly AnalysisDimensionSpec[]
  filter: AnalysisFilter
  /** Every row the screen was shipped — the chip counts are computed over these, not the match. */
  rows: readonly MatchableRow[]
  /** Newest first, for the `when` popover's Race list. */
  races: readonly AnalysisArchiveRace[]
  onChange: (next: AnalysisFilter) => void
}

/**
 * The **Analysis Filter** as a rail that never hides (ADR 0029).
 *
 * One menu chip per dimension, each reading its own current narrowing, in a horizontally scrolling
 * row under the screen title. Tapping one opens a popover of that dimension's buckets; nothing
 * else moves and the chart is never covered.
 *
 * It does not collapse, and that is the decision rather than a styling choice: on a 390px screen
 * the mockup's disclosure panel is either open and pushing the chart off-screen, or closed and
 * silent about what it is doing. A rail's state is legible without opening anything.
 *
 * **A tap never navigates.** The filter is client state and this component only ever calls
 * `onChange`; whoever owns the state mirrors it into the URL (see `PolarPerformanceContent`).
 *
 * One component for all three screens that have a filter. Each passes its own dimension registry,
 * so a new dimension is added once — which is why nothing here names a screen.
 */
export default function AnalysisFilterRail({
  dimensions,
  filter,
  rows,
  races,
  onChange,
}: AnalysisFilterRailProps): ReactElement {
  const [open, setOpen] = useState<AnalysisDimension | null>(null)
  const openSpec = dimensions.find((dimension) => dimension.id === open) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
      <div
        data-testid="analysis-filter-rail"
        role="group"
        aria-label="Analysis filter"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          // Bleeds to the screen edges so it reads as scrollable rather than as a wrapped list.
          padding: `2px ${spacing(4)}`,
          margin: `0 -${spacing(4)}`,
          scrollbarWidth: 'none',
        }}
      >
        {dimensions.map((dimension) => {
          const narrowed = isNarrowed(filter, dimension.id)

          return (
            <button
              key={dimension.id}
              type="button"
              data-testid={`filter-chip-${dimension.id}`}
              aria-expanded={open === dimension.id}
              onClick={() => setOpen(open === dimension.id ? null : dimension.id)}
              style={{
                ...CHIP_STYLE,
                border: `1px solid ${narrowed ? 'var(--blue-500)' : 'var(--surface-border)'}`,
                background: narrowed ? 'var(--blue-muted)' : 'var(--surface-raised)',
                color: narrowed ? 'var(--text-accent)' : 'var(--text-secondary)',
                fontWeight: narrowed ? 600 : 500,
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{dimension.label}:</span>
              {summariseDimension(filter, dimension)}
              <Chevron />
            </button>
          )
        })}
      </div>

      {openSpec !== null && (
        <BucketPopover
          dimension={openSpec}
          dimensions={dimensions}
          filter={filter}
          rows={rows}
          races={races}
          onChange={onChange}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

const CHIP_STYLE: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '7px 11px',
  borderRadius: radius('full'),
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  whiteSpace: 'nowrap',
}

function Chevron(): ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/**
 * One dimension's buckets, open.
 *
 * Every bucket in the vocabulary renders, and an empty one renders **disabled rather than absent**
 * (ADR 0014, ADR 0029): this boat owns three sails it has never raced, and a chip that vanished
 * would leave a sailor unable to tell "never sailed" from "filtered away".
 *
 * Every chip carries its row count, computed with every *other* dimension applied but **not its
 * own** — so the number predicts what tapping it does rather than describing what is already on
 * screen.
 *
 * Inline under the rail rather than floated over it. A floating popover at 390px either covers the
 * figures or needs collision maths; pushing the content down costs one scroll and covers nothing.
 */
function BucketPopover({
  dimension,
  dimensions,
  filter,
  rows,
  races,
  onChange,
  onClose,
}: {
  dimension: AnalysisDimensionSpec
  dimensions: readonly AnalysisDimensionSpec[]
  filter: AnalysisFilter
  rows: readonly MatchableRow[]
  races: readonly AnalysisArchiveRace[]
  onChange: (next: AnalysisFilter) => void
  onClose: () => void
}): ReactElement {
  const counts = bucketCounts(rows, filter, dimensions, dimension.id)
  const picked = selectedBuckets(filter, dimension.id)
  const footnotes = dimension.buckets.flatMap((bucket) =>
    bucket.footnote === null ? [] : [bucket.footnote]
  )

  return (
    <div
      data-testid="filter-popover"
      role="group"
      aria-label={dimension.label}
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--blue-muted-40)',
        borderRadius: radius('md'),
        boxShadow: 'var(--shadow-md)',
        padding: spacing(3),
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>{dimension.label}</span>
        <span style={{ display: 'flex', gap: spacing(3) }}>
          <button
            type="button"
            onClick={() => onChange(clearDimension(filter, dimension.id))}
            style={LINK_STYLE}
          >
            Any
          </button>
          <button type="button" onClick={onClose} style={LINK_STYLE}>
            Done
          </button>
        </span>
      </div>

      {picked.length === 0 && filter.range === null && (
        // Said out loud, because an untouched dimension lights no chip and a sailor could read that
        // as nothing being selected rather than everything being in. ADR 0026's default, in words.
        <p style={{ ...NOTE_STYLE, margin: 0 }}>
          Any — every bucket, including the rows with nothing recorded.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dimension.buckets.map((bucket) => (
          <BucketChip
            key={bucket.id}
            bucket={bucket}
            rows={counts.get(bucket.id)?.rows ?? 0}
            selected={picked.includes(bucket.id)}
            onToggle={() => onChange(toggleBucket(filter, dimension.id, bucket.id))}
          />
        ))}
      </div>

      {dimension.continuous && <RaceRange filter={filter} races={races} onChange={onChange} />}

      {footnotes.map((footnote) => (
        <p key={footnote} style={{ ...NOTE_STYLE, margin: 0 }}>
          {footnote}
        </p>
      ))}
    </div>
  )
}

const LINK_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--text-accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
}

const NOTE_STYLE: CSSProperties = {
  fontSize: 'var(--text-xs)',
  lineHeight: 1.45,
  color: 'var(--text-muted)',
}

/**
 * One bucket, with the count tapping it would produce.
 *
 * A bucket about the record borrows **Not recorded**'s own vocabulary and its 135° hatch, and is
 * deliberately *not* `components/common/NotRecorded.tsx`: that primitive renders an absent value
 * and its own comment says nothing about an absence is interactive. This is a control for
 * selecting rows that *lack* a value — a different thing wearing the same clothes (ADR 0029).
 */
function BucketChip({
  bucket,
  rows,
  selected,
  onToggle,
}: {
  bucket: AnalysisBucket
  rows: number
  selected: boolean
  onToggle: () => void
}): ReactElement {
  // Empty and unselected is disabled; empty and selected is not, or a narrowing could not be
  // undone from the chip that made it.
  const unavailable = rows === 0 && !selected

  return (
    <button
      type="button"
      data-testid="bucket-chip"
      data-bucket={bucket.id}
      aria-pressed={selected}
      disabled={unavailable}
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '7px 11px',
        borderRadius: radius('full'),
        // Longhand throughout: mixing `border` with `borderStyle` makes React warn, and the two
        // disagree on re-render in whichever order they were written.
        borderWidth: 1,
        borderStyle: bucket.about_the_record && !selected ? 'dashed' : 'solid',
        borderColor: selected ? 'var(--blue-500)' : 'var(--surface-border)',
        background: selected
          ? 'var(--blue-500)'
          : bucket.about_the_record
            ? // The 135° hatch `NotRecorded` uses, through the same token, so it survives the
              // night-vision theme (ADR 0029).
              'repeating-linear-gradient(135deg, var(--surface-divider) 0 4px, transparent 4px 8px)'
            : 'var(--surface-elevated)',
        color: selected ? 'var(--btn-primary-fg)' : 'var(--text-secondary)',
        fontStyle: bucket.about_the_record ? 'italic' : 'normal',
        fontSize: 'var(--text-sm)',
        fontWeight: selected ? 600 : 500,
        fontFamily: 'var(--font-body)',
        cursor: unavailable ? 'not-allowed' : 'pointer',
        opacity: unavailable ? 0.45 : 1,
      }}
    >
      {bucket.label}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', opacity: 0.75 }}>
        {rows}
      </span>
    </button>
  )
}

/**
 * The Races themselves, tap-first-tap-last.
 *
 * A continuous dimension gets a continuous control, and the Races are what a sailor actually
 * remembers — "the St Joe race", not "4 September" (ADR 0029). The month chips above are the
 * shortcut, not the vocabulary, which is why they and this are mutually exclusive in the filter.
 */
function RaceRange({
  filter,
  races,
  onChange,
}: {
  filter: AnalysisFilter
  races: readonly AnalysisArchiveRace[]
  onChange: (next: AnalysisFilter) => void
}): ReactElement {
  const [anchor, setAnchor] = useState<string | null>(null)
  const range = filter.range

  function press(day: string): void {
    if (anchor === null) {
      setAnchor(day)
      onChange(setDayRange(filter, { from: day, to: day }))
      return
    }

    setAnchor(null)
    onChange(
      setDayRange(filter, anchor <= day ? { from: anchor, to: day } : { from: day, to: anchor })
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(1) }}>
      <p style={{ ...NOTE_STYLE, margin: 0 }}>
        {anchor === null
          ? 'Or tap the first and last race to include.'
          : 'Now tap the last race to include.'}
      </p>

      {races.map((race) => {
        const inRange = range !== null && race.day >= range.from && race.day <= range.to

        return (
          <button
            key={race.id}
            type="button"
            data-testid="race-range-row"
            aria-pressed={inRange}
            onClick={() => press(race.day)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing(2),
              padding: '6px 8px',
              borderRadius: radius('sm'),
              border: `1px solid ${inRange ? 'var(--blue-muted-40)' : 'transparent'}`,
              background: inRange ? 'var(--blue-muted)' : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              {race.day.slice(5)}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 'var(--text-xs)',
                color: inRange ? 'var(--text-accent)' : 'var(--text-secondary)',
                fontWeight: inRange ? 600 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {/* An untitled race is normal (ADR 0010); generating a name here would be Layline
                  writing Testimony the sailor withheld. */}
              {race.title ?? 'Untitled race'}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              {race.rows}
            </span>
          </button>
        )
      })}
    </div>
  )
}
