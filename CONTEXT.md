# Layline Weather Data Context

Layline fetches real-time weather data from multiple sources to provide sailors with actionable race preparation information for Wednesday night races on Lake Michigan.

## Language

### Data Sources

**Buoy**:
A physical weather monitoring station on Lake Michigan that provides real-time wind, wave, and environmental measurements.
_Avoid_: Weather station, sensor, source (too generic)

**Data Source**:
Any provider of weather information (buoys, weather models). Encompasses both real-time observations (buoys) and forecast predictions (weather models).
_Avoid_: API, service, endpoint

**CHII2 (Harrison Dever Crib)**:
Primary buoy located at Harrison Dever water crib, 85 feet above water surface. Always operational, measures wind at elevation (readings typically 20-30% higher than surface wind).

**Purdue Buoy (45198)**:
Secondary buoy with surface-level measurements. Seasonal (May-October). Best on-water wind speed when operational.

### Weather Models

**Weather Model**:
A numerical weather prediction (NWP) system that generates forecasts by simulating atmospheric physics. Layline integrates GFS (NOAA's global model), HRRR (NOAA's high-resolution regional), and ECMWF (European global model). Future: NAM (NOAA North American), HRDPS (Canadian high-resolution).
_Avoid_: Forecast model, prediction model (use Weather Model)

**GFS (Global Forecast System)**:
NOAA's global weather model with 384-hour (16-day) forecast horizon. Updates every 6 hours (00z, 06z, 12z, 18z UTC). Good for overall synoptic patterns and long-range planning.
_Context_: "GFS shows light air building to 12 knots by Wednesday evening"

**HRRR (High-Resolution Rapid Refresh)**:
NOAA's regional model covering North America with 48-hour forecast horizon. Updates hourly. Best for short-term Lake Michigan forecasts due to high temporal and spatial resolution.
_Context_: "HRRR predicts a shift from SW to W around 7:00 PM"

**ECMWF (European Centre for Medium-Range Weather Forecasts)**:
European global model with 240-hour (10-day) forecast horizon. Updates every 12 hours (00z, 12z UTC). Generally considered most accurate global model for medium-range forecasts.
_Context_: "ECMWF agrees with GFS on the approaching front Thursday"

**Forecast Horizon**:
The maximum time period ahead that a weather model predicts. Measured in hours (e.g., HRRR: 48h, GFS: 384h, ECMWF: 240h). Forecast accuracy typically decreases with distance from model run time.
_Avoid_: Prediction range, forecast length

**Forecast Location**:
Geographic coordinates (latitude, longitude) for which weather forecasts are requested. Layline's primary location is COLYC Race Circle (41.8528333°N, -87.55683333°W), approximately 2.5 nautical miles offshore from Navy Pier.
_Avoid_: Forecast point (that's a specific timestamp), location (too generic)

**Forecast Point**:
A single timestamped prediction from a weather model containing wind speed, direction, gusts, and optionally temperature/pressure. Weather models generate arrays of forecast points (e.g., hourly predictions for next 48 hours).
_Avoid_: Data point, prediction point

**Weather Model Result**:
The complete response from fetching a weather model forecast: model ID, location, array of forecast points, model run time, fetch time, data source status. Parallel to BuoyDataResult but for forecasts instead of observations.

**Model Run Time**:
The UTC time when a weather model execution began (e.g., "00z run" means model started at midnight UTC). Different models have different run schedules: HRRR runs hourly, GFS runs every 6 hours (00z/06z/12z/18z), ECMWF runs every 12 hours (00z/12z).
_Avoid_: Generation time, model time

### Data Status

**Online**:
Data source successfully fetched within the last 15 minutes (aligned with NDBC's 10-minute update frequency). Trustworthy for racing decisions.

**Recent**:
Data source fetch failed, but cached data is 15-30 minutes old. Still usable for racing decisions with caution.

**Stale**:
Cached data is 30-120 minutes old. Questionable reliability, use with caution.

**Offline**:
Cached data is >120 minutes old, or data source never successfully fetched. Not actionable.

**Error**:
Fetch failed with no cached data available. Data source unavailable.

### Data Fetching

**Live Fetch**:
Fresh API call bypassing cache. Used on dedicated live data pages with auto-refresh.
_Avoid_: Real-time, uncached

**Cached Fetch**:
Returns cached data if within TTL (10 minutes for history data, aligned with NDBC's update frequency). Used on dashboard for performance.
_Avoid_: Standard fetch, normal fetch

**Cache Adapter**:
Abstraction layer for weather model caching strategies. Implementations include InMemoryWeatherCache (default), with support for future Redis/Vercel KV backends. Allows cache strategy swapping without changing fetch logic.
_Context_: "The cache adapter can be swapped to Redis for multi-instance deployments"

**Staleness**:
Time elapsed since data was successfully fetched. Used to determine data source status and display freshness to users.

### Wind Analysis

**Veering**:
Wind direction shifting clockwise (e.g., SW → W → NW). Indicated by positive direction delta over time.
_Avoid_: Clocking

**Backing**:
Wind direction shifting counter-clockwise (e.g., W → SW → S). Indicated by negative direction delta over time.
_Avoid_: Anti-clocking

**Oscillation Range**:
The spread of wind direction changes over a time period (e.g., ±5° last hour). Indicates direction stability.
_Avoid_: Direction variance, shifting range

**Gust Factor**:
Percentage difference between gust and average wind speed ((gust - avg) / avg × 100). Indicates puffiness.
- >30%: Puffy conditions
- 15-30%: Moderate
- <15%: Smooth

**Speed Trend**:
Rate of wind speed change over time (e.g., "building +2 kts/h" or "easing"). Calculated by comparing recent average (last 20 min) to longer average (last 2 hours).
_Avoid_: Acceleration, wind change

**Variability (σ)**:
Standard deviation of wind speed over a time period. Measures consistency.
_Avoid_: Stability, consistency

### UI Components

**Station Card**:
UI component displaying buoy data. Has two states:
- **Collapsed**: Shows current wind speed, direction, gust, status dot
- **Expanded**: Adds history charts, trend badges, detailed statistics

**Summary Bar**:
Aggregated status display showing count of online stations, average wind across online sources, consensus direction, and last sync time.

**Trend Badge**:
Pill-shaped indicator showing speed or direction trend (e.g., "↑ Building +1.5 kts" or "↻ Veering +8° / 2h").

### Data Structures

**Wind History**:
Time-series of wind measurements from a buoy. NDBC provides 10-minute interval readings (up to 72 hours). Each point: `{ timestamp, spd, dir }` where timestamp is ISO 8601 format. UI components filter to needed time ranges (last hour, last 6h, last 72h, etc.) and calculate relative time offsets at render time to prevent timestamp drift.

## Relationships

- A **Buoy** is a type of **Data Source**
- A **Weather Model** is a type of **Data Source**
- Each **Buoy** has one **Data Source Status** at any given time
- Each **Weather Model Result** has one **Data Source Status** at any given time
- **CHII2** is always operational (never seasonally offline)
- **Purdue Buoy** is seasonal (May-October only)
- **Live Fetch** ignores cache, **Cached Fetch** respects cache TTL
- **Staleness** determines **Data Source Status** (online → recent → stale → offline)
- **Station Card** has collapsed (dashboard) and expanded (Wind Data page) states
- **Wind History** provides 10-minute interval data that UI components filter by time range
- **Speed Trend** calculated from filtered **Wind History** (20min avg vs 2h avg)
- **Veering** is positive direction delta, **Backing** is negative direction delta
- **Summary Bar** only averages wind from **Online** stations (excludes recent/stale/offline)
- Each **Weather Model** has a **Forecast Horizon** (HRRR: 48h, GFS: 384h, ECMWF: 240h)
- Each **Weather Model** has **Model Run Times** (HRRR: hourly, GFS: 6h, ECMWF: 12h)
- **Weather Model Result** contains multiple **Forecast Points** (one per timestamp)
- All **Weather Model Results** use the same **Forecast Location** (COLYC Race Circle)
- **Forecast Points** with null wind speed or direction are filtered out (data quality enforcement)

## Example dialogue

> **Dev:** "When CHII2 is marked as **Recent**, can we still display it?"
> **Domain expert:** "Yes — **Recent** means the data is 2-30 minutes old, which is still useful for race prep. Just show the timestamp so sailors know it's not brand new."

> **Dev:** "Should we treat **Purdue Buoy** being **Offline** in November as an error?"
> **Domain expert:** "No — that's expected. Mark it **Offline** with a note that it's seasonal. **Error** is for unexpected failures."

> **Dev:** "What's the difference between **Live Fetch** and **Cached Fetch**?"
> **Domain expert:** "**Cached Fetch** is for the dashboard where 10-minute-old data is fine (NDBC updates every 10 minutes anyway). **Live Fetch** is for the dedicated buoy page where someone's actively monitoring conditions before heading out — they want the absolute latest."

> **Dev:** "The wind direction changed from 230° to 250°. Is that **veering** or **backing**?"
> **Domain expert:** "That's **veering** — clockwise rotation. If it went from 250° to 230°, that would be **backing**."

> **Dev:** "Should the **Summary Bar** include **Recent** stations in the average wind calculation?"
> **Domain expert:** "No — only average **Online** stations. If data is older than 15 minutes, it's not representative of current conditions."

> **Dev:** "What's a good **Gust Factor** threshold for showing a warning?"
> **Domain expert:** "Above 30% is **puffy** — that's when sailors need to be ready for significant speed variations. Below 15% is **smooth**, easy to manage."

## Flagged ambiguities

- "real-time" was used to mean both "no cache" and "frequently updated data" — resolved: use **Live Fetch** for uncached requests, describe update frequency separately (e.g., "CHII2 updates every 10 minutes").
- "offline" could mean "seasonal" (expected) or "error" (unexpected) — resolved: **Offline** is a neutral status, context determines if it's expected (Purdue in winter) or concerning (CHII2 in summer).
