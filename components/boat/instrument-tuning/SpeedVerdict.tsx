/**
 * The `STW` card's answer — "does the paddlewheel need recalibrating?" — in words, and the five
 * questions it was drawn from (ADR 0041).
 *
 * The numbers are `paddlewheel-verdict.ts`'s; everything here is how a sailor reads them. Two rules
 * hold throughout:
 *
 * - **Slow and fast, never a sign.** `+0.37 kt` asks the reader to remember which instrument was
 *   subtracted from which; "0.37 kt slow" does not. Slow means GPS was faster than the paddlewheel
 *   said — the log under-reads.
 * - **Whether, never how much to change.** A gap is given in knots at stated speeds. No percentage,
 *   since "reads 5% slow" is "set the multiplier to 1.05" with the arithmetic left to the reader
 *   (ADR 0027, ADR 0041).
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
  MIN_RACES_PER_BAND,
  MIN_ROWS_PER_RACE,
  SPOT_ON_SHARE_TO_LEAVE,
  type PaddlewheelRecommendation,
  type PaddlewheelVerdict,
  type SpeedBandRead,
  type SpeedBandVerdict,
} from '@/services/analysis/paddlewheel-verdict'

import { CHART_FONT } from './chart-furniture'

/** "0.37 kt slow", "0.10 kt fast", or "spot on" — never a signed figure. */
export function slowFast(gap: number): string {
  if (Math.abs(gap) < 0.005) return 'spot on'
  return `${Math.abs(gap).toFixed(2)} kt ${gap > 0 ? 'slow' : 'fast'}`
}

export const BAND_WORDS: Record<SpeedBandVerdict, string> = {
  thin: 'too few Races',
  'spot-on': 'spot on',
  'reads-slow': 'reads slow',
  'reads-fast': 'reads fast',
  'races-disagree': 'Races disagree',
}

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

/** The runs of adjacent bands holding one of `verdicts`, as "2–4 kt", "8–9 kt". */
function spans(bands: readonly SpeedBandRead[], verdicts: readonly SpeedBandVerdict[]): string {
  const runs: [number, number][] = []
  for (const band of bands) {
    if (!verdicts.includes(band.verdict)) continue
    const last = runs[runs.length - 1]
    if (last !== undefined && last[1] === band.band) last[1] = band.band + 1
    else runs.push([band.band, band.band + 1])
  }
  return runs.map(([from, to]) => `${from}–${to} kt`).join(', ')
}

/** "reads slow at 2–4 kt and reads fast at 8–9 kt", over the bands where the Races agree. */
function whereOff(bands: readonly SpeedBandRead[]): string {
  return [
    bands.some((band) => band.verdict === 'reads-slow') && `reads slow at ${spans(bands, ['reads-slow'])}`,
    bands.some((band) => band.verdict === 'reads-fast') && `reads fast at ${spans(bands, ['reads-fast'])}`,
  ]
    .filter(Boolean)
    .join(' and ')
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}

/** The verdict as a headline and the one sentence that earns it. */
export function verdictWords(verdict: PaddlewheelVerdict): { headline: string; detail: string } {
  const { bands, recommendation, spot_on_share: share, heading, drift } = verdict
  const off = whereOff(bands)
  const spot = spans(bands, ['spot-on'])
  const disagree = spans(bands, ['races-disagree'])

  switch (recommendation) {
    case 'recalibrate':
      return {
        headline: 'Worth recalibrating',
        detail: `The paddlewheel ${off}, the Races agree, and one calibration can take it out.`,
      }
    case 'clean-first':
      return {
        headline: 'Clean the paddlewheel first',
        detail: `The gap moved ${Math.abs(drift.change_knots ?? 0).toFixed(2)} kt between the first Races and the last, which is what weed on the wheel does. Clean it and sail again before recalibrating.`,
      }
    case 'leave-it':
      if (off !== '') {
        return {
          headline: 'No recalibration needed',
          detail: `Spot on at ${spot}, where ${percent(share ?? 0)} of your sailing is. It ${off} — but recalibrating moves every speed together, so fixing that would make the rest read wrong.`,
        }
      }
      return {
        headline: 'No recalibration needed',
        detail:
          `Within ${CLOSE_ENOUGH_KNOTS} kt of GPS at ${spot}.` +
          (disagree === ''
            ? ''
            : ` At ${disagree} the Races disagree with each other — current or noise, not calibration.`),
      }
    case 'cant-tell':
      if (bands.every((band) => band.verdict === 'thin')) {
        return {
          headline: 'Not enough Races yet',
          detail: `A speed needs ${MIN_RACES_PER_BAND} Races with ${MIN_ROWS_PER_RACE} rows each there before it gets a verdict.`,
        }
      }
      if (off !== '' && heading.swing_knots !== null) {
        return {
          headline: 'Can’t tell yet',
          detail: `It ${off}, but the gap swings ${heading.swing_knots.toFixed(2)} kt with heading. Current does that and a paddlewheel can’t, so recalibrating would bake the current in.`,
        }
      }
      return {
        headline: 'Can’t tell yet',
        detail: 'The Races disagree with each other more than the paddlewheel is off — that is current or noise. More Races will settle it.',
      }
  }
}

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

function range(band: SpeedBandRead): string {
  return `${band.band}–${band.band + 1} kt`
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
  const listed = outside.map((band) => `${range(band)} (${slowFast(band.mean_gap_knots ?? 0)})`).join(', ')

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
                  `Yes at ${agreeing.map(range).join(', ')} — ${
                    agreeing.every((band) => band.agreeing === band.races.length)
                      ? 'every Race that sailed there shows it'
                      : 'most Races that sailed there show it'
                  }, so that is the paddlewheel.`,
                disagreeing.length > 0 &&
                  `No at ${disagreeing.map(range).join(', ')} — some Races read slow, some fast: current or noise.`,
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
