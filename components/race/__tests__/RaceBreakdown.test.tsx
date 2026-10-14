/**
 * The per-Race breakdown under the map and the Polar Plot: performance, sail-vs-chart and the
 * calibration check, in that order — and each one's words where the race produced no figure.
 */

import { cleanup, render, screen, within } from '@testing-library/react'
import type { RaceChartAgreement, RaceSailChartRead } from '@/services/analysis/sail-selection'
import type {
  AsymmetryFigure,
  EfficiencyAggregate,
  RaceInstrumentCheck,
  RacePolarPlot,
  RaceTrack,
} from '@/types'

import RaceBreakdown from '../RaceBreakdown'

afterEach(cleanup)

function sums(over: Partial<EfficiencyAggregate> = {}): EfficiencyAggregate {
  return {
    rows: 40,
    filler_anchored_rows: 0,
    vmg_rows: 30,
    vmg_filler_anchored_rows: 0,
    rows_without_interval: 0,
    rows_without_target: 0,
    elapsed_seconds: 1500,
    actual_distance_nm: 2.2,
    target_distance_nm: 2.5,
    polar_efficiency: 0.88,
    actual_vmg_distance_nm: 1.2,
    target_vmg_distance_nm: 1.5,
    vmg_efficiency: 0.8,
    ...over,
  }
}

function scored(performance: EfficiencyAggregate): RaceTrack {
  const plot: RacePolarPlot = {
    moments: [],
    polar: { twa_axis: [], tws_axis: [], boat_speed: [] },
    polar_version_id: 'polar-1',
    undrawn: { seconds: 0, parts: [] },
    performance,
  }
  return { heatmap: null, scoring: 'polar', plot }
}

const NO_VERDICTS = { agrees: 0, differs: 0, 'off-chart': 0, 'not-recorded': 0, 'other-version': 0 }

function agreement(over: Partial<RaceChartAgreement> = {}): RaceSailChartRead {
  return {
    ok: true,
    agreement: {
      placed_rows: 20,
      judgeable_rows: 16,
      agreement: 0.75,
      following: sums({ polar_efficiency: 0.9 }),
      differing: sums({ polar_efficiency: 0.86 }),
      verdicts: { ...NO_VERDICTS, agrees: 12, differs: 4, 'not-recorded': 4 },
      cells: { agrees: 3, mixed: 1, 'not-recorded': 1 },
      ...over,
    },
  }
}

function upwind(over: Partial<AsymmetryFigure> = {}): AsymmetryFigure {
  return {
    point_of_sail: 'upwind',
    asymmetry_deg: 2.1,
    wider_tack: 'starboard',
    wider_by_deg: 4.2,
    held_deg: { starboard: 32, port: 27.8 },
    pair_count: 3,
    caveat: 'not a Measured Offset',
    ...over,
  }
}

const MEASURED: RaceInstrumentCheck = {
  heading: {
    ok: true,
    race_id: 'race-1',
    window_start: '2026-06-03T19:00:00',
    offset: {
      race_id: 'race-1',
      window_start: '2026-06-03T19:00:00',
      mean_offset_deg: 2.4,
      std_dev_deg: 3,
      max_abs_error_deg: 9,
      row_count: 120,
      headings_covered: 14,
      heading_coverage: 14 / 36,
      bins: [],
      caveat: 'CTW = HDG + leeway',
    },
  },
  heading_swing_deg: 11.3,
  asymmetry: {
    ok: true,
    race_id: 'race-1',
    window_start: '2026-06-03T19:00:00',
    asymmetry: {
      race_id: 'race-1',
      window_start: '2026-06-03T19:00:00',
      upwind: upwind(),
      downwind: null,
      pairs: [],
      caveat: 'not a Measured Offset',
    },
  },
  speed: {
    fitted: true,
    r_squared: 0.82,
    gaps: [
      { stw_knots: 4, gap_knots: 0.31 },
      { stw_knots: 8, gap_knots: null },
    ],
  },
}

const NOTHING: RaceInstrumentCheck = {
  heading: {
    ok: false,
    race_id: 'race-1',
    window_start: '2026-06-03T19:00:00',
    reason: 'too-few-rows',
    row_count: 3,
  },
  heading_swing_deg: null,
  asymmetry: {
    ok: false,
    race_id: 'race-1',
    window_start: '2026-06-03T19:00:00',
    reason: 'no-pairs',
    segment_count: 4,
  },
  speed: { fitted: false, reason: 'narrow-spread' },
}

function renderBreakdown({
  track = scored(sums()),
  sailChart = agreement(),
  instruments = MEASURED,
}: {
  track?: RaceTrack
  sailChart?: RaceSailChartRead
  instruments?: RaceInstrumentCheck
} = {}): void {
  render(<RaceBreakdown track={track} sailChart={sailChart} instruments={instruments} />)
}

describe('the order', () => {
  it('is performance, then sail-vs-chart, then the calibration check — and nothing else', () => {
    renderBreakdown()

    const headings = screen.getAllByRole('heading', { level: 2 }).map((each) => each.textContent)
    expect(headings).toEqual([
      'Polar & VMG efficiency',
      'Sail selection vs. chart',
      'Instrument calibration check',
    ])
    // No AI summary, and no placeholder where one would have been (ADR 0033).
    expect(screen.queryByText(/summary/i)).not.toBeInTheDocument()
  })
})

describe('the performance tile', () => {
  it('states the race’s two figures, from the Polar Plot’s own sums', () => {
    renderBreakdown()

    expect(screen.getByTestId('race-polar-efficiency')).toHaveTextContent('88.0%')
    expect(screen.getByTestId('race-vmg-efficiency')).toHaveTextContent('80.0%')
    expect(screen.getByTestId('race-performance')).toHaveTextContent('25m of scored sailing')
  })

  it('flags a Filler-Anchored figure beside the number, never instead of it', () => {
    renderBreakdown({ track: scored(sums({ filler_anchored_rows: 10, vmg_filler_anchored_rows: 0 })) })

    expect(screen.getByTestId('race-polar-efficiency')).toHaveTextContent('88.0%')
    expect(screen.getByTestId('race-polar-efficiency-filler-anchored')).toHaveTextContent('25%')
    // Its own share over its own rows: VMG rested on no filler here.
    expect(screen.queryByTestId('race-vmg-efficiency-filler-anchored')).not.toBeInTheDocument()
  })

  it('says in words that nothing could be scored, rather than a dash or a nought', () => {
    renderBreakdown({
      track: scored(
        sums({ rows: 0, vmg_rows: 0, elapsed_seconds: 0, polar_efficiency: null, vmg_efficiency: null })
      ),
    })

    expect(screen.getByTestId('race-polar-efficiency')).toHaveTextContent(
      /Nothing in this race could be scored/
    )
    expect(screen.getByTestId('race-performance')).not.toHaveTextContent(/\d%/)
  })

  it('says why there are no figures where the race names no Polar, or names one nobody can read', () => {
    renderBreakdown({ track: { heatmap: null, scoring: 'no-polar-version', plot: null } })
    expect(screen.getByTestId('race-performance')).toHaveTextContent(/records no Polar Version/)
    expect(screen.queryByTestId('race-polar-efficiency')).not.toBeInTheDocument()

    cleanup()
    renderBreakdown({ track: { heatmap: null, scoring: 'polar-unreadable', plot: null } })
    expect(screen.getByTestId('race-performance')).toHaveTextContent(/could not be read/)
  })
})

describe('the sail-vs-chart tile', () => {
  it('states the share of judgeable sailing that carried what the chart calls for', () => {
    renderBreakdown()

    const tile = screen.getByTestId('race-sail-chart')
    expect(within(tile).getByTestId('race-chart-agreement')).toHaveTextContent('75.0%')
    expect(tile).toHaveTextContent('90.0% of target when it did, 86.0% when it did not')
    // What the share rests on, and the cells the race reached.
    expect(tile).toHaveTextContent('20% no sail recorded')
    expect(tile).toHaveTextContent('5 cells')
    expect(within(tile).getByRole('link')).toHaveAttribute('href', '/boat-performance/sail-selection')
  })

  it('says why there is no share — never a nought percent', () => {
    renderBreakdown({
      sailChart: agreement({
        judgeable_rows: 0,
        agreement: null,
        verdicts: { ...NO_VERDICTS, 'not-recorded': 20 },
        cells: { 'not-recorded': 4 },
      }),
    })

    const tile = screen.getByTestId('race-sail-chart')
    expect(tile).toHaveTextContent(/recorded no sail/)
    expect(within(tile).queryByTestId('race-chart-agreement')).not.toBeInTheDocument()
    expect(tile).not.toHaveTextContent(/\b0(\.0)?%/)
  })

  it('names a different chart Version as the reason, rather than calling it disagreement', () => {
    renderBreakdown({
      sailChart: agreement({
        judgeable_rows: 0,
        agreement: null,
        verdicts: { ...NO_VERDICTS, 'other-version': 20 },
        cells: { 'other-version': 4 },
      }),
    })

    expect(screen.getByTestId('race-sail-chart')).toHaveTextContent(/different Crossover Chart Version/)
  })

  it('says nothing of this race reached the chart, where nothing did', () => {
    renderBreakdown({
      sailChart: agreement({
        placed_rows: 0,
        judgeable_rows: 0,
        agreement: null,
        verdicts: NO_VERDICTS,
        cells: {},
      }),
    })

    expect(screen.getByTestId('race-sail-chart')).toHaveTextContent(/falls on no cell of the chart/)
  })

  it('says there is no chart, or no archive, in words', () => {
    renderBreakdown({ sailChart: { ok: false, reason: 'no-chart' } })
    expect(screen.getByTestId('race-sail-chart')).toHaveTextContent(/No Crossover Chart/)

    cleanup()
    renderBreakdown({ sailChart: { ok: false, reason: 'unreadable' } })
    expect(screen.getByTestId('race-sail-chart')).toHaveTextContent(/could not be read/)
  })
})

describe('the calibration-check tile', () => {
  function channel(name: 'HDG' | 'AWA' | 'STW'): HTMLElement {
    const found = screen
      .getAllByTestId('race-calibration-figures')
      .find((each) => each.dataset.channel === name)
    if (found === undefined) throw new Error(`no ${name} column`)
    return found
  }

  it('states the race’s own figure on each of the three channels, each over its coverage', () => {
    renderBreakdown()

    expect(channel('HDG')).toHaveTextContent('11.3° swing')
    expect(channel('AWA')).toHaveTextContent('stbd 4.2°')
    expect(channel('AWA')).toHaveTextContent('no pairs')
    expect(channel('STW')).toHaveTextContent('+0.31 kt')
    // A speed the race's line never reached is said, not extrapolated.
    expect(channel('STW')).toHaveTextContent('off its line')

    const tile = screen.getByTestId('race-calibration')
    expect(tile).toHaveTextContent('39% of the rose')
    expect(tile).toHaveTextContent('3 Tack Pairs')
    expect(tile).toHaveTextContent('R² 0.82')
    expect(within(tile).getAllByTestId('race-calibration-bar')).toHaveLength(3)
    expect(within(tile).getByRole('link')).toHaveAttribute(
      'href',
      '/boat-performance/instrument-tuning'
    )
  })

  it('says why, in words, on a channel this race produced nothing for — and draws no bar', () => {
    renderBreakdown({ instruments: NOTHING })

    expect(channel('HDG')).toHaveTextContent('only 3 rows this check could read')
    expect(channel('AWA')).toHaveTextContent(/no two steady segments on opposite tacks/)
    expect(channel('STW')).toHaveTextContent(/under 3 kt of SOG/)

    const tile = screen.getByTestId('race-calibration')
    expect(within(tile).queryAllByTestId('race-calibration-bar')).toHaveLength(0)
    expect(tile).not.toHaveTextContent(/[+−]\d|\d°|R²/)
  })

  it('says a compass reading spanned too few headings for a swing, rather than a nought swing', () => {
    renderBreakdown({ instruments: { ...MEASURED, heading_swing_deg: null } })

    expect(channel('HDG')).toHaveTextContent(/one heading/)
    expect(channel('HDG')).not.toHaveTextContent('0.0°')
  })
})
