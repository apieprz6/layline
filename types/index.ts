// Weather and wind data types
export interface WindForecast {
  source: string // 'NOAA', 'Windy', 'PredictWind', etc.
  timestamp: string
  speed: number // knots
  direction: number // degrees
  gust?: number // knots
  confidence?: number // 0-1
}

export interface BuoyData {
  buoyId: string
  name: string
  timestamp: string
  windSpeed: number // knots
  windDirection: number // degrees
  waveHeight?: number // feet
  wavePeriod?: number // seconds
  airTemp?: number // fahrenheit
  waterTemp?: number // fahrenheit
  pressure?: number // mb
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
