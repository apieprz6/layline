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
export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  email: string
  role: UserRole | null
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
}

export interface Profile {
  id: string
  user_id: string
  display_name: string | null
  role: UserRole | null
  preferences: UserPreferences
  created_at: string
  updated_at: string
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
export type ReefState = 'full' | 'reef-1'
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

/** One sail in the boat's Sail Inventory. */
export interface Sail {
  id: string
  boat_id: string
  /** Stable slug a Sail Configuration points at: 'main', 'jib-1', 'A2'. */
  key: string
  /** What the sailor sees. Renaming a sail is an UPDATE of this, and nothing else. */
  label: string
  sort_order: number
  /** A flown sail is never deleted, only retired out of the picker. Calendar date. */
  retired_on: string | null
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

export interface CrossoverSailDefinition {
  number: number
  label: string
}

export interface CrossoverChartPayload {
  twa_axis: number[]
  tws_axis: number[]
  /** One row per TWA, one cell per TWS, each cell a `sail_definitions` number. */
  cells: number[][]
  sail_definitions: CrossoverSailDefinition[]
  source?: { format: string; header_token: string }
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

export type ShroudPosition = 'V1' | 'D1' | 'D2'

/**
 * Both figures for every position and side (ADR 0007): turns re-gear the rig at the dock,
 * the gap restores it when nothing is trusted, and neither derives from the other because
 * no thread pitch is recorded.
 */
export interface ShroudSideSetting {
  gap_mm: number
  turns_from_base: number
}

export interface ShroudPositionSetting {
  port: ShroudSideSetting
  starboard: ShroudSideSetting
}

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
 */
export interface RaceSailEntry {
  id: string
  race_id: string
  at: string
  reef: ReefState
  created_at: string
}

/** A Sail Configuration is a set of sails, so it is stored as a set. Never empty. */
export interface RaceSailEntrySail {
  entry_id: string
  sail_id: string
}

export interface RaceSeaStateEntry {
  id: string
  race_id: string
  at: string
  sea_state: SeaState
  created_at: string
}

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
