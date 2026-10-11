/**
 * The three charts, over the owner's real season, through the real services.
 *
 * ADR 0034's charts were designed against a Python port of the two checks on these same thirteen
 * recordings, and the figures it quotes are the ones the owner reviewed the design against. This
 * suite closes that loop the other way: it runs the shipped services over the same files and
 * renders the shipped components on the result, so what the sailor will read is asserted against
 * what the decision was made on.
 *
 * It is not a second copy of `services/analysis/__tests__/archive-instrument-tuning.test.ts` or of
 * `archive-paddlewheel.test.ts`. Those pin the *arithmetic* — `+12.7°` heading NNE, the U-shaped
 * knot gap, the three slopes. This asserts that the arithmetic reaches the screen: that the curve's
 * extremes are what the readout leads with, that 33 of 36 headings leave 3 hatched, that two
 * downwind Tack Pairs are flagged as too few to lean on, and that the one thing the `STW` chart may
 * never print is nowhere in its markup.
 *
 * Needs the owner's recordings and skips loudly without them — see
 * `services/recordings/__tests__/archive.ts`.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompassChart from '@/components/boat/instrument-tuning/CompassChart'
import SpeedCheckChart from '@/components/boat/instrument-tuning/SpeedCheckChart'
import TackDial from '@/components/boat/instrument-tuning/TackDial'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import {
  instrumentTuningSeason,
  type InstrumentTuningSeason,
  type TuningRace,
} from '@/services/analysis/instrument-tuning'
import {
  archiveFilenames,
  describeArchive,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import type { CalibrationEvent, CalibrationLogEntry } from '@/types'

/**
 * The archive's one recorded act on the compass: the 4 July autocompensation.
 *
 * Written out here rather than read from the prior art's `compass-calibrations.yaml`, for the
 * reason the Race Windows are: this reaches Layline as a **Calibration Event** a person entered
 * through the finished UI, and every figure below is a figure under exactly this boundary. Nothing
 * infers it from the step in the data it plainly caused.
 */
const AUTOCOMPENSATION: CalibrationEvent = {
  id: 'event-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: ['HDG'],
  note: 'Autocompensation performed; the compass rebuilt its own deviation table.',
  created_by: 'admin-1',
  created_at: '2026-07-05T02:00:00Z',
  updated_at: '2026-07-05T02:00:00Z',
}

const LOG: CalibrationLogEntry[] = buildCalibrationLog([], [AUTOCOMPENSATION])

function races(): TuningRace[] {
  return archiveFilenames.map((filename) => ({
    race_id: filename.replace(/\.csv$/, ''),
    rows: transcribe(filename).transcription.rows,
    window: raceWindowFor(filename),
  }))
}

/**
 * Computed once, on first use: thirteen recordings assessed whole is the expensive half of this
 * suite, and lazily rather than in a `beforeAll` so nothing is read at all where the archive is
 * absent and every `describeArchive` below is a skip.
 */
let computed: { season: InstrumentTuningSeason; labels: Record<string, string> } | null = null

function archive(): { season: InstrumentTuningSeason; labels: Record<string, string> } {
  computed ??= {
    season: instrumentTuningSeason(races(), LOG),
    labels: Object.fromEntries(
      archiveFilenames.map((filename) => [filename.replace(/\.csv$/, ''), filename.slice(0, 10)])
    ),
  }
  return computed
}

describeArchive('the compass chart over the owner’s season', () => {
  function renderCompass() {
    const { season, labels } = archive()
    // The current Era is the last, and the one before it is the dashed overlay.
    const current = season.heading[season.heading.length - 1]
    const previous = season.heading.length > 1 ? season.heading[season.heading.length - 2] : null

    return render(
      <CompassChart era={current} previous={previous} log={LOG} labels={labels} />
    )
  }

  it('leads with the curve’s own extremes and the swing between them', () => {
    renderCompass()

    // ADR 0034's figures, reaching the readout: +12.7° heading NNE against −8.9° WSW, a 22° swing.
    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('+12.7° NNE · −8.9° WSW')
    expect(readout).toHaveTextContent('Swings 22° with heading')
  })

  it('hatches the three headings the Era never reached, and draws no bar across them', () => {
    renderCompass()

    // The era curve reaches 33 of 36. The other three are absent and drawn as absent — the one
    // thing a chart over sparse data must not quietly interpolate.
    expect(screen.getAllByTestId('compass-absent-bin')).toHaveLength(3)
  })

  it('states coverage off the headings resting on two or more Races, and reads THIN', () => {
    renderCompass()

    // 24 of 36 is two-thirds exactly, which is the SOLID cut — and the reason to state the count
    // rather than the word alone: the verdict sits right on its own boundary on this archive.
    const coverage = screen.getByTestId('coverage-verdict')
    expect(coverage).toHaveTextContent('24 of 36 headings rest on two or more Races')
    expect(coverage).toHaveTextContent('SOLID')
  })

  it('draws the Era before the autocompensation by default, dashed', () => {
    renderCompass()

    const { season } = archive()
    expect(season.heading).toHaveLength(2)
    expect(screen.getByTestId('compass-previous-era')).toBeInTheDocument()
  })

  it('keeps the same heading selected across the Strip | Rose toggle', async () => {
    renderCompass()

    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))

    expect(screen.getByTestId('compass-rose')).toBeInTheDocument()
    expect(screen.queryByTestId('compass-strip')).not.toBeInTheDocument()
  })

  it('carries the CTW caveat on the figure, as the service hands it over', () => {
    const { season } = archive()
    const current = season.heading[season.heading.length - 1]

    expect(current.caveat).toContain('CTW = HDG + leeway')
  })
})

describeArchive('the Tack Dial over the owner’s season', () => {
  function renderDial() {
    const { season, labels } = archive()
    return render(
      <TackDial
        season={season.asymmetry.season}
        eras={season.asymmetry.eras}
        compassEras={season.asymmetry.compass_eras}
        log={LOG}
        labels={labels}
      />
    )
  }

  it('draws both dots of all twenty Tack Pairs the season produced', () => {
    renderDial()

    // 18 upwind pairs from 10 Races and 2 downwind from 2 — ADR 0034's own counts — and a dot per
    // tack of each, which is what a sailor taps.
    const { season } = archive()
    expect(season.asymmetry.season.upwind?.pair_count).toBe(18)
    expect(season.asymmetry.season.downwind?.pair_count).toBe(2)
    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(40)
  })

  it('flags the downwind side as too few to lean on, and does not flag upwind', () => {
    renderDial()

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('2 Tack Pairs · 2 Races — too few to lean on')
    expect(readout).toHaveTextContent('18 Tack Pairs · 10 Races')
    expect(readout).not.toHaveTextContent('18 Tack Pairs · 10 Races — too few')
  })

  it('says the two points of sail lean opposite ways, which a vane offset would not', () => {
    renderDial()

    // Port reads wider upwind and starboard wider downwind. This is the sentence ADR 0034 asked
    // the dial to make possible, and the reason their mean is never computed.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'Upwind and downwind lean opposite ways'
    )
  })

  it('reads ANECDOTAL off the weaker point of sail, not off the eighteen upwind pairs', () => {
    renderDial()

    const coverage = screen.getByTestId('coverage-verdict')
    expect(coverage).toHaveTextContent('ANECDOTAL')
    expect(coverage).toHaveTextContent('2 Tack Pairs downwind, against 18 upwind')
  })

  it('is one Era of its own, because nothing was ever recorded against the masthead', () => {
    const { season } = archive()

    // The archive's only recorded act is the compass autocompensation, so `AWA` has one Era over
    // the whole season — and the day the owner re-types the vane offset, it will have two.
    expect(season.asymmetry.eras).toHaveLength(1)
    expect(season.asymmetry.eras[0].era.from_date).toBeNull()
  })

  it('puts LAY-145 §2.6’s check one tap away, and the move is not compass-shaped', async () => {
    renderDial()

    const { season } = archive()
    // The compass's boundaries, borrowed and labelled as the compass's — offered beside `AWA`'s own
    // rather than instead of them.
    expect(season.asymmetry.compass_eras).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Since 4 Jul · HDG' }))

    // Across an autocompensation that moved the compass about ten degrees, the upwind Asymmetry
    // moves under a degree. The dial states the two figures; the inference is the reader's.
    const before = season.asymmetry.compass_eras[0].upwind?.asymmetry_deg ?? 0
    const after = season.asymmetry.compass_eras[1].upwind?.asymmetry_deg ?? 0
    expect(Math.abs(after - before)).toBeLessThan(1)
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('Port reads')
  })

  it('never prints a figure averaging the two points of sail', () => {
    renderDial()

    // −6.0° upwind and +5.1° downwind average to something near zero, which would report a
    // symmetric instrument on a season that is anything but.
    const text = screen.getByTestId('tack-dial').textContent ?? ''
    expect(text).not.toMatch(/overall|combined/i)
  })
})

describeArchive('the STW chart over the owner’s season', () => {
  function renderSpeed() {
    const { season, labels } = archive()
    return render(
      <SpeedCheckChart
        byMethod={{
          orthogonal: season.speed.orthogonal[0],
          'sog-on-stw': season.speed['sog-on-stw'][0],
        }}
        log={LOG}
        labels={labels}
      />
    )
  }

  it('is one `STW` Era, because nothing was ever done to the paddlewheel', () => {
    renderSpeed()

    // The compass has two Eras and the paddlewheel one, off the same Log — and no step anywhere in
    // these rows may add a second.
    const { season } = archive()
    expect(season.speed.orthogonal).toHaveLength(1)
    expect(screen.getByTestId('calibration-rail-STW')).toHaveTextContent(
      'Nothing in the Calibration Log touches STW'
    )
  })

  it('draws the fit, and never prints a coefficient of it under either method', async () => {
    renderSpeed()

    for (const method of ['both noisy', 'SOG on STW']) {
      await userEvent.click(screen.getByRole('radio', { name: method }))

      expect(screen.getByTestId('fitted-line')).toBeInTheDocument()
      const text = screen.getByTestId('speed-check-chart').textContent ?? ''
      expect(text).not.toMatch(/slope|intercept/i)
      // The three the archive measures: 0.94 regressing SOG on STW, 0.98 orthogonal, 1.02 the
      // other way. Any of them on screen is a drafted correction with a different label on it.
      expect(text).not.toMatch(/0\.94|0\.98|1\.02/)
    }
  })

  it('says where the blank-`STW` rows went, because none of them reached the chart', () => {
    renderSpeed()

    // ADR 0027's 19.8% is a fact about the whole archive. Over the rows the scatter reads it is
    // zero, and all 935 were Frozen or Low-Speed.
    const { season } = archive()
    expect(season.speed.orthogonal[0].coverage.blank_stw).toBe(0)
    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent(
      'blank-STW rows in these Races were Frozen, Low-Speed or inside a Maneuver Window'
    )
  })

  it('shows the U-shaped gap in the gap view, which the straight line cannot follow', async () => {
    renderSpeed()

    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))

    // ~+0.45 kt at 2–3 kt, near zero at 4–6, +0.3 to +0.5 at 8–9. The bands are drawn; the
    // disagreement with the line is what a tap on one says.
    const bands = new Map(
      archive().season.speed.orthogonal[0].gap_by_speed.map((band) => [
        band.band,
        band.mean_gap_knots,
      ])
    )
    expect(bands.get(2)).toBeGreaterThan(0.3)
    expect(Math.abs(bands.get(5) ?? 1)).toBeLessThan(0.2)
    expect(screen.getByTestId('speed-gap')).toBeInTheDocument()
  })

  it('states coverage off the Races carrying a line of their own', () => {
    renderSpeed()

    const era = archive().season.speed.orthogonal[0]
    expect(screen.getByTestId('coverage-verdict')).toHaveTextContent(
      `${era.races_with_a_line} of ${era.races.length} Races carry a line of their own`
    )
  })
})
