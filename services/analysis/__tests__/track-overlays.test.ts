/**
 * The six scales the **Race Track Heatmap** can colour a race by, and the two different gates they
 * apply to a row (ADR 0037).
 *
 * The claim this suite exists for is the asymmetry, because it is the one a future reader will be
 * tempted to "fix": **a ratio and a reading are not gated alike.** ADR 0025 keeps Low-Speed and
 * mid-manoeuvre rows out of every *performance metric*, which the two percentages are. A speed over
 * the ground is not a performance metric — a parked boat's is simply what the GPS measured — so a
 * channel overlay draws it. Making the six agree would either hide recorded values or let excluded
 * rows into a metric, and both are worse than the asymmetry.
 *
 * The other claim is that every band is a **token**: `.theme-nightvision` collapses all of them to
 * one red depth ramp, and a chart escaping the theme is the one thing `globals.css` forbids.
 */

import {
  TRACK_OVERLAYS,
  TRACK_SCALES,
  isRatioOverlay,
  overlayGate,
  overlayBand,
  overlayColour,
  overlayPaint,
  overlayValue,
} from '@/services/analysis/track-overlays'
import { WIND_THRESHOLDS } from '@/lib/utils/wind'
import type { TrackOverlay, TrackRowFacts } from '@/types'

/** A row on the pace, close-hauled on starboard in ten knots, with nothing excluding it. */
function facts(over: Partial<TrackRowFacts> = {}): TrackRowFacts {
  return {
    row_index: 1,
    row_time: '2026-07-11T14:20:00',
    sog: 6.4,
    tws: 10,
    twa: 48,
    cog: 40,
    target_speed: 6.5,
    polar_efficiency: 6.4 / 6.5,
    target_vmg: 4.6,
    vmg_efficiency: 0.93,
    filler_anchored: false,
    excluded: null,
    sail_agreement: 'agrees',
    sail_flown: 'Main + Jib 1',
    sail_recommended: 'Main + Jib 1',
    ...over,
  }
}

describe('the scales', () => {
  it('offers six overlays, and every one of them has a scale', () => {
    expect(TRACK_OVERLAYS).toEqual([
      'target_speed',
      'target_vmg',
      'sail',
      'sog',
      'tws',
      'twa',
    ])
    TRACK_OVERLAYS.forEach((overlay) => {
      expect(TRACK_SCALES[overlay].overlay).toBe(overlay)
      expect(TRACK_SCALES[overlay].bands.length).toBeGreaterThan(1)
    })
  })

  it('names a token for every band and never a hex, so the theme stays in charge', () => {
    TRACK_OVERLAYS.forEach((overlay) => {
      TRACK_SCALES[overlay].bands.forEach((step) => {
        expect(overlayColour(step.band)).toBe(`var(--${step.band})`)
        expect(step.band).not.toMatch(/#|rgb/)
      })
    })
  })

  it('says something different after dark on every scale, and never the daylight words', () => {
    // The obligation ADR 0033 accepted in exchange for keeping colour as the encoding: the ramp
    // may collapse, the legend may not pretend it hasn't.
    TRACK_OVERLAYS.forEach((overlay) => {
      const { day, night } = TRACK_SCALES[overlay]
      expect(night).not.toBe(day)
      expect(night.length).toBeGreaterThan(20)
    })
  })

  it('spends the wind-speed tokens on wind speed, and on nothing else', () => {
    // ADR 0033 refused these for percent-of-target because they mean an absolute wind speed on a
    // screen that also shows a ratio. On a TWS overlay they mean exactly what they say.
    const windy = TRACK_OVERLAYS.filter((overlay) =>
      TRACK_SCALES[overlay].bands.some((step) => step.band.startsWith('wind-'))
    )

    expect(windy).toEqual(['tws'])
  })

  it('reads the wind bands off WIND_THRESHOLDS rather than restating them', () => {
    // Two copies of 8 and 15 would be two chances for the dashboard's wind card and this map to
    // disagree about what medium air is.
    expect(overlayBand('tws', WIND_THRESHOLDS.LIGHT_MAX)).toBe('wind-light')
    expect(overlayBand('tws', WIND_THRESHOLDS.LIGHT_MAX + 1)).toBe('wind-medium')
    expect(overlayBand('tws', WIND_THRESHOLDS.MEDIUM_MAX)).toBe('wind-medium')
    expect(overlayBand('tws', WIND_THRESHOLDS.MEDIUM_MAX + 1)).toBe('wind-heavy')
    expect(overlayBand('tws', WIND_THRESHOLDS.HEAVY_MAX + 1)).toBe('wind-storm')
  })

  it('centres both ratios on 100% and reads each band off its own upper edge', () => {
    expect(overlayBand('target_speed', 0.8499)).toBe('track-below-3')
    expect(overlayBand('target_speed', 0.85)).toBe('track-below-2')
    // 98–102% is one band, so a boat two percent either side of target reads as on it.
    expect(overlayBand('target_speed', 0.98)).toBe('track-at')
    expect(overlayBand('target_speed', 1.0199)).toBe('track-at')
    expect(overlayBand('target_speed', 1.02)).toBe('track-above-1')
    expect(overlayBand('target_speed', 4.8)).toBe('track-above-3')

    // The same ramp for both, because they are the same shape of question and must not read on two
    // different scales on one screen.
    expect(TRACK_SCALES.target_vmg.bands).toBe(TRACK_SCALES.target_speed.bands)
  })

  it('splits TWA by tack, with depth for how far off the wind', () => {
    // Signed as the recording wrote it: negative to port (ADR 0008). A single ramp over |TWA|
    // would draw both tacks identically and lose the thing a sailor is looking for.
    expect(overlayBand('twa', -170)).toBe('track-port-3')
    expect(overlayBand('twa', -90)).toBe('track-port-2')
    expect(overlayBand('twa', -40)).toBe('track-port-1')
    expect(overlayBand('twa', 40)).toBe('track-stbd-1')
    expect(overlayBand('twa', 90)).toBe('track-stbd-2')
    expect(overlayBand('twa', 170)).toBe('track-stbd-3')
  })

  it('paints sail agreement from the verdict, not from a number', () => {
    // The one categorical overlay: two bands, read off the comparison the server made against the
    // Race's own chart Version. Green agrees, red differs — and a difference is not a fault.
    expect(overlayPaint('sail', facts({ sail_agreement: 'agrees' }), true).band).toBe('track-agree')
    expect(overlayPaint('sail', facts({ sail_agreement: 'differs' }), true).band).toBe(
      'track-differ'
    )
  })

  it('keeps the four ways there is no sail verdict apart', () => {
    // A gap in the archive, a sail the chart cannot name, and the edge of the chart are different
    // facts, and the readout says each of them in its own words.
    const reasons = ['no_chart_version', 'no_sail_recorded', 'sail_unnamed', 'no_chart_cell'] as const

    reasons.forEach((reason) => {
      const paint = overlayPaint('sail', facts({ sail_agreement: reason }), true)
      expect(paint.band).toBeNull()
      expect(paint.not_scored).toBe(reason)
    })
  })

  it('carries a standing caveat on Target VMG and on every wind figure', () => {
    // ADR 0036: a rectangular grid cannot hold an optimum that moves with wind speed, so this is
    // an estimate of the certificate's answer and never a reproduction of it.
    expect(TRACK_SCALES.target_vmg.caveat).toMatch(/estimated from the Polar/)
    // ADR 0008: every wind figure is computed by qtVlm, never read off the masthead.
    expect(TRACK_SCALES.tws.caveat).toMatch(/computed by qtVlm/)
    expect(TRACK_SCALES.twa.caveat).toMatch(/computed by qtVlm/)
    // And nothing claims a caveat it does not need.
    expect(TRACK_SCALES.target_speed.caveat).toBeUndefined()
  })

  it('reads each overlay off its own field of the row', () => {
    const row = facts()

    expect(overlayValue('target_speed', row)).toBe(row.polar_efficiency)
    expect(overlayValue('target_vmg', row)).toBe(row.vmg_efficiency)
    expect(overlayValue('sog', row)).toBe(row.sog)
    expect(overlayValue('tws', row)).toBe(row.tws)
    expect(overlayValue('twa', row)).toBe(row.twa)
    // Categorical: there is no number to band, and `overlayPaint` reads the verdict instead.
    expect(overlayValue('sail', row)).toBeNull()
  })
})

describe('which rows an overlay may colour', () => {
  const readings: TrackOverlay[] = ['sog', 'tws', 'twa']
  const ratios: TrackOverlay[] = ['target_speed', 'target_vmg']

  it('agrees with ADR 0025 about which overlays are performance metrics', () => {
    ratios.forEach((overlay) => expect(isRatioOverlay(overlay)).toBe(true))
    readings.forEach((overlay) => expect(isRatioOverlay(overlay)).toBe(false))
    // Sail agreement is not a ratio — it cannot be Filler-Anchored, and it carries no percentage —
    // and it *is* gated like one, because a manoeuvre's TWA sweeps through head to wind and the
    // chart's answer there is to a question nobody asked (ADR 0030, ADR 0037).
    expect(isRatioOverlay('sail')).toBe(false)
    expect(overlayGate('sail')).toBe('countable')
    ratios.forEach((overlay) => expect(overlayGate(overlay)).toBe('countable'))
    readings.forEach((overlay) => expect(overlayGate(overlay)).toBe('feed-alive'))
  })

  it('refuses a Frozen row on every overlay, readings included', () => {
    // The one exclusion all six keep: those values are the row above's, verbatim, so colouring one
    // would paint a number the boat never produced (ADR 0009).
    const frozen = facts({ excluded: 'frozen' })

    TRACK_OVERLAYS.forEach((overlay) => {
      const paint = overlayPaint(overlay, frozen, true)
      expect(paint.band).toBeNull()
      expect(paint.not_scored).toBe('frozen')
    })
  })

  it('refuses a parked row a percent of target and still draws its speed', () => {
    // The asymmetry, stated. A Low-Speed row is out of every performance metric (ADR 0025) and its
    // `SOG` is nonetheless exactly what the GPS recorded.
    const parked = facts({ excluded: 'low_speed', sog: 1.2 })

    expect(overlayPaint('target_speed', parked, true).not_scored).toBe('low_speed')
    expect(overlayPaint('target_vmg', parked, true).not_scored).toBe('low_speed')
    expect(overlayPaint('sail', parked, true).not_scored).toBe('low_speed')
    expect(overlayPaint('sog', parked, true).band).toBe('track-speed-1')
    expect(overlayPaint('tws', parked, true).band).toBe('wind-medium')
  })

  it('does the same for a row inside a manoeuvre window', () => {
    const turning = facts({ excluded: 'maneuver_window' })

    expect(overlayPaint('target_speed', turning, true).not_scored).toBe('maneuver_window')
    expect(overlayPaint('sog', turning, true).band).not.toBeNull()
  })

  it('tells a race with no Polar apart from a Polar that cannot answer', () => {
    // Two different sentences under the legend, so they must not be one state here. Nine of this
    // archive's races record no Polar at all.
    expect(overlayPaint('target_speed', facts(), false).not_scored).toBe('no_polar_version')
    expect(
      overlayPaint('target_speed', facts({ polar_efficiency: null }), true).not_scored
    ).toBe('no_target')
  })

  it('leaves the channel overlays untouched by a missing Polar', () => {
    // A recorded speed does not depend on a certificate.
    readings.forEach((overlay) => {
      expect(overlayPaint(overlay, facts(), false).band).not.toBeNull()
    })
  })

  it('says a blank channel is an absence rather than an exclusion', () => {
    expect(overlayPaint('sog', facts({ sog: null }), true).not_scored).toBe('no_reading')
    expect(overlayPaint('tws', facts({ tws: null }), true).not_scored).toBe('no_reading')
  })

  it('never lets a value that is not a number paint itself as the last band', () => {
    // Each band is read off its upper bound, and `NaN` fails every one of them — so without the
    // finite check it would fall out of the scale as *storm*, or as above 115% of target.
    expect(overlayPaint('tws', facts({ tws: NaN }), true).band).toBeNull()
    expect(overlayPaint('target_speed', facts({ polar_efficiency: NaN }), true).band).toBeNull()
  })

  it('flags a Filler-Anchored figure on a ratio and never on a reading', () => {
    // The flag is a property of the comparison, not of the reading: a boat's speed over the ground
    // does not become doubtful because the certificate's cell was manufactured (ADR 0036).
    const flagged = facts({ filler_anchored: true })

    expect(overlayPaint('target_speed', flagged, true).flagged).toBe(true)
    expect(overlayPaint('target_vmg', flagged, true).flagged).toBe(true)
    expect(overlayPaint('sog', flagged, true).flagged).toBe(false)
  })

  it('colours a figure rather than withholding it, flag and all', () => {
    // 6.4 knots against a 6.5-knot target is 98.5% — on target, and it says so with the flag
    // beside it rather than reading as "no data" because the cell behind the target was weak.
    expect(overlayPaint('target_speed', facts({ filler_anchored: true }), true).band).toBe(
      'track-at'
    )
  })
})
