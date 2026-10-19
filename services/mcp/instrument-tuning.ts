import { calibrationEras, eraOf } from '@/services/analysis/calibration-eras'
import {
  binSpan,
  compassAbsence,
  headingsUnread,
  noCurveSentence,
  raceHeadingReading,
  racesAtHeading,
} from '@/services/analysis/compass-words'
import type { InstrumentTuningSeason, OfferedFitMethod } from '@/services/analysis/instrument-tuning'
import {
  RACE_CAVEATS,
  boatSpeedHeadline,
  compassHeadline,
  raceHeadlines,
  seasonHeadlines,
  thinnestChannel,
  windAngleHeadline,
} from '@/services/analysis/instrument-tuning-headlines'
import {
  CHANNEL_TITLE,
  NO_FIT_WORDS,
  NO_RACES_TO_MEASURE,
  asymmetryAbsence,
  compassPoint,
  eraLabel,
  raceLabel,
  raceLabelsFrom,
} from '@/services/analysis/instrument-tuning-text'
import {
  HEADLINE_SPEEDS_KNOTS,
  lineGapAt,
  type EraDivergence,
  type FittedLine,
} from '@/services/analysis/paddlewheel'
import { paddlewheelVerdict } from '@/services/analysis/paddlewheel-verdict'
import {
  BAND_WORDS,
  CHECKLIST_ANSWER_WORDS,
  bandRange,
  bandVerdictSentence,
  paddlewheelChecklist,
  sectorReading,
  slowFast,
  verdictWords,
} from '@/services/analysis/paddlewheel-verdict-words'
import type { TuningRaceRef } from '@/services/analysis/readInstrumentTuning'
import {
  METHOD_WORDS,
  THIS_ERA,
  bandRowsSentence,
  blankStwSentence,
  lineAtBand,
  lineGapSentence,
  noLineSentence,
} from '@/services/analysis/speed-check-words'
import {
  leaning,
  pairClock,
  pairHeld,
  tooFewToLeanOn,
  widerSentence,
} from '@/services/analysis/tack-dial-words'
import type {
  AsymmetryFigure,
  CalibrationEra,
  CalibrationLogEntry,
  CheckedChannel,
  EraAwaAsymmetry,
  EraHeadingBin,
  EraHeadingOffset,
  McpAsymmetrySide,
  McpBoatSpeedFinding,
  McpCalibrationEra,
  McpCompassFinding,
  McpHeadingExtreme,
  McpInstrumentTuningRace,
  McpInstrumentTuningSeason,
  McpRaceRef,
  McpRaceTuningFinding,
  McpSpeedFit,
  McpTackPair,
  McpTuningChannel,
  McpTuningFinding,
  McpWindAngleFinding,
  RaceDetail,
  RaceListEntry,
  SeasonChannelHeadline,
  TackPair,
} from '@/types'

import { calibrationLogEntryAnswer } from './boat-setup'

/**
 * `instrument_tuning`'s answers, shaped from the Instrument Tuning screen's own season and a Race
 * page's own calibration check.
 *
 * Pure, and only shaping: every figure is the services', every headline and sentence is the one
 * `instrument-tuning-headlines.ts` and `paddlewheel-verdict-words.ts` compose for the screens, and
 * nothing here classifies, sums or recomputes (ADR 0042). Which Era a channel's headline is over —
 * the current one, or the pooled season on the Tack Dial — is `seasonHeadlines`' choice, so the
 * tool's headline is the "This season" row's by construction.
 */

function eraAnswer(era: CalibrationEra, channel: CheckedChannel): McpCalibrationEra {
  return {
    channel,
    label: eraLabel(era),
    fromDate: era.from_date,
    untilDate: era.until_date,
    openedBy: era.opened_by.map(calibrationLogEntryAnswer),
  }
}

function finding(headline: SeasonChannelHeadline): McpTuningFinding {
  return {
    era: headline.era === null ? null : eraAnswer(headline.era, headline.channel),
    figures: headline.figures,
    instead: headline.instead,
    coverage: {
      verdict: headline.coverage.verdict,
      reason: headline.coverage.reason,
      towardsSolid: headline.towards_solid,
    },
    caveat: headline.caveat,
  }
}

function extreme(bin: EraHeadingBin & { mean_error_deg: number }): McpHeadingExtreme {
  return {
    headingDegrees: bin.bin_center_deg,
    compassPoint: compassPoint(bin.bin_center_deg),
    offsetDegrees: bin.mean_error_deg,
  }
}

/** Names a Race the way the charts do, from the read's own titles. */
type Namer = (raceId: string, sailedAt: string) => McpRaceRef

function namer(races: readonly TuningRaceRef[]): Namer {
  const labels = raceLabelsFrom(races)
  return (id, sailedAt) => ({ id, label: raceLabel(labels, id, sailedAt) })
}

function compassEra(era: EraHeadingOffset, name: Namer): McpCompassFinding {
  return {
    ...finding(compassHeadline(era)),
    era: eraAnswer(era.era, 'HDG'),
    swing:
      era.swing === null
        ? null
        : {
            highest: extreme(era.swing.highest),
            lowest: extreme(era.swing.lowest),
            swingDegrees: era.swing.swing_deg,
          },
    ...(era.swing === null ? { noCurve: noCurveSentence(era) } : {}),
    meanEveryHeadingEqualDegrees: era.mean_of_bins_deg,
    meanEveryRaceEqualDegrees: era.mean_of_races_deg,
    headingsCovered: era.headings_covered,
    headingsUnread: headingsUnread(era),
    headings: era.bins.map((bin, index) => {
      const span = binSpan(bin)
      return {
        fromDegrees: span.from,
        toDegrees: span.to,
        compassPoint: compassPoint(bin.bin_center_deg),
        offsetDegrees: bin.mean_error_deg,
        races: bin.race_count,
        readings: racesAtHeading(era, index).map(({ race, reading }) => ({
          ...name(race.race_id, race.window_start),
          offsetDegrees: reading.mean_error_deg,
          rows: reading.row_count,
          reading: raceHeadingReading(reading),
        })),
      }
    }),
    races: era.races.map((race) => ({
      ...name(race.race_id, race.window_start),
      shareOfRose: race.heading_coverage,
    })),
    racesWithNoFigure: era.excluded.map((race) => ({
      ...name(race.race_id, race.window_start),
      reason: compassAbsence(race),
    })),
  }
}

/** One point of sail, as the Tack Dial's figure reads it, over `races` Races. */
function side(figure: AsymmetryFigure | null, races: number): McpAsymmetrySide | null {
  if (figure === null) return null

  return {
    widerTack: figure.wider_tack,
    widerByDegrees: figure.wider_by_deg,
    asymmetryDegrees: figure.asymmetry_deg,
    heldDegrees: { starboard: figure.held_deg.starboard, port: figure.held_deg.port },
    reading: widerSentence(figure),
    tooFewToLeanOn: tooFewToLeanOn(figure),
    tackPairs: figure.pair_count,
    races,
  }
}

function tackPair(pair: TackPair, race: McpRaceRef): McpTackPair {
  const held = pairHeld(pair)

  return {
    race,
    at: pair.at,
    clock: pairClock(pair),
    pointOfSail: pair.point_of_sail,
    asymmetryDegrees: pair.asymmetry_deg,
    heldDegrees: { starboard: held.starboard_deg, port: held.port_deg },
    widerTack: held.wider_tack,
    widerByDegrees: held.wider_by_deg,
    rows: { starboard: pair.starboard.row_indexes.length, port: pair.port.row_indexes.length },
    gapSeconds: pair.gap_seconds,
  }
}

function windAngleEra(era: EraAwaAsymmetry, name: Namer): McpWindAngleFinding {
  return {
    ...finding(windAngleHeadline(era)),
    era: eraAnswer(era.era, 'AWA'),
    upwind: side(era.upwind, era.upwind?.race_count ?? 0),
    downwind: side(era.downwind, era.downwind?.race_count ?? 0),
    leaning: leaning(era.upwind, era.downwind),
    // One Race is the one Race it is, as the dial counts it when a Race is picked.
    races: era.races.map((race) => ({
      ...name(race.race_id, race.window_start),
      upwind: side(race.upwind, 1),
      downwind: side(race.downwind, 1),
      tackPairs: race.pairs.length,
    })),
    racesWithNoFigure: era.excluded.map((race) => ({
      ...name(race.race_id, race.window_start),
      reason: asymmetryAbsence(race),
    })),
    tackPairs: era.races.flatMap((race) =>
      race.pairs.map((pair) => tackPair(pair, name(race.race_id, race.window_start)))
    ),
  }
}

/** The line's gap from 1:1 at the headline speeds, read with the chart's own arithmetic. */
function gapsAtSpeeds(line: FittedLine | null): { stwKnots: number; gapKnots: number | null }[] {
  return HEADLINE_SPEEDS_KNOTS.map((knots) => ({
    stwKnots: knots,
    gapKnots: line === null ? null : lineGapAt(line, knots),
  }))
}

/** One fit method's line over the Era, as the Scatter states it with that method picked. */
function speedFit(era: EraDivergence, method: OfferedFitMethod): McpSpeedFit {
  const line = era.fit.fitted ? era.fit.line : null

  return {
    method: METHOD_WORDS[method],
    fitted: line !== null,
    summary: era.fit.fitted
      ? lineGapSentence(THIS_ERA, era.measured_offset_knots, era.fit.line)
      : noLineSentence(THIS_ERA, era.fit.reason, era.measured_offset_knots),
    rSquared: line?.r_squared ?? null,
    rows: line?.points ?? null,
    gapsAtSpeeds: gapsAtSpeeds(line),
    bands: era.gap_by_speed.map((band) => {
      const atLine = line === null ? null : lineAtBand(line, band)
      return {
        knots: bandRange(band),
        meanGapKnots: band.mean_gap_knots,
        rows: band.rows,
        races: band.races,
        sentence: bandRowsSentence(band, false),
        lineGapKnots: atLine?.line_gap_knots ?? null,
        lineSentence: atLine?.sentence ?? null,
      }
    }),
  }
}

/**
 * The Era's figures, the card's Recalibration Verdict and everything the chart's three views show
 * of it. `sogOnStw` is the same Era fitted the other way, which the Scatter's toggle offers.
 */
function boatSpeedEra(era: EraDivergence, sogOnStw: EraDivergence, name: Namer): McpBoatSpeedFinding {
  const verdict = paddlewheelVerdict(era)
  const sailedAt = new Map(era.races.map((race) => [race.race_id, race.sailed_at]))
  const named = (raceId: string): McpRaceRef => name(raceId, sailedAt.get(raceId) ?? '')

  return {
    ...finding(boatSpeedHeadline(era)),
    era: eraAnswer(era.era, 'STW'),
    recalibration: { recommendation: verdict.recommendation, ...verdictWords(verdict) },
    meanGapKnots: era.measured_offset_knots,
    spotOnShare: verdict.spot_on_share,
    bands: verdict.bands.map((band) => ({
      knots: bandRange(band),
      verdict: BAND_WORDS[band.verdict],
      gap: band.mean_gap_knots === null ? null : slowFast(band.mean_gap_knots),
      rows: band.rows,
      agreeing: band.agreeing,
      sentence: bandVerdictSentence(band),
      races: band.races.map((race) => ({ ...named(race.race_id), gap: slowFast(race.mean_gap_knots) })),
    })),
    checklist: paddlewheelChecklist(verdict).map((item) => ({
      question: item.question,
      answer: CHECKLIST_ANSWER_WORDS[item.answer],
      finding: item.finding,
    })),
    headingSectors: verdict.heading.sectors.map((sector) => ({
      sector: sector.sector,
      reading: sector.mean_gap_knots === null ? null : BAND_WORDS[sectorReading(sector.mean_gap_knots)],
      gap: sector.mean_gap_knots === null ? null : slowFast(sector.mean_gap_knots),
      races: sector.races,
    })),
    headingSwingKnots: verdict.heading.swing_knots,
    drift: {
      points: verdict.drift.points.map((point) => ({
        ...name(point.race_id, point.sailed_at),
        gapKnots: point.measured_offset_knots,
      })),
      changeKnots: verdict.drift.change_knots,
    },
    fits: { orthogonal: speedFit(era, 'orthogonal'), sogOnStw: speedFit(sogOnStw, 'sog-on-stw') },
    blankStw: blankStwSentence(era.coverage),
    races: era.races.map((race) => {
      const line = race.fit.fitted ? race.fit.line : null
      return {
        ...name(race.race_id, race.sailed_at),
        meanGapKnots: race.measured_offset_knots,
        fitted: line !== null,
        rSquared: line?.r_squared ?? null,
        gapsAtSpeeds: gapsAtSpeeds(line),
        noLine: race.fit.fitted ? null : NO_FIT_WORDS[race.fit.reason],
      }
    }),
  }
}

/**
 * The season, every channel or one, as the screen and the "This season" row state it, with
 * everything each chart shows of every Era when tapped.
 *
 * `STW`'s verdict, bands and checklist are read off the orthogonal fit, the screen's default: the
 * verdict reads the Era's points alone and is the same under either method. Both fits' lines are
 * given, as the Scatter's toggle offers them.
 *
 * @param races Every Race the season was read over, as the read names them.
 */
export function instrumentTuningSeasonAnswer(
  season: InstrumentTuningSeason,
  races: readonly TuningRaceRef[],
  channel?: CheckedChannel
): McpInstrumentTuningSeason {
  const headlines = seasonHeadlines(season)
  const [hdg, awa, stw] = headlines
  const name = namer(races)
  const windAngle = (era: EraAwaAsymmetry): McpWindAngleFinding => windAngleEra(era, name)

  const channels: McpTuningChannel[] = [
    {
      channel: 'HDG',
      name: CHANNEL_TITLE.HDG,
      headline: finding(hdg),
      eras: season.heading.map((era) => compassEra(era, name)),
    },
    {
      channel: 'AWA',
      name: CHANNEL_TITLE.AWA,
      headline: finding(awa),
      season: windAngle(season.asymmetry.season),
      eras: season.asymmetry.eras.map(windAngle),
      compassEras: season.asymmetry.compass_eras.map(windAngle),
    },
    {
      channel: 'STW',
      name: CHANNEL_TITLE.STW,
      headline: finding(stw),
      // The two methods fit the same Eras over the same rows, in the same order.
      eras: season.speed.orthogonal.map((era, index) =>
        boatSpeedEra(era, season.speed['sog-on-stw'][index], name)
      ),
    },
  ]

  if (channel !== undefined) {
    return {
      scope: 'season',
      races: races.length,
      channels: channels.filter((each) => each.channel === channel),
    }
  }

  const thinnest = thinnestChannel(headlines)
  return {
    scope: 'season',
    races: races.length,
    channels,
    thinnest: { channel: thinnest.channel, verdict: thinnest.coverage.verdict },
  }
}

/**
 * One Race's calibration check, every channel or one, as its page's tile states it.
 *
 * Each channel names the Calibration Era the Race was sailed in, cut on that channel's own Log
 * entries, as the season's charts cut it: a Race sits in one Era per channel by construction.
 */
export function instrumentTuningRaceAnswer(
  race: Pick<RaceDetail, 'id' | 'title' | 'window_start' | 'instruments'>,
  log: readonly CalibrationLogEntry[],
  channel?: CheckedChannel
): McpInstrumentTuningRace {
  const findings = raceHeadlines(race.instruments).map((column): McpRaceTuningFinding => {
    const era = eraOf(calibrationEras(log, column.channel), race.window_start)

    return {
      channel: column.channel,
      name: CHANNEL_TITLE[column.channel],
      era: era === null ? null : eraAnswer(era, column.channel),
      figures: column.figures,
      instead: column.instead,
      coverage: { basis: column.basis, share: column.bar },
      caveat: RACE_CAVEATS[column.channel],
    }
  })

  return {
    scope: 'race',
    race: { id: race.id, title: race.title, windowStart: race.window_start },
    channels: channel === undefined ? findings : findings.filter((each) => each.channel === channel),
  }
}

/** An archive with no Race in it, in the screen's own words: an answer, never a failure. */
export const NO_RACES_ANSWER: McpInstrumentTuningSeason = {
  scope: 'season',
  races: 0,
  channels: [],
  note: `${NO_RACES_TO_MEASURE.title}. ${NO_RACES_TO_MEASURE.detail}`,
}

/**
 * The refusal for a Race id nobody can read, naming every one the caller can.
 *
 * A missing Race, one RLS hides and one that could not be read whole are one answer, as on the
 * Race page: there is no Race here to check, and never part of one.
 */
export function unknownRaceRefusal(
  raceId: string,
  races: readonly Pick<RaceListEntry, 'id' | 'title' | 'window_start'>[]
): string {
  // Named as the charts name a Race, so one id can be told from another without list_races.
  const labels = raceLabelsFrom(races.map((each) => ({ ...each, race_id: each.id })))
  const valid =
    races.length === 0
      ? 'The archive lists no Race to choose from.'
      : `Races there are: ${races.map((each) => `${each.id} (${labels[each.id]})`).join(', ')}.`

  return `No Race with id ${raceId} could be read. ${valid} If it is listed, the read failed and may be retried.`
}
