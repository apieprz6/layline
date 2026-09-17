// Weather and wind data types
export interface WindForecast {
  source: string // 'NOAA', 'Windy', 'PredictWind', etc.
  timestamp: string
  speed: number // knots
  direction: number // degrees
  gust?: number // knots
  confidence?: number // 0-1
}

// Data source status states
export type DataSourceStatus = 'online' | 'recent' | 'stale' | 'offline' | 'error'

// Buoy metadata for context (never modify raw data)
export interface BuoyMetadata {
  station: string
  source: 'ndbc'
  location: {
    latitude: number
    longitude: number
  }
  windMeasurementHeight: number // feet above water
  adjustmentNote?: string // Context for interpretation (e.g., "Wind measured at 85ft typically reads 20-30% higher than surface")
}

// Core buoy data structure (raw measurements preserved)
export interface BuoyData {
  buoyId: string
  name: string
  timestamp: string
  windSpeed: number // knots (raw, unmodified)
  windDirection: number // degrees (raw, unmodified)
  windGust?: number // knots
  waveHeight?: number // feet
  wavePeriod?: number // seconds
  airTemp?: number // fahrenheit
  waterTemp?: number // fahrenheit
  pressure?: number // mb
  metadata: BuoyMetadata
}

// Result wrapper with status calculation
export interface BuoyDataResult {
  data: BuoyData | null
  status: DataSourceStatus
  fetchedAt: string // ISO timestamp of last successful fetch
  error?: string
}

// NDBC real-time text format response
export interface BuoyApiResponse {
  stationId: string
  timestamp: string
  windDirection: number // degrees
  windSpeed: number // m/s (will be converted to knots)
  windGust?: number // m/s
  waveHeight?: number // meters
  dominantWavePeriod?: number // seconds
  airTemp?: number // degC (will be converted to °F)
  waterTemp?: number // degC
  pressure?: number // hPa (will be converted to mb)
}

// In-memory cache entry
export interface BuoyCacheEntry {
  data: BuoyData
  fetchedAt: number // Unix timestamp in milliseconds
}

export interface WeatherModel {
  name: string
  windForecasts: WindForecast[]
  lastUpdated: string
}

// Race strategy types
export interface CourseRecommendation {
  courseName: string // e.g., "Windward-Leeward", "Triangle"
  probability: number // 0-1
  reasoning: string
}

export interface RigSetup {
  tension: 'light' | 'medium' | 'heavy'
  backstay: string
  cunningham: string
  outhaul: string
  reasoning: string
}

export interface SailTrim {
  conditions: 'light' | 'medium' | 'heavy'
  jibSheet: string
  mainSheet: string
  traveler: string
  vangTension: string
  reasoning: string
}

export interface TacticalAdvice {
  windShiftExpected: boolean
  shiftTiming?: string
  favoredSide?: 'left' | 'right' | 'middle'
  seaStateImpact: string
  strategyNotes: string[]
}

export interface RaceBriefing {
  generatedAt: string
  /** The Target Time this briefing was anchored to (ISO 8601), or null for a current-conditions briefing */
  targetTime: string | null
  courseRecommendations: CourseRecommendation[]
  rigSetup: RigSetup
  sailTrim: SailTrim
  tactical: TacticalAdvice
  rawDataSummary: string
  confidence: number // 0-1
}

// Database types

// A Role governs writes only, and is never null: every account starts as a viewer and
// admin is granted by hand through Supabase. See docs/adr/0017 and docs/adr/0019.
export type UserRole = 'admin' | 'viewer'

export interface User {
  id: string
  email: string
  role: UserRole
  createdAt: string
}

export interface RaceEvent {
  id: string
  name: string
  date: string
  location: string
  startTime: string
}

// User preferences types (JSONB structure)
export interface DataSourcePreference {
  enabled: boolean
  displayName: string
}

export interface UserPreferences {
  dataSources: {
    chii2: DataSourcePreference
    45198: DataSourcePreference
  }
  /**
   * The sailor's chosen theme, so that a choice made on the phone is there on the
   * laptop. Optional because absent and `auto` are different facts: `auto` is a
   * choice — follow civil twilight at Navy Pier — and absent means this sailor has
   * never chosen on any device, which is every row that predates the field.
   * `localStorage` remains the browser's own copy and answers first paint.
   */
  theme?: ThemePreference
}

export interface Profile {
  id: string
  user_id: string
  display_name: string | null
  role: UserRole
  preferences: UserPreferences
  created_at: string
  updated_at: string
}

/**
 * The signed-in sailor: an email address — their Google one, since that is what
 * signs in — and the parts of their one **Profile** the app reads. `null` in
 * place of an Account means a **Guest**.
 *
 * Resolved on the server and passed down as a prop; client code never assembles
 * one (ADR 0018). The email comes from the verified JWT and everything else from
 * `profiles`, so the two stay distinct rather than blended. `displayName` is
 * null whenever Google gave no name, and is never filled in from the address.
 */
export interface Account {
  userId: string
  email: string
  displayName: string | null
  /** Governs writes only, and is shown nowhere in the drawer (ADR 0019, ADR 0021). */
  role: UserRole
}

// Buoy history types

// Canonical wind data point with absolute timestamp
export interface WindDataPoint {
  timestamp: string // ISO 8601 format (e.g., "2026-05-19T17:50:00Z")
  spd: number // wind speed in knots
  dir: number // wind direction in degrees
}

// Wind data point with calculated relative time offset (for component use)
export interface WindDataPointWithOffset extends WindDataPoint {
  minsAgo: number // calculated minutes ago from reference time
}

// DEPRECATED: Use WindDataPoint with absolute timestamps instead
export interface HourlyDataPoint {
  time: string // HH:MM format (e.g., "14:00")
  spd: number // wind speed in knots
  dir: number // wind direction in degrees
}

// DEPRECATED: Use WindDataPoint with absolute timestamps instead
export interface MinuteDataPoint {
  minsAgo: number // minutes ago from now (e.g., 0, 10, 20, ...)
  spd: number // wind speed in knots
  dir: number // wind direction in degrees
}

// Row shape returned by Supabase `purdue_buoy_readings` table queries
export interface PurdueBuoyRow {
  timestamp: string
  wind_speed: number
  wind_direction: number | null
}

export interface BuoyHistoryData {
  buoyId: string
  name: string
  history: WindDataPoint[] | null // 10-minute interval measurements (up to 72h), null if unavailable
  status: DataSourceStatus
  fetchedAt: string
  error?: string
  // DEPRECATED fields (maintained for backwards compatibility, will be removed in future version)
  hourlyHistory?: HourlyDataPoint[] | null
  minuteHistory?: MinuteDataPoint[] | null
  extendedHistory?: MinuteDataPoint[] | null
}

// Window statistics for aggregate wind analysis
export interface WindowStats {
  meanDir: number // Vector-averaged direction (0-360°)
  meanSpd: number // Arithmetic mean speed (knots)
  spdMin: number // Minimum speed in window
  spdMax: number // Maximum speed in window
  spread: number // Veer/back angular spread (degrees)
  count: number // Number of data points
}

// Weather model forecast types

// Supported weather model identifiers
export type ModelId = 'gfs' | 'hrrr' | 'ecmwf'

// Geographic location for weather forecasts
export interface ForecastLocation {
  latitude: number
  longitude: number
  name: string
}

// Single forecast data point
export interface ForecastPoint {
  timestamp: string // ISO 8601 format
  windSpeed: number // knots
  windDirection: number // degrees (0-360)
  windGust?: number // knots
  temperature?: number // fahrenheit
  pressure?: number // mb
}

// Complete weather model forecast result
export interface WeatherModelResult {
  modelId: ModelId
  location: ForecastLocation
  forecastPoints: ForecastPoint[]
  generatedAt: string // Model run time (ISO 8601)
  fetchedAt: string // API fetch time (ISO 8601)
  status: DataSourceStatus // Data source status (online/recent/stale/offline/error)
  error?: string // Error message if status is 'error'
}

// In-memory cache entry for weather model forecasts
export interface WeatherModelCacheEntry {
  data: WeatherModelResult
  expiresAt: number // Unix timestamp when cache entry expires (milliseconds)
}

// Theme types
export type ThemePreference = 'auto' | 'solar' | 'nightvision'
export type ResolvedTheme = 'solar' | 'nightvision'

// ---------------------------------------------------------------------------
// Race archive and Boat Setup
// ---------------------------------------------------------------------------
// Row shapes for the tables created by
// supabase/migrations/20260910183000_create_race_archive_and_boat_setup.sql.
// Design: docs/design-docs/race-archive-schema.md, ADR 0011, ADR 0012, ADR 0013.
//
// Two conventions carried over from the schema, because both are load-bearing:
//
// - Column names are the database's, snake_case, so a row can be handed straight to
//   PostgREST and back without a mapping layer to get wrong.
// - `timestamp` columns (a recording's own naive wall-clock frame) and `timestamptz`
//   columns (moments in Layline's life) are both `string` here. Which frame a field is in
//   is stated per field; nothing in this file converts between them.
//
// Recorded channels are bare `numeric` in Postgres and arrive as JSON numbers, so the
// declared scale is lost in JavaScript: `0.0` parses to `0`. Anything that has to be
// byte-exact — the round-trip test above all — must select the column in text form rather
// than trust these fields to carry the scale.

// Postgres enums
export type BoatSetupKind = 'polar' | 'crossover_chart' | 'rig_tune' | 'instrument_calibration'
export type CalibrationChannel = 'AWA' | 'AWS' | 'STW' | 'HDG'
export type CalibrationEventType = 'autocompensation' | 'other'
export type SeaState = 'calm' | 'slight' | 'moderate' | 'rough'
export type RecordingDateOrder = 'MDY' | 'DMY'

/**
 * The two kinds that come from a file, and so the only two with a Storage path.
 * A Rig Tune and an Instrument Calibration are entered by hand — enforced in the database
 * by boat_setup_versions' `file_backed_kinds_only`.
 */
export type FileBackedBoatSetupKind = Extract<BoatSetupKind, 'polar' | 'crossover_chart'>

export interface Boat {
  id: string
  name: string
  model: string
  created_at: string
  updated_at: string
}

/** One of exactly four rows, one per kind, holding the current pointer. */
export interface BoatSetupArtifact {
  id: string
  boat_id: string
  kind: BoatSetupKind
  /** Null until the first Version exists. Moves forward only, and can never be cleared. */
  current_version_id: string | null
  created_at: string
  updated_at: string
}

export interface PolarPayload {
  twa_axis: number[]
  tws_axis: number[]
  /** One row per TWA, one cell per TWS, boat speed in knots. */
  boat_speed: number[][]
  source?: { format: string; header_token: string }
}

/**
 * What an admin is shown after dropping a `.pol` and before committing it — the whole of the
 * first step of the two-step confirm.
 *
 * It crosses the server/client boundary in both directions: the server parses the file and
 * returns this, and the panel shows it and posts the file a second time to confirm. The bytes
 * themselves are not in it. The client keeps the file it already has, and the server re-parses
 * what it is given on confirm rather than trusting a grid the client hands back (ADR 0009).
 */
export interface PolarUploadPreview {
  /** The sailor's own filename, verbatim. */
  filename: string
  /** Size of the file as dropped, for the admin to recognise it by. */
  byte_length: number
  /** Hex SHA-256 of those bytes. Posted back on confirm, so the confirm is of *this* file. */
  content_sha256: string
  /** The grid as parsed, which is what will be stored. */
  payload: PolarPayload
  /** Everything tolerated on the way in, so nothing was quietly repaired. */
  warnings: PolarParseWarning[]
  /** Which angles the file fills in rather than measures, and why they are not shown. */
  suppression: PolarSuppression
  /**
   * The number this upload would take, read before the confirm. Advisory only: the version
   * number is minted inside the transaction, so a second upload racing this one wins it.
   */
  next_version_number: number
}

/**
 * One **Version** of a file-backed artifact as a list row states it: which number it is, when it
 * took effect, what the file was called, and whether it is the one in force.
 *
 * `Pick`ed from the Versions themselves wherever the field is the same field, so the two spellings
 * of a column name cannot drift. Shared by the Polar and the Crossover Chart, because a list row
 * is machinery: it states the columns every file-backed kind has and says nothing about the payload.
 */
export type FileBackedVersionSummary = Pick<
  PolarVersion | CrossoverChartVersion,
  'id' | 'version_number' | 'effective_from' | 'recorded_at' | 'note' | 'filename' | 'content_sha256'
> & {
  /** Whether the artifact's current pointer is at this Version. */
  is_current: boolean
}

/** Every Version of one file-backed artifact, newest first, and which of them is in force. */
export interface FileBackedVersionList {
  /** Null until the first upload. */
  current_version_id: string | null
  /** Newest first, which is the order the screen reads them in. */
  versions: FileBackedVersionSummary[]
}

/** A Version with its payload, which is what the Version's own screen shows. */
export type FileBackedVersionDetail<Payload> = FileBackedVersionSummary & { payload: Payload }

/** What an artifact's screen shows: every Version, and the payload the pointer is at. */
export interface FileBackedScreen<Payload> {
  list: FileBackedVersionList
  /**
   * Null on an empty archive, and also when the Version in force holds a payload the schema does
   * not accept — the list still renders, and the screen says why there is nothing under it.
   */
  current: FileBackedVersionDetail<Payload> | null
}

export type PolarVersionSummary = FileBackedVersionSummary
export type PolarVersionList = FileBackedVersionList

/** A Polar Version with its grid, which is what the Version's own screen shows. */
export type PolarVersionDetail = FileBackedVersionDetail<PolarPayload>

/** What the Polar screen shows: every Version, and the grid the pointer is at. */
export type PolarScreen = FileBackedScreen<PolarPayload>

/** A Crossover Chart Version with its grid and its definitions — one payload, both halves. */
export type CrossoverChartVersionDetail = FileBackedVersionDetail<CrossoverChartPayload>

/** What the Crossover Chart screen shows: every Version, and the chart the pointer is at. */
export type CrossoverChartScreen = FileBackedScreen<CrossoverChartPayload>

/**
 * Where one row of a Polar grid came from, read off the grid itself.
 *
 * A certificate polar tabulates angles the boat cannot sail, and fills them by ramping up from
 * zero — Handsome Pete's row 35 is exactly twice its row 30 in every column. Nothing in the
 * file says so, which is why this is detected rather than declared, and derived at read rather
 * than stored (ADR 0009): a better detector must be able to re-answer the question about a
 * Version written years ago.
 */
export type PolarRowOrigin =
  /** Every cell zero — the file's own statement that it has nothing at this angle. */
  | 'no-data'
  /** A multiple of the lowest tabulated row, in every column. Generated, not measured. */
  | 'ramp-filler'
  /** Still on that ramp in light air, off it where the boat's real speed binds. */
  | 'partial-ramp-filler'
  /** The exact arithmetic mean of the rows either side, in every column. */
  | 'interpolated'
  /** Nothing about it says generated, so it is read as the boat's own speed. */
  | 'measured'

/**
 * Which angles a Polar grid may be displayed at, and why the rest are not.
 *
 * The suppression is a display rule and never a storage rule: the payload keeps every row the
 * file gave, including the filler.
 */
export interface PolarSuppression {
  /** The lowest angle worth showing. The whole axis is shown when no filler is found. */
  firstTrustworthyTwa: number
  /** The angles below it, in axis order. Empty when nothing is suppressed. */
  suppressedTwa: number[]
  /** What to tell the sailor, or `null` when there is nothing to explain. */
  reason: string | null
}

/**
 * Something a `TWA/TWS` grid file did that is worth telling the admin about but is not worth
 * refusing it over.
 *
 * Shared by the Polar's `.pol` and the Crossover Chart's `.sailselect`, which are the same
 * document with different cells — qtVlm documents the shape once (p. 38) and both files obey it.
 * Every one of these is a shape seen in the 273-file corpus surveyed in
 * `docs/research/orc-polar-file-formats.md`, so all of them are tolerated — and all of them
 * are *reported*, because a file quietly repaired is a file nobody knows was odd.
 */
export type GridParseWarningCode =
  /** A UTF-8 byte-order mark before the header token. Stripped. */
  | 'bom-stripped'
  /** CRLF or bare-CR line endings. Normalised for parsing; the stored bytes keep them. */
  | 'crlf-line-endings'
  /** A blank line inside the file. Skipped. */
  | 'blank-line-skipped'
  /** A line beginning `#` or `!`. Skipped. */
  | 'comment-line-skipped'
  /** One free-text line before the header, which some exporters put the boat's name on. */
  | 'description-line-skipped'
  /** One trailing delimiter per line, so every line parses one field wider than it reads. */
  | 'trailing-empty-field'
  /** A header token that is neither `twa/tws` nor `TWA\TWS` in any casing. Kept verbatim. */
  | 'unexpected-header-token'
  /** A header whose first field is a bare `TWA` — 86 of the polar corpus's 273 files. */
  | 'bare-twa-header'

/** A Polar file's oddities: every grid oddity, plus the one that is about decimals. */
export type PolarParseWarningCode =
  | GridParseWarningCode
  /** Decimal commas, normalised to points. Only ever read this way under `;` or TAB. */
  | 'decimal-comma-normalised'

/**
 * A Crossover Chart grid's oddities are exactly the shared ones. A sail id is a whole number, so
 * there is no decimal separator for a locale to disagree about.
 */
export type CrossoverGridParseWarningCode = GridParseWarningCode

export interface GridParseWarning<Code extends string = GridParseWarningCode> {
  code: Code
  /** 1-based line in the file as given, so a warning can be pointed at. */
  line?: number
  /** What was actually seen, when the code alone does not say. */
  detail?: string
}

export type PolarParseWarning = GridParseWarning<PolarParseWarningCode>

export type CrossoverGridParseWarning = GridParseWarning<CrossoverGridParseWarningCode>

/**
 * Why a `TWA/TWS` grid file was refused. Parsing is the gate (ADR 0009), so each of these is a
 * reason the file cannot be read as a grid — never a judgement about the sailing in it.
 */
export type GridParseRefusal =
  /** Larger than any grid plausibly is, so it is some other file. */
  | 'too-large'
  /** Fewer than two lines: a header with no grid, or an empty file. */
  | 'too-few-lines'
  /** No line that reads as a header of at least two fields. */
  | 'no-header'
  /** A row whose field count is not the header's. */
  | 'row-width-mismatch'
  /** An empty cell in the grid. Neither format has missing entries, so this is a broken file. */
  | 'empty-cell'
  /** An axis value or a cell that is not a number. */
  | 'not-a-number'
  /**
   * An axis that repeats or goes backwards. A hard refusal rather than a truncation point:
   * qtVlm silently drops the rest of such a file, which loses data without saying so.
   */
  | 'axis-not-ascending'
  /** A TWA outside 0..180, or a negative TWS or cell value. */
  | 'value-out-of-range'
  /** More angles or wind speeds than any grid has: 181 × 200 is already absurd. */
  | 'grid-too-large'

/** Every refusal a Polar file can earn is a refusal any `TWA/TWS` grid can earn. */
export type PolarParseRefusal = GridParseRefusal

/**
 * A Crossover Chart grid's refusals, which add the one thing its cells are that a polar's are
 * not: whole numbers. A sail id is an identifier, and `2.5` identifies nothing.
 */
export type CrossoverGridParseRefusal = GridParseRefusal | 'not-an-integer'

/**
 * What `parsePolarFile` gives back. A refusal carries the line it was decided on wherever
 * there is one, because "line 14" is the difference between a fixable file and a mystery.
 */
export type PolarParseOutcome =
  | { ok: true; payload: PolarPayload; warnings: PolarParseWarning[] }
  | { ok: false; reason: PolarParseRefusal; message: string; line?: number }

/**
 * What `parseCrossoverGridFile` gives back: the grid half of a Crossover Chart, on its own.
 *
 * Only half a payload, because the other half arrives in a second file. The two are joined into
 * one payload — and so into one Version — by the action that uploads them (ADR 0012).
 */
export type CrossoverGridParseOutcome =
  | { ok: true; grid: CrossoverGrid; warnings: CrossoverGridParseWarning[] }
  | { ok: false; reason: CrossoverGridParseRefusal; message: string; line?: number }

export interface CrossoverGrid {
  twa_axis: number[]
  tws_axis: number[]
  /** One row per TWA, one cell per TWS, each cell a sail definition's number. */
  cells: number[][]
  /** The header token the file carried, verbatim, for `payload.source` to record. */
  header_token: string
}

/**
 * A Sail Definitions file's oddities. Its lines are `number;label` and it has no header, so it
 * shares the four that are about the *text* of a delimited file and none of the ones about a grid.
 */
export type CrossoverDefinitionsParseWarningCode =
  | Extract<
      GridParseWarningCode,
      'bom-stripped' | 'crlf-line-endings' | 'blank-line-skipped' | 'comment-line-skipped'
    >
  /**
   * Definition numbers that do not ascend. Tolerated and kept in the file's own order: the
   * numbers are external ids and nothing reads them in sequence, so an out-of-order file is odd
   * rather than wrong.
   */
  | 'numbers-not-ascending'
  /** A label with leading or trailing whitespace, which is trimmed for the label only. */
  | 'label-whitespace-trimmed'

export type CrossoverDefinitionsParseWarning = GridParseWarning<CrossoverDefinitionsParseWarningCode>

/**
 * Why a Sail Definitions file was refused.
 *
 * The research (`docs/research/orc-polar-file-formats.md`) says to be permissive and constructive
 * with the sail files, so this list is short: it holds only the things that would make the
 * definitions unusable as a lookup, and every one of them is something the admin can fix.
 */
export type CrossoverDefinitionsParseRefusal =
  /** Larger than any list of sail configurations plausibly is. */
  | 'too-large'
  /** Not one definition in the whole file, so there is nothing for the grid to resolve against. */
  | 'no-definitions'
  /** A line with no delimiter at all, so it is neither a number nor a label. */
  | 'no-delimiter'
  /** A number that is not a number, or not a whole one. A sail id of `2.5` identifies nothing. */
  | 'not-an-integer'
  /** A negative definition number. */
  | 'value-out-of-range'
  /** Two definitions claiming the same number, so a cell holding it resolves to both. */
  | 'duplicate-number'
  /** A definition with a number and no label. */
  | 'empty-label'
  /**
   * A `;` inside a label. The delimiter is the only structure the format has, so a label
   * containing one is unrepresentable — and silently keeping the first fragment would be
   * overwriting what the source gave us.
   */
  | 'delimiter-in-label'

export type CrossoverDefinitionsParseOutcome =
  | { ok: true; definitions: CrossoverSailDefinition[]; warnings: CrossoverDefinitionsParseWarning[] }
  | { ok: false; reason: CrossoverDefinitionsParseRefusal; message: string; line?: number }

/**
 * One sail this chart Version can call for, in the chart's own words.
 *
 * This is Layline's only sail vocabulary (ADR 0023): a Sail Configuration on a Race names one of
 * these by number, and there is no inventory beside it.
 *
 * `number` is the integer the grid's cells hold, and it is qtVlm's external id rather than a Layline
 * concept — so it is stored as the file gave it and never renumbered. It is only ever meaningful
 * *within one Version*, which is why everything pointing at a Definition carries the Version's id
 * alongside the number.
 *
 * `label` is free text. Layline's own sail names are the corrected ones (`A3`), and the payload
 * gate refuses a legacy spelling rather than rewriting it: v1 of this artifact is authored right
 * rather than recording a correction to a name Layline never used.
 */
export interface CrossoverSailDefinition {
  number: number
  label: string
}

/**
 * Where a Crossover Chart payload came from — both halves of it.
 *
 * The grid file's own filename and hash are columns on the Version, as they are for a Polar. The
 * definitions file has no columns of its own, so its provenance lives here, beside the
 * definitions it describes (ADR 0022).
 */
export interface CrossoverChartSource {
  /** The format the grid was read as, and the header token that grid file carried. */
  format: string
  header_token: string
  definitions: {
    format: string
    /** The sailor's own filename for the definitions half, verbatim. */
    filename: string
    /** Hex SHA-256 of the definitions file's bytes, which Storage holds under the same prefix. */
    content_sha256: string
  }
}

export interface CrossoverChartPayload {
  twa_axis: number[]
  tws_axis: number[]
  /** One row per TWA, one cell per TWS, each cell a `sail_definitions` number. */
  cells: number[][]
  sail_definitions: CrossoverSailDefinition[]
  source?: CrossoverChartSource
}

/** One definition and how much of the chart calls for it. */
export interface CrossoverDefinitionUsage {
  definition: CrossoverSailDefinition
  /** How many cells hold this definition's number. Zero is legal. */
  cells: number
}

/** One of the two files a Crossover Chart upload carries, as the admin dropped it. */
export interface CrossoverChartUploadFile {
  /** The sailor's own filename, verbatim. */
  filename: string
  /** Size of the file as dropped, for the admin to recognise it by. */
  byte_length: number
  /** Hex SHA-256 of those bytes. Posted back on confirm, so the confirm is of *these* files. */
  content_sha256: string
}

/**
 * What an admin is shown after dropping a `.sailselect` and its definitions, and before committing
 * them — the whole of the first step of the two-step confirm.
 *
 * It crosses the server/client boundary in both directions: the server parses both files and returns
 * this, and the panel shows it and posts both files a second time to confirm. The bytes themselves
 * are not in it. The client keeps the files it already has, and the server re-parses what it is given
 * on confirm rather than trusting a chart the client hands back (ADR 0009).
 *
 * One preview for two files, because they commit as one Version. There is no state in which the grid
 * is accepted and the definitions are not (ADR 0012).
 */
export interface CrossoverChartUploadPreview {
  grid: CrossoverChartUploadFile
  definitions: CrossoverChartUploadFile
  /** Both halves joined, which is what will be stored. */
  payload: CrossoverChartPayload
  /** Everything tolerated in the grid file, so nothing was quietly repaired. */
  grid_warnings: CrossoverGridParseWarning[]
  /** Everything tolerated in the definitions file, for the same reason. */
  definitions_warnings: CrossoverDefinitionsParseWarning[]
  /**
   * How much of the chart each definition accounts for. Shown because zero is *legal* and worth
   * seeing before committing: a definition the chart never recommends is an inventory entry, not a
   * mistake, and the admin is the one who can tell which.
   */
  usage: CrossoverDefinitionUsage[]
  /**
   * The number this upload would take, read before the confirm. Advisory only: the version number
   * is minted inside the transaction, so a second upload racing this one wins it.
   */
  next_version_number: number
}

/**
 * One channel of an Instrument Calibration, in the display's own encoding.
 * Applied as `multiplier × reading + offset`. `multiplier` is absent — not null — for the
 * channels that have none on the display (AWA, HDG).
 */
export interface ChannelCalibration {
  multiplier?: number
  offset: number
}

export type InstrumentCalibrationPayload = Record<CalibrationChannel, ChannelCalibration>

/** A Rig Tune's content lives in rig_tune_bands, so its payload is empty. */
export type RigTunePayload = Record<string, never>

export type BoatSetupPayload =
  | PolarPayload
  | CrossoverChartPayload
  | InstrumentCalibrationPayload
  | RigTunePayload

interface BoatSetupVersionCommon {
  id: string
  artifact_id: string
  version_number: number
  /** Calendar date the sailor says this Version took effect. */
  effective_from: string
  /** When Layline first recorded it. Immutable, including through a correction. */
  recorded_at: string
  note: string | null
  created_by: string
}

export interface PolarVersion extends BoatSetupVersionCommon {
  kind: 'polar'
  filename: string
  content_sha256: string
  payload: PolarPayload
}

export interface CrossoverChartVersion extends BoatSetupVersionCommon {
  kind: 'crossover_chart'
  filename: string
  content_sha256: string
  payload: CrossoverChartPayload
}

export interface RigTuneVersion extends BoatSetupVersionCommon {
  kind: 'rig_tune'
  filename: null
  content_sha256: null
  /** Required on a Rig Tune: the numbers do not stand without it (ADR 0007). */
  note: string
  payload: RigTunePayload
}

export interface InstrumentCalibrationVersion extends BoatSetupVersionCommon {
  kind: 'instrument_calibration'
  filename: null
  content_sha256: null
  payload: InstrumentCalibrationPayload
}

/** The only kind that may be corrected in place, and then only payload, note and date. */
export type BoatSetupVersion =
  | PolarVersion
  | CrossoverChartVersion
  | RigTuneVersion
  | InstrumentCalibrationVersion

/**
 * As much of the Version in force as a list row states: which number it is, and when
 * it took effect. `Pick`ed from the Version itself so the two spellings of a column
 * name can never drift apart.
 */
export type CurrentBoatSetupVersion = Pick<BoatSetupVersion, 'version_number' | 'effective_from'>

/** One artifact as the Boat management list needs it. `null` means *not recorded*. */
export interface BoatSetupRow {
  kind: BoatSetupKind
  current: CurrentBoatSetupVersion | null
}

/**
 * The boat and its four artifacts, read together — the whole of Boat management's
 * data. All-or-nothing on purpose: the screen's header *is* the boat's identity, so
 * there is no half of this worth rendering.
 */
export interface BoatSetup {
  boat: Boat
  /** Always four, in `BOAT_SETUP_ORDER`. */
  artifacts: BoatSetupRow[]
}

export type ShroudPosition = 'V1' | 'D1' | 'D2'

/**
 * Port and starboard, always both: a rig is measured side by side, and one side copied onto
 * the other would assert a symmetry nobody checked (ADR 0007).
 */
export type ShroudSide = 'port' | 'starboard'

/**
 * Both figures for every position and side (ADR 0007): turns re-gear the rig at the dock,
 * the gap restores it when nothing is trusted, and neither derives from the other because
 * no thread pitch is recorded.
 */
export interface ShroudSideSetting {
  gap_mm: number
  turns_from_base: number
}

export type ShroudPositionSetting = Record<ShroudSide, ShroudSideSetting>

export type RigTuneShrouds = Record<ShroudPosition, ShroudPositionSetting>

/** One Wind Band of a Rig Tune Version. */
export interface RigTuneBand {
  id: string
  version_id: string
  kind: 'rig_tune'
  low_kt: number
  /** Null is the open-ended top band, of which there is at most one per Version. */
  high_kt: number | null
  /** Exactly one Base Tune per Version, marked by this flag and never by position or name. */
  is_base: boolean
  /**
   * Free text from the tuning guide the numbers came from. Never index this against the
   * dashboard's Light / Medium / Heavy / Storm bins: rig `medium` is 15–20 kt, which
   * `classifyBin` calls `heavy`, so keying one off the other returns the wrong rig.
   */
  label: string | null
  note: string | null
  shrouds: RigTuneShrouds
  /**
   * The Gaps no longer describe the rig, because the Base Tune was re-measured and this
   * band was not. Never recomputed from the base — that would need the thread pitch ADR
   * 0007 deliberately does not store — and never true of the Base Tune itself, which is
   * what the others are stale *against* (`base_band_gaps_never_stale`).
   */
  gaps_stale: boolean
}

/**
 * One Sail Definition of a Crossover Chart Version, as a row.
 *
 * The same pair of numbers and labels the Version's payload carries, projected out of the same
 * parse inside the same transaction (ADR 0023). It exists as rows for one reason: a Sail
 * Configuration on a Race points at one, and `(version_id, number)` is what makes that pointer a
 * real foreign key rather than a number nobody checked. The payload is still the record of what
 * the file said, and nothing reads these rows to render a chart.
 *
 * `kind` is the constant tag that carries the composite key into `boat_setup_versions (id, kind)`,
 * exactly as `RigTuneBand.kind` does (ADR 0011).
 */
export interface CrossoverSailDefinitionRow {
  version_id: string
  kind: 'crossover_chart'
  /** The chart's own identifier, as the file gave it. Whole and non-negative, never renumbered. */
  number: number
  label: string
}

/**
 * One Rig Tune Version as its screen reads it: the machinery, plus every Wind Band.
 *
 * `note` is the required change reason, so it is a `string` here and not `string | null`
 * (`rig_tune_note_required`).
 */
export interface RigTuneVersionRecord {
  id: string
  version_number: number
  /** Calendar date the sailor says this tune took effect. */
  effective_from: string
  /** When Layline recorded it. A moment, not a calendar date. */
  recorded_at: string
  /** Why this Version exists. Required on a Rig Tune. */
  note: string
  created_by: string
  /** Ascending by `low_kt`, which is the order the bands are read in. */
  bands: RigTuneBand[]
}

/**
 * The Rig Tune artifact as its screen reads it, all-or-nothing like `BoatSetup`.
 *
 * Every Version is carried, not just the current one: a Race freezes a pointer at one,
 * and that pointer is worthless if nobody can open it (ADR 0007).
 */
export interface RigTunePage {
  boat: Boat
  artifact_id: string
  /** Null until the first Version exists. */
  current_version_id: string | null
  /** Newest first. Empty on an unrecorded artifact. */
  versions: RigTuneVersionRecord[]
}

/**
 * One side of one Shroud Position as it is being typed.
 *
 * Strings, because a form field holds text and an empty field is not a zero: parsing
 * happens once, in `lib/boat/rigTune.ts`, where a blank is a refusal rather than a
 * number nobody entered.
 */
export interface RigTuneSideDraft {
  gap_mm: string
  turns_from_base: string
}

export type RigTunePositionDraft = Record<ShroudSide, RigTuneSideDraft>

/** The twelve figures of one band, as they are being typed. */
export type RigTuneDraftShrouds = Record<ShroudPosition, RigTunePositionDraft>

/**
 * What one band of the draft was seeded from, or `null` when the admin added it.
 *
 * `was_base` is what tells re-measuring the Base Tune — which makes the other bands' Gaps
 * stale — from moving the flag to a different band, which is re-organising the table and
 * makes nothing stale (ADR 0007).
 */
export interface RigTuneBandSeed {
  shrouds: RigTuneShrouds
  gaps_stale: boolean
  was_base: boolean
}

export interface RigTuneBandDraft {
  /** Stable for the length of the edit only. Not a database id — a Version mints new rows. */
  key: string
  label: string
  low_kt: string
  /** Blank is the open-ended top band. */
  high_kt: string
  is_base: boolean
  note: string
  shrouds: RigTuneDraftShrouds
  seed: RigTuneBandSeed | null
}

/**
 * The whole table as it is being edited. A Version is all of this or none of it.
 *
 * Staleness is decided per band, from each band's own `seed`, and there is deliberately no
 * table-level record of the old Base Tune: comparing a *different* band's Gaps to it would
 * call every band stale the moment the flag moved.
 */
export interface RigTuneDraft {
  /** `YYYY-MM-DD`. */
  effective_from: string
  /** The required change reason. */
  change_reason: string
  bands: RigTuneBandDraft[]
}

/** One band as it is written: numbers, nulls where the sailor left a field empty. */
export interface RigTuneBandInput {
  low_kt: number
  high_kt: number | null
  is_base: boolean
  label: string | null
  note: string | null
  gaps_stale: boolean
  shrouds: RigTuneShrouds
}

/** A whole Version, ready for `mint_rig_tune_version`. Bands ascend by `low_kt`. */
export interface RigTuneVersionInput {
  effective_from: string
  note: string
  bands: RigTuneBandInput[]
}

/**
 * One refusal, tied to the band that caused it where there is one. `band_key` is null for
 * a problem with the table as a whole — a missing change reason, two base bands, a gap
 * between two of them.
 */
export interface RigTuneProblem {
  band_key: string | null
  message: string
}

/** A dated act on the instruments that changed no stored value (ADR 0005). */
export interface CalibrationEvent {
  id: string
  artifact_id: string
  kind: 'instrument_calibration'
  /** Calendar date. */
  occurred_on: string
  type: CalibrationEventType
  /** At least one channel; exactly `['HDG']` when type is 'autocompensation'. */
  channels: CalibrationChannel[]
  note: string
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * The Instrument Calibration artifact, whole: every Version ever minted and every
 * **Calibration Event** ever written down.
 *
 * Read together because the **Calibration Log** is a projection over both, assembled
 * when read. `null` in place of this is a failed read, never an empty calibration.
 */
export interface InstrumentCalibrationRecord {
  artifactId: string
  /** The Version in force. Null until the first one is recorded. */
  currentVersionId: string | null
  /** Ascending by `version_number`, which is mint order and not date order. */
  versions: InstrumentCalibrationVersion[]
  events: CalibrationEvent[]
}

/**
 * One figure that moved between two Instrument Calibration Versions.
 *
 * `from` is null on the first Version — there was no previous figure, which is not
 * the same as a previous figure of zero.
 */
export interface CalibrationFieldChange {
  channel: CalibrationChannel
  field: 'multiplier' | 'offset'
  from: number | null
  to: number | null
}

/**
 * One line of the **Calibration Log** — the read-time projection, not a table.
 *
 * A Version arm carries the Version itself plus what it changed, computed against
 * the previous one; an Event arm carries the hand-written act. Nothing is stored
 * twice, so no two representations of one change can disagree (ADR 0005).
 */
export type CalibrationLogEntry =
  | {
      entry: 'version'
      /** `effective_from`: the day the numbers went into the box. */
      date: string
      version: InstrumentCalibrationVersion
      /** Every figure on the first Version; only what moved on the rest. */
      changes: CalibrationFieldChange[]
      isFirst: boolean
    }
  | {
      entry: 'event'
      /** `occurred_on`: the day the act was performed. */
      date: string
      event: CalibrationEvent
    }

/**
 * One qtVlm VDR export, as recorded. Every field but `date_order` is a fact about the
 * file, written once and never updated.
 */
export interface Recording {
  /**
   * Supplied by the caller — there is no database DEFAULT. The permanent Storage path
   * contains this id, so it has to exist before the bytes move (ADR 0013).
   */
  id: string
  filename: string
  content_sha256: string
  /** The header exactly as recorded, in order: 'TWA (calc)', not the SQL name. */
  source_columns: string[]
  /** How `date_verbatim` is read. Correctable without re-uploading. */
  date_order: RecordingDateOrder
  trailing_newline: boolean
  row_count: number
  /** The recording's own naive wall-clock frame. */
  first_row_time: string
  last_row_time: string
  uploaded_by: string
  created_at: string
}

/** Unrecognised header fields, keyed by the verbatim header name, values as written. */
export type RecordingRowExtras = Record<string, string>

/**
 * One row of the Transcription. Immutable: there is no UPDATE or DELETE policy, so a row
 * can only be removed by deleting its Recording.
 *
 * Row Quality and Gap Seconds are deliberately absent — both are computed at read over the
 * whole Transcription (ADR 0009).
 */
export interface RecordingRow {
  recording_id: string
  /** 1-based, preserving file order. */
  row_index: number
  /** 'MM/DD/YYYY HH:MM:SS', exactly as written. */
  date_verbatim: string
  /** Parsed, naive, no conversion. */
  row_time: string
  longitude: number | null
  latitude: number | null
  cog: number | null
  sog: number | null
  twd: number | null
  tws: number | null
  twa: number | null
  gwd: number | null
  gws: number | null
  ctw: number | null
  stw: number | null
  pol: number | null
  pre: number | null
  xte: number | null
  rpm: number | null
  /** 'TWA (calc)' */
  twa_calc: number | null
  /** 'AWA (calc)' */
  awa_calc: number | null
  /** 'AWS (calc)' */
  aws_calc: number | null
  alarm: string | null
  observations: string | null
  extras: RecordingRowExtras | null
  /** Generated by Postgres: the only thing Layline computes onto a row (ADR 0008). */
  water_referenced: boolean
}

/**
 * The editable half of a Race: its Window, its Testimony and its frozen config pointers.
 * The Race is the child of its Recording, which is what makes ADR 0010's split structural.
 */
export interface Race {
  id: string
  boat_id: string
  recording_id: string
  /** Optional, free text, never generated. */
  title: string | null
  /** The recording's own naive wall-clock frame. Must contain at least one row. */
  window_start: string
  window_finish: string
  /** Null means not recorded, never a backdated guess. All five are writable. */
  polar_version_id: string | null
  crossover_chart_version_id: string | null
  rig_tune_version_id: string | null
  instrument_calibration_version_id: string | null
  /** The Wind Band the boat was set to. Must belong to `rig_tune_version_id`. */
  rig_tune_band_id: string | null
  /**
   * The constant tags that make each pointer's kind a database constraint rather than a
   * convention (ADR 0011). Every one is `NOT NULL DEFAULT` its own literal, so a write omits
   * them and a read returns them — which is why they are here: a row read from PostgREST has
   * them, and a type that pretended otherwise would be a mapping layer.
   */
  polar_kind: 'polar'
  crossover_kind: 'crossover_chart'
  rig_tune_kind: 'rig_tune'
  calibration_kind: 'instrument_calibration'
  created_by: string
  created_at: string
  /** The entire provenance of an Amendment, touched by the annotation tables too. */
  updated_at: string
}

/**
 * One Sail Configuration, in force from `at` until the next entry. `at` is deliberately
 * unbounded by the Race Window: the sails were set before the start.
 *
 * A Configuration names one Sail Definition of one Crossover Chart Version — the chart's own
 * vocabulary, and the only sail vocabulary Layline has (ADR 0023). `crossover_chart_version_id`
 * repeats the Race's own pointer rather than deriving from it, because that is what carries the
 * composite keys: `(race_id, crossover_chart_version_id)` into `races`, so an entry cannot
 * disagree with the Race about which chart was aboard, and `(crossover_chart_version_id,
 * definition_number)` into `crossover_sail_definitions`, so it cannot name a number that Version
 * never defined.
 *
 * Both `definition_number` and `note` are nullable and at least one is present
 * (`sail_entry_says_something`). A note alone is what the sailor flew something the chart does not
 * name; a note beside a Definition is a remark about it.
 */
export interface RaceSailEntry {
  id: string
  race_id: string
  /** The Race's own chart pointer, repeated. Never null: no chart Version, no Configurations. */
  crossover_chart_version_id: string
  at: string
  /** A Sail Definition number of that Version, or null when only a note was left. */
  definition_number: number | null
  /** Free text, or null. Never the empty string (`sail_entry_note_non_empty`). */
  note: string | null
  created_at: string
}

export interface RaceSeaStateEntry {
  id: string
  race_id: string
  at: string
  sea_state: SeaState
  created_at: string
}

// ---------------------------------------------------------------------------
// A parsed Transcription
// ---------------------------------------------------------------------------
// What `services/recordings/qtvlm.ts` produces from a file's bytes, and what
// `reassembleTranscription` reads to reproduce them. Field names are the database's, so a
// Transcription row is written by adding `recording_id` and a `row_index` and nothing else.
//
// Every recorded channel is `string | null` here, not `number | null`, and that is the
// round trip's load-bearing detail rather than a convenience: `0.0` and `-0.0` and `20.10`
// are all the JavaScript number they parse to, and none of them renders back as what the
// file said. Postgres `numeric` preserves the scale it was given, so text in and text out
// is the one representation that survives both hops — which is why `RecordingRow` above,
// the shape a plain PostgREST select returns, cannot be used for a round trip.

/** Every recognised field of a Transcription row, in file order, in text form. */
export interface TranscriptionChannels {
  longitude: string | null
  latitude: string | null
  cog: string | null
  sog: string | null
  twd: string | null
  tws: string | null
  /** Authoritative for true wind angle. Signed, −180..180, positive = starboard (ADR 0008). */
  twa: string | null
  gwd: string | null
  gws: string | null
  ctw: string | null
  stw: string | null
  pol: string | null
  pre: string | null
  xte: string | null
  rpm: string | null
  /** `TWA (calc)` — transcribed and read by nothing. */
  twa_calc: string | null
  /** `AWA (calc)` — the only apparent wind that exists, and a calculation. Unsigned 0..360. */
  awa_calc: string | null
  /** `AWS (calc)` — likewise a calculation, not a masthead reading. */
  aws_calc: string | null
  alarm: string | null
  observations: string | null
}

/** One row of a parsed Transcription. `recording_id` is added by whoever writes it. */
export interface TranscriptionRow extends TranscriptionChannels {
  /** 1-based, preserving file order. */
  row_index: number
  /** Exactly as written, whatever the ordering or the format. */
  date_verbatim: string
  /** `date_verbatim` resolved under `date_order`: naive wall clock, no conversion, ever. */
  row_time: string
  /** One key per unrecognised header, verbatim, value as written. Null when there are none. */
  extras: RecordingRowExtras | null
}

/** How `date_order` was arrived at, which is the difference between a fact and a default. */
export type DateOrderEvidence =
  /** A day component above 12 settles it. */
  | 'proven'
  /** Every component is 12 or below, so the file cannot say. Month-first is the assumption. */
  | 'assumed'
  /** The caller said so, which is how a wrong reading is corrected without re-uploading. */
  | 'supplied'

/**
 * A file transcribed. The first seven fields are `recordings` columns under their own names;
 * the last three are sniffed facts with nowhere to be stored, reported so a caller can state
 * them and so `reassembleTranscription` can be handed them.
 */
export interface Transcription {
  /** The header exactly as recorded, in order: 'TWA (calc)', not the SQL name. */
  source_columns: string[]
  date_order: RecordingDateOrder
  trailing_newline: boolean
  content_sha256: string
  row_count: number
  /** The recording's own naive wall-clock frame. */
  first_row_time: string
  last_row_time: string
  rows: TranscriptionRow[]
  date_order_evidence: DateOrderEvidence
  /** Sniffed. `;` in every file seen, but the format does not fix it. */
  delimiter: string
  /** Sniffed independently of the delimiter: a real vendor export pairs `;` with `,`. */
  decimal_separator: '.' | ','
}

/**
 * Why a file was refused. Only two conditions refuse a recording (ADR 0009) — it yields no
 * rows, or it has no `Date` or no position — and these five are those two spelled out plus
 * the parse's own honesty check. Nothing about a recording's *quality* is ever a reason.
 */
export type TranscriptionRefusal =
  /** Nothing to transcribe: no data rows at all. */
  | 'no-rows'
  /** No `Date` column in the header. */
  | 'no-date-column'
  /** No `Longitude` or no `Latitude` column in the header. */
  | 'no-position-column'
  /** A `Date` column whose values cannot be read as timestamps, which is no `Date` in effect. */
  | 'date-unreadable'
  /**
   * The bytes could not be reproduced, so storing the transcription would store a claim. This
   * covers everything the file has that no column could hold and nothing about its quality: a
   * CRLF or a byte-order mark, an encoding that is not UTF-8, a `Date` anywhere but first, a
   * duplicated column name, a row whose field count is not the header's, a value Postgres
   * `numeric` would not give back unchanged, and the self-check itself failing.
   */
  | 'not-transcribable'

export type TranscriptionOutcome =
  | { ok: true; transcription: Transcription }
  | { ok: false; reason: TranscriptionRefusal; message: string }

/**
 * The format and cadence figures a race page states, computed over whatever rows it is given
 * — the whole Transcription, or the rows inside a Race Window. Nothing here is stored: every
 * figure is a function of rows that cannot change (ADR 0009).
 */
export interface RecordingProvenance {
  /** The header, verbatim and in order. */
  column_set: string[]
  row_count: number
  /** Median interval between consecutive rows. Null below two rows. Never assume 30. */
  median_cadence_seconds: number | null
  /** The largest interval between consecutive rows. Null below two rows. */
  largest_gap_seconds: number | null
  /** Earliest row to latest row, which is first to last only while the clock went forwards. */
  span_seconds: number | null
  /**
   * How many times the naive wall clock stepped backwards — the hour a fall-back repeats. Those
   * steps are not intervals, so they are counted here instead of being averaged into a cadence.
   */
  backwards_steps: number
  /** Verbatim header names with no value in any row: the channels this boat never fed. */
  dead_channels: string[]
  /** Verbatim header names carrying one value throughout, which is nearly as little. */
  constant_channels: { column: string; value: string }[]
}

/**
 * What one row is worth, as three independent tests rather than three levels of one.
 *
 * A row may carry more than one of them and most carry none. They are separate fields because
 * they are separate questions, and because the prior art's single `STATUS` column is what lost
 * 34 rows their maneuver marker to low-speed precedence (ADR 0009).
 */
export interface RowQuality {
  /** The row this is about, so a filtered set still says which rows it describes. */
  row_index: number
  row_time: string
  /**
   * Inside a **Dropout**: this row's position, course and speed are a verbatim copy of the
   * previous row's, in a run long enough that the feed was dead rather than the boat slow.
   *
   * Read this one first. It says the row's values are a copy, so the two below — which are
   * computed on those values and never suppressed — describe copied values rather than readings.
   * Suppressing them would also destroy the two figures that prove neither can stand in for this
   * one: 856 of the archive's 870 frozen rows are not Low-Speed, and 25 of them are still
   * water-referenced (ADR 0009).
   */
  frozen: boolean
  /**
   * `STW` or `CTW` absent, so the wind columns were computed from GPS and mean something
   * different from their neighbours. The same predicate as the stored generated column.
   */
  not_water_referenced: boolean
  /** `SOG` below the gate. Gated on GPS speed, which is verifiable, and never on `STW`. */
  low_speed: boolean
  /**
   * Elapsed seconds since the previous non-**Frozen** row. Null for the first row in hand.
   * Anything computing a row-to-row rate must read this rather than assume the cadence.
   */
  gap_seconds: number | null
}

/** A channel a **Dropout** freezes, and so one the detector compares row to row. */
export type DropoutChannel = 'latitude' | 'longitude' | 'cog' | 'sog'

/**
 * Row Quality over a set of rows, with the rules that produced it.
 *
 * The constants and the version ride along because nothing here is stored: a page states which
 * rules it is showing, and a changed gate is a redeploy rather than a migration (ADR 0009).
 */
export interface TranscriptionQuality {
  /** Bumped whenever a rule or a constant below changes. */
  detector_version: string
  /** The `SOG` a row is Low-Speed below, in knots. */
  low_speed_sog_knots: number
  /** How many verbatim repeats in a run make a Dropout. */
  dropout_min_rows: number
  /**
   * Which channels the recording fed, and so which the comparison could use. All four for every
   * recording in the archive; fewer for a boat that logs no `COG`.
   *
   * Empty means no Dropout could be detected at all, because the recording carries no position.
   * A page must say so rather than show no dropouts, which is the same output as a clean track.
   */
  dropout_channels: DropoutChannel[]
  /** One entry per row it was given, in that order. */
  rows: RowQuality[]
}

// ---------------------------------------------------------------------------
// Uploading a race, and what a race states afterwards
// ---------------------------------------------------------------------------
// The wizard's shapes (ADR 0014). Two things are worth knowing before reading them.
//
// First, every time here is a naive wall-clock stamp or a count of seconds in the recording's own
// frame, and the two convert through `services/recordings/wall-clock.ts` and nothing else. There
// is no `Date` in this section on purpose: a `Date` carries an offset, and an offset is a claim
// about a timezone the recording never made.
//
// Second, `RaceChartSeries` is the only place in Layline where a recorded value is a `number`. It
// is a projection for drawing and is never written back: what a chart needs is a coordinate, and
// what the database needs is the file's own text (see `TranscriptionChannels`).

/** The channels the swappable chart offers, in pill order. `awa` is qtVlm's `AWA (calc)`. */
export type RaceChannelKey = 'sog' | 'tws' | 'twa' | 'awa'

/**
 * A whole recording as the arrays the map and the channel chart read.
 *
 * Parallel arrays rather than an array of rows: both charts walk one channel at a time over
 * thousands of rows, and this is the shape that crosses the server boundary without repeating a
 * key per row. Every array is the same length and in file order, so index `i` is one row
 * throughout — including `frozen` and `not_water_referenced`, which come from Row Quality
 * assessed over the whole recording before any window narrowed it (ADR 0009).
 */
export interface RaceChartSeries {
  /** The recording's bounds, restated so a chart can label an axis without scanning. */
  first_row_time: string
  last_row_time: string
  /** Absolute seconds in the recording's own frame — the one time axis both charts share. */
  row_seconds: number[]
  latitude: (number | null)[]
  longitude: (number | null)[]
  /** Null is absent and draws as a break. `-1` is a wind angle, never a missing one. */
  channels: Record<RaceChannelKey, (number | null)[]>
  /**
   * What a chart actually draws for the value's height — identical to `channels` for every
   * channel except `awa`, whose column is unsigned 0..360 (types/index.ts on `awa_calc`) and is
   * folded here to a magnitude on the same 0..180 scale `twa` already fits, rather than clipped
   * against it. Nothing folded is written back; `channels` still carries the reading as the file
   * gave it.
   */
  plotted: Record<RaceChannelKey, (number | null)[]>
  /**
   * Whether the file writes this channel negative anywhere, which is what makes its axis
   * −180..180 instead of 0..180. Judged over the whole recording so cropping never rescales it.
   */
  signed: Record<RaceChannelKey, boolean>
  /**
   * Which side the wind was on, for a channel whose sign (or, for `awa`, fold) carries a tack —
   * null for a speed channel, and for a missing reading. Read off the same fold `plotted` uses,
   * not off `channels` directly, so `awa`'s and `twa`'s conventions agree: negative is port.
   */
  tack: Record<RaceChannelKey, ('port' | 'starboard' | null)[]>
  frozen: boolean[]
  not_water_referenced: boolean[]
  /**
   * `SOG` below the gate. Carried so the wizard's Review step can state the same Row Quality notes
   * the race page will, from the arrays it already has, rather than a shorter list that would look
   * like a cleaner race.
   */
  low_speed: boolean[]
  /** Empty means no Dropout could be detected at all — which a page must say, not hide. */
  dropout_channels: DropoutChannel[]
}

/**
 * How much of a Race Window the recording actually covers, in time and never in rows.
 *
 * A row count answers a question nobody asked: 6,337 rows is meaningless without the cadence, and
 * it counts frozen rows as evidence. Seconds are what a sailor can check against their own memory
 * of the race.
 */
export interface RaceCoverage {
  /** Finish minus start, in the recording's frame. */
  window_seconds: number
  /** Start to the first row inside the window. A race whose recording began late. */
  lead_gap_seconds: number
  /** The last row inside the window to the finish — the gap a window past the last row states. */
  tail_gap_seconds: number
  /** Seconds spanned by rows that were measured. */
  live_seconds: number
  /** Seconds spanned by rows inside a Dropout, which are a copy rather than a reading. */
  frozen_seconds: number
  /**
   * How many times the clock stepped backwards between consecutive in-window rows. Those steps
   * are not durations, so they are counted rather than folded into either bucket above — which is
   * also why the four figures sum to `window_seconds` only while this is zero.
   */
  backwards_steps: number
  /** In-window rows, for the seams that genuinely need it. Never presented as coverage. */
  row_count: number
  /**
   * The middle interval between consecutive in-window rows, or null below two of them.
   *
   * The cadence as this window actually recorded it, which is what tells an edge gap worth stating
   * from the fraction of a sample a handle lands on between two rows (see `statesAGap`). Median, so
   * one dropout of an hour does not become the cadence.
   */
  median_interval_seconds: number | null
}

/**
 * How firmly a finding stands in the way (ADR 0009).
 *
 * Three levels, and the count of each that exists is the point: exactly two refusals, exactly one
 * confirmation, and everything else a note. Adding a fourth refusal is an ADR, not a commit.
 */
export type RaceFindingSeverity =
  /** Cannot proceed. A finish at or before the start, or a window with no rows in it. */
  | 'refusal'
  /** Proceeds once the sailor says so. Only ever a duplicate content hash. */
  | 'confirmation'
  /** Stated and never in the way. Recomputed at read, so it is never stored. */
  | 'note'

export interface RaceFinding {
  severity: RaceFindingSeverity
  /** Addressed to the sailor, and specific enough to act on. */
  message: string
}

/**
 * A file parsed and its bytes parked in `tmp/`, with nothing written to the database (ADR 0013).
 *
 * `recording_id` is generated here, before the bytes move, because the object path contains it:
 * the id has to exist before there is anywhere to put the file, so it comes from the client rather
 * than from a `DEFAULT` (ADR 0013). Abandoning the wizard at any step leaves exactly this — one
 * `tmp/` object and no row.
 *
 * Only what the wizard draws or sends back. The staging path, the row count, the row times and the
 * provenance figures all stay on the server: the browser has the series it charts and the findings it
 * states, and submit re-derives everything else from the bytes rather than trusting a round trip.
 */
export interface StagedRecording {
  /** Scopes the `tmp/` object to this attempt, so two uploads of one file cannot collide. */
  upload_id: string
  /** The id the Recording will have, fixed now because `storage_path` will contain it. */
  recording_id: string
  filename: string
  /** Checked again on submit: the bytes that get written are the bytes that were charted. */
  content_sha256: string
  series: RaceChartSeries
  /** Everything the file said about itself that is worth stating. Never a refusal. */
  findings: RaceFinding[]
}

export type StageRecordingResult =
  | { ok: true; staged: StagedRecording }
  | { ok: false; message: string }

// ---------------------------------------------------------------------------
// Annotations, as the wizard holds them and as submit sends them
// ---------------------------------------------------------------------------
// One ordered list per kind, every entry timestamped, and no initial value sitting apart from a
// list of changes (ADR 0010). An empty list is legal and means the race is not remembered — so
// none of these has a default, and nothing here is pre-selected.
//
// A draft is in absolute seconds of the recording's own naive frame, because that is the axis the
// charts are tapped on; a submission is in stamps, because that is what a `timestamp` column
// takes. Neither is bounded by the Race Window: the sails were set before the start.

/**
 * One Crossover Chart Version as the sails step offers it: which Version, and its vocabulary.
 *
 * Every Version travels, not only the current one, because a Race freezes a pointer at the Version
 * that was aboard and an archived race from last season has to be able to name its sails in the
 * chart it was actually sailed under (ADR 0012, ADR 0023). `effective_from` is what the default is
 * chosen by: the Version in force at the recording's start time.
 */
export interface CrossoverChartChoice {
  version_id: string
  version_number: number
  /** Calendar date the sailor says this chart took effect. */
  effective_from: string
  /** Every Definition the Version defines, in the chart's own numbering — cited or not. */
  definitions: CrossoverSailDefinition[]
}

/**
 * One Boat Setup Version as a pointer names it: which Version, and the day it took effect.
 *
 * The same three fields whether it is being offered on the Review step or read back off a saved
 * Race, because both are the same act — naming one Version out of the boat's history. A Race
 * freezes the id (ADR 0012); the number and the date are what let a screen say *which* one without
 * a second read, and neither is ever resolved to "the newest".
 */
export interface BoatSetupVersionRef {
  version_id: string
  version_number: number
  /** Calendar date the sailor says this Version took effect. */
  effective_from: string
}

/**
 * One Wind Band of a Rig Tune Version, as a picker offers it and as a race page reads it back.
 *
 * Bands do not travel between Versions — a re-tune means new bands — so a band is only ever named
 * beside the Version it belongs to. `high_kt` is null on the open-ended top band, of which there is
 * at most one per Version.
 */
export interface WindBandRef {
  band_id: string
  low_kt: number
  high_kt: number | null
  /** The Base Tune, which every Turns figure of the other bands is counted from (ADR 0007). */
  is_base: boolean
  /** Free text from the tuning guide. Never indexed against the dashboard's wind bins. */
  label: string | null
}

/**
 * A Rig Tune Version and its own bands, which are the only bands a Race pointing at it may record.
 *
 * Carried together because the band picker is gated behind the Version choice: with no Version there
 * are no bands, and with one there are exactly these. The composite key
 * `races (rig_tune_version_id, rig_tune_band_id)` refuses anything else, so a picker built from this
 * cannot offer a band the database would then reject.
 */
export interface RigTuneChoice extends BoatSetupVersionRef {
  /** Ascending by `low_kt`, which is the order a band table is read in. */
  bands: WindBandRef[]
}

/**
 * The three Version lists the Review step offers, beside the Crossover Charts the Sails step reads.
 *
 * Every Version of each kind, not only the one in force: the archive is hand-entered backwards, so a
 * race being recorded here was usually sailed under a Version the boat has since replaced (ADR 0012).
 * Which one a recording defaults to is `versionInForceOn`'s answer, from the recording's own start.
 *
 * A null *in place of the whole object* is "could not be read", the same distinction
 * `RaceFlowProps.charts` makes and for the same reason: a Review step showing empty pickers
 * would present a failed read as "the boat has none". Within it the three lists are plain, and an
 * empty one is the honest answer for a boat that has no Version of that kind yet — which is why every
 * pointer on `races` is nullable in the first place.
 */
export interface RaceBoatSetupChoices {
  polar: BoatSetupVersionRef[]
  rig_tune: RigTuneChoice[]
  instrument_calibration: BoatSetupVersionRef[]
}

/** One Sail Configuration as the wizard holds it, before anything has been written. */
export interface SailEntryDraft {
  /**
   * Client-side identity, so the list has stable keys and one entry can be the selected one. Not
   * sent and not stored: the database's own key is `(race_id, at)`.
   */
  key: string
  /** Absolute seconds in the recording's own naive frame. */
  at: number
  /**
   * The Sail Definition number of the chosen Crossover Chart Version. Null while the sailor is
   * still choosing, and null for good on an entry that only carries a note — the sail flown was
   * something the chart does not name.
   */
  definition_number: number | null
  /**
   * Free text beside the Definition, or instead of it. Blank means no note, which is why this is a
   * string rather than `string | null`: it is a text field, and a text field holds ''.
   */
  note: string
}

/** One Sea State reading as the wizard holds it. */
export interface SeaStateEntryDraft {
  key: string
  at: number
  /** Null until stated. Nothing is pre-selected, so there is no `slight` by default. */
  sea_state: SeaState | null
}

/**
 * One Sail Configuration on its way to the database: a Definition number, a note, or both.
 *
 * The Version they are named in is not here. It is one answer for the whole Race —
 * `SubmitRaceInput.crossover_chart_version_id` — because a sailor names their sails in one
 * vocabulary, and `race_sail_entries_race_chart_fkey` would refuse anything else.
 */
export interface SubmitSailEntry {
  /** The recording's own naive frame. Unbounded by the window. */
  at: string
  /** A Sail Definition number of the Race's chart Version, or null on a note-only entry. */
  definition_number: number | null
  /** Null rather than '': a blank note is no note (`sail_entry_note_non_empty`). */
  note: string | null
}

/** One Sea State reading on its way to the database. */
export interface SubmitSeaStateEntry {
  at: string
  sea_state: SeaState
}

/**
 * The five Boat Setup answers a Race records: four Version pointers, and the Wind Band the rig was
 * set to.
 *
 * Pointers, not copies (ADR 0012). Each is frozen onto the Race when it is filed and each stays
 * changeable afterwards, so nothing here is ever resolved at read — a Polar minted next winter
 * cannot become the Polar this race was sailed under. Null throughout means *not recorded*, which is
 * the honest answer for a race sailed before the boat had that artifact at all, and it stays null:
 * no backdated guesses (ADR 0008).
 *
 * `rig_tune_band_id` names a band of `rig_tune_version_id` and of no other Version. Bands do not
 * migrate — a re-tune means new rows — and the composite key
 * `races (rig_tune_version_id, rig_tune_band_id)` is what enforces that, with
 * `band_requires_rig_tune` refusing a band recorded against no Version at all. The forms are built
 * so those two never fire; the database is the reason they cannot be talked around.
 */
export interface RaceBoatSetupPointers {
  /** The Polar the boat's targets came from that day. */
  polar_version_id: string | null
  /**
   * The Crossover Chart Version the sails are named in, frozen onto the Race at upload (ADR 0023).
   *
   * Null means the Race records no chart Version, which is a legitimate answer (ADR 0012) and one
   * in which `sails` must be empty: with no vocabulary there is nothing to say a sail in. It is
   * written here rather than resolved at read, so a chart minted next winter cannot silently
   * re-word what this race flew.
   */
  crossover_chart_version_id: string | null
  /** The Rig Tune the mast was set up to, and the only Version `rig_tune_band_id` may belong to. */
  rig_tune_version_id: string | null
  /** The Instrument Calibration in force, which is what the recording's own figures were read through. */
  instrument_calibration_version_id: string | null
  /**
   * The Wind Band of that Rig Tune the rig was actually set to, as the sailor recorded it.
   *
   * Recorded, not derived. A band that disagrees with the wind the file logged is a finding stated on
   * the race page, never an error and never a correction — the sailor may well have been tuned for
   * the forecast rather than the breeze that arrived (ADR 0008).
   */
  rig_tune_band_id: string | null
}

/**
 * What submit sends back about a staged upload: which attempt it was, and the sailor's Testimony.
 *
 * Nothing derived travels — no rows, no series, no coverage. The server re-reads the bytes it parked
 * and re-parses them, so what gets written is a function of the file rather than of anything the
 * browser could have edited on the way back. `tmp_path` is absent for the same reason: it is derived
 * from the signed-in user and `upload_id`, never taken from the request.
 */
export interface SubmitRaceInput extends RaceBoatSetupPointers {
  upload_id: string
  recording_id: string
  filename: string
  /** Checked against the bytes in `tmp/`: the bytes written are the bytes that were charted. */
  content_sha256: string
  /** The recording's own naive frame, both of them. No offset, no conversion. */
  window_start: string
  window_finish: string
  /** Blank is stored as null — an untitled race is normal (ADR 0010). */
  title: string
  /**
   * The sailor's Testimony about the sails, in time order. Empty is legal and means the sail plan
   * was not recorded — never a stand-in configuration.
   */
  sails: SubmitSailEntry[]
  /** The same, for the Sea State. Empty means not recorded. */
  sea_state: SubmitSeaStateEntry[]
  /**
   * The sailor's answer to the duplicate-hash confirmation, carried so the server can ask again.
   *
   * A Server Action is a public endpoint, so a confirmation that lived only in a checkbox would be
   * one anything else could skip. False on every upload that had nothing to confirm.
   */
  duplicate_acknowledged: boolean
}

/**
 * What submit answers with, and — on a failure — whether the staged upload survived it.
 *
 * `start_over` is the difference between a failure the sailor can fix from where they stand and one
 * that has taken the staged bytes with it. A window that holds no rows is the first: edit the window,
 * press save again. Anything after the move to the permanent path is the second, because the bytes
 * are no longer at the staging path a second attempt would look for — so re-arming the same button
 * offers a retry that can only ever come back "the staged bytes are gone".
 *
 * Required rather than optional, so a failure path added later has to say which kind it is instead of
 * defaulting into the answer that is wrong more often.
 */
export type SubmitRaceResult =
  | { ok: true; race_id: string }
  | { ok: false; message: string; start_over: boolean }

/** A race as the Races tab lists it. */
export interface RaceListEntry {
  id: string
  /**
   * Null where the sailor gave none, and left null all the way to the screen. An untitled race is
   * normal (ADR 0010), so a generated stand-in here would be Layline writing Testimony.
   */
  title: string | null
  window_start: string
  window_finish: string
  filename: string
  /** Finish minus start. The list states a duration; the detail page states the coverage. */
  window_seconds: number
}

/**
 * One Sail Configuration as a page states it: the Crossover Chart Version's own label for the
 * Definition that was named, and whatever the sailor wrote beside it.
 *
 * `label` is the Version's own words, resolved from `crossover_sail_definitions` for the Version
 * the Race points at — not the current chart's wording for the same number (ADR 0023). It is null
 * exactly when `definition_number` is, which is the note-only entry: the sail was something the
 * chart does not name, and the page states what was written rather than a label nobody chose.
 */
export interface RaceSailAnnotation {
  /** The recording's own naive frame. Ordered with the rest of the list, earliest first. */
  at: string
  definition_number: number | null
  label: string | null
  note: string | null
}

/** One Sea State reading as a page states it. */
export interface RaceSeaStateAnnotation {
  at: string
  sea_state: SeaState
}

/**
 * The sailor's Testimony about a race, both kinds, earliest first.
 *
 * Either list may be empty, and an empty list means that kind was not recorded (ADR 0010). Nothing
 * here is resolved onto a row: resolution happens at read, from these lists, and is never stored
 * (see `annotationInForce` in services/races/annotations.ts).
 */
export interface RaceAnnotations {
  sails: RaceSailAnnotation[]
  sea_state: RaceSeaStateAnnotation[]
}

/**
 * The Boat Setup a race was sailed under, as its page states it.
 *
 * Every field is resolved from the pointers the Race froze, and each is null exactly when the pointer
 * is: *not recorded*, which the page says in those words rather than filling in the boat's current
 * artifact. Nine races in the archive predate any Boat Setup at all, and every one of them should read
 * that way (ADR 0012).
 *
 * A pointer that names a Version the read could not find is not represented — that is a broken
 * `ON DELETE RESTRICT`, not a state a screen should describe — so `readRace` refuses the page instead,
 * the same all-or-nothing it applies to the Transcription.
 */
export interface RaceBoatSetup {
  polar: BoatSetupVersionRef | null
  crossover_chart: BoatSetupVersionRef | null
  rig_tune: BoatSetupVersionRef | null
  instrument_calibration: BoatSetupVersionRef | null
  /** The band the sailor recorded, which always belongs to `rig_tune`. */
  band: WindBandRef | null
  /**
   * The mean TWS the file logged across the Race Window, in knots, or null where it logged none.
   *
   * Derived at read and stored nowhere, like coverage (ADR 0009). It exists so the page can put the
   * recorded band beside the wind that actually blew; it is never compared in order to correct the
   * band, and a disagreement between the two is a note.
   */
  logged_tws_mean: number | null
}

/** A race as its own page states it: its window, its coverage in time, and its Row Quality. */
export interface RaceDetail {
  id: string
  /** Null where the sailor gave none. See `RaceListEntry.title`. */
  title: string | null
  window_start: string
  window_finish: string
  recording: {
    id: string
    filename: string
    first_row_time: string
    last_row_time: string
    source_columns: string[]
  }
  coverage: RaceCoverage
  /** Assessed over the whole Transcription, then filtered to the window (ADR 0009). */
  quality: TranscriptionQuality
  findings: RaceFinding[]
  /** Testimony, as given. Either list may be empty, and the page says so in words. */
  annotations: RaceAnnotations
  /** Which Boat Setup Versions the race was sailed under, and the Wind Band the rig was set to. */
  boat_setup: RaceBoatSetup
}

/**
 * What deleting a race answers with.
 *
 * `bytes_removed` is false when the transaction committed and the object did not go with it — the
 * failure ADR 0013 chooses deliberately, since bytes nothing points at are invisible and sweepable
 * while a row pointing at bytes nobody kept is a race that lists, opens and then fails. The race is
 * gone either way, which is why this is not a failure; it is stated so the screen can say it and the
 * sweeper has something to find.
 */
export type DeleteRaceResult =
  | { ok: true; bytes_removed: boolean }
  | { ok: false; message: string }

/**
 * A stored race, as the flow needs it in order to be amended.
 *
 * This is the upload flow's `StagedRecording` with the upload taken out of it, and the difference is
 * the point: there is no `upload_id`, no `content_sha256`, no `filename`, and no `findings` about a
 * parse, because nothing here was parsed. `series` is drawn from `recording_rows` — the Transcription
 * as stored — so the amend path never reads a file, never hashes bytes and cannot ask the
 * duplicate-content question (ADR 0010 Amendment 1: the parse boundary is outside the flow).
 *
 * The Transcription is not reachable through this either, in the only sense that matters: `series`
 * carries the recorded values the charts draw, and there is no field here, and no action anywhere in
 * the app, that writes one back. What an amendment may change is what the sailor said about the
 * recording, never the recording.
 */
export interface RaceAmendment {
  race_id: string
  /** Null where the race has none, and shown as its day instead. Editable, and may be blanked again. */
  title: string | null
  /** The window as stored, in the recording's own naive frame. */
  window_start: string
  window_finish: string
  /**
   * The whole Transcription as charted series, not the part inside the window.
   *
   * The whole of it, because the window is the thing being amended: a sailor moving the start earlier
   * has to be able to see the rows they are moving it onto, and rows clipped to the old window would
   * make the new one undrawable.
   */
  series: RaceChartSeries
  /** The five answers the Race already records, as the pickers' starting state. */
  setup: RaceBoatSetupPointers
  /**
   * The Testimony as stored, in the recording's own frame, earliest first.
   *
   * Sail entries carry the Definition *number* and not its label: the words come from the chart
   * Versions the flow is already handed, so resolving them here would give the flow a second
   * vocabulary that could disagree with the one the pickers offer (ADR 0023).
   */
  sails: SubmitSailEntry[]
  sea_state: SubmitSeaStateEntry[]
}

/**
 * One amendment, as one save.
 *
 * Everything the flow can change travels together, and it is applied in one transaction — there is no
 * per-section save, because a sailor correcting the window and the sails they flew inside it is
 * correcting one thing, and a half-applied amendment would be a race that never happened (ADR 0010
 * Amendment 1).
 *
 * Both annotation lists are sent whole, always, and always replace what is stored. That is what makes
 * a section the sailor never opened safe: it sends back exactly what it was given.
 *
 * There is no change reason and no per-field history. `races.updated_at` is the whole record of an
 * amendment, and it is moved by the triggers on both annotation tables as well as by the row itself,
 * so a correction that touched only the sea state still advances it.
 */
export interface AmendRaceInput extends RaceBoatSetupPointers {
  race_id: string
  /** The recording's own naive frame. Refused if the window holds no recorded row, or ends first. */
  window_start: string
  window_finish: string
  /** Blank is stored as null: a titled race can be untitled again (ADR 0010). */
  title: string
  sails: SubmitSailEntry[]
  sea_state: SubmitSeaStateEntry[]
}

/**
 * What amending a race answers with.
 *
 * No `start_over` twin of `SubmitRaceResult`'s: nothing was staged, no bytes moved, and a refusal
 * leaves the race exactly as it stood — so every failure here is one the sailor can fix from where
 * they are standing and try again.
 */
export type AmendRaceResult = { ok: true } | { ok: false; message: string }

// Purdue Buoy (IISEAGrant) reading row
export interface PurdueBuoyReading {
  timestamp: Date
  wind_speed: number | null
  wind_direction: number | null
  wind_gust: number | null
  air_temp: number | null
  water_temp: number | null
  pressure: number | null
  humidity: number | null
  wave_height: number | null
  wave_period: number | null
  wave_direction: number | null
}
