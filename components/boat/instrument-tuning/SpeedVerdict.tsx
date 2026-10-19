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
  type PaddlewheelRecommendation,
  type PaddlewheelVerdict,
  type SpeedBandRead,
  type SpeedBandVerdict,
} from '@/services/analysis/paddlewheel-verdict'
import {
  CHECKLIST_ANSWER_WORDS,
  paddlewheelChecklist,
  sectorReading,
  verdictWords,
  type ChecklistAnswer,
  type ChecklistEvidence,
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

const ANSWER: Record<ChecklistAnswer, { mark: string; colour: string }> = {
  fine: { mark: '✓', colour: 'var(--state-success)' },
  attention: { mark: '!', colour: 'var(--state-warning)' },
  unknown: { mark: '?', colour: 'var(--text-muted)' },
}

/**
 * The five questions a rigger asks before touching the calibration, each answered in a sentence
 * with its evidence under it — `paddlewheelChecklist`'s, which the MCP tool states too.
 */
export function Checklist({ verdict }: { verdict: PaddlewheelVerdict }): ReactElement {
  const evidence: Record<ChecklistEvidence, ReactElement> = {
    bands: <BandStrip bands={verdict.bands} />,
    heading: <HeadingRose sectors={verdict.heading.sectors} />,
    drift: <DriftLine offsets={verdict.drift.points.map((point) => point.measured_offset_knots)} />,
  }

  return (
    <ol data-testid="speed-checklist" style={{ display: 'grid', gap: spacing(3), listStyle: 'none', margin: 0, padding: 0 }}>
      {paddlewheelChecklist(verdict).map((item) => (
        <Question
          key={item.question}
          answer={item.answer}
          question={item.question}
          finding={item.finding}
          evidence={item.evidence === null ? undefined : evidence[item.evidence]}
        />
      ))}
    </ol>
  )
}

function Question({
  answer,
  question,
  finding,
  evidence,
}: {
  answer: ChecklistAnswer
  question: string
  finding: string
  evidence?: ReactElement
}): ReactElement {
  const { mark, colour } = ANSWER[answer]

  return (
    <li style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: spacing(3), alignItems: 'start' }}>
      <span
        role="img"
        aria-label={CHECKLIST_ANSWER_WORDS[answer]}
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
        const verdict = sectorReading(gap)
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
