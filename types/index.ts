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
  raceDate: string
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
