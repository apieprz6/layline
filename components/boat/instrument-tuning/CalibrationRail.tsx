'use client'

/**
 * The **Calibration Log**'s dates, as dashed rules across the season a chart is reading.
 *
 * ADR 0032 decided that a Calibration Event annotates every trend it could plausibly have moved,
 * as a dashed vertical rule at every date in the Log — both of its sources, the Events somebody
 * wrote down and the `HDG`/`AWA`/`STW` field changes in an **Instrument Calibration** Version. This
 * is the chart's own copy of that: a season rail under the level chips, so the sailor can see where
 * the figure on screen sits relative to the last time anybody touched the instrument.
 *
 * **And the `AWA` rail marks `HDG` acts too**, drawn muted and labelled with the channel they
 * belong to so neither can be misread as the other. That is the one cross-channel mark and it
 * exists for a specific reason: the compass propagates into the recomputed wind columns, so without
 * it the check that separates a compass-driven asymmetry from a masthead-driven one cannot be made
 * on the screen that shows the asymmetry. Nothing else crosses — no other channel's history has any
 * bearing on a paddlewheel.
 *
 * ## Why the axis is ordinal and not a date scale
 *
 * Races are evenly spaced here, and a rule sits in the gap between the last Race before the act and
 * the first Race after it. Two reasons, and neither is laziness:
 *
 * - Every statement this rail makes is of the form "these Races were sailed before the compass was
 *   swung, those after", and comparing `YYYY-MM-DD` as text answers that exactly. A day scale would
 *   answer it the same way after more arithmetic.
 * - Nothing here may build a `Date`. A calendar date in the Log has no time and no zone, and
 *   `new Date('2026-07-04')` is parsed as UTC midnight — which renders as 3 July for a reader in
 *   Chicago (`lib/utils/calendarDate.ts`). An ordinal axis needs no date arithmetic at all.
 *
 * A season's Races are also not evenly *spread*: four in a June weekend and one in September would
 * leave a true date scale with four overlapping ticks and a lot of empty rail. The card's per-Race
 * trend is a different object with a different job, and it is free to use a date scale.
 */

import type { ReactElement } from 'react'
import { CALIBRATION_EVENT_LABEL } from '@/lib/boat/calibration'
import { spacing } from '@/lib/utils/design'
import type { CalibrationChannel, CalibrationLogEntry } from '@/types'

import { TUNING_CHART_WIDTH } from './chart-furniture'
import { raceLabel, shortDate, type RaceLabels } from './chart-text'

/** One Race on the rail: where it sits in the season and whether it produced a figure. */
export interface RailRace {
  race_id: string
  /** The Race Window's start, in the Recording's own frame. Compared as text, never parsed. */
  sailed_at: string
  /**
   * Whether this channel's check got a figure out of it.
   *
   * Drawn hollow where it did not. A Race that produced nothing is never a point at zero and never
   * a gap: it was sailed, and the rail says so (ADR 0012, ADR 0032).
   */
  measured: boolean
}

/**
 * Every Race a check read, measured or not, in the shape the rail draws.
 *
 * Here rather than in each chart because two of the three build it from exactly the same pair of
 * lists — the Races that produced a figure and the ones carried through with their reason — and
 * which of the two a Race came from *is* whether it was measured. Two copies of that mapping would
 * be two chances to draw an excluded Race as a measured one.
 */
export function railRacesFrom(
  measured: readonly { race_id: string; window_start: string }[],
  excluded: readonly { race_id: string; window_start: string }[]
): RailRace[] {
  return [
    ...measured.map((race) => ({
      race_id: race.race_id,
      sailed_at: race.window_start,
      measured: true,
    })),
    ...excluded.map((race) => ({
      race_id: race.race_id,
      sailed_at: race.window_start,
      measured: false,
    })),
  ]
}

interface CalibrationRailProps {
  /** Whose rules these are. `AWA` additionally gets the `HDG` ones, muted. */
  channel: CalibrationChannel
  /** The whole Log, both sources, in any order. Filtering to the channel is this component's. */
  log: readonly CalibrationLogEntry[]
  /** Every Race the chart above is reading, in any order. */
  races: readonly RailRace[]
  labels: RaceLabels
  /** The Race the chart has picked, drawn filled on the rail. */
  selectedRaceId?: string | null
}

const INSET = 12
const HEIGHT = 46
/** Where the Race ticks sit: high enough to leave the rule labels a line of their own beneath. */
const BASELINE = 17

/** Whether a Log entry is an act on this channel — an Event names them, a Version shows them. */
function touches(entry: CalibrationLogEntry, channel: CalibrationChannel): boolean {
  return entry.entry === 'event'
    ? entry.event.channels.includes(channel)
    : entry.changes.some((change) => change.channel === channel)
}

/** What a rule is called: the day, and what happened on it, in as few words as 390px allows. */
function describeEntry(entry: CalibrationLogEntry): string {
  if (entry.entry === 'event') {
    return entry.event.type === 'autocompensation'
      ? 'swung'
      : CALIBRATION_EVENT_LABEL[entry.event.type].toLowerCase()
  }
  return entry.isFirst ? 'first recorded' : 're-typed'
}

interface Rule {
  key: string
  date: string
  /** Null for a rule this chart owns; the channel's name for a borrowed one. */
  borrowedFrom: CalibrationChannel | null
  what: string
}

/**
 * The rules to draw, oldest first.
 *
 * Grouped by date, because two acts on one day are one boundary — a Version minted the same day as
 * the Event that prompted it is the ordinary case, and two rules a pixel apart would claim the
 * instrument was touched twice.
 */
function rulesFor(
  log: readonly CalibrationLogEntry[],
  channel: CalibrationChannel
): Rule[] {
  const own = new Set<string>()
  const byDate = new Map<string, Rule>()

  const collect = (borrowedFrom: CalibrationChannel | null, from: CalibrationChannel): void => {
    for (const entry of log) {
      if (!touches(entry, from)) continue

      const date = entry.date.slice(0, 10)
      if (borrowedFrom === null) own.add(date)
      // An act this chart owns always wins the date: on the `AWA` rail, a day the masthead and the
      // compass were both touched is the masthead's rule, not a borrowed one.
      else if (own.has(date)) continue

      const existing = byDate.get(date)
      byDate.set(date, {
        key: `${borrowedFrom ?? from}:${date}`,
        date,
        borrowedFrom,
        what:
          existing === undefined || existing.what === describeEntry(entry)
            ? describeEntry(entry)
            : `${existing.what} + ${describeEntry(entry)}`,
      })
    }
  }

  collect(null, channel)
  // The one cross-channel mark (ADR 0032). Compass deviation leaks into the recomputed apparent
  // wind, so the Asymmetry's own chart has to show when the compass moved.
  if (channel === 'AWA') collect('HDG', 'HDG')

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export default function CalibrationRail({
  channel,
  log,
  races,
  labels,
  selectedRaceId = null,
}: CalibrationRailProps): ReactElement {
  const inOrder = [...races].sort((a, b) => a.sailed_at.localeCompare(b.sailed_at))
  const rules = rulesFor(log, channel)

  const span = TUNING_CHART_WIDTH - INSET * 2
  const step = inOrder.length === 0 ? span : span / inOrder.length
  const tick = (index: number): number => INSET + (index + 0.5) * step
  /** The gap before the first Race sailed on or after this date — the boundary the act opens. */
  const boundary = (date: string): number =>
    INSET + inOrder.filter((race) => race.sailed_at.slice(0, 10) < date).length * step

  return (
    <div data-testid={`calibration-rail-${channel}`}>
      <svg
        viewBox={`0 0 ${TUNING_CHART_WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={
          rules.length === 0
            ? `No Calibration Log entry for ${channel}: one Calibration Era over the whole archive.`
            : `Calibration Log dates on the ${channel} season: ${rules
                .map(
                  (rule) =>
                    `${shortDate(rule.date)}${rule.borrowedFrom ? ` ${rule.borrowedFrom}` : ''}`
                )
                .join(', ')}.`
        }
        style={{ display: 'block', width: '100%' }}
      >
        <line
          x1={INSET}
          x2={TUNING_CHART_WIDTH - INSET}
          y1={BASELINE}
          y2={BASELINE}
          stroke="var(--surface-divider)"
        />

        {rules.map((rule) => {
          const x = boundary(rule.date)
          const borrowed = rule.borrowedFrom !== null
          return (
            <g key={rule.key} data-testid="calibration-mark" data-date={rule.date}>
              <line
                x1={x}
                x2={x}
                y1={2}
                y2={BASELINE + 7}
                stroke={borrowed ? 'var(--text-muted)' : 'var(--text-primary)'}
                strokeWidth={borrowed ? 1 : 1.4}
                strokeDasharray="3 2.5"
                opacity={borrowed ? 0.65 : 1}
              />
              <text
                x={Math.min(Math.max(x, 20), TUNING_CHART_WIDTH - 20)}
                y={BASELINE + 18}
                fontSize="7.5"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fill={borrowed ? 'var(--text-muted)' : 'var(--text-secondary)'}
              >
                {/* The channel is named on a borrowed rule and only there: an unlabelled muted
                    rule on the AWA chart would read as a masthead event. */}
                {shortDate(rule.date)} · {borrowed ? `${rule.borrowedFrom} ` : ''}
                {rule.what}
              </text>
            </g>
          )
        })}

        {inOrder.map((race, index) => (
          <circle
            key={race.race_id}
            cx={tick(index)}
            cy={BASELINE}
            r={race.race_id === selectedRaceId ? 4 : 2.6}
            fill={
              race.measured
                ? race.race_id === selectedRaceId
                  ? 'var(--state-warning)'
                  : 'var(--text-accent)'
                : 'var(--surface-raised)'
            }
            stroke={race.measured ? 'none' : 'var(--text-muted)'}
            strokeWidth="1.2"
          >
            <title>
              {raceLabel(labels, race.race_id, race.sailed_at)}
              {race.measured ? '' : ' — no figure'}
            </title>
          </circle>
        ))}
      </svg>

      <p
        style={{
          margin: `0 0 ${spacing(1)}`,
          fontSize: 9.5,
          lineHeight: 1.5,
          color: 'var(--text-muted)',
        }}
      >
        {rules.length === 0 ? (
          <>
            Nothing in the Calibration Log touches {channel}, so this is one Calibration Era over the
            whole archive. A boundary is never inferred from a step in the data.
          </>
        ) : (
          <>
            Dashed: the Calibration Log&rsquo;s dates. Races left of a rule were sailed before that
            act.
            {rules.some((rule) => rule.borrowedFrom !== null) &&
              ' Muted and channel-labelled: an act on another channel that could have moved this figure.'}
          </>
        )}{' '}
        Hollow: a Race this check got no figure from.
      </p>
    </div>
  )
}
