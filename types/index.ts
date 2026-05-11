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
export interface User {
  id: string
  email: string
  role: 'captain' | 'crew' | 'tactician' | 'trimmer'
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
  role: string | null
  preferences: UserPreferences
  created_at: string
  updated_at: string
}

// Buoy history types
export interface HourlyDataPoint {
  time: string // HH:MM format (e.g., "14:00")
  spd: number // wind speed in knots
  dir: number // wind direction in degrees
}

export interface MinuteDataPoint {
  minsAgo: number // minutes ago from now (e.g., 0, 10, 20, ...)
  spd: number // wind speed in knots
  dir: number // wind direction in degrees
}

export interface BuoyHistoryData {
  buoyId: string
  name: string
  hourlyHistory: HourlyDataPoint[] | null // 6 hourly points, null if unavailable
  minuteHistory: MinuteDataPoint[] | null // ~12 10-min points (last 2h), null if unavailable
  extendedHistory: MinuteDataPoint[] | null // ~432 10-min points (last 72h), null if unavailable
  status: DataSourceStatus
  fetchedAt: string
  error?: string
}
