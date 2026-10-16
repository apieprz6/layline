/**
 * The three **Calibration Channels** side by side: each one's name, its figure, what that figure
 * rests on, and a bar.
 *
 * LAY-149 variant D's tile, which two places draw — the "This season" rail's **Instrument tuning** row,
 * over the season, and a Race page's calibration check, over one race. One grid for both, so the
 * same `stbd 4.2°` cannot be laid out two ways a tap apart.
 *
 * Neutral throughout: a bar states how much evidence there is, never that an instrument is wrong
 * (ADR 0034), and no figure here is a value to type into a display (LAY-138 decision 7).
 *
 * A Server Component: nothing to interact with.
 */

import type { CSSProperties, ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { CHANNEL_TITLE, type CheckedChannel } from './chart-text'

/** One figure, with the speed or point of sail it belongs to where there are two of them. */
export interface ChannelFigure {
  /** `4 kt`, `up`, `down` — absent where the column has one figure and nothing to tell apart. */
  at?: string
  reading: string
}

/** One channel's column, computed by whoever knows what the figures are over. */
export interface ChannelColumn {
  channel: CheckedChannel
  figures: ChannelFigure[]
  /** Words in place of the figures, where the channel produced none. Null where it did. */
  instead: string | null
  /** What the figure rests on, in words. Null where there is nothing to say it of. */
  basis: string | null
  /** 0–1, or null where there is no figure to draw evidence for. */
  bar: number | null
}

/** The `data-testid` each band carries, so each place keeps the hooks its own suites read. */
export interface ChannelColumnTestIds {
  name?: string
  figures: string
  basis?: string
  bar: string
}

export default function ChannelColumns({
  columns,
  testIds,
}: {
  columns: readonly ChannelColumn[]
  testIds: ChannelColumnTestIds
}): ReactElement {
  return (
    // Laid out a row at a time rather than a column at a time — three names, then three sets of
    // figures, then three reasons, then three bars. A grid of three columns fills in that order by
    // itself, so the four bands line up across the three channels without a subgrid: otherwise the
    // Wind angle column's two points of sail would push its bar below the other two, and the three
    // would stop reading as one picture.
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        columnGap: spacing(2),
        rowGap: 2,
        alignItems: 'start',
      }}
    >
      {columns.map((column) => (
        // The channel's own name — the title of the chart a tap lands on, never a second word for it.
        <span
          key={column.channel}
          data-testid={testIds.name}
          data-channel={column.channel}
          style={NAME_STYLE}
        >
          {CHANNEL_TITLE[column.channel]}
        </span>
      ))}
      {columns.map((column) => (
        <Figures key={column.channel} column={column} testId={testIds.figures} />
      ))}
      {columns.map((column) => (
        <span
          key={column.channel}
          data-testid={testIds.basis}
          data-channel={column.channel}
          style={BASIS_STYLE}
        >
          {column.basis}
        </span>
      ))}
      {columns.map((column) => (
        <Bar key={column.channel} column={column} testId={testIds.bar} />
      ))}
    </div>
  )
}

/** Its figure, or the words that stand where the figure would have been. */
function Figures({ column, testId }: { column: ChannelColumn; testId: string }): ReactElement {
  if (column.instead !== null) {
    return (
      // Words, never a dash and never a nought: the prototype's `—` is the one thing from its tile
      // that cannot ship (ADR 0012). An absence is a finding and reads as one.
      <span
        data-testid={testId}
        data-channel={column.channel}
        style={{ fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic', minWidth: 0 }}
      >
        {column.instead}
      </span>
    )
  }

  return (
    <span
      data-testid={testId}
      data-channel={column.channel}
      style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
    >
      {column.figures.map((figure) => (
        <span
          key={figure.at ?? figure.reading}
          style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}
        >
          {/* Which speed or which point of sail, small and ahead of the figure it belongs to, so
              two readings in one column can never be read in the wrong order. */}
          {figure.at !== undefined && (
            <span style={{ fontSize: 8.5, color: 'var(--text-muted)', flexShrink: 0 }}>
              {figure.at}
            </span>
          )}
          {/*
            Never wrapped, and 12px rather than the 13 the prototype's tile used: `stbd 10.0°` with
            its point of sail ahead of it is the widest reading any channel produces, and at 13px it
            broke across two lines in a third of a 390px screen — splitting a figure from its unit,
            which is the one thing a figure may not do. `e2e/authenticated/instrument-tuning-charts`
            and `e2e/race-breakdown` measure the columns, so a wider reading fails there rather than
            wrapping quietly.
          */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            {figure.reading}
          </span>
        </span>
      ))}
    </span>
  )
}

/**
 * The bar, or nothing at all where the channel produced no figure.
 *
 * A bar is a drawing of how much a figure rests on, so an empty track under no figure would be
 * drawing the evidence for a measurement nobody made. The cell still stands, keeping the three
 * columns in step.
 */
function Bar({ column, testId }: { column: ChannelColumn; testId: string }): ReactElement {
  if (column.bar === null) return <span />

  return (
    <span
      data-testid={testId}
      data-channel={column.channel}
      data-share={column.bar.toFixed(2)}
      style={{
        display: 'block',
        height: 4,
        background: 'var(--surface-divider)',
        borderRadius: 2,
        marginTop: 3,
      }}
    >
      <span
        style={{
          display: 'block',
          width: `${Math.round(column.bar * 100)}%`,
          height: 4,
          background: 'var(--text-primary)',
          borderRadius: 2,
        }}
      />
    </span>
  )
}

const NAME_STYLE: CSSProperties = {
  fontSize: 8.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  lineHeight: 1.3,
  minWidth: 0,
}

const BASIS_STYLE: CSSProperties = {
  fontSize: 8.5,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
  minWidth: 0,
}
