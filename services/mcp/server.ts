import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { BOAT_SETUP_LABEL, BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'
import {
  POLAR_PERFORMANCE_DIMENSIONS,
  SAIL_SELECTION_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import { CHANNEL_TITLE, CHECKED_CHANNELS } from '@/services/analysis/instrument-tuning-text'
import { polarDomain } from '@/services/analysis/polar-targets'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { readCalibrationLog, readInstrumentTuning } from '@/services/analysis/readInstrumentTuning'
import { readBoatSetup } from '@/services/boat/readBoatSetup'
import {
  readCrossoverChartScreen,
  readCrossoverChartVersionsWithCharts,
} from '@/services/boat/readCrossoverChartVersions'
import { readInstrumentCalibration } from '@/services/boat/readInstrumentCalibration'
import { readPolarScreen, readPolarVersions } from '@/services/boat/readPolarVersions'
import { readRigTune } from '@/services/boat/readRigTune'
import {
  fetchCHII2,
  fetchCHII2History,
  fetchPurdueBuoy,
  fetchPurdueBuoyHistory,
  isPurdueSeason,
} from '@/services/buoys/ndbc'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import { readRace } from '@/services/races/readRace'
import { readRaces } from '@/services/races/readRaces'
import { analysisFilterSchema, filterFromArgument } from './analysis-filter'
import { currentConditions } from './current-conditions'
import {
  NO_RACES_ANSWER,
  instrumentTuningRaceAnswer,
  instrumentTuningSeasonAnswer,
  unknownRaceRefusal,
} from './instrument-tuning'
import { buoyHistory } from './buoy-history'
import { polarPerformanceAnswer, windWindowFromArgument } from './polar-performance'
import { raceList, raceSummary } from './races'
import { cellFromArgument, sailSelectionAnswer } from './sail-selection'
import {
  boatSetupOverview,
  crossoverChartVersions,
  instrumentCalibrationVersions,
  polarVersions,
  rigTuneVersions,

} from './boat-setup'
import type { BoatSetupKind, McpBoatSetupResult } from '@/types'

/**
 * What the dashboard's own copy tells a sailor about these numbers, told to Claude instead.
 * It is the tool's contract with the model as much as the output shape is (ADR 0042).
 */
const CURRENT_CONDITIONS_DESCRIPTION = `What the wind is doing right now at Layline's two stations off Chicago, exactly as the Layline dashboard shows it.

- Harrison Dever Crib (CHII2) measures wind from an anemometer 85 ft above the water. Report its speed as the 85 ft reading it is, with its note that wind at this height typically reads 20-30% higher than at the surface; never present a surface figure of your own as measured. It is best for direction and trend.
- The Purdue Buoy (45198) measures at the surface and is the best on-water speed when deployed. It is seasonal, May through October; out of season it reports no wind at all, which is not a fault.
- Speeds are knots, directions are degrees true the wind blows FROM.
- Every station carries its Data Status (online, recent, stale, offline, or error if the read failed), the dashboard's own judgement of how fresh it is, and its Staleness: the age of the observation, as the dashboard prints it. Say how old a reading is when it is not online. A null wind means no reading; never fill one in.`

/** The station page's own caveats, told to Claude. Prose, so it is updated by hand (ADR 0042). */
const BUOY_HISTORY_DESCRIPTION = `How the wind has been at one of Layline's two stations off Chicago over a recent stretch, exactly as the Layline station page shows it: every reading in the window, newest first, and the page's Stats panel for that window.

- Harrison Dever Crib (CHII2) measures from an anemometer 85 ft above the water, and its gusts come off the same anemometer. Report its readings as the 85 ft figures they are, with its note that wind at this height typically reads 20-30% higher than at the surface; never present a surface figure of your own as measured. It is best for direction and trend.
- The Purdue Buoy (45198) measures at the surface and is seasonal, May through October; out of season it has no history at all, which is not a fault.
- Readings are as recorded, every ten minutes or so. Speeds and gusts are knots, directions degrees true the wind blows FROM, wave height feet. Gust and wave height appear only where the station page shows them; a null one is a moment the station reported none, so never fill it in from a neighbour.
- windowStats is derived by Layline from those readings, the figures the Stats panel prints: mean direction (vector-averaged), mean speed, the speed range, and the veer/back spread (twice the largest swing of any reading either side of that mean direction). It is null when the window holds fewer than three readings, where the page says "No data in window."
- Every answer carries its Data Status (online, recent, stale, offline, or error if the read failed) and its Staleness, the age of the newest reading as the dashboard prints it. Say how old the readings are when the station is not online.`

const LIST_RACES_DESCRIPTION = `Every Race in Layline's archive of this boat's recorded races, newest first, with what identifies each and how well it was recorded.

- A Race is named by the title the sailor gave it, which may be null: an untitled Race is normal, so call it by its day rather than inventing a name. The archive records no separate occasion; anything like "weeknight series" or "distance race" is only ever in the title.
- Times are the recording's own clock, exactly as logged, with no time zone. day and weekday are read from the window's start.
- Coverage is time, never rows, each as seconds with the screens' own wording: window is the race the sailor set, logged the part the recording's rows span (a dead, frozen feed included), and countable the part every performance figure reads (not frozen, not below the speed gate, not mid-maneuver). A Race whose countable time is a small share of its window is a thin one; say so when you use it.
- Pass a Race's id to race_summary for its figures.`

const RACE_SUMMARY_DESCRIPTION = `One Race as its page in Layline states it, computed by the same functions from the same read: aggregates only, never the recording's rows.

- boatSetup is the Polar, Crossover Chart, Rig Tune and Instrument Calibration Versions the Race was sailed under, frozen when it was recorded. Null means not recorded, which many older Races legitimately are; never assume the boat's current Version.
- coverage is time, never rows, as the page's coverage readout states it. recorded is live, measured sailing; frozen is a dead instrument feed repeating its last row, not a boat sitting still; beforeFirstRow and afterLastRow are parts of the window the recording never reached. list_races' logged spans live and frozen rows alike, so it is larger than recorded on a Race with a dropout. findings are the page's own notes about the recording; pass them on.
- testimony is what the sailor recorded: each sail change and each sea state, with its time, in the race page's own words. A sail is named in the Crossover Chart Version the Race was sailed under; an entry with no sail named is only its note, so never put a chart sail to it. An empty list means nobody wrote that down, not that nothing changed: say "not recorded". Sea state is the sailor's own reading of the water, not a buoy measurement.
- maneuvers are TWA sign flips the detector classified as tacks, gybes and roundings. A recording at roughly thirty-second resolution holds a maneuver in one or two rows: count them, but do not state what one cost.
- performance is Polar Efficiency (speed over the ground against the Race's own Polar) and VMG Efficiency, over countable time only. fillerAnchoredShare is how much of each figure is compared against a cell the Polar manufactured rather than measured: state it beside the figure whenever it is above zero, never drop the figure for it. Target VMG is estimated, per its caveat. Where there is no figure, note says why.`

/** The Boat Management screens' own caveats, told to Claude. Prose, so it is updated by hand (ADR 0042). */
const BOAT_SETUP_DESCRIPTION = `The boat's Boat Setup exactly as Layline's Boat Management screens state it: the four artifacts a Race is sailed under (Polar, Crossover Chart, Rig Tune, Instrument Calibration), and every Version of each.

- With no arguments: the boat and each artifact's Version in force. current null means not recorded, which is a real answer about the boat, not a fault.
- With an artifact: every Version of it, newest first, or with version the one Version of that number. race_summary names the Versions a Race was sailed under by number: pass that number here to open the Version the Race holds, which is often not the one in force now. Never answer for a Race from the current Version.
- Every Version carries its effectiveFrom (the calendar date the sailor says it took effect), its note, and inForce.
- rig_tune: each Version's change reason and its Wind Bands up the wind axis. A band's range, label and note are the tuning guide's words; label is never the dashboard's light/medium/heavy wind classification. Every shroud position is stated port and starboard, both as the Turnbuckle Gap in mm and as Turns From Base (signed half turns, counted from the Base Tune). Neither derives from the other, since no thread pitch is recorded, so never convert one to the other. gapsStale means the Base Tune was re-measured after that band was, so its Gaps describe a rig that no longer exists while its Turns still hold; say so, and never recompute a Gap.
- instrument_calibration: each Version's figures per channel in the TL-25 display's own encoding, exactly as transcribed: a multiplier reads 1.02, not +2%, and each channel corrects a reading as multiplier × reading + offset. AWA and HDG take an offset alone ("no multiplier"), which is not a missing figure. changes is what that Version moved against the one before it. With every Version, calibrationLog is the dated history, newest first, of Version changes and Calibration Events (acts such as an autocompensation that changed no programmed figure). That log answers when a channel was last recalibrated.
- crossover_chart: each Version's Sail Definitions by number and label, and how many chart cells call for each; a sail no cell calls for is "never recommended", which is legal. sailDefinitions null means that Version's stored chart can no longer be read.
- polar: each Version's number, date, note and file, but never the grid. Never work out a target or an efficiency from a Polar: the season's efficiency is polar_performance's and a Race's is in race_summary, each stated as its screen states it.`

const POLAR_PERFORMANCE_DESCRIPTION = `Season Polar Efficiency and VMG Efficiency over the boat's race archive, narrowed by the Analysis Filter, exactly as Layline's Polar performance screen states them.

- Polar Efficiency is total distance sailed over the distance the Polar's Target Speed implies, across all the scored sailing the filter matches; VMG Efficiency is the same for VMG against Target VMG. Each race's sailing is scored against the Polar that race was sailed under. Report them as the percentages given.
- The two headline figures blend every wind speed the filter matches. Each moment is scored against its own wind's target, but one percentage over all winds can hide that the boat is 110% of target at 4 knots and 50% at 12. Never present the headline figures as any wind band's.
- To answer about a wind range, pass windWindow: the Polar performance screen's own wind window, a centre in whole knots and a width of 2, 4 or 6 (windWindowOptions in every answer says which centres the Polar allows). 10-14 knots is { centre: 12, width: 4 }. The window has its own Polar Efficiency over the sailing inside it (the screen prints it under the window, as reading; there is no VMG figure for a window, because VMG collapses at the beam by definition), the Polar columns that sailing was scored against, and its patches: 5 degrees of |TWA| by half a knot of SOG, each with its own percent of target, time, races and Filler-Anchored share. Compare patches only within one window, and call again for another band rather than merging windows. Port and starboard are not told apart.
- The filter offers the screen's five dimensions: point of sail, sail used, sea state, time of day and when. Wind speed is not one of them; on the screen the wind window owns that axis.
- A dimension left out includes everything, Not recorded included. Naming buckets narrows to exactly those. Sails are named by their Sail Definition label, never a number; every answer lists each dimension's valid buckets.
- Every answer carries its Coverage Ledger: how much sailing time matched, how much of it was scored, what was excluded and why, and how much has no Sea State or Sail Configuration recorded. Each figure also states its own scored time; VMG Efficiency can rest on less than Polar Efficiency. State how much sailing is behind a figure, especially when it is little.
- A figure may be Filler-Anchored: part of it is compared against Polar cells the Polar manufactured rather than measured. Give the figure and say what share is Filler-Anchored; do not withhold it.
- Target VMG is estimated from the Polar's grid, not the certificate's own optimum.
- A null figure means nothing in the match could be scored; never fill one in.`

/** The Sail Selection Screen's own caveats, told to Claude. Prose, so it is updated by hand (ADR 0042). */
const SAIL_SELECTION_DESCRIPTION = `The boat's race archive laid over its own Crossover Chart, exactly as Layline's Sail Selection screen states it: whether the sail the crew carried was the one the chart calls for, cell by cell, narrowed by the Analysis Filter.

- Cell Agreement is something to look at, never a verdict that the chart is wrong, nor that the crew was. A cell where the crew carried something else is a cell worth a conversation: the chart may not fit the boat there, or the crew may have had a reason. Never say the chart is wrong.
- The grid is the Crossover Chart Version in force (crossoverChart.version): cells are named by the chart's own axis values, an angle (|TWA|, degrees) and a wind speed (TWS, knots), and each cell runs from its axis value up to the next one. Agreement is the integer Sail Definition comparison the screen makes, never a match on sail names.
- Each row of sailing in a cell is one of five verdicts: agrees, differs, not-recorded (nobody wrote down the sail), off-chart (a sail the chart has no word for; never disagreement) or other-version (sailed under another Crossover Chart Version, so its sail numbers mean something else and it is not judged). A cell's Cell Agreement reads them together, and adds mixed for a cell with both agreeing and differing rows. Every verdict comes with its share of the cell's sailing: give the share ("two thirds agreed"), not just "mixed". Not recorded and Off-chart are never Differs.
- With no cell: chartAgreement (the share of judgeable sailing, agrees plus differs, that carried what its own cell calls for, and each side's own percent of target, side by side; never subtract them into a finding), then every region of the chart as the Chart layer outlines it (cells of one sail joined edge to edge, named by that sail; two regions of one sail are told apart by region number), each with its own Cell Agreement and its cells. judgeableShare is how much of the placed sailing recorded its sail at all: state it, because half an archive can be unannotated.
- With a cell: that cell's sheet, its figures and the screen's own sentences (statement), and its breakdown by the sail actually carried, by Sea State and by time of day, each line with its own percent of target over its own rows. The sail carried is listed only here, which is why the filter has no sail dimension.
- A cell nobody sailed in under the filter is unreached, with its reason: a narrowing emptied it, or no race has ever reached it. noTargetReason is different: a cell outside the Polar's axes can never hold a percent of target, however much it is sailed.
- Verdict words are in words, once per answer. grid.placement is the screen's note on matched sailing no cell holds.
- polarEfficiency is total distance over Target Speed distance across the cell's scored sailing, with its scored time. Give a Filler-Anchored share beside the figure when above zero, never withhold the figure for it. A null figure means nothing there could be scored; never fill one in.
- The filter offers the screen's five dimensions: wind speed, point of sail, sea state, time of day and when. A dimension left out includes everything, Not recorded included. Every answer carries its Coverage Ledger and lists each dimension's valid buckets; state how much sailing is behind a figure, especially when it is little.`

/** The Instrument Tuning screen's and a Race page's own caveats, told to Claude (ADR 0042). */
const INSTRUMENT_TUNING_DESCRIPTION = `What the boat's race archive says about its instruments, exactly as Layline's Instrument Tuning screen and a Race page's calibration check state it: the compass (HDG, via COG), the wind angle tack to tack (the Apparent Wind Asymmetry) and boat speed (the paddlewheel, STW, against GPS SOG), read in that order because compass deviation propagates into the other two.

- Over every Race in the archive. This screen has no filter yet, so nothing can be narrowed by wind or sea state; say so if asked.
- Findings are evidence about the instruments, never a calibration. No figure here is a value to set an instrument to, and none has been applied: a calibration is something the owner does on the boat and records (boat_setup's instrument_calibration). Never suggest a multiplier, offset or percentage.
- Every figure belongs to one Calibration Era: a stretch of that channel's life between two entries in the Calibration Log, cut per channel, so HDG and STW Eras need not line up. Never combine figures from two Eras. openedBy is what was done to the boat on the day an Era opens.
- Coverage is how much evidence a figure rests on, SOLID, THIN or ANECDOTAL with the reason, and never whether the instrument is right. Give the word with its reason whenever you give a figure.
- Each channel's headline is what the screen's season row shows: the current Era for the compass and boat speed, all Races pooled for wind angle. thinnest is the weakest coverage of the three.
- Each Era also carries everything its chart shows when tapped, in the chart's own words: what a sailor can find on the screen, you can find here. Races are named as the charts name them (day, then the sailor's title); a Race that produced no figure is listed with the chart's reason, never dropped. The recording's rows themselves are never given, only what the charts state of them.
- Compass: the swing between the highest and lowest heading's offset leads; a single mean of a curve matches no heading the compass shows, so give the two means only beside the swing, each with its weighting. headings is all 36 10° headings from north, each with the Races behind it and each Race's own reading there; a Race under three rows at a heading is listed as not counted. A heading resting on one Race is that Race's heading mix, not the Era's.
- Wind angle: upwind and downwind separately, each saying which tack reads wider, with the angle each tack held. Never average them: they can lean opposite ways. leaning is the dial's sentence on what their agreement does and does not imply; a side flagged tooFewToLeanOn is to be said so. It is not a Measured Offset and names no channel to adjust. season is the one figure that spans Era boundaries; eras are cut on AWA's own Log, compassEras on HDG's, for asking whether the asymmetry is compass-driven. tackPairs is every pair behind a figure, as the dial lists them.
- Boat speed: the fitted line's gap from 1:1 at 4 and 6 kt, and recalibration, the card's verdict on whether the paddlewheel needs recalibrating. Report the verdict's headline and detail as given; it says whether, never by how much. Behind it: bands, each knot of STW with its verdict, how many Races lean its way and each Race's gap (said as slow or fast, never signed); checklist, the five questions the verdict rests on, answered; headingSectors (eight of 45°, 0 centred on north, clockwise) and drift, the readings that rule out current and weed. fits is the Scatter's line both ways it can be fitted, each with its R², its readout and its per-knot gap against the rows': the method changes the line, never the verdict. meanGapKnots is SOG − STW, a signed reading of the drawn figures, not a correction.
- With race: that one Race's check, as its page's tile shows it, each channel with the Era the Race was sailed in. One Race is thin evidence for any instrument whatever its share; share is the tile's bar.
- Every finding carries its caveat. Pass it on when it changes what the figure means.`

/** What a tool answers when the archive could not be read whole: an error, never a figure. */
const ARCHIVE_UNREADABLE =
  'The race archive could not be read, so there is no figure to give. This is not the same as having no races.'

/** A Race's Era cannot be named without the whole Log, so a failed one is an error too. */
const CALIBRATION_LOG_UNREADABLE =
  'The Calibration Log could not be read, so no Era can be named for this Race and nothing is given. Try again shortly.'

/**
 * A tool's answer as both forms MCP carries: JSON text for a client that reads only text, and the
 * same object as structured content.
 */
function answer(value: object): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: { ...value } }
}

/** A refusal Claude reads as a failed call, never as an answer about the archive or the boat. */
function refusal(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

function toolResult<Answer extends object>(result: McpBoatSetupResult<Answer>): CallToolResult {
  return result.ok ? answer(result.answer) : refusal(result.refusal)
}

/** One artifact's screen, read through the caller's client and shaped by `boat-setup`. */
async function artifactVersions(
  artifact: BoatSetupKind,
  version: number | undefined,
  supabase: SupabaseClient
): Promise<CallToolResult> {
  switch (artifact) {
    case 'polar':
      return toolResult(polarVersions(await readPolarVersions(supabase), version))
    case 'crossover_chart':
      return toolResult(crossoverChartVersions(await readCrossoverChartVersionsWithCharts(supabase), version))
    case 'rig_tune':
      return toolResult(rigTuneVersions(await readRigTune(supabase), version))
    case 'instrument_calibration':
      return toolResult(instrumentCalibrationVersions(await readInstrumentCalibration(supabase), version))
  }
}

/**
 * A fresh server per request: the endpoint is stateless (ADR 0042), so nothing a server holds
 * outlives the one request it answers.
 *
 * Every tool is read-only, and the buoy services are the dashboard's own, cache included, so a
 * tool call adds no upstream request the screen would not have made.
 *
 * The archive and boat tools read through `supabase`, the client built from the caller's own token, so
 * row-level security decides what they see exactly as it does for a screen. Never the service role.
 */
export function createLaylineMcpServer({ supabase }: { supabase: SupabaseClient }): McpServer {
  const server = new McpServer({ name: 'layline', version: '0.1.0' })

  server.registerTool(
    'current_conditions',
    {
      title: 'Current Conditions',
      description: CURRENT_CONDITIONS_DESCRIPTION,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const [chii2, purdue] = await Promise.all([fetchCHII2(), fetchPurdueBuoy()])
      return answer(currentConditions({ chii2, purdue, now: new Date(), purdueInSeason: isPurdueSeason() }))
    }
  )

  server.registerTool(
    'buoy_history',
    {
      title: 'Buoy History',
      description: BUOY_HISTORY_DESCRIPTION,
      inputSchema: {
        station: z
          .enum(['CHII2', '45198'])
          .describe('CHII2 for the Harrison Dever Crib, 45198 for the Purdue Buoy.'),
        window: z
          .enum(Object.keys(TIME_SCALES) as [TimeScale, ...TimeScale[]])
          .default('1h')
          .describe(
            `How far back from now, as the station page's time scales: ${Object.entries(TIME_SCALES)
              .map(([id, scale]) => `${id} (${scale.label})`)
              .join(', ')}. The page opens on 1h.`
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ station, window }) => {
      const history = station === 'CHII2' ? await fetchCHII2History() : await fetchPurdueBuoyHistory()
      return answer(
        buoyHistory({ station, history, window, now: new Date(), purdueInSeason: isPurdueSeason() })
      )
    }
  )

  server.registerTool(
    'list_races',
    {
      title: 'Races',
      description: LIST_RACES_DESCRIPTION,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const [races, archive] = await Promise.all([readRaces(supabase), readAnalysisArchive(supabase)])
      const list = raceList(races, archive)

      return list.ok
        ? answer({ races: list.races })
        : refusal('The race archive could not be read in full, so no list is given. Try again shortly.')
    }
  )

  server.registerTool(
    'race_summary',
    {
      title: 'Race summary',
      description: RACE_SUMMARY_DESCRIPTION,
      inputSchema: { race: z.string().describe("The Race's id, as list_races gives it.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ race: raceId }) => {
      const race = await readRace(raceId, supabase)

      // A missing Race, one RLS hides and one that could not be read whole are one answer, as on
      // the page: there is no Race here to summarise, and never part of one.
      return race === null
        ? refusal(
            `No Race with id ${raceId} could be read. Check the id against list_races; if it is listed, the read failed and may be retried.`
          )
        : answer(raceSummary(race))
    }
  )

  server.registerTool(
    'polar_performance',
    {
      title: 'Polar performance',
      description: POLAR_PERFORMANCE_DESCRIPTION,
      inputSchema: {
        filter: analysisFilterSchema(POLAR_PERFORMANCE_DIMENSIONS),
        windWindow: z
          .object({
            centre: z.number().describe('Centre of the wind window, in whole knots of TWS.'),
            width: z.number().describe('Width of the window in knots: 2, 4 or 6.'),
          })
          .optional()
          .describe(
            "The screen's wind window. TWS from centre - width/2 inclusive to centre + width/2 exclusive."
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ filter, windWindow }) => {
      // All or nothing (ADR 0026): a short archive would make the Coverage Ledger the wrong part.
      const archive = await readAnalysisArchive(supabase)
      if (archive === null) return refusal(ARCHIVE_UNREADABLE)

      const dimensions = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, archive.vocabulary)
      const reading = filterFromArgument(filter, dimensions)
      if (!reading.ok) return refusal(reading.message)

      const window = windWindow === undefined ? null : windWindowFromArgument(windWindow, archive.polars)
      if (window !== null && !window.ok) return refusal(window.message)

      return answer(
        polarPerformanceAnswer(archive.rows, reading.filter, dimensions, archive.polars, window?.window ?? null)
      )
    }
  )

  server.registerTool(
    'sail_selection',
    {
      title: 'Sail selection',
      description: SAIL_SELECTION_DESCRIPTION,
      inputSchema: {
        filter: analysisFilterSchema(SAIL_SELECTION_DIMENSIONS),
        cell: z
          .object({
            twa: z.number().describe("The cell's angle, one of the chart's TWA axis values, in degrees."),
            tws: z.number().describe("The cell's wind speed, one of the chart's TWS axis values, in knots."),
          })
          .optional()
          .describe(
            'One cell, for its breakdown. Omit it for the whole chart. Every answer gives the axes as crossoverChart.'
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ filter, cell }) => {
      // All or nothing (ADR 0026), and the three reads the screen makes, in one wave.
      const [archive, chart, polar] = await Promise.all([
        readAnalysisArchive(supabase),
        readCrossoverChartScreen(supabase),
        readPolarScreen(supabase),
      ])
      if (archive === null) return refusal(ARCHIVE_UNREADABLE)

      const current = chart?.current ?? null
      if (current === null) {
        return refusal(
          'No Crossover Chart could be read: none has been uploaded, or the read failed. The Sail Selection screen is the chart, so there is nothing to lay the archive over.'
        )
      }

      const dimensions = analysisDimensions(SAIL_SELECTION_DIMENSIONS, archive.vocabulary)
      const reading = filterFromArgument(filter, dimensions)
      if (!reading.ok) return refusal(reading.message)

      const target = cell === undefined ? null : cellFromArgument(cell, current.payload)
      if (target !== null && !target.ok) return refusal(target.message)

      return answer(
        sailSelectionAnswer(
          archive.rows,
          reading.filter,
          dimensions,
          { payload: current.payload, versionId: current.id, versionNumber: current.version_number },
          // A failed Polar read loses only the claim that a cell can never hold a figure, as on
          // the screen: each row's Target Speed came from its own Race's Polar.
          polar?.current == null ? null : polarDomain(polar.current.payload),
          target?.cell ?? null
        )
      )
    }
  )

  server.registerTool(
    'instrument_tuning',
    {
      title: 'Instrument tuning',
      description: INSTRUMENT_TUNING_DESCRIPTION,
      inputSchema: {
        channel: z
          .enum(CHECKED_CHANNELS)
          .optional()
          .describe(
            `One channel: ${CHECKED_CHANNELS.map((each) => `${each} (${CHANNEL_TITLE[each]})`).join(
              ', '
            )}. Omit it for all three.`
          ),
        race: z
          .string()
          .optional()
          .describe("One Race's id, as list_races gives it, for its own check. Omit it for the season."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ channel, race: raceId }) => {
      if (raceId !== undefined) {
        const [race, log] = await Promise.all([readRace(raceId, supabase), readCalibrationLog(supabase)])
        if (race === null) return refusal(unknownRaceRefusal(raceId, await readRaces(supabase)))
        if (log === null) return refusal(CALIBRATION_LOG_UNREADABLE)

        return answer(instrumentTuningRaceAnswer(race, log, channel))
      }

      // All or nothing (ADR 0026): a season over the Races that happened to load would present as
      // the whole season, and its coverage verdicts would be claims about evidence it did not have.
      const read = await readInstrumentTuning(supabase)
      if (!read.ok) return read.reason === 'no-races' ? answer(NO_RACES_ANSWER) : refusal(ARCHIVE_UNREADABLE)

      return answer(instrumentTuningSeasonAnswer(read.season, read.races, channel))
    }
  )

  const artifacts = BOAT_SETUP_ORDER.join(', ')

  server.registerTool(
    'boat_setup',
    {
      title: 'Boat Setup',
      description: BOAT_SETUP_DESCRIPTION,
      inputSchema: {
        artifact: z
          .enum(BOAT_SETUP_ORDER)
          .optional()
          .describe(
            `Which artifact: ${BOAT_SETUP_ORDER.map((kind) => `${kind} (${BOAT_SETUP_LABEL[kind]})`).join(
              ', '
            )}. Omit it for the boat and every artifact's Version in force.`
          ),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'One Version of the artifact, by its number, as race_summary names it. Omit it for every Version.'
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ artifact, version }) => {
      if (artifact === undefined) {
        return version === undefined
          ? toolResult(boatSetupOverview(await readBoatSetup(supabase)))
          : refusal(`A Version is a Version of one artifact. Name it as well: one of ${artifacts}.`)
      }

      return artifactVersions(artifact, version, supabase)
    }
  )

  return server
}
