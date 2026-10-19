/**
 * The `STW` card's answer — "does the paddlewheel need recalibrating?" — in words, and the five
 * questions it was drawn from (ADR 0041).
 *
 * The numbers are `paddlewheel-verdict.ts`'s and the verdict's sentence is
 * `paddlewheel-verdict-words.ts`'s, which says the two rules every word here keeps: slow and fast,
 * never a sign; whether, never how much to change.
 *
 * Every answer is in words as well as colour: under the night-vision theme the whole screen is one
 * red ramp, and a verdict carried by green alone would vanish.
 */

import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import {
  CLOSE_ENOUGH_KNOTS,
  HEADING_SECTORS,
  exceeds,
  SPOT_ON_SHARE_TO_LEAVE,
  type PaddlewheelRecommendation,
  type PaddlewheelVerdict,
  type SpeedBandRead,
  type SpeedBandVerdict,
} from '@/services/analysis/paddlewheel-verdict'
import {
  bandRange,
  percent,
  slowFast,
  spans,
  verdictWords,
} from '@/services/analysis/paddlewheel-verdict-words'

import { CHART_FONT } from './chart-furniture'

export const BAND_COLOUR: Record<SpeedBandVerdict, string> = {
  thin: 'var(--text-muted)',
  'spot-on': 'var(--state-success)',
  'reads-slow': 'var(--state-warning)',
  'reads-fast': 'var(--state-info)',
  'races-disagree': 'var(--text-muted)',
}

const RECOMMENDATION_COLOUR: Record<PaddlewheelRecommendation, string> = {
  recalibrate: 'var(--state-warning)',
  'clean-first': 'var(--state-warning)',
  'leave-it': 'var(--state-success)',
  'cant-tell': 'var(--text-muted)',
}

const OFF: readonly SpeedBandVerdict[] = ['reads-slow', 'reads-fast']

/** The answer, first, with its colour down the edge and its words beside it. */
export function VerdictBanner({ verdict }: { verdict: PaddlewheelVerdict }): ReactElement {
  const { headline, detail } = verdictWords(verdict)

  return (
    <div
      data-testid="speed-verdict"
      style={{
        borderLeft: `4px solid ${RECOMMENDATION_COLOUR[verdict.recommendation]}`,
        padding: `${spacing(1)} ${spacing(3)}`,
        marginBottom: spacing(3),
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
        {headline}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{detail}</div>
    </div>
  )
}

/* ----------------------------------------------------------------------- checklist */

type Answer = 'fine' | 'attention' | 'unknown'

const ANSWER: Record<Answer, { mark: string; colour: string; words: string }> = {
  fine: { mark: '✓', colour: 'var(--state-success)', words: 'fine' },
  attention: { mark: '!', colour: 'var(--state-warning)', words: 'needs attention' },
  unknown: { mark: '?', colour: 'var(--text-muted)', words: 'can’t say yet' },
}

/**
 * The five questions a rigger asks before touching the calibration, each answered in a sentence
 * with its evidence under it. The last two are the ones a scatter cannot answer at all: they are
 * what rule out current and weed.
 */
export function Checklist({ verdict }: { verdict: PaddlewheelVerdict }): ReactElement {
  const { bands, spot_on_share: share, heading, drift } = verdict
  const judged = bands.filter((band) => band.verdict !== 'thin' && band.mean_gap_knots !== null)
  const outside = judged.filter((band) => exceeds(band.mean_gap_knots ?? 0, CLOSE_ENOUGH_KNOTS))
  const agreeing = outside.filter((band) => OFF.includes(band.verdict))
  const disagreeing = outside.filter((band) => band.verdict === 'races-disagree')
  const sailedMostSpotOn = share !== null && share >= SPOT_ON_SHARE_TO_LEAVE
  const listed = outside.map((band) => `${bandRange(band)} (${slowFast(band.mean_gap_knots ?? 0)})`).join(', ')

  return (
    <ol data-testid="speed-checklist" style={{ display: 'grid', gap: spacing(3), listStyle: 'none', margin: 0, padding: 0 }}>
      <Question
        answer={sailedMostSpotOn ? 'fine' : agreeing.length > 0 ? 'attention' : 'unknown'}
        question="Is it off where you sail most?"
        finding={
          sailedMostSpotOn
            ? `No — spot on at ${spans(bands, ['spot-on'])}, ${percent(share ?? 0)} of your sailing.${listed === '' ? '' : ` Off at ${listed}.`}`
            : agreeing.length > 0
              ? `Yes, at ${listed}.`
              : 'Not enough Races at the speeds you sail most to say.'
        }
        evidence={<BandStrip bands={bands} />}
      />
      <Question
        answer={outside.length === 0 ? 'unknown' : agreeing.length > 0 ? 'attention' : 'fine'}
        question="Where it’s off, do the Races agree?"
        finding={
          outside.length === 0
            ? 'Nothing is off.'
            : [
                agreeing.length > 0 &&
                  `Yes at ${agreeing.map(bandRange).join(', ')} — ${
                    agreeing.every((band) => band.agreeing === band.races.length)
                      ? 'every Race that sailed there shows it'
                      : 'most Races that sailed there show it'
                  }, so that is the paddlewheel.`,
                disagreeing.length > 0 &&
                  `No at ${disagreeing.map(bandRange).join(', ')} — some Races read slow, some fast: current or noise.`,
              ]
                .filter(Boolean)
                .join(' ')
        }
      />
      <Question
        answer={
          heading.swing_knots === null
            ? 'unknown'
            : exceeds(heading.swing_knots, 2 * CLOSE_ENOUGH_KNOTS)
              ? 'attention'
              : 'fine'
        }
        question="Is it the same on every heading?"
        finding={
          heading.swing_knots === null
            ? 'Not enough headings sailed to say.'
            : exceeds(heading.swing_knots, 2 * CLOSE_ENOUGH_KNOTS)
              ? `No — it swings ${heading.swing_knots.toFixed(2)} kt with heading. Current does that; a paddlewheel can’t.`
              : `Yes, within ${heading.swing_knots.toFixed(2)} kt on every heading sailed — so it isn’t current.`
        }
        evidence={<HeadingRose sectors={heading.sectors} />}
      />
      <Question
        answer={
          drift.change_knots === null
            ? 'unknown'
            : exceeds(drift.change_knots, CLOSE_ENOUGH_KNOTS)
              ? 'attention'
              : 'fine'
        }
        question="Has it held steady through the season?"
        finding={
          drift.change_knots === null
            ? 'Not enough Races yet to say.'
            : exceeds(drift.change_knots, CLOSE_ENOUGH_KNOTS)
              ? `No — it moved ${Math.abs(drift.change_knots).toFixed(2)} kt between the first Races and the last. Weed on the wheel does that; clean it first.`
              : `Yes — it moved ${Math.abs(drift.change_knots).toFixed(2)} kt between the first Races and the last, so it isn’t weed.`
        }
        evidence={<DriftLine offsets={drift.points.map((point) => point.measured_offset_knots)} />}
      />
      <Question
        answer={agreeing.length === 0 ? 'unknown' : verdict.one_calibration_fixes ? 'attention' : 'fine'}
        question="Would recalibrating fix it?"
        finding={
          agreeing.length === 0
            ? 'There is nothing for it to fix.'
            : verdict.one_calibration_fixes
              ? 'Yes — the gap is a straight line in speed, which one calibration takes out.'
              : sailedMostSpotOn
                ? 'No — it is already spot on where you sail most, and recalibrating moves every speed together, so fixing the edges would spoil that.'
                : 'No — the gap curves with speed, and a calibration can only take out a straight-line error.'
        }
      />
    </ol>
  )
}

function Question({
  answer,
  question,
  finding,
  evidence,
}: {
  answer: Answer
  question: string
  finding: string
  evidence?: ReactElement
}): ReactElement {
  const { mark, colour, words } = ANSWER[answer]

  return (
    <li style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: spacing(3), alignItems: 'start' }}>
      <span
        role="img"
        aria-label={words}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: colour,
          color: 'var(--text-inverse)',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {mark}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{question}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{finding}</div>
        {evidence !== undefined && <div style={{ marginTop: 4 }}>{evidence}</div>}
      </div>
    </li>
  )
}

/** One block per knot, in its verdict's colour: the whole speed range at a glance. */
function BandStrip({ bands }: { bands: readonly SpeedBandRead[] }): ReactElement {
  return (
    <svg width={bands.length * 9} height={16} aria-hidden="true">
      {bands.map((band) => (
        <rect
          key={band.band}
          x={band.band * 9}
          y={1}
          width={8}
          height={14}
          rx={1.5}
          fill={BAND_COLOUR[band.verdict]}
          opacity={band.verdict === 'thin' ? 0.2 : 0.85}
        />
      ))}
    </svg>
  )
}

/** The gap by heading as eight wedges, longer for a bigger gap; a sector with no mean is left out. */
function HeadingRose({ sectors }: { sectors: PaddlewheelVerdict['heading']['sectors'] }): ReactElement {
  const outer = 22
  const width = 360 / HEADING_SECTORS
  const at = (degrees: number, r: number): string => {
    const radians = ((degrees - 90) * Math.PI) / 180
    return `${(r * Math.cos(radians)).toFixed(2)} ${(r * Math.sin(radians)).toFixed(2)}`
  }

  return (
    <svg width={56} height={56} viewBox="-28 -28 56 56" aria-hidden="true">
      <circle r={outer} fill="none" stroke="var(--surface-divider)" />
      {sectors.map(({ sector, mean_gap_knots: gap }) => {
        if (gap === null) return null
        const r = 6 + Math.min(1, Math.abs(gap) / 0.6) * (outer - 6)
        const from = sector * width - width / 2
        const verdict: SpeedBandVerdict =
          !exceeds(gap, CLOSE_ENOUGH_KNOTS) ? 'spot-on' : gap > 0 ? 'reads-slow' : 'reads-fast'
        return (
          <path
            key={sector}
            d={`M0 0 L${at(from, r)} A${r} ${r} 0 0 1 ${at(from + width, r)} Z`}
            fill={BAND_COLOUR[verdict]}
            opacity={0.75}
          />
        )
      })}
      <text y={-outer - 1} fontSize={CHART_FONT.micro} textAnchor="middle" fill="var(--text-muted)">
        N
      </text>
    </svg>
  )
}

/** Each Race's whole-Race gap in the order sailed, against the close-enough window. */
function DriftLine({ offsets }: { offsets: readonly number[] }): ReactElement {
  const w = 80
  const h = 26
  const y = (gap: number): number => h / 2 - (Math.max(-0.6, Math.min(0.6, gap)) / 0.6) * (h / 2 - 2)
  const x = (index: number): number => (index / Math.max(1, offsets.length - 1)) * (w - 4) + 2

  return (
    <svg width={w} height={h} aria-hidden="true">
      <rect
        x={0}
        y={y(CLOSE_ENOUGH_KNOTS)}
        width={w}
        height={y(-CLOSE_ENOUGH_KNOTS) - y(CLOSE_ENOUGH_KNOTS)}
        fill="var(--state-success)"
        opacity="0.15"
      />
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--text-muted)" strokeDasharray="2 2" />
      <polyline
        points={offsets.map((gap, index) => `${x(index)},${y(gap)}`).join(' ')}
        fill="none"
        stroke="var(--text-primary)"
        strokeWidth="1.2"
      />
      {offsets.map((gap, index) => (
        <circle key={index} cx={x(index)} cy={y(gap)} r={1.8} fill="var(--text-primary)" />
      ))}
    </svg>
  )
}
