'use client'

/**
 * The three diagnostic charts, stacked in the causal order the channels propagate in.
 *
 * `HDG` → `AWA` → `STW`: compass deviation leaks into the recomputed wind columns and so into the
 * Apparent Wind Asymmetry, which is why the compass is read first and why the Asymmetry chart marks
 * `HDG` acts as well as its own (ADR 0032).
 *
 * **This is the charts, not the screen.** The Instrument Tuning Screen is three cards, each
 * headlined for its own channel, each opening its chart in a bottom sheet, over a two-dimension
 * Analysis Filter rail — all of which belongs to the ticket after this one. What is here is the
 * three charts on one route, so they can be read on the real archive and driven in a real browser.
 * The cards will open these same components; nothing below assumes it is at the top of a page.
 *
 * Each chart carries its own caveat beneath it, as data from the service rather than as prose a
 * renderer remembered to add. A figure read through a proxy and an asymmetry whose causes cannot be
 * separated are honest only with their sentence attached, and the second renderer always forgets.
 */

import { useId, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import type { TuningRaceRef } from '@/services/analysis/readInstrumentTuning'
import type { CalibrationLogEntry } from '@/types'

import CompassChart from './CompassChart'
import SpeedCheckChart from './SpeedCheckChart'
import TackDial from './TackDial'
import { eraLabel, raceLabelsFrom } from './chart-text'

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
  const previousHeading = season.heading.length > 1 ? season.heading[season.heading.length - 2] : null
  const speed = {
    orthogonal: season.speed.orthogonal[season.speed.orthogonal.length - 1] ?? null,
    'sog-on-stw': season.speed['sog-on-stw'][season.speed['sog-on-stw'].length - 1] ?? null,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(6) }}>
      <Chart
        title="Compass"
        term="Measured Offset for HDG, via COG"
        caveat={heading?.caveat ?? null}
      >
        {heading === null ? (
          <Nothing what="No Race has produced a compass reading yet." />
        ) : (
          <>
            <EraLine era={heading.era} />
            <CompassChart
              era={heading}
              previous={previousHeading}
              log={log}
              labels={labels}
            />
          </>
        )}
      </Chart>

      <Chart
        title="Wind angle, tack to tack"
        term="Apparent Wind Asymmetry — not a Measured Offset"
        caveat={season.asymmetry.season.caveat}
        warn
      >
        <TackDial
          season={season.asymmetry.season}
          eras={season.asymmetry.eras}
          log={log}
          labels={labels}
        />
      </Chart>

      <Chart
        title="Boat speed"
        term="Measured Offset for STW, via SOG"
        caveat={PADDLEWHEEL_CAVEAT}
      >
        {speed.orthogonal === null || speed['sog-on-stw'] === null ? (
          <Nothing what="No Race has produced a speed comparison yet." />
        ) : (
          <>
            <EraLine era={speed.orthogonal.era} />
            <SpeedCheckChart
              byMethod={{ orthogonal: speed.orthogonal, 'sog-on-stw': speed['sog-on-stw'] }}
              log={log}
              labels={labels}
            />
          </>
        )}
      </Chart>
    </div>
  )
}

/**
 * The `STW` caveat, which is the one of the three the services do not carry.
 *
 * The other two travel with their figures because each is about how the figure was *derived* — a
 * compass read through `CTW`, an apparent wind recomputed by qtVlm. This one is about the venue, so
 * no service is in a position to assert it: whether current is negligible on the COLYC race circle
 * is a fact about Lake Michigan that the arithmetic cannot know.
 */
const PADDLEWHEEL_CAVEAT =
  'Assumes current is negligible on this venue, since a current would move SOG and leave STW ' +
  'alone and read here as a paddlewheel error. The 1:1 line is the paddlewheel as currently ' +
  'configured; no uncorrected reading is reconstructed.'

function Chart({
  title,
  term,
  caveat,
  warn,
  children,
}: {
  title: string
  term: string
  caveat: string | null
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
      }}
    >
      <h2
        id={headingId}
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h2>
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

      {caveat !== null && (
        <p
          style={{
            margin: `${spacing(3)} 0 0`,
            paddingTop: spacing(3),
            borderTop: '1px solid var(--surface-divider)',
            fontSize: 10.5,
            lineHeight: 1.55,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}
        >
          {caveat}
        </p>
      )}
    </section>
  )
}

/** Which Era is on screen, said in words above the chart rather than left to the chips. */
function EraLine({ era }: { era: { from_date: string | null; channel: string } }): ReactElement {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: spacing(2),
      }}
    >
      {era.channel} Calibration Era · {eraLabel(era)}
    </div>
  )
}

function Nothing({ what }: { what: string }): ReactElement {
  return (
    <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
      {what} A figure that could not be computed is reported as absent, never as a zero.
    </p>
  )
}
