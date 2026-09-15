/**
 * A Transcription, projected into the arrays the chart stack draws.
 *
 * This is emphatically **not** a Transcription and never round-trips to one. A Transcription is
 * text because `0.0` and `-0.0` and `20.10` are one JavaScript number and none of them renders
 * back as what the file wrote (see `qtvlm.ts`); a chart needs a coordinate, so here the text
 * becomes a number and the bytes are left behind in the Transcription that keeps them. Nothing
 * writes a value from here to the database, and nothing reads one back out expecting the file.
 *
 * Three rules make the projection honest:
 *
 *   1. **A missing value stays missing.** `Number('')` is 0 and `Number(null)` is 0, and either
 *      would put a boat on the equator or a wind angle dead ahead. Null in, null out, and the
 *      charts draw a break rather than a point.
 *   2. **Row Quality rides along per row.** A **Dropout** draws a flat line on a chart and
 *      *nothing at all* on a map — the boat sits at one pixel — so both charts need to know which
 *      rows are Frozen in order to break their line and ring their points (ADR 0014). Row Quality
 *      is computed over the whole Transcription before any window is applied (ADR 0009), which is
 *      why it is passed in rather than derived from whatever subset a chart is showing.
 *   3. **Signedness is a fact about the file, not about the visible rows.** qtVlm writes `TWA`
 *      negative to port; a race sailed entirely on starboard carries no negative value anywhere in
 *      its window. The flag is therefore read over every row of the recording, so cropping the
 *      window never rescales the y-axis under the sailor (ADR 0014).
 *
 * Times are absolute naive wall-clock seconds, in the recording's own frame, with no conversion
 * of any kind. Chicago-local is a rendering of the same digits and happens in the UI.
 */

import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  RaceChannelKey,
  RaceChartSeries,
  Transcription,
  TranscriptionQuality,
  TranscriptionRow,
} from '@/types'

/**
 * The four channels the swappable chart offers, in pill order, and what each one actually is.
 *
 * `awa` reads the file's own `AWA (calc)` column and says so: the boat never measured an apparent
 * wind angle, qtVlm computed one, and the column name is the evidence (ADR 0008, ADR 0014). `twa`
 * reads `TWA` and never `TWA (calc)`, which Layline transcribes and reads nowhere.
 */
export const RACE_CHANNELS: readonly {
  key: RaceChannelKey
  /** The field of a Transcription row this comes from. */
  field: keyof Pick<TranscriptionRow, 'sog' | 'tws' | 'twa' | 'awa_calc'>
  label: string
  unit: string
  /** The qtVlm header, verbatim, so the provenance line can name it. */
  source_column: string
  /** Angles wrap and share one fixed scale; speeds scale to the file. */
  kind: 'speed' | 'angle'
  /** One sentence about where the number came from — never a badge per value (ADR 0008). */
  provenance: string
}[] = [
  {
    key: 'sog',
    field: 'sog',
    label: 'SOG',
    unit: 'kt',
    source_column: 'SOG',
    kind: 'speed',
    provenance:
      'Speed over ground, from GPS. Progress across the seabed rather than through the water, so a current is in it.',
  },
  {
    key: 'tws',
    field: 'tws',
    label: 'TWS',
    unit: 'kt',
    source_column: 'TWS',
    kind: 'speed',
    provenance:
      'True wind speed as the instruments reported it, never adjusted. Where STW and CTW are blank the figure was computed from GPS instead, and those stretches are washed blue.',
  },
  {
    key: 'twa',
    field: 'twa',
    label: 'TWA',
    unit: '°',
    source_column: 'TWA',
    kind: 'angle',
    provenance:
      'True wind angle as reported, signed negative to port. The file also carries a TWA (calc) column, which Layline stores and reads nowhere.',
  },
  {
    key: 'awa',
    field: 'awa_calc',
    label: 'AWA',
    unit: '°',
    source_column: 'AWA (calc)',
    kind: 'angle',
    provenance:
      'Apparent wind angle. The boat never measured it — qtVlm calculated it, and the column name says so. Stored exactly as the file gives it and labelled a calculation wherever it is shown.',
  },
]

/** The channel a key names, for a chart that has only the key. */
export function raceChannel(key: RaceChannelKey): (typeof RACE_CHANNELS)[number] {
  const found = RACE_CHANNELS.find((channel) => channel.key === key)
  if (!found) throw new TypeError(`no such channel: ${JSON.stringify(key)}`)
  return found
}

/**
 * A recorded value as a coordinate, or absent.
 *
 * Absent covers two cases and both draw as a break: the instrument said nothing, and — which
 * cannot happen for a Transcription the parser produced, since it refuses anything Postgres
 * `numeric` would not give back — a value that is not a finite number. A `NaN` reaching an SVG
 * path silently swallows the whole polyline, so the break is both honest and the safer failure.
 */
function coordinate(recorded: string | null): number | null {
  if (recorded === null) return null

  const value = Number(recorded)
  return Number.isFinite(value) ? value : null
}

/** Whether any row writes this channel negative, which is what makes its axis −180..180. */
function isSigned(values: readonly (number | null)[]): boolean {
  return values.some((value) => value !== null && value < 0)
}

/**
 * The arrays the chart stack reads, over the whole recording.
 *
 * The **whole** recording, deliberately: cropping here would be cropping the ghost track the
 * scrub erases to, and the sailor could no longer see the transit they are cropping away.
 *
 * `quality` must be the assessment of these same rows in this same order — it is passed rather
 * than computed so that one assessment serves the charts, the coverage figures and the notes,
 * and so that it is unmistakably the assessment over the whole Transcription (ADR 0009).
 */
export function raceChartSeries(
  transcription: Pick<Transcription, 'rows' | 'first_row_time' | 'last_row_time'>,
  quality: TranscriptionQuality
): RaceChartSeries {
  const { rows } = transcription

  if (quality.rows.length !== rows.length) {
    throw new TypeError(
      `Row Quality describes ${quality.rows.length} rows and the Transcription has ${rows.length}; ` +
        'the charts would mark the wrong rows Frozen'
    )
  }

  const channels = {} as Record<RaceChannelKey, (number | null)[]>
  const signed = {} as Record<RaceChannelKey, boolean>

  for (const channel of RACE_CHANNELS) {
    const values = rows.map((row) => coordinate(row[channel.field]))
    channels[channel.key] = values
    // A speed is never drawn below zero, so asking the question of one would only invite a
    // negative axis on a file with a bad sample in it.
    signed[channel.key] = channel.kind === 'angle' && isSigned(values)
  }

  return {
    first_row_time: transcription.first_row_time,
    last_row_time: transcription.last_row_time,
    row_seconds: rows.map((row) => wallClockSeconds(row.row_time)),
    latitude: rows.map((row) => coordinate(row.latitude)),
    longitude: rows.map((row) => coordinate(row.longitude)),
    channels,
    signed,
    frozen: quality.rows.map((row) => row.frozen),
    not_water_referenced: quality.rows.map((row) => row.not_water_referenced),
    low_speed: quality.rows.map((row) => row.low_speed),
    dropout_channels: quality.dropout_channels,
  }
}

/**
 * The one time axis the map's rail and the chart's handles both drag along.
 *
 * There are not two scrubbers, so there cannot be two axes: both charts read this, which is what
 * makes a drag on either one land in the same place rather than merely look as though it did.
 *
 * **Not clamped to the file.** The bounds are padded by a tenth of the recording's span, and by at
 * least ten minutes, precisely because a window reaching past the last row is legal and ordinary —
 * a distance race's logger is stopped on the dock. Clamped, the finish handle would jam at the last
 * row and the gap the race has to state would be undraggable.
 *
 * Bounds are the earliest and latest row by *time* and not the first and last by position: a
 * recording whose naive clock steps back an hour has those disagree, and taking file order would
 * put part of the track off the end of the axis.
 */
export interface RaceChartAxis {
  /** The earliest recorded row. */
  first: number
  /** The latest recorded row. */
  last: number
  min: number
  max: number
}

/** The least slack either side of a recording, so a short one still has room to drag into. */
const AXIS_MINIMUM_SLACK_SECONDS = 10 * 60

export function raceChartAxis(series: Pick<RaceChartSeries, 'row_seconds'>): RaceChartAxis {
  const { row_seconds } = series

  // `row_count > 0` is a CHECK on `recordings` and the parser refuses a file with no rows, so this
  // is unreachable through either path into a chart. Handled anyway, because the alternative is an
  // axis of Infinity and an SVG of nothing with no explanation.
  if (row_seconds.length === 0) {
    return {
      first: 0,
      last: 0,
      min: -AXIS_MINIMUM_SLACK_SECONDS,
      max: AXIS_MINIMUM_SLACK_SECONDS,
    }
  }

  const first = Math.min(...row_seconds)
  const last = Math.max(...row_seconds)
  const slack = Math.max((last - first) * 0.1, AXIS_MINIMUM_SLACK_SECONDS)

  return { first, last, min: first - slack, max: last + slack }
}

/** A run of consecutive rows carrying one flag, as the stretch of the axis it covers. */
export interface RaceChartSpan {
  from: number
  to: number
}

/**
 * The runs a boolean flag marks, in axis seconds, so a chart can wash or hatch them.
 *
 * A span runs to the *next* row after the run rather than to its own last row, because what is
 * being drawn is the stretch of time the flag describes: a Dropout's final frozen row is still
 * frozen for the interval that follows it, and stopping the hatch at that row's own instant would
 * leave the last sample of every dropout looking measured. A run that ends the recording has no
 * next row, so it stops where the rows do — which is the honest answer, the file saying nothing
 * about the time after it.
 *
 * File order, deliberately: these are runs of consecutive *rows*, which is what the detector found.
 */
export function raceChartSpans(
  rowSeconds: readonly number[],
  flags: readonly boolean[]
): RaceChartSpan[] {
  const spans: RaceChartSpan[] = []
  let from: number | null = null

  rowSeconds.forEach((seconds, index) => {
    if (flags[index]) {
      if (from === null) from = seconds
      return
    }
    if (from !== null) {
      spans.push({ from, to: seconds })
      from = null
    }
  })

  if (from !== null) {
    spans.push({ from, to: rowSeconds[rowSeconds.length - 1] })
  }

  return spans
}
