import { ASYMMETRY_CAVEAT } from '@/services/analysis/awa-asymmetry'
import { calibrationEras, eraOf } from '@/services/analysis/calibration-eras'
import { HEADING_OFFSET_CAVEAT } from '@/services/analysis/compass-deviation'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import {
  boatSpeedHeadline,
  RACE_SPEED_CAVEAT,
  compassHeadline,
  raceHeadlines,
  seasonHeadlines,
  thinnestChannel,
  windAngleHeadline,
} from '@/services/analysis/instrument-tuning-headlines'
import { CHANNEL_TITLE, compassPoint, eraLabel } from '@/services/analysis/instrument-tuning-text'
import type { EraDivergence } from '@/services/analysis/paddlewheel'
import { paddlewheelVerdict } from '@/services/analysis/paddlewheel-verdict'
import { PADDLEWHEEL_CAVEAT, verdictWords } from '@/services/analysis/paddlewheel-verdict-words'
import type {
  CalibrationEra,
  CalibrationLogEntry,
  CheckedChannel,
  EraAsymmetryFigure,
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
  McpRaceTuningFinding,
  McpTuningChannel,
  McpTuningFinding,
  McpWindAngleFinding,
  RaceDetail,
  RaceListEntry,
  SeasonChannelHeadline,
} from '@/types'

import { calibrationLogEntry } from './boat-setup'

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
    openedBy: era.opened_by.map(calibrationLogEntry),
  }
}

function finding(
  headline: SeasonChannelHeadline,
  era: CalibrationEra | null,
  caveat: string
): McpTuningFinding {
  return {
    era: era === null ? null : eraAnswer(era, headline.channel),
    figures: headline.figures,
    instead: headline.instead,
    coverage: {
      verdict: headline.coverage.verdict,
      reason: headline.coverage.reason,
      towardsSolid: headline.towards_solid,
    },
    caveat,
  }
}

function extreme(bin: EraHeadingBin & { mean_error_deg: number }): McpHeadingExtreme {
  return {
    headingDegrees: bin.bin_center_deg,
    compassPoint: compassPoint(bin.bin_center_deg),
    offsetDegrees: bin.mean_error_deg,
  }
}

function compassEra(era: EraHeadingOffset): McpCompassFinding {
  return {
    ...finding(compassHeadline(era), era.era, era.caveat),
    era: eraAnswer(era.era, 'HDG'),
    swing:
      era.swing === null
        ? null
        : {
            highest: extreme(era.swing.highest),
            lowest: extreme(era.swing.lowest),
            swingDegrees: era.swing.swing_deg,
          },
    meanEveryHeadingEqualDegrees: era.mean_of_bins_deg,
    meanEveryRaceEqualDegrees: era.mean_of_races_deg,
    races: era.race_count,
    racesWithNoFigure: era.excluded.length,
  }
}

function side(figure: EraAsymmetryFigure | null): McpAsymmetrySide | null {
  if (figure === null) return null

  return {
    widerTack: figure.wider_tack,
    widerByDegrees: figure.wider_by_deg,
    tackPairs: figure.pair_count,
    races: figure.race_count,
  }
}

function windAngleEra(era: EraAwaAsymmetry): McpWindAngleFinding {
  return {
    ...finding(windAngleHeadline(era), era.era, era.caveat),
    era: eraAnswer(era.era, 'AWA'),
    upwind: side(era.upwind),
    downwind: side(era.downwind),
    races: era.race_count,
    racesWithNoFigure: era.excluded.length,
  }
}

/** The Era's figures and the card's Recalibration Verdict, from the function the card calls. */
function boatSpeedEra(era: EraDivergence): McpBoatSpeedFinding {
  const verdict = paddlewheelVerdict(era)

  return {
    ...finding(boatSpeedHeadline(era), era.era, PADDLEWHEEL_CAVEAT),
    era: eraAnswer(era.era, 'STW'),
    recalibration: { recommendation: verdict.recommendation, ...verdictWords(verdict) },
    races: era.races.length,
    racesWithALine: era.races_with_a_line,
  }
}

const last = <Item>(items: readonly Item[]): Item | null => items[items.length - 1] ?? null

/**
 * The season, every channel or one, as the screen and the "This season" row state it.
 *
 * `STW` is read off the orthogonal fit, the screen's default: the verdict reads the Era's points
 * alone and is the same under either method, and the headline gaps are the row's, which reads it.
 *
 * @param races How many Races the season was read over.
 */
export function instrumentTuningSeasonAnswer(
  season: InstrumentTuningSeason,
  races: number,
  channel?: CheckedChannel
): McpInstrumentTuningSeason {
  const headlines = seasonHeadlines(season)
  const [hdg, awa, stw] = headlines
  const currentHeading = last(season.heading)
  const currentSpeed = last(season.speed.orthogonal)

  const channels: McpTuningChannel[] = [
    {
      channel: 'HDG',
      name: CHANNEL_TITLE.HDG,
      headline: finding(hdg, currentHeading?.era ?? null, currentHeading?.caveat ?? HEADING_OFFSET_CAVEAT),
      eras: season.heading.map(compassEra),
    },
    {
      channel: 'AWA',
      name: CHANNEL_TITLE.AWA,
      headline: finding(awa, season.asymmetry.season.era, season.asymmetry.season.caveat),
      season: windAngleEra(season.asymmetry.season),
      eras: season.asymmetry.eras.map(windAngleEra),
      compassEras: season.asymmetry.compass_eras.map(windAngleEra),
    },
    {
      channel: 'STW',
      name: CHANNEL_TITLE.STW,
      headline: finding(stw, currentSpeed?.era ?? null, PADDLEWHEEL_CAVEAT),
      eras: season.speed.orthogonal.map(boatSpeedEra),
    },
  ]

  if (channel !== undefined) {
    return { scope: 'season', races, channels: channels.filter((each) => each.channel === channel) }
  }

  const thinnest = thinnestChannel(headlines)
  return {
    scope: 'season',
    races,
    channels,
    thinnest: { channel: thinnest.channel, verdict: thinnest.coverage.verdict },
  }
}

/** What travels with one Race's figure on each channel: the caveats its page's tile folds away. */
const RACE_CAVEAT: Readonly<Record<CheckedChannel, string>> = {
  HDG: HEADING_OFFSET_CAVEAT,
  AWA: ASYMMETRY_CAVEAT,
  STW: RACE_SPEED_CAVEAT,
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
      caveat: RACE_CAVEAT[column.channel],
    }
  })

  return {
    scope: 'race',
    race: { id: race.id, title: race.title, windowStart: race.window_start },
    channels: channel === undefined ? findings : findings.filter((each) => each.channel === channel),
  }
}

/** An archive with no Race in it, in the screen's own words: an answer, never a failure. */
export const NO_RACES_TO_MEASURE: McpInstrumentTuningSeason = {
  scope: 'season',
  races: 0,
  channels: [],
  note: 'No races to measure yet. These checks read a season of recordings; they appear once a race has been uploaded.',
}

/**
 * The refusal for a Race id nobody can read, naming every one the caller can.
 *
 * A missing Race, one RLS hides and one that could not be read whole are one answer, as on the
 * Race page: there is no Race here to check, and never part of one.
 */
export function unknownRaceRefusal(raceId: string, races: readonly Pick<RaceListEntry, 'id'>[]): string {
  const valid =
    races.length === 0 ? 'The archive lists no Race to choose from.' : `Races there are: ${races.map((each) => each.id).join(', ')}.`

  return `No Race with id ${raceId} could be read. ${valid} If it is listed, the read failed and may be retried.`
}
