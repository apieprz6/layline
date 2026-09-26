import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { DiagnosticOnlyNote, FilterStub, ScreenHeader } from './Chrome'
import {
  CAL_EVENTS,
  CHANNELS,
  COVERAGE,
  ERAS,
  EXCLUSION_WORDS,
  RACES,
  pointOf,
  raceName,
  shortDate,
  signed,
  type ChannelKey,
  type ChannelMeta,
} from './fixture'

export const NAME = 'Shared timeline, noise envelopes'

/* -------------------------------------------------------------- geometry */

const AXIS_FROM = Date.parse('2026-05-28T00:00:00Z')
const AXIS_TO = Date.parse('2026-09-22T00:00:00Z')
const LEFT = 30
const RIGHT = 296

function xOf(iso: string): number {
  const at = Date.parse(`${iso}T12:00:00Z`)
  return LEFT + ((at - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * (RIGHT - LEFT)
}

interface Span {
  from: string
  until: string
  value: number
  spread: number
}

/** A channel's eras as drawable spans — `ERAS` is newest-first, so each one ends where the last began. */
function spansOf(key: ChannelKey): Span[] {
  const eras = ERAS[key]
  return eras.map((era, index) => ({
    from: era.from,
    until: index === 0 ? '2026-09-22' : eras[index - 1].from,
    value: era.value,
    spread: era.spread,
  }))
}

interface Lane {
  meta: ChannelMeta
  top: number
  height: number
  yOf: (value: number) => number
  spans: Span[]
}

const LANE_HEIGHT = 58
/**
 * Tall enough for two rows of event labels. Two of the archive's three Calibration Events are 14
 * days apart on a ~117-day axis, so their labels collide outright on one row at 390px — they are
 * staggered instead of abbreviated, since "PADDLEWHEEL" and "MASTHEAD" are the words that make the
 * rule legible without tapping it.
 */
const GUTTER = 34
const EVENT_LABEL_ROWS = 2

function buildLanes(): Lane[] {
  return CHANNELS.map((meta, index) => {
    const spans = spansOf(meta.key)
    const values = RACES.flatMap((race) => {
      const point = pointOf(race, meta.key)
      return point.ok ? [point.value] : []
    })
    const edges = [
      0,
      ...values,
      ...spans.flatMap((span) => [span.value - span.spread, span.value + span.spread]),
    ]
    const lo = Math.min(...edges)
    const hi = Math.max(...edges)
    const pad = (hi - lo) * 0.12 || 1
    const top = GUTTER + index * LANE_HEIGHT
    return {
      meta,
      top,
      height: LANE_HEIGHT,
      spans,
      yOf: (value: number): number =>
        top + LANE_HEIGHT - 16 - ((value - (lo - pad)) / (hi + pad - (lo - pad))) * (LANE_HEIGHT - 24),
    }
  })
}

const LANES = buildLanes()
const CHART_HEIGHT = GUTTER + CHANNELS.length * LANE_HEIGHT + 14

/* ----------------------------------------------------------------- chart */

/**
 * PROTOTYPE — variant C's answer to questions 1, 2 and 3 in one object.
 *
 * **One date axis, three lanes.** A Calibration Event is a rule that crosses *all three*, which
 * makes LAY-145's cross-channel finding visible without a word of explanation: the July compass
 * autocompensation is a single line, and both the `HDG` and the `AWA` lane step at it while `STW`
 * does not.
 *
 * **The verdict is a shaded envelope, not a chip.** Each era draws a ribbon at its own mean ± σ.
 * A Race inside the ribbon is indistinguishable from the scatter that made it; a Race outside is
 * visibly outside. Nothing is classified, nothing is coloured red, and no number is drafted — the
 * eye does the judging, which is the most a diagnostic can honestly ask for.
 *
 * A Race with no figure is a hollow tick on the lane floor, so an absence still occupies its place
 * on the axis (LAY-145 §2.4).
 */
function Timeline(): ReactElement {
  return (
    <svg
      width="100%"
      viewBox={`0 0 300 ${CHART_HEIGHT}`}
      role="img"
      aria-label="Three instrument channels over the season, with calibration events crossing all three"
    >
      {/* Event rules first, so every lane is drawn on top of them. */}
      {[...CAL_EVENTS]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((event, index) => {
          // Alternate label rows, so two events a fortnight apart stay readable.
          const row = index % EVENT_LABEL_ROWS
          const labelTop = 7 + row * 13
          return (
            <g key={event.date}>
              <line
                x1={xOf(event.date)}
                y1={labelTop + 2}
                x2={xOf(event.date)}
                y2={GUTTER + CHANNELS.length * LANE_HEIGHT}
                stroke="var(--text-accent)"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.55"
              />
              <text
                x={xOf(event.date)}
                y={labelTop}
                fontSize="5.5"
                fontFamily="var(--font-mono)"
                fill="var(--text-accent)"
                textAnchor="middle"
              >
                {event.tick}
              </text>
              <text
                x={xOf(event.date)}
                y={labelTop + 6}
                fontSize="5.5"
                fontFamily="var(--font-mono)"
                fill="var(--text-muted)"
                textAnchor="middle"
              >
                {event.channel} · {shortDate(event.date)}
              </text>
            </g>
          )
        })}

      {LANES.map((lane) => {
        const floor = lane.top + lane.height - 6
        return (
          <g key={lane.meta.key}>
            <line
              x1={LEFT}
              y1={lane.top + 1}
              x2={RIGHT}
              y2={lane.top + 1}
              stroke="var(--surface-divider)"
              strokeWidth="0.6"
            />
            <text
              x="2"
              y={lane.top + 12}
              fontSize="7"
              fontFamily="var(--font-mono)"
              fontWeight="700"
              fill="var(--text-secondary)"
            >
              {lane.meta.channel}
            </text>
            <text x="2" y={lane.top + 20} fontSize="5.5" fill="var(--text-muted)">
              {lane.meta.unit === 'kt' ? 'kt' : 'deg'}
            </text>

            {/* Zero, and the per-era noise envelope. */}
            <line
              x1={LEFT}
              y1={lane.yOf(0)}
              x2={RIGHT}
              y2={lane.yOf(0)}
              stroke="var(--chart-grid-coarse)"
              strokeWidth="0.8"
            />
            {lane.spans.map((span) => {
              const x1 = xOf(span.from)
              const x2 = xOf(span.until)
              const yHi = lane.yOf(span.value + span.spread)
              const yLo = lane.yOf(span.value - span.spread)
              return (
                <g key={span.from}>
                  <rect
                    x={x1}
                    y={yHi}
                    width={Math.max(1, x2 - x1)}
                    height={Math.max(1, yLo - yHi)}
                    fill="var(--blue-500)"
                    opacity="0.09"
                  />
                  <line
                    x1={x1}
                    y1={lane.yOf(span.value)}
                    x2={x2}
                    y2={lane.yOf(span.value)}
                    stroke="var(--blue-500)"
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  <text
                    x={x1 + 2}
                    y={lane.yOf(span.value) - 2}
                    fontSize="5.5"
                    fontFamily="var(--font-mono)"
                    fill="var(--text-accent)"
                  >
                    {signed(span.value, lane.meta.unit, lane.meta.unit === 'kt' ? 2 : 1)}
                  </text>
                </g>
              )
            })}

            {RACES.map((race) => {
              const point = pointOf(race, lane.meta.key)
              if (!point.ok) {
                return (
                  <g key={race.id}>
                    <line
                      x1={xOf(race.date)}
                      y1={floor - 3}
                      x2={xOf(race.date)}
                      y2={floor}
                      stroke="var(--text-muted)"
                      strokeWidth="0.8"
                    />
                    <circle
                      cx={xOf(race.date)}
                      cy={floor - 5}
                      r="1.7"
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="0.8"
                    />
                  </g>
                )
              }
              const span = lane.spans.find(
                (candidate) => race.date >= candidate.from && race.date < candidate.until
              )
              const outside =
                span !== undefined && Math.abs(point.value - span.value) > span.spread
              return (
                <circle
                  key={race.id}
                  cx={xOf(race.date)}
                  cy={lane.yOf(point.value)}
                  r={outside ? 2.6 : 2}
                  fill={outside ? 'var(--surface-raised)' : 'var(--blue-500)'}
                  stroke="var(--blue-500)"
                  strokeWidth={outside ? 1.4 : 0}
                />
              )
            })}
          </g>
        )
      })}

      {['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map((month) => (
        <text
          key={month}
          x={xOf(month)}
          y={CHART_HEIGHT - 3}
          fontSize="6"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
          textAnchor="middle"
        >
          {shortDate(month).split(' ')[0]}
        </text>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------- feed */

type FeedItem =
  | { kind: 'race'; date: string; race: (typeof RACES)[number] }
  | { kind: 'event'; date: string; event: (typeof CAL_EVENTS)[number] }

function feed(): FeedItem[] {
  const items: FeedItem[] = [
    ...RACES.map((race) => ({ kind: 'race' as const, date: race.date, race })),
    ...CAL_EVENTS.map((event) => ({ kind: 'event' as const, date: event.date, event })),
  ]
  return items.sort((a, b) => b.date.localeCompare(a.date))
}

function FeedList(): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {feed().map((item) =>
        item.kind === 'event' ? (
          <div
            key={`e-${item.date}`}
            style={{
              borderLeft: '2px solid var(--text-accent)',
              background: 'var(--blue-muted)',
              padding: '8px 10px',
              margin: '4px 0',
              borderRadius: '0 6px 6px 0',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-accent)',
                fontWeight: 700,
              }}
            >
              {shortDate(item.date)} · {item.event.tick} · {item.event.channel}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              {item.event.note}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
              {item.event.source === 'event'
                ? 'Calibration Event — something a person did'
                : 'Instrument Calibration Version — a number a person typed in'}
            </div>
          </div>
        ) : (
          <div
            key={`r-${item.race.id}`}
            style={{ borderTop: '1px solid var(--surface-divider)', padding: '8px 2px' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'baseline',
              }}
            >
              <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontWeight: 600 }}>
                {raceName(item.race)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {shortDate(item.date)} · {item.race.hours.toFixed(1)}h
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              {CHANNELS.map((channel) => {
                const point = pointOf(item.race, channel.key)
                return (
                  <span
                    key={channel.key}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, whiteSpace: 'nowrap' }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>{channel.channel} </span>
                    {point.ok ? (
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                        {signed(point.value, channel.unit, channel.unit === 'kt' ? 2 : 1)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>
                        ○ {EXCLUSION_WORDS[point.reason]}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- screen */

export function Screen(): ReactElement {
  return (
    <div style={{ background: 'var(--page-bg)', minHeight: '100vh', paddingBottom: 64 }}>
      <ScreenHeader
        subtitle="One season, three channels, one date axis. Events cross all three lanes, because a change to one instrument rarely stays in its own channel."
      />

      <div
        style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(4) }}
      >
        <FilterStub />

        <section
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            padding: `${spacing(3)} ${spacing(2)}`,
          }}
        >
          <Timeline />
          <div
            style={{
              fontSize: 10,
              lineHeight: 1.55,
              color: 'var(--text-muted)',
              padding: `6px ${spacing(2)} 0`,
            }}
          >
            The shaded band is each era’s own scatter (mean ± σ). A <strong>hollow dot</strong> sits
            outside its era’s band — outside that channel’s own noise. A{' '}
            <strong>hollow tick on the floor</strong> is a race that produced no figure at all, kept
            on the axis so it is not mistaken for a race that never happened.
          </div>
        </section>

        {/* No verdict chips: the definitions and caveats carry the interpretation instead. */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CHANNELS.map((meta) => (
            <div
              key={meta.key}
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--surface-border)',
                borderRadius: 6,
                padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', flexWrap: 'wrap' }}>
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
              {meta.key === 'stw' && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--text-secondary)',
                    marginTop: 3,
                  }}
                >
                  R² {ERAS.stw[0].r2?.toFixed(2)} this era · no paddlewheel reading on{' '}
                  {COVERAGE.blankStwPct}% of rows
                </div>
              )}
            </div>
          ))}
        </section>

        <section>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}
          >
            The season in order
          </div>
          <FeedList />
        </section>

        <DiagnosticOnlyNote
          body="Nothing on this screen is a setting. The bands say how far each reading sits from its own noise; whether that earns a trip to the boat is yours to decide, and the correction itself is measured out on the water and typed into the display by hand. Layline records that you did it, then starts measuring what is left over."
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ teaser */

/**
 * Variant C's teaser is not a row. Its argument: the existing "Instrument calibration" row opens a
 * *file*, and a row is the right shape for a file. This opens a *season of measurements*, so it
 * takes the shape the Polar hero card already established for that — which also settles the naming
 * collision by making the two look nothing alike.
 */
export function Teaser(): ReactElement {
  const mini = 52
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-md)',
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          Instrument tuning · whole archive
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>›</span>
      </div>
      <svg width="100%" viewBox={`0 0 300 ${mini * CHANNELS.length}`} role="presentation">
        {CHANNELS.map((meta, index) => {
          const values = RACES.flatMap((race) => {
            const point = pointOf(race, meta.key)
            return point.ok ? [{ date: race.date, value: point.value }] : []
          })
          const lo = Math.min(...values.map((entry) => entry.value))
          const hi = Math.max(...values.map((entry) => entry.value))
          const top = index * mini
          const y = (value: number): number =>
            top + mini - 14 - ((value - lo) / (hi - lo || 1)) * (mini - 26)
          return (
            <g key={meta.key}>
              <text x="2" y={top + 12} fontSize="8" fontFamily="var(--font-mono)" fill="var(--text-muted)">
                {meta.channel}
              </text>
              <polyline
                points={values.map((entry) => `${xOf(entry.date)},${y(entry.value)}`).join(' ')}
                fill="none"
                stroke="var(--blue-500)"
                strokeWidth="1.4"
              />
              {CAL_EVENTS.filter((event) => meta.marks.includes(event.channel)).map((event) => (
                <line
                  key={event.date}
                  x1={xOf(event.date)}
                  y1={top + 6}
                  x2={xOf(event.date)}
                  y2={top + mini - 8}
                  stroke="var(--text-accent)"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                  opacity="0.5"
                />
              ))}
            </g>
          )
        })}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        3 channels · 12 of {COVERAGE.races} races in the compass trend · tap for the season
      </div>
    </div>
  )
}

export const TEASER_NOTE =
  'Not a row at all. A row is the right shape for a file, which is what "Instrument calibration" opens; this opens a season of measurements, so it borrows the Polar hero card’s shape instead. The naming collision stops mattering once the two look nothing alike.'

export const TEASER_PLACEMENT = 'card' as const
