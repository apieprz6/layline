# Layline Weather Data Context

Layline fetches real-time weather data from multiple sources to provide sailors with actionable race preparation information for Wednesday night races on Lake Michigan.

## Language

### Data Sources

**Buoy**:
A physical weather monitoring station on Lake Michigan that provides real-time wind, wave, and environmental measurements.
_Avoid_: Weather station, sensor, source (too generic)

**Data Source**:
Any provider of weather information (buoys, forecasts, models). Buoys are one type of data source.
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

## Relationships

- A **Buoy** is a type of **Data Source**
- Each **Buoy** has one **Data Source Status** at any given time
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
