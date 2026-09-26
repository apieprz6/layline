import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { DiagnosticOnlyNote, FilterStub, ScreenHeader } from './Chrome'
import { Row } from './OverallShell'
import {
  CAL_EVENTS,
  CHANNELS,
  COVERAGE,
  EXCLUSION_WORDS,
  RACES,
  pointOf,
  raceName,
  shortDate,
  signed,
  type CalEvent,
  type ChannelKey,
  type ChannelMeta,
  type ExclusionReason,
  type Race,
} from './fixture'

export const NAME = 'Era ledger, no verdict'

/* ---------------------------------------------------------------- segments */

/**
 * PROTOTYPE — variant B's answer to question 3, which is to refuse the premise.
 *
 * The other variants annotate a trend with Calibration Events. Here the events **are** the
 * structure: one row per Calibration Log entry, newest first, every channel's figure shown as it
 * stood in that stretch. So a row is not "a note on the chart", it is the unit the screen is made
 * of — and the cross-channel question answers itself, because the July compass autocompensation
 * visibly moves the `HDG` *and* `AWA` columns while leaving `STW` alone, all on one line.
 *
 * The Calibration Log is already a merged projection of Events and Instrument Calibration Version
 * changes (`lib/boat/calibrationLog.ts`), which is exactly the timeline this table needs; nothing
 * is re-derived per channel.
 */
interface Segment {
  from: string
  /** `null` for the stretch that opens with the archive's first Race. */
  opener: CalEvent | null
  races: Race[]
}

function buildSegments(): Segment[] {
  const boundaries = [...CAL_EVENTS].sort((a, b) => a.date.localeCompare(b.date))
  const starts: { from: string; opener: CalEvent | null }[] = [
    { from: RACES[0].date, opener: null },
    ...boundaries.map((event) => ({ from: event.date, opener: event })),
  ]

  return starts
    .map(({ from, opener }, index) => {
      const until = starts[index + 1]?.from ?? '9999-12-31'
      return {
        from,
        opener,
        races: RACES.filter((race) => race.date >= from && race.date < until),
      }
    })
    .reverse()
}

const SEGMENTS = buildSegments()

interface Cell {
  /** `null` when no Race in the stretch produced a figure at all. */
  value: number | null
  withFigure: number
  withoutFigure: number
}

function cellOf(segment: Segment, key: ChannelKey): Cell {
  const values = segment.races.flatMap((race) => {
    const point = pointOf(race, key)
    return point.ok ? [point.value] : []
  })
  return {
    // Each Race counts once, regardless of duration — LAY-145 §2.3, so the 13.68-hour distance
    // race does not outweigh nine beer-cans in its own stretch.
    value: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
    withFigure: values.length,
    withoutFigure: segment.races.length - values.length,
  }
}

const CELLS: Cell[][] = SEGMENTS.map((segment) =>
  CHANNELS.map((channel) => cellOf(segment, channel.key))
)

/** The Δ against the next stretch *down* the table — the older one. This is the whole verdict. */
function deltaOf(rowIndex: number, colIndex: number): number | null {
  const here = CELLS[rowIndex][colIndex].value
  for (let below = rowIndex + 1; below < CELLS.length; below += 1) {
    const there = CELLS[below][colIndex].value
    if (here !== null && there !== null) return here - there
  }
  return null
}

/* ------------------------------------------------------------------ ledger */

const HEAD_CELL = {
  fontSize: 8.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
  padding: '0 0 5px',
  textAlign: 'left',
} as const

function Ledger(): ReactElement {
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '31%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '23%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={HEAD_CELL}>Since</th>
            {CHANNELS.map((channel) => (
              <th key={channel.key} style={HEAD_CELL}>
                {channel.channel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEGMENTS.map((segment, rowIndex) => (
            <tr
              key={segment.from}
              style={{ borderTop: '1px solid var(--surface-divider)', verticalAlign: 'top' }}
            >
              <th scope="row" style={{ textAlign: 'left', padding: '9px 6px 9px 0' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {shortDate(segment.from)}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {segment.opener
                    ? `${segment.opener.tick} · ${segment.opener.channel}`
                    : 'first race'}
                </div>
                <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {segment.races.length} race{segment.races.length === 1 ? '' : 's'}
                </div>
              </th>

              {CHANNELS.map((channel, colIndex) => {
                const cell = CELLS[rowIndex][colIndex]
                const delta = deltaOf(rowIndex, colIndex)
                const places = channel.unit === 'kt' ? 2 : 1
                return (
                  <td key={channel.key} style={{ padding: '9px 4px 9px 0' }}>
                    {cell.value === null ? (
                      <>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          —
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                          no figure
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {signed(cell.value, channel.unit, places)}
                        </div>
                        {/* No colour, on purpose. The number that matters is the change, and a
                            change is a fact, not a status. */}
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--text-secondary)',
                            lineHeight: 1.4,
                          }}
                        >
                          {delta === null
                            ? 'no earlier figure'
                            : `Δ ${signed(delta, channel.unit, places)}`}
                        </div>
                      </>
                    )}
                    {cell.withoutFigure > 0 && (
                      <div style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.35 }}>
                        {cell.withoutFigure} race{cell.withoutFigure === 1 ? '' : 's'} not counted
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Native disclosure rather than React state: the prototype is answering a layout question,
          and `<details>` costs no hydration to find out whether the drill-down is wanted at all. */}
      <div style={{ marginTop: spacing(3), display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SEGMENTS.map((segment) => (
          <details
            key={segment.from}
            style={{
              border: '1px solid var(--surface-border)',
              borderRadius: 6,
              background: 'var(--surface-raised)',
              padding: '7px 10px',
            }}
          >
            <summary style={{ fontSize: 11, color: 'var(--text-accent)', cursor: 'pointer' }}>
              Race by race since {shortDate(segment.from)}
            </summary>
            <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {segment.races.map((race) => (
                <div
                  key={race.id}
                  style={{ borderTop: '1px solid var(--surface-divider)', paddingTop: 5 }}
                >
                  <div style={{ fontSize: 10.5, color: 'var(--text-primary)', fontWeight: 600 }}>
                    {raceName(race)}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      color: 'var(--text-muted)',
                      marginBottom: 3,
                    }}
                  >
                    {shortDate(race.date)} · {race.hours.toFixed(1)}h · {race.countableRows}{' '}
                    countable rows
                  </div>
                  {CHANNELS.map((channel) => {
                    const point = pointOf(race, channel.key)
                    return (
                      <div
                        key={channel.key}
                        style={{ display: 'flex', gap: 6, fontSize: 10, lineHeight: 1.6 }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            width: 34,
                            flexShrink: 0,
                          }}
                        >
                          {channel.channel}
                        </span>
                        {point.ok ? (
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                            {signed(point.value, channel.unit, channel.unit === 'kt' ? 2 : 1)}{' '}
                            <span style={{ color: 'var(--text-muted)' }}>
                              ± {point.spread.toFixed(channel.unit === 'kt' ? 2 : 1)} · {point.points}{' '}
                              pts
                            </span>
                          </span>
                        ) : (
                          /* Struck through rather than absent: the Race is real, the figure is not. */
                          <span
                            style={{
                              color: 'var(--text-muted)',
                              textDecoration: 'line-through',
                              textDecorationColor: 'var(--surface-border)',
                            }}
                          >
                            {EXCLUSION_WORDS[point.reason]} ({point.points})
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- glossary */

function Glossary({ meta }: { meta: ChannelMeta }): ReactElement {
  return (
    <div style={{ borderTop: '1px solid var(--surface-divider)', paddingTop: 7 }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-accent)',
          }}
        >
          {meta.channel}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          {meta.term}
        </span>
      </div>
      <div style={{ fontSize: 9.5, lineHeight: 1.5, color: 'var(--text-muted)', marginTop: 2 }}>
        {meta.how} <em>{meta.caveat}</em>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ screen */

const REASONS: ExclusionReason[] = ['too-few-points', 'too-few-segments', 'no-pairs']

export function Screen(): ReactElement {
  return (
    <div style={{ background: 'var(--page-bg)', minHeight: '100vh', paddingBottom: 64 }}>
      <ScreenHeader
        subtitle="Every stretch of the instruments’ life, three channels wide, newest at the top. Read a row against the one below it."
      />

      <div
        style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(4) }}
      >
        <FilterStub />

        <Ledger />

        <section
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: spacing(3),
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 7,
            }}
          >
            Not in any trend
          </div>
          {REASONS.map((reason) => {
            const hits = CHANNELS.flatMap((channel) =>
              RACES.flatMap((race) => {
                const point = pointOf(race, channel.key)
                return !point.ok && point.reason === reason
                  ? [`${shortDate(race.date)} · ${channel.channel}`]
                  : []
              })
            )
            if (hits.length === 0) return null
            return (
              <div key={reason} style={{ fontSize: 10, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>{EXCLUSION_WORDS[reason]}</strong>
                {' — '}
                {hits.join(', ')}
              </div>
            )
          })}
          <div style={{ fontSize: 10, lineHeight: 1.6, color: 'var(--text-muted)', marginTop: 5 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>No paddlewheel reading</strong> —{' '}
            {COVERAGE.blankStwPct}% of rows across the whole archive. Those rows have no speed to
            plot against GPS, so they are counted rather than quietly dropped.
          </div>
        </section>

        <section
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: spacing(3),
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            What each column is
          </div>
          {CHANNELS.map((meta) => (
            <Glossary key={meta.key} meta={meta} />
          ))}
        </section>

        <DiagnosticOnlyNote
          body="There is no status anywhere on this screen, and that is the design. A diagnostic can honestly say “this moved, by this much, when this happened”; it cannot say whether that is worth your Saturday. Nor does it draft a correction — the number you would type into the display is measured on the boat, on the water, and Layline only records that you did it and then measures what is left."
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ teaser */

export function Teaser(): ReactElement {
  const newest = SEGMENTS[0]
  const biggest = CHANNELS.map((channel, colIndex) => ({
    channel,
    delta: deltaOf(0, colIndex),
  }))
    .filter((entry): entry is { channel: ChannelMeta; delta: number } => entry.delta !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]

  return (
    <Row
      label="Instrument tuning"
      sub={
        biggest
          ? `last change ${shortDate(newest.from)} · ${biggest.channel.channel} ${signed(
              biggest.delta,
              biggest.channel.unit,
              biggest.channel.unit === 'kt' ? 2 : 1
            )}`
          : `${CHANNELS.length} channels · whole archive`
      }
    />
  )
}

export const TEASER_NOTE =
  'No pill at all. The row gains a second, monospaced line stating the most recent change — so it differs from the single-line "Instrument calibration" file row by shape, not by colour, and it promises a measurement rather than a chore.'

export const TEASER_PLACEMENT = 'row' as const
