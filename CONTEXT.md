# Layline Weather Data Context

Layline fetches real-time weather data from multiple sources to provide sailors with actionable race preparation information for Wednesday night races on Lake Michigan.

## Language

### Data Sources

**Buoy**:
A physical weather monitoring station on Lake Michigan that provides real-time wind, wave, and environmental measurements. One type of **Data Source**.
_Avoid_: Weather station, sensor, source (too generic)

**Weather Model**:
Numerical weather prediction system providing forecast data. Each model has a different **Forecast Horizon** (how far into the future it predicts) and **Update Frequency** (how often new runs are published). One type of **Data Source**.

Supported models:
- **GFS** (Global Forecast System): US global model, 16-day horizon, 6-hour updates
- **HRRR** (High-Resolution Rapid Refresh): US regional model, 18-48h horizon, hourly updates
- **ECMWF** (European Centre): European global model, 10-day horizon, 12-hour updates
- **NAM** (North American Mesoscale): US regional model, 84-hour horizon (planned)
- **HRDPS** (High Resolution Deterministic Prediction System): Canadian regional model (planned)

_Avoid_: Forecast model, prediction model

**Forecast Horizon**:
Maximum time range a weather model provides predictions for. Varies by model (e.g., HRRR: 18-48h, GFS: 16 days, ECMWF: 10 days).
_Avoid_: Forecast window, prediction range

**Data Source**:
Any provider of weather information. Encompasses both **Buoys** (observations) and **Weather Models** (forecasts).
_Avoid_: API, service, endpoint

**CHII2 (Harrison Dever Crib)**:
Primary buoy located at Harrison Dever water crib, 85 feet above water surface. Always operational, measures wind at elevation (readings typically 20-30% higher than surface wind).

**Purdue Buoy (45198)**:
Secondary buoy with surface-level measurements. Seasonal (May-October). Best on-water wind speed when operational.

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

**Forecast Point**:
Single timestamped prediction from a weather model (timestamp, wind speed, direction, optional gust).

**Weather Model Result**:
Complete forecast dataset from a single model run. Contains array of **Forecast Points**, **Data Source Status**, and **Forecast Location**.

**Forecast Location**:
Geographic coordinate for weather model forecasts. Primary location is **COLYC Race Circle** (41.8528333°N, -87.55683333°W) for Wednesday night races.

**Model Run Time**:
Timestamp when a weather model execution began (e.g., "2026-05-21T12:00Z"). Models update on schedules (HRRR hourly, GFS every 6h, ECMWF every 12h).

### API Structure

**Weather Model Endpoints**:
Individual endpoints per model allow parallel fetching and progressive loading:
- `GET /api/weather/models/gfs` - GFS forecast data
- `GET /api/weather/models/hrrr` - HRRR forecast data  
- `GET /api/weather/models/ecmwf` - ECMWF forecast data

Each endpoint returns a **Weather Model Result** with forecasts for **COLYC Race Circle** location.


## Relationships

- **Buoy** and **Weather Model** are both types of **Data Source**
- Each **Data Source** has one **Data Source Status** at any given time
- Each **Weather Model** has a **Forecast Horizon** (how far ahead it predicts) and **Model Run Time** schedule
- Weather models are fetched from Open-Meteo via individual API endpoints (`/api/weather/models/{modelId}`)
- **CHII2** is always operational (never seasonally offline)
- **Purdue Buoy** is seasonal (May-October only)
- **Live Fetch** ignores cache, **Cached Fetch** respects cache TTL
- **Staleness** determines **Data Source Status** (online → recent → stale → offline)
- **Station Card** has collapsed (dashboard) and expanded (Wind Data page) states
- **Wind History** provides 10-minute interval data that UI components filter by time range
- **Speed Trend** calculated from filtered **Wind History** (20min avg vs 2h avg)
- **Veering** is positive direction delta, **Backing** is negative direction delta
- **Summary Bar** only averages wind from **Online** stations (excludes recent/stale/offline)

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
