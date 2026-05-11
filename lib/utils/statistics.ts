/**
 * Wind statistics utility module
 * Statistical calculations for wind analysis and trend detection
 */

/**
 * Wind statistics computed from minute-level history data
 */
export interface WindStats {
  speedTrend: {
    type: 'building' | 'easing' | 'steady'
    delta: number // Absolute change in knots
    signedDelta: number // Signed change (+ = building, - = easing)
  }
  directionTrend: {
    type: 'veering' | 'backing' | 'steady'
    delta: number // Absolute change in degrees
    signedDelta: number // Signed change (+ = veering, - = backing)
  }
  oscillation: number // ±X° range (half of std dev)
  oscillationRange: number // Full oscillation range in degrees
  gustFactor: number // Percentage difference between gust and average
  gustFactorLabel: 'Puffy' | 'Moderate' | 'Smooth'
  variability: number // Speed standard deviation
}

/**
 * Minute-level data point for trend calculations
 */
export interface MinuteDataPoint {
  minsAgo: number
  spd: number // Wind speed in knots
  dir: number // Wind direction in degrees
}

/**
 * Calculate standard deviation of numeric values
 * @param values - Array of numbers
 * @returns Standard deviation, or 0 if array is empty
 */
export function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Calculate circular standard deviation for wind directions
 * Handles wraparound correctly (e.g., 350° and 10° are close, not far apart)
 *
 * @param directions - Array of wind directions in degrees (0-360)
 * @returns Circular standard deviation in degrees, or 0 if array is empty
 */
export function calculateCircularStdDev(directions: number[]): number {
  if (directions.length === 0) return 0

  // Convert to radians and calculate mean direction
  let sumSin = 0
  let sumCos = 0
  directions.forEach((deg) => {
    const rad = (deg * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  })

  const meanSin = sumSin / directions.length
  const meanCos = sumCos / directions.length
  const r = Math.sqrt(meanSin * meanSin + meanCos * meanCos)

  // Circular standard deviation in degrees
  const circularStdDev = Math.sqrt(-2 * Math.log(r)) * (180 / Math.PI)
  return circularStdDev
}

/**
 * Calculate consensus direction from multiple wind directions
 * Handles wraparound correctly (e.g., average of 350° and 10° is 0°, not 180°)
 *
 * @param directions - Array of wind directions in degrees (0-360)
 * @returns Average direction in degrees (0-360), rounded to nearest degree
 */
export function averageDirections(directions: number[]): number {
  if (directions.length === 0) return 0

  // Convert to radians and calculate mean of sin/cos components
  let sumSin = 0
  let sumCos = 0

  directions.forEach((deg) => {
    const rad = (deg * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  })

  const avgSin = sumSin / directions.length
  const avgCos = sumCos / directions.length

  // Convert back to degrees
  const avgRad = Math.atan2(avgSin, avgCos)
  let avgDeg = (avgRad * 180) / Math.PI

  // Normalize to 0-360
  if (avgDeg < 0) {
    avgDeg += 360
  }

  return Math.round(avgDeg)
}

/**
 * Compute comprehensive wind statistics from minute-level history data
 * Analyzes speed trends, direction trends, oscillation, gust factor, and variability
 *
 * @param minuteHistory - Array of minute-level data points (last 2 hours)
 * @param currentSpeed - Current wind speed in knots
 * @param currentGust - Current gust speed in knots (optional)
 * @returns WindStats object or null if insufficient data (< 3 points)
 */
export function computeWindStats(
  minuteHistory: MinuteDataPoint[],
  currentSpeed: number,
  currentGust: number | undefined
): WindStats | null {
  if (minuteHistory.length < 3) return null

  // Speed trend: compare avg(last 20min) vs avg(last 2h)
  const last20min = minuteHistory.filter((p) => p.minsAgo <= 20)
  const allPoints = minuteHistory

  const avg20min = last20min.reduce((sum, p) => sum + p.spd, 0) / last20min.length
  const avg2h = allPoints.reduce((sum, p) => sum + p.spd, 0) / allPoints.length

  const speedDelta = avg20min - avg2h
  let speedTrendType: 'building' | 'easing' | 'steady' = 'steady'
  if (speedDelta > 0.3) speedTrendType = 'building'
  else if (speedDelta < -0.3) speedTrendType = 'easing'

  // Direction trend: newest - oldest, normalize to [-180, 180]
  const newest = minuteHistory[0]
  const oldest = minuteHistory[minuteHistory.length - 1]
  let dirDelta = newest.dir - oldest.dir

  // Normalize to [-180, 180]
  if (dirDelta > 180) dirDelta -= 360
  if (dirDelta < -180) dirDelta += 360

  let dirTrendType: 'veering' | 'backing' | 'steady' = 'steady'
  if (Math.abs(dirDelta) > 5) {
    dirTrendType = dirDelta > 0 ? 'veering' : 'backing'
  }

  // Oscillation range: std dev of directions over last hour
  const lastHour = minuteHistory.filter((p) => p.minsAgo <= 60)
  const dirStdDev = calculateCircularStdDev(lastHour.map((p) => p.dir))
  const oscillation = dirStdDev / 2 // Half of std dev for ± range

  // Gust factor
  const gustFactor = currentGust ? ((currentGust - currentSpeed) / currentSpeed) * 100 : 0
  let gustFactorLabel: 'Puffy' | 'Moderate' | 'Smooth' = 'Smooth'
  if (gustFactor > 30) gustFactorLabel = 'Puffy'
  else if (gustFactor > 15) gustFactorLabel = 'Moderate'

  // Speed variability: std dev over last hour
  const speedStdDev = calculateStdDev(lastHour.map((p) => p.spd))

  return {
    speedTrend: {
      type: speedTrendType,
      delta: Math.abs(speedDelta),
      signedDelta: speedDelta,
    },
    directionTrend: {
      type: dirTrendType,
      delta: Math.abs(dirDelta),
      signedDelta: dirDelta,
    },
    oscillation,
    oscillationRange: dirStdDev, // Full range for display
    gustFactor,
    gustFactorLabel,
    variability: speedStdDev,
  }
}
