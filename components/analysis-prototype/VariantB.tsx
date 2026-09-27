'use client'

/**
 * PROTOTYPE — LAY-144, Variant B: "bottom sheet, one dimension at a time".
 *
 * Argues the opposite of the mockup: six dimensions carrying up to ten buckets
 * each will not fit a 390px panel without becoming a wall of pills, so nothing is
 * shown until asked for. A dock button opens a sheet listing the six dimensions
 * and what each is currently narrowed to; tapping one drills into its buckets.
 *
 * Its answers to the ticket's three questions:
 *  1. `When` is not a chip row at all — it is a drill-in whose first entries are
 *     whole-archive and season, with months under them and an exact-dates row last.
 *     A dimension whose buckets are derived from the archive gets a list, not chips.
 *  2. "Not recorded" is pushed below a divider headed "Nothing written down",
 *     with its own count — separated from the real values instead of sitting among
 *     them, because it answers a different question.
 *  3. Selections are staged in the sheet and written to the URL once, on
 *     "Show results". One navigation per visit to the sheet, not one per tap.
 */

import { useState } from 'react'
import { radius, spacing } from '@/lib/utils/design'
import {
  ARCHIVE_SPAN,
  DIMENSIONS,
  EMPTY_FILTER,
  activeDimensions,
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

export const VARIANT_B_NAME = 'Bottom sheet, batched URL'

type Props = {
  filter: PrototypeFilter
  onChange: (next: PrototypeFilter) => void
  onClear: () => void
  pending: boolean
}

export default function VariantB({ filter, onChange, onClear, pending }: Props) {
  const [sheet, setSheet] = useState<'closed' | 'dimensions' | DimensionId>('closed')
  const [draft, setDraft] = useState<PrototypeFilter>(filter)
  const active = activeDimensions(filter)
  const stats = matchStats(filter)

  const openSheet = () => {
    setDraft(filter)
    setSheet('dimensions')
  }
  const apply = () => {
    setSheet('closed')
    onChange(draft)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3), paddingBottom: 72 }}>
      {/* Applied filters as removable pills — the only filter UI visible at rest. */}
      {active.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Whole archive · {stats.rows} rows across {stats.totalRaces} races.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {active.map((dim) => (
            <button
              key={dim}
              type="button"
              onClick={() => onChange(clearDimension(filter, dim))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px 5px 10px',
                borderRadius: radius('full'),
                border: '1px solid var(--blue-muted-40)',
                background: 'var(--blue-muted)',
                color: 'var(--text-accent)',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              {dimension(dim).label}: {summarise(filter, dim)}
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}>
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onClear}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 4px',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <div
        style={{
          border: '1px dashed var(--surface-border)',
          borderRadius: radius('md'),
          padding: spacing(5),
          textAlign: 'center',
          opacity: pending ? 0.55 : 1,
          transition: 'opacity 120ms',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 30,
            fontWeight: 700,
            color: 'var(--text-accent)',
          }}
        >
          {stats.avgPct === null ? '—' : `${stats.avgPct}%`}
        </div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          avg of target
        </div>
        <div style={{ marginTop: spacing(3), fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Polar chart goes here · {stats.rows} rows, {stats.races} races
        </div>
      </div>

      {/* Dock. `.bottom-dock` already exists in globals.css; this borrows its look. */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${spacing(2)} ${spacing(4)} ${spacing(4)}`,
          background: 'var(--surface-dock-bg)',
          backdropFilter: 'var(--surface-dock-blur)',
          borderTop: '1px solid var(--surface-divider)',
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={openSheet}
          style={{
            width: '100%',
            padding: '11px 14px',
            borderRadius: radius('md'),
            border: 'none',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          Filters{active.length > 0 ? ` · ${active.length}` : ''}
        </button>
      </div>

      {sheet !== 'closed' && (
        <Sheet
          onClose={() => setSheet('closed')}
          title={sheet === 'dimensions' ? 'Filters' : dimension(sheet).label}
          onBack={sheet === 'dimensions' ? undefined : () => setSheet('dimensions')}
          footer={
            <button
              type="button"
              onClick={apply}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: radius('md'),
                border: 'none',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-fg)',
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Show {matchStats(draft).rows} rows
            </button>
          }
        >
          {sheet === 'dimensions' ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {DIMENSIONS.map((dim) => (
                <button
                  key={dim.id}
                  type="button"
                  onClick={() => setSheet(dim.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing(2),
                    padding: `${spacing(3)} 0`,
                    borderBottom: '1px solid var(--surface-divider)',
                    background: 'none',
                    border: 'none',
                    borderBottomWidth: 1,
                    borderBottomStyle: 'solid',
                    borderBottomColor: 'var(--surface-divider)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {dim.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: selected(draft, dim.id).length || (dim.id === 'date' && draft.range) ? 'var(--text-accent)' : 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {summarise(draft, dim.id)}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" aria-hidden>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <BucketList dim={sheet} draft={draft} setDraft={setDraft} />
          )}
        </Sheet>
      )}
    </div>
  )
}

function BucketList({
  dim,
  draft,
  setDraft,
}: {
  dim: DimensionId
  draft: PrototypeFilter
  setDraft: (f: PrototypeFilter) => void
}) {
  const d = dimension(dim)
  const counts = bucketCounts(draft, dim)
  const picked = selected(draft, dim)
  const real = d.buckets.filter((b) => b.aboutTheRecord !== true)
  const record = d.buckets.filter((b) => b.aboutTheRecord === true)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Row
        label="Any"
        detail="Every value, and rows with nothing written down"
        on={picked.length === 0 && !(dim === 'date' && draft.range)}
        onPress={() => setDraft(clearDimension(draft, dim))}
      />

      {dim === 'date' && (
        <Row
          label="2026 season"
          detail={`${ARCHIVE_SPAN.from} → ${ARCHIVE_SPAN.to} · the only season in the archive`}
          on={picked.length === d.buckets.length}
          onPress={() => setDraft({ ...draft, date: d.buckets.map((b) => b.id), range: null })}
        />
      )}

      {real.map((b) => (
        <Row
          key={b.id}
          label={b.label}
          detail={`${counts[b.id]?.rows ?? 0} rows · ${counts[b.id]?.races ?? 0} races`}
          on={picked.includes(b.id)}
          disabled={(counts[b.id]?.rows ?? 0) === 0 && !picked.includes(b.id)}
          onPress={() => setDraft(toggleBucket(draft, dim, b.id))}
        />
      ))}

      {dim === 'date' && (
        <div style={{ padding: `${spacing(3)} 0` }}>
          <div
            style={{
              fontSize: 9.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
              marginBottom: spacing(2),
            }}
          >
            Exact dates
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="date"
              aria-label="From"
              min={ARCHIVE_SPAN.from}
              max={ARCHIVE_SPAN.to}
              value={draft.range?.from ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  date: [],
                  range: { from: e.target.value, to: draft.range?.to ?? ARCHIVE_SPAN.to },
                })
              }
              style={sheetDateStyle}
            />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input
              type="date"
              aria-label="To"
              min={ARCHIVE_SPAN.from}
              max={ARCHIVE_SPAN.to}
              value={draft.range?.to ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  date: [],
                  range: { from: draft.range?.from ?? ARCHIVE_SPAN.from, to: e.target.value },
                })
              }
              style={sheetDateStyle}
            />
          </div>
        </div>
      )}

      {record.length > 0 && (
        <>
          <div
            style={{
              marginTop: spacing(4),
              paddingTop: spacing(2),
              borderTop: '1px solid var(--surface-border)',
              fontSize: 9.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
            }}
          >
            Nothing written down
          </div>
          {record.map((b) => (
            <Row
              key={b.id}
              label={b.label}
              italic
              detail={
                b.id === 'note-only'
                  ? `${counts[b.id]?.rows ?? 0} rows · a sail the chart has no word for`
                  : `${counts[b.id]?.rows ?? 0} rows · ${counts[b.id]?.races ?? 0} races nobody annotated`
              }
              on={picked.includes(b.id)}
              disabled={(counts[b.id]?.rows ?? 0) === 0 && !picked.includes(b.id)}
              onPress={() => setDraft(toggleBucket(draft, dim, b.id))}
            />
          ))}
        </>
      )}
    </div>
  )
}

const sheetDateStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: radius('sm'),
  color: 'var(--input-fg)',
  padding: '8px 9px',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-mono)',
}

function Row({
  label,
  detail,
  on,
  disabled,
  italic,
  onPress,
}: {
  label: string
  detail: string
  on: boolean
  disabled?: boolean
  italic?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={on}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing(3),
        padding: `${spacing(3)} 0`,
        borderBottom: '1px solid var(--surface-divider)',
        background: 'none',
        border: 'none',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--surface-divider)',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: radius('xs'),
          border: `1px solid ${on ? 'var(--blue-500)' : 'var(--surface-border)'}`,
          background: on ? 'var(--blue-500)' : 'var(--surface-raised)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        {on ? '✓' : ''}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-base)',
            color: 'var(--text-primary)',
            fontStyle: italic ? 'italic' : 'normal',
          }}
        >
          {label}
        </span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
          {detail}
        </span>
      </span>
    </button>
  )
}

function Sheet({
  title,
  onClose,
  onBack,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  onBack?: () => void
  footer: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      aria-modal
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: 'none', cursor: 'pointer' }}
      />
      <div
        style={{
          background: 'var(--surface-base)',
          borderTopLeftRadius: radius('xl'),
          borderTopRightRadius: radius('xl'),
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing(2),
            padding: `${spacing(3)} ${spacing(4)}`,
            borderBottom: '1px solid var(--surface-divider)',
          }}
        >
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              style={{ background: 'none', border: 'none', padding: 4, marginLeft: -4, cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--text-md)',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${spacing(4)}` }}>{children}</div>
        <div style={{ padding: spacing(4), borderTop: '1px solid var(--surface-divider)' }}>{footer}</div>
      </div>
    </div>
  )
}

export { EMPTY_FILTER }
