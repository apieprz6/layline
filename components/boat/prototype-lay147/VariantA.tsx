import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { DiagnosticOnlyNote, FilterStub, ScreenHeader } from './Chrome'
import { Row } from './OverallShell'
import {
  CAL_EVENTS,
  CHANNELS,
  COVERAGE,
  ERAS,
  EXCLUSION_WORDS,
  RACES,
  pointOf,
  shortDate,
  signed,
  type ChannelMeta,
  type Era,
} from './fixture'

export const NAME = 'Channel cards + verdict bands'

/* ------------------------------------------------------------------ bands */

/**
 * PROTOTYPE — variant A's answer to "how does the sailor know a number is bad enough to act on,
 * without the UI drafting a value for them?"
 *
 * A **band**, judged against the figure's own dispersion rather than any absolute threshold. A
 * figure inside one σ of itself is indistinguishable from the scatter that produced it; past two σ
 * it is a real signal. The band says *look at the instrument*; it never says what to set it to,
 * which keeps it inside LAY-138 decision 7.
 *
 * Using each channel's own σ rather than hand-picked degree/knot thresholds also means the rule
 * needs no per-channel calibration table that would rot as the archive grows.
 */
type Band = 'within-noise' | 'worth-watching' | 'clearly-off'

function bandOf(era: Era): Band {
  const ratio = Math.abs(era.value) / era.spread
  if (ratio <= 1) return 'within-noise'
  if (ratio <= 2) return 'worth-watching'
  return 'clearly-off'
}

const BAND_WORDS: Record<Band, { label: string; fg: string; bg: string; gloss: string }> = {
  'within-noise': {
    label: 'WITHIN NOISE',
    fg: 'var(--state-neutral)',
    bg: 'rgba(0,0,0,0.05)',
    gloss: 'Smaller than the race-to-race scatter behind it. Nothing to read into.',
  },
  'worth-watching': {
    label: 'WORTH WATCHING',
    fg: 'var(--state-warning)',
    bg: 'rgba(196,112,0,0.12)',
    gloss: 'Bigger than the scatter, but not by much. Worth a look next time the boat is dry.',
  },
  'clearly-off': {
    label: 'CLEARLY OFF',
    fg: 'var(--state-danger)',
    bg: 'rgba(204,17,0,0.10)',
    gloss: 'Well outside its own scatter. This is the instrument, not the day.',
  },
}

function offBandCount(): number {
  return CHANNELS.filter((channel) => bandOf(ERAS[channel.key][0]) !== 'within-noise').length
}

/* ------------------------------------------------------------------ trend */

const AXIS_FROM = Date.parse('2026-06-01T00:00:00Z')
const AXIS_TO = Date.parse('2026-09-20T00:00:00Z')

function xOf(iso: string): number {
  const at = Date.parse(`${iso}T12:00:00Z`)
  return 8 + ((at - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 284
}

/**
 * One channel's per-Race trend, with its Calibration Events as dashed rules.
 *
 * Two things this has to get right, both settled by closed tickets: a Race with no computable
 * figure is drawn as a **hollow tick below the baseline**, never as a point at zero (LAY-145 §2.4);
 * and the `AWA` lane marks `HDG` events too, because LAY-145 found a compass autocompensation
 * plausibly moves the asymmetry.
 */
function Trend({ meta }: { meta: ChannelMeta }): ReactElement {
  const points = RACES.map((race) => ({ race, point: pointOf(race, meta.key) }))
  const values = points.flatMap(({ point }) => (point.ok ? [point.value] : []))
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const pad = (hi - lo) * 0.2 || 1
  const yOf = (value: number): number =>
    58 - ((value - (lo - pad)) / (hi + pad - (lo - pad))) * 50

  const marks = CAL_EVENTS.filter((event) => meta.marks.includes(event.channel))
  const line = points
    .flatMap(({ race, point }) => (point.ok ? [`${xOf(race.date)},${yOf(point.value)}`] : []))
    .join(' ')

  return (
    <svg width="100%" height="84" viewBox="0 0 300 84" role="presentation">
      {/* Zero: the line the offset is a departure from. */}
      <line
        x1="8"
        y1={yOf(0)}
        x2="292"
        y2={yOf(0)}
        stroke="var(--chart-grid-cardinal)"
        strokeWidth="1"
      />
      <text x="8" y={yOf(0) - 3} fontSize="6.5" fill="var(--text-muted)">
        0{meta.unit}
      </text>

      {marks.map((event) => (
        <g key={event.date}>
          <line
            x1={xOf(event.date)}
            y1="4"
            x2={xOf(event.date)}
            y2="62"
            stroke={
              event.channel === meta.channel ? 'var(--text-accent)' : 'var(--chart-grid-inter)'
            }
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          <text
            x={xOf(event.date) + 3}
            y="10"
            fontSize="6"
            fontFamily="var(--font-mono)"
            fill={event.channel === meta.channel ? 'var(--text-accent)' : 'var(--text-muted)'}
          >
            {event.tick}
            {event.channel === meta.channel ? '' : ` (${event.channel})`}
          </text>
        </g>
      ))}

      <polyline points={line} fill="none" stroke="var(--blue-500)" strokeWidth="1.5" />
      {points.map(({ race, point }) =>
        point.ok ? (
          <circle
            key={race.id}
            cx={xOf(race.date)}
            cy={yOf(point.value)}
            r="2.4"
            fill="var(--blue-500)"
          />
        ) : (
          /* Not a gap and not a zero — a Race that happened and produced no figure. */
          <g key={race.id}>
            <line
              x1={xOf(race.date)}
              y1="68"
              x2={xOf(race.date)}
              y2="75"
              stroke="var(--text-muted)"
              strokeWidth="1"
            />
            <circle
              cx={xOf(race.date)}
              cy="66"
              r="2.2"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1"
            />
          </g>
        )
      )}
      <text x="8" y="82" fontSize="6.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        Jun
      </text>
      <text x="270" y="82" fontSize="6.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        Sep
      </text>
      <text x="108" y="82" fontSize="6" fill="var(--text-muted)">
        ○ = race with no figure
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ cards */

function ChannelCard({ meta }: { meta: ChannelMeta }): ReactElement {
  const eras = ERAS[meta.key]
  const current = eras[0]
  const previous = eras[1] ?? null
  const band = BAND_WORDS[bandOf(current)]
  const excluded = RACES.filter((race) => !pointOf(race, meta.key).ok)
  const isAsymmetry = meta.key === 'awa'

  return (
    <section
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: spacing(3),
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {meta.label}
          </div>
          {/* The domain term, spelled as the closed tickets settled it — including the fact that
              the AWA figure is deliberately *not* called a Measured Offset. */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: isAsymmetry ? 'var(--state-warning)' : 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {meta.term}
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            alignSelf: 'flex-start',
            background: band.bg,
            color: band.fg,
            borderRadius: 9999,
            padding: '2px 8px',
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {band.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 27,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          {signed(current.value, meta.unit, meta.unit === 'kt' ? 2 : 1)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
          ± {current.spread.toFixed(meta.unit === 'kt' ? 2 : 1)}
          {meta.unit === 'kt' ? ' kt' : meta.unit} σ · {current.races} races
          {current.r2 !== null && ` · R² ${current.r2.toFixed(2)}`}
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
        Since{' '}
        <strong style={{ fontFamily: 'var(--font-mono)' }}>{shortDate(current.from)}</strong>
        {current.opener ? ` · ${current.opener.note}` : ' · the first race in the archive'}
        {previous && (
          <>
            {' '}
            Before that,{' '}
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {signed(previous.value, meta.unit, meta.unit === 'kt' ? 2 : 1)}
            </strong>
            .
          </>
        )}
      </div>

      <Trend meta={meta} />

      <div style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)' }}>
        {meta.how}
        <br />
        <em>{meta.caveat}</em>
      </div>

      {excluded.length > 0 && (
        <div
          style={{
            fontSize: 9.5,
            lineHeight: 1.5,
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--surface-divider)',
            paddingTop: 6,
          }}
        >
          <strong style={{ color: 'var(--text-secondary)' }}>
            Not in this trend ({excluded.length}):
          </strong>{' '}
          {excluded
            .map((race) => {
              const point = pointOf(race, meta.key)
              const why = point.ok ? '' : EXCLUSION_WORDS[point.reason]
              return `${shortDate(race.date)} — ${why}`
            })
            .join(' · ')}
        </div>
      )}

      {meta.key === 'stw' && (
        <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
          The paddlewheel had no reading at all for{' '}
          <strong style={{ fontFamily: 'var(--font-mono)' }}>{COVERAGE.blankStwPct}%</strong> of this
          population — those rows cannot appear in the scatter, so they are counted here instead.
        </div>
      )}

      {/* The card is a summary, not the last word. The chart named here is the one that actually
          proves the figure — a deviation curve, a paired asymmetry plot, a SOG-on-STW scatter —
          and every one of them is specified by a closed ticket but designed by none of them.
          Stubbed rather than drawn, the same way the filter is: LAY-149 owns their form. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderTop: '1px solid var(--surface-divider)',
          marginTop: 2,
          paddingTop: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-accent)', fontWeight: 600 }}>
            {meta.opens.chart}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {meta.opens.strength} · LAY-149 designs this
          </div>
        </div>
        <span style={{ flexShrink: 0, color: 'var(--text-muted)', fontSize: 15 }}>›</span>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ screen */

export function Screen(): ReactElement {
  return (
    <div style={{ background: 'var(--page-bg)', minHeight: '100vh', paddingBottom: 64 }}>
      <ScreenHeader
        subtitle="What the archive says is still off, one channel at a time. Every figure here is a measurement, not an instruction."
      />

      <div
        style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(3) }}
      >
        <FilterStub />

        {CHANNELS.map((meta) => (
          <ChannelCard key={meta.key} meta={meta} />
        ))}

        <section
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: spacing(3),
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
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
            What a band means
          </div>
          {(Object.keys(BAND_WORDS) as Band[]).map((key) => (
            <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  background: BAND_WORDS[key].bg,
                  color: BAND_WORDS[key].fg,
                  borderRadius: 9999,
                  padding: '2px 7px',
                  fontSize: 8,
                  fontWeight: 700,
                  minWidth: 92,
                  textAlign: 'center',
                }}
              >
                {BAND_WORDS[key].label}
              </span>
              <span style={{ fontSize: 10, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {BAND_WORDS[key].gloss}
              </span>
            </div>
          ))}
          <DiagnosticOnlyNote
            body="A band says whether to go and look at the instrument. It never says what to set it to. The correction is measured on the boat, on the water, and typed in by hand afterwards — Layline records that you did it, and then measures what is left."
          />
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ teaser */

export function Teaser(): ReactElement {
  const off = offBandCount()
  return (
    <Row
      label="Instrument tuning"
      pill={{
        text: off === 0 ? 'all within noise' : `${off} of ${CHANNELS.length} off band`,
        tone: off === 0 ? 'neutral' : 'warning',
      }}
    />
  )
}

export const TEASER_NOTE =
  'The new row takes the same shape as its two neighbours and leans on an amber pill to carry the difference. Deliberately does nothing about the collision — two rows starting "Instrument …", both amber-pilled, one opening a file and one opening a season of measurements.'

export const TEASER_PLACEMENT = 'row' as const
