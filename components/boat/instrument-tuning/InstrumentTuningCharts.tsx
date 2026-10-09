'use client'

/**
 * The three diagnostic charts, in the causal order the channels propagate in.
 *
 * `HDG` → `AWA` → `STW`: compass deviation leaks into the recomputed wind columns and so into the
 * Apparent Wind Asymmetry, which is why the compass is read first and why the Asymmetry chart marks
 * `HDG` acts as well as its own (ADR 0032). Side by side on a wide screen, so the order is left to
 * right rather than top to bottom; stacked on a narrow one.
 *
 * **This is the charts, not the screen.** The Instrument Tuning Screen is three cards, each
 * headlined for its own channel, each opening its chart in a bottom sheet, over a two-dimension
 * Analysis Filter rail — all of which belongs to the ticket after this one. What is here is the
 * three charts on one route, so they can be read on the real archive and driven in a real browser.
 * The cards will open these same components; nothing below assumes it is at the top of a page.
 *
 * ## Why the column has a measure
 *
 * Every chart is `width: 100%` inside its own card, so with nothing capping the column a desktop
 * window drew each one 1,216 pixels across — a 3.6× magnification of a box designed at 390px, with
 * 32-pixel axis labels and a page three screens long. `repeat(auto-fit, minmax(…))` fixes both ends
 * of that with no breakpoint to maintain: one column on a phone, two on a tablet, three on a
 * desktop, and never a fourth, because three charts in a 1,100-pixel measure cannot make one.
 */

import { useId, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import type { TuningRaceRef } from '@/services/analysis/readInstrumentTuning'
import type { CalibrationLogEntry } from '@/types'

import CompassChart from './CompassChart'
import SpeedCheckChart from './SpeedCheckChart'
import TackDial from './TackDial'
import { CHART_MAX_WIDTH } from './chart-furniture'
import { raceLabelsFrom } from './chart-text'

/**
 * The measure the three charts are laid out in.
 *
 * Three columns of a chart's own maximum width, plus the gaps between them — so the widest the
 * screen ever gets is the width at which all three are fully drawn, and an ultrawide window gets
 * margins rather than three enormous charts.
 */
export const SCREEN_MAX_WIDTH = CHART_MAX_WIDTH * 3 + 24 * 2 + 16 * 6

interface InstrumentTuningChartsProps {
  season: InstrumentTuningSeason
  log: readonly CalibrationLogEntry[]
  races: readonly TuningRaceRef[]
}

export default function InstrumentTuningCharts({
  season,
  log,
  races,
}: InstrumentTuningChartsProps): ReactElement {
  const labels = raceLabelsFrom(races)

  // The current Era is the last; the one before it is the compass's dashed overlay.
  const heading = season.heading[season.heading.length - 1] ?? null
  const previousHeading =
    season.heading.length > 1 ? season.heading[season.heading.length - 2] : null
  const speed = {
    orthogonal: season.speed.orthogonal[season.speed.orthogonal.length - 1] ?? null,
    'sog-on-stw': season.speed['sog-on-stw'][season.speed['sog-on-stw'].length - 1] ?? null,
  }

  return (
    <div
      style={{
        display: 'grid',
        // No media query, and so no breakpoint to keep in step with the chart's own maximum: the
        // column count falls out of how many 320px tracks the measure holds.
        gridTemplateColumns: `repeat(auto-fit, minmax(min(320px, 100%), 1fr))`,
        alignItems: 'start',
        gap: spacing(6),
        maxWidth: SCREEN_MAX_WIDTH,
      }}
    >
      <Chart title="Compass" term="Measured Offset for HDG, via COG">
        {heading === null ? (
          <Nothing what="No Race has produced a compass reading yet." />
        ) : (
          <CompassChart era={heading} previous={previousHeading} log={log} labels={labels} />
        )}
      </Chart>

      <Chart
        title="Wind angle, tack to tack"
        term="Apparent Wind Asymmetry — not a Measured Offset"
        warn
      >
        <TackDial
          season={season.asymmetry.season}
          eras={season.asymmetry.eras}
          log={log}
          labels={labels}
        />
      </Chart>

      <Chart title="Boat speed" term="Measured Offset for STW, via SOG">
        {speed.orthogonal === null || speed['sog-on-stw'] === null ? (
          <Nothing what="No Race has produced a speed comparison yet." />
        ) : (
          <SpeedCheckChart
            byMethod={{ orthogonal: speed.orthogonal, 'sog-on-stw': speed['sog-on-stw'] }}
            log={log}
            labels={labels}
          />
        )}
      </Chart>
    </div>
  )
}

function Chart({
  title,
  term,
  warn,
  children,
}: {
  title: string
  term: string
  /** The Asymmetry's own term is a warning: it names what the figure is *not*. */
  warn?: boolean
  children: ReactElement
}): ReactElement {
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-lg)',
        padding: spacing(4),
        minWidth: 0,
      }}
    >
      <h2
        id={headingId}
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h2>
      {/*
        What the figure is called in the domain, which is not decoration: "Apparent Wind Asymmetry —
        not a Measured Offset" is the one place the distinction is stated on the face of the screen.
        Which Era is on screen used to have a line of its own here; the first level chip says it.
      */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: warn ? 'var(--state-warning)' : 'var(--text-muted)',
          marginTop: 3,
        }}
      >
        {term}
      </div>

      <div style={{ marginTop: spacing(3) }}>{children}</div>
    </section>
  )
}

function Nothing({ what }: { what: string }): ReactElement {
  return (
    <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
      {what}
    </p>
  )
}
