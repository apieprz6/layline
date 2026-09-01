# Layline Weather Data Context

Layline fetches real-time weather data from multiple sources to give sailors actionable wind information for racing on Lake Michigan — any race, any day. It presents current conditions by default; a **Target Time** is optional.

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
_Context_: "GFS shows light air building to 12 knots by Saturday evening"

**HRRR (High-Resolution Rapid Refresh)**:
NOAA's regional model covering North America with 48-hour forecast horizon. Updates hourly. Best for short-term Lake Michigan forecasts due to high temporal and spatial resolution.
_Context_: "HRRR predicts a shift from SW to W around sunset"

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

### Time & Occasion

**Target Time**:
An optional future moment a sailor anchors the forecast to — a start time, a scheduled race, or any time of interest. When no Target Time is set, Layline presents current conditions. A Target Time is chosen by the sailor; Layline does not assume one.
_Avoid_: Race time (implies a fixed recurring schedule), forecast time (that's any Forecast Point's timestamp), start time (too narrow — a Target Time need not be a race start)

**Current Conditions**:
The present state of the wind as reported by Buoys, with no Target Time applied. The default view. Distinct from a forecast, which is always a prediction for some other moment.
_Avoid_: Live conditions (reserved for the Live Fetch concept), real-time

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

### Boat Setup

**Boat Setup**:
The versioned record of how the boat is configured: its **Polar**, **Crossover Chart**, **Sail Definitions**, **Rig Tune**, and **Instrument Calibration**. Each is versioned independently; a **Race** is measured against the versions that were current when it was sailed.
_Avoid_: Versioned artifact, config, boat config, settings (a Boat Setup artifact is a measured or measured-out record, not a preference)

**Version**:
An immutable snapshot of one **Boat Setup** artifact. A new Version is minted whenever the artifact changes — by upload (Polar, Crossover Chart, Sail Definitions) or by entry (Rig Tune, Instrument Calibration). Earlier Versions are never overwritten, because Races already point at them. One exception: an **Instrument Calibration** Version's numbers may be corrected in place, because they are transcribed off a display and a mistyped figure would otherwise stand forever as what the boat ran.
_Avoid_: Revision, edit, update

**Polar**:
The table of the boat's target boat speed by true wind angle and true wind speed. The boat's own performance reference, measured or certificate-derived — nothing to do with wind observations.
_Avoid_: Polar chart (that's the **Wind Rose**), speed chart, VMG table (a Polar holds boat speed, not VMG)

**Target Speed**:
The boat speed the **Polar** says is achievable at a given true wind angle and true wind speed. Always computed by Layline from the stored **Polar**; never read from a **Recording**, even though recordings carry a target-speed column of their own.
_Avoid_: Polar speed, POL (that's a column in a Recording, not this concept), hull speed, Target Time (an unrelated weather concept)

**Polar Efficiency**:
Actual boat speed as a fraction of **Target Speed** at the angle the boat is actually sailing. Answers "is the boat going as fast as it can at this angle" — and nothing else: a Polar Efficiency of 100% says nothing about whether the angle was the right one to steer. Distinct from **VMG Efficiency**, which judges the angle too.
_Avoid_: Percent of polar, percent of target, polar percent, boat speed percentage

**VMG (Velocity Made Good)**:
The component of boat speed in the direction that matters — upwind, the speed made directly to windward: boat speed × cos(true wind angle). Always derived, never measured by an instrument.
_Avoid_: Speed to mark, progress, effective speed

**Target VMG**:
The best **VMG** the **Polar** can produce at a given true wind speed, achieved at that Polar's optimal beating or running angle. A property of the Polar and the wind speed alone — it does not depend on the angle currently being sailed.
_Avoid_: Target speed (that's boat speed at a specific angle — a different number), best VMG, optimum

**VMG Efficiency**:
Actual **VMG** as a fraction of **Target VMG**. Judges boat speed and steering angle together, so it is the harsher and more tactically honest number: sailing fast at a bad angle scores well on **Polar Efficiency** and badly here. Meaningful upwind and downwind only — on a reach, VMG is measured toward a mark, and Layline holds no course or mark data.
_Avoid_: Polar efficiency (a different number), percent of target VMG, VMG percentage

**Crossover Chart**:
The grid of true wind angle against true wind speed naming which **Sail Configuration** to carry. A recommendation the boat may or may not have followed — comparing it against what was actually flown is the point of keeping it.
_Avoid_: Sail selection chart, sail chart, matrix

**Sail Definition**:
One numbered entry in the sail list a **Crossover Chart** refers to. The number is the chart's own identifier, not Layline's idea of a sail. A Sail Definition may exist without the chart ever calling for it.
_Avoid_: Sail number, sail id, sail type

**Sail Configuration**:
The sails set at a given moment, as the set of sails flown plus the **Reef State**. What the crew actually did, distinct from what the **Crossover Chart** suggested. The sails aboard Handsome Pete are `main`, `jib-1`, `jib-2`, `jib-3`, `A2`, `A3`. A Sail Configuration may be as small as the main alone.
_Avoid_: Sail plan, sail combo, sail selection (that's the chart's recommendation, not what was flown), reaching spin (the sail is the `A3`)

**Reef State**:
How deeply the mainsail is reefed in a **Sail Configuration**. Handsome Pete's main has one reef point, so the values are `full` and `reef-1`. Named for the reef point rather than as a yes/no, so a future main with two reefs does not force the vocabulary to change.
_Avoid_: Reefed (as a boolean), shortened, first reef

**Rig Tune**:
The versioned record of the boat's shroud settings, one row per **Wind Band**. Entered by hand from measurements on the dock, never uploaded from a file — no such file has ever existed for this boat. Holds only standing rigging the crew can actually adjust: the three **Shroud Positions**, port and starboard. Deliberately silent about the headstay, mast rake, pre-bend and mast butt position, none of which are adjustable in practice on Handsome Pete, and about backstay, cunningham and outhaul, which are trim rather than tune.
_Avoid_: Rig setup, tuning guide (that's the external document the numbers come from), rig config, rig file

**Shroud Position**:
One of the three shroud pairs a **Rig Tune** records: `V1` (the cap shroud), `D1` (the lower) and `D2` (the intermediate). Named as the boat's tuning guide names them, so figures transcribe without a mapping step. Each Position is recorded for port and starboard separately, because each has its own turnbuckle and the two genuinely differ.
_Avoid_: Upper / mid / lower (the mockup's names, and `Mid` is `D2` while `Lower` is `D1` — an easy transcription error), shroud, stay, cap

**Turnbuckle Gap**:
The measured distance between the threads inside one turnbuckle, in millimetres, for one **Shroud Position** on one side. Smaller gap means more tension. The figure a caliper produces and the one that restores a **Rig Tune** when something has moved.
_Avoid_: Tension, shroud tension, Loos reading (a dimensionless gauge number, and its meaning depends on the gauge model), gap (bare)

**Turns From Base**:
How far one **Shroud Position** is wound off the **Base Tune**, as signed full turns at half-turn resolution. How the rig is actually re-geared at the dock, with no tools. Stored alongside the **Turnbuckle Gap** rather than derived from it: both are the specification, and no thread pitch is recorded that would let one produce the other.
_Avoid_: Turns (bare), delta, adjustment, offset (that word belongs to **Instrument Calibration**)

**Base Tune**:
The one **Wind Band** in a **Rig Tune** whose **Turnbuckle Gaps** are absolute, and from which every other band's **Turns From Base** is counted. On Handsome Pete it is a heavier band — the tune set for the Race to Mackinac and then left in — so most of the table runs looser than base, and the largest deltas sit at the light end. Marked by an explicit flag, never by a band's position in the list or by its name.
_Avoid_: Base (bare), base setting, default tune, standard tune

**Wind Band**:
One true-wind-speed range in a **Rig Tune**, holding the settings for those conditions. The bands belong to the Version, not to the application: they are entered by hand from whichever tuning guide the numbers came from, they must be contiguous, and the top band is open-ended. Distinct from the dashboard's Light / Medium / Heavy / Storm display classification, which describes conditions on screen and has no business indexing a tune.
_Avoid_: Wind range, condition band, gear (as in "shifting gears" — that's the act, not the row)

**Instrument Calibration**:
The versioned record of the corrections programmed into the boat's instrument display: one multiplier and one **Programmed Offset** per **Calibration Channel**. Entered by hand off the display's own screens and kept in the display's own encoding — a multiplier reads `1.02`, never `+2%`. A Version snapshots all channels at once, and is dated from when the numbers went into the instrument, not when they were typed into Layline.
_Avoid_: Calibration (bare), calibration file, calibration settings, instrument correction

**Calibration Channel**:
One measurement the instrument display corrects: `AWA`, `AWS`, `STW`, or `HDG`. The correction is `multiplier × reading + Programmed Offset`, and only `AWS` and `STW` have a multiplier — `AWA` and `HDG` carry an offset alone. The same four names identify what a **Calibration Event** was performed on.
_Avoid_: Instrument (the display corrects channels, not devices — one masthead unit feeds both `AWA` and `AWS`), sensor, field

**Programmed Offset**:
The figure a person typed into the instrument display for one **Calibration Channel**, in that channel's own unit — degrees for `AWA` and `HDG`, knots for `AWS` and `STW`. What the boat was told. Distinct from the **Measured Offset**, which is what the data says is still wrong afterwards.
_Avoid_: Offset (bare — ambiguous between this and a **Measured Offset**), calibration offset, correction

**Calibration Event**:
Something a person did to the instruments on a given date, recorded as that date, the **Calibration Channels** it was performed on, and a note in plain words. Its type is either `autocompensation` — the compass rebuilding its own deviation table, which can only be performed on `HDG` — or `other`, covering everything else: a paddlewheel replaced or cleaned, a masthead unit swapped or re-aligned, a smoothing setting changed in the navigation software. Records an action, never a value; numbers live in **Instrument Calibration**.
_Avoid_: Calibration (bare — ambiguous between the action and the number)

**Calibration Log**:
The one timeline of everything done to the instruments, assembled when read from two sources: the **Calibration Events** somebody wrote down, and the **Instrument Calibration** Versions, each shown as what it changed. Nothing is stored in it twice, and it holds no value of its own — "what is the boat set to now" is answered by the current Instrument Calibration Version, never by reading back through the Log.
_Avoid_: Log (bare — overloaded between logbook, Calibration Log, and NMEA log)

**Measured Offset**:
The instrument error still present in a **Race**'s own data, derived by Layline — a compass deviation, a wind-angle offset. Because the display applies its correction before a **Recording** is written, this is what remains *after* the **Programmed Offset** rather than the whole error: a residual. Independently measured, never written back into the **Calibration Log** and never held on the instrument.
_Avoid_: Calibration, correction, error

### Race Archive

**Race**:
One complete race sailed, as the sailor-supplied window of start and finish inside a **Recording**. The unit sailors talk about and the unit performance is reported for.
_Avoid_: Regatta (that's a multi-race event, which Layline does not model), series, event, session

**Recording**:
One qtVlm VDR export, covering a single **Race** plus the transit before it and the motoring after. Longer than the Race it contains.
_Avoid_: Log, track, GPX, file

**Sea State**:
The wave conditions a sailor reports from the boat, as one of `calm` / `slight` / `moderate` / `rough` (roughly 0-1 / 1-2 / 2-3 / 3+ ft). Human-observed and human-entered; never inferred from wind.
_Avoid_: Wave state, chop, Douglas number (the formal Douglas scale is numeric 0-9 and is not what these bands are)

### Users & Authentication

**Guest**:
An unauthenticated visitor. Guests have full access to the dashboard, weather data, and all read-only features. No account required.
_Avoid_: Anonymous user, visitor

**Profile**:
A signed-in user's identity. Stored in the `profiles` table. Contains `display_name`, `role`, and `preferences`. Created on first sign-up (email/password or Google OAuth).

**Display Name**:
Human-readable name shown in the UI (e.g., avatar initials, greeting). Sourced from the sign-up form (email/password flow) or Google profile metadata (OAuth flow).

**Role**:
Flat permission level on a profile. Values: `admin` (can upload **Races**, modify **Boat Setup**), `user` (can view boat performance data), or `null` (not yet assigned). Assigned after sign-up, not during.
_Avoid_: Captain, crew, tactician, trimmer (legacy terms from initial design)

**Auth Sheet**:
Bottom sheet overlay (82% viewport height) on the dashboard. Three modes: Sign in (email + password), Sign up (name + email + password), Forgot password (email only). Includes Google OAuth in sign-in and sign-up modes. Not a dedicated route — lives inside the dashboard layout.
_Avoid_: Login page, auth page (it's a sheet, not a page)

**Account Merging**:
When a user signs up with email/password and later authenticates via Google OAuth with the same email address, both identities resolve to the same account. Configured in Supabase auth settings.

### UI Components

**Station Card**:
UI component displaying buoy data. Has two states:
- **Collapsed**: Shows current wind speed, direction, gust, status dot
- **Expanded**: Adds history charts, trend badges, detailed statistics

**Wind Rose**:
Radial display of wind observations from one **Buoy**: angle is wind direction, distance from centre is how recently the observation was taken, colour is wind speed. A weather display — it has nothing to do with the boat's **Polar**.
_Avoid_: Polar chart, polar (reserved for the boat's target-speed table)

**Summary Bar**:
Aggregated status display showing count of online stations, average wind across online sources, consensus direction, and last sync time.

**Trend Badge**:
Pill-shaped indicator showing speed or direction trend (e.g., "↑ Building +1.5 kts" or "↻ Veering +8° / 2h").

### Data Structures

**Wind History**:
Time-series of wind measurements from a buoy. NDBC provides 10-minute interval readings (up to 72 hours). Each point: `{ timestamp, spd, dir }` where timestamp is ISO 8601 format. UI components filter to needed time ranges (last hour, last 6h, last 72h, etc.) and calculate relative time offsets at render time to prevent timestamp drift.

## Relationships

- A **Boat Setup** comprises a **Polar**, a **Crossover Chart**, **Sail Definitions**, a **Rig Tune**, and an **Instrument Calibration**
- Each **Boat Setup** artifact has many **Versions**; each **Race** points at the Versions current when it was sailed
- A **Recording** contains exactly one **Race**; the Race is the sailor-supplied window inside it
- A **Race** carries **Sail Configurations** and **Sea State** as human annotations, resolved onto the Recording by time
- A **Crossover Chart** cell names a **Sail Definition**; every cell must resolve to one, but a Sail Definition need not appear in any cell
- A **Sail Configuration** is what was flown; a **Crossover Chart** says what was suggested — the two are compared, never conflated
- **Target Speed** is computed from the **Polar**, never read from a **Recording**
- **Polar Efficiency** compares boat speed against **Target Speed** at the angle sailed; **VMG Efficiency** compares **VMG** against **Target VMG** and judges the angle itself
- **Target Speed** depends on both true wind angle and true wind speed; **Target VMG** depends on wind speed alone
- A **Sail Configuration** is a set of sails plus one **Reef State**
- A **Rig Tune** has one row per **Wind Band**; each row holds a **Turnbuckle Gap** and a **Turns From Base** for every **Shroud Position**, port and starboard
- Exactly one **Wind Band** in a **Rig Tune** is the **Base Tune**; its **Turnbuckle Gaps** are absolute and every other band's **Turns From Base** counts from it
- **Wind Bands** are contiguous and the top one is open-ended, so every wind speed falls in exactly one band
- Changing the **Base Tune**'s **Turnbuckle Gaps** marks every other band's Gaps stale; their **Turns From Base** are unaffected
- A **Race** points at the **Rig Tune** Version in force when it was sailed and records which **Wind Band** the boat was set to, or at neither — the archived races predate any Version
- The **Wind Band** a **Race** was set to is what the crew chose, never derived from the **Recording**'s own wind; the gap between the two is a finding, not an ingest error
- A **Calibration Event** records a human action; a **Measured Offset** is derived from a **Race** — neither produces the other
- An **Instrument Calibration** holds one multiplier and one **Programmed Offset** per **Calibration Channel**; a **Calibration Event** names the Channels it was performed on and holds no numbers at all
- The **Calibration Log** is a view over **Calibration Events** and **Instrument Calibration** Versions; the current Version answers what the boat is set to, and the Log never does
- A **Race** points at the **Instrument Calibration** Version in force when it was sailed, or at none — an unrecorded calibration is left empty rather than guessed
- A **Programmed Offset** is what a person put into the instrument; a **Measured Offset** is what the data says is left over
- A **Wind Rose** displays **Buoy** observations; a **Polar** describes the boat — they share no data
- A Guest sees no **Boat Setup** and no **Race**; a **Profile** with `role` `admin` may write them
- A **Guest** can use all dashboard and weather features without a **Profile**
- A **Profile** is created on sign-up (email/password or Google OAuth)
- A **Profile** has one **Role** (`admin`, `user`, or `null`)
- **Account Merging** links email/password and Google OAuth identities sharing the same email
- The **Auth Sheet** opens from the dashboard; it does not navigate to a separate route
- The `/auth/reset-password` page is the only dedicated auth route (deep-linked from email)
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
- A **Target Time** is optional and sailor-set; with none set, Layline shows **Current Conditions**
- A **Target Time** selects one **Forecast Point** per **Weather Model** for emphasis; it never filters the others out
- **Current Conditions** come from **Buoys**; a **Target Time** is served by **Weather Models**

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

> **Dev:** "The **Recording** already has a target speed column. Why compute **Target Speed** ourselves?"
> **Domain expert:** "Because that column is qtVlm's number, not ours — it was computed inside that software against settings we can't see and can't recover. We recompute from the **Polar** so every race is measured the same way."

> **Dev:** "The crew flew the main alone for two minutes. Which **Sail Definition** is that?"
> **Domain expert:** "None — the numbered list has no entry for it. That's exactly why a **Sail Configuration** is a set of sails and not a number off the chart."

> **Dev:** "We were at 101% **Polar Efficiency** upwind but only 88% **VMG Efficiency**. Is one of them wrong?"
> **Domain expert:** "Both are right — that's the boat going beautifully in the wrong direction. Full speed for the angle you're steering, but you're steering too low to make good progress to windward. If they ever read the same, one of them is broken."

> **Dev:** "We re-measured the **Polar** in July. Does the June race's percentage change?"
> **Domain expert:** "No. That race points at the **Version** that was current in June, and it keeps pointing at it forever."

> **Dev:** "The display has a `+2°` wind angle offset programmed. So the **Measured Offset** for a race should come out near zero?"
> **Domain expert:** "It should come out near zero if the `+2°` was right. The display corrects the reading before the recording is written, so what you measure afterwards is whatever is *still* wrong — the leftover. If it reads 3°, the boat needs 3° more, not 3° instead of the 2°."

> **Dev:** "The **Base Tune** is one of the heavy bands? I assumed base meant the middle of the range."
> **Domain expert:** "It means the tune we actually set and leave in. We tune for the Mac — three days offshore, heavy-ish all round — and that's the rig for most of the season. Everything else is easing off it, so the light-air band is the furthest from base, not the closest."

> **Dev:** "If we store **Turns From Base** and the **Turnbuckle Gap** for the same band, isn't one of them redundant?"
> **Domain expert:** "No, they're for different moments. Turns are how I re-gear at the dock in five minutes with a spanner. The gap is how I put it back where it belongs when something's come loose and I don't trust anything — that's when the caliper comes out. Both are the spec. If they ever disagree, somebody miscounted, and I'd want to know."

> **Dev:** "We re-measured the **Base Tune** in July. The other bands' gaps are still on file — are they still good?"
> **Domain expert:** "No, and that's the trap. The turns are still right — light air is still a turn and a half looser than base, whatever base is. But every millimetre figure I wrote down for the other bands was measured against the old base, so they're all wrong until I go and measure them again."

## Flagged ambiguities

- "real-time" was used to mean both "no cache" and "frequently updated data" — resolved: use **Live Fetch** for uncached requests, describe update frequency separately (e.g., "CHII2 updates every 10 minutes").
- "offline" could mean "seasonal" (expected) or "error" (unexpected) — resolved: **Offline** is a neutral status, context determines if it's expected (Purdue in winter) or concerning (CHII2 in summer).
- "polar" meant both the boat's target-speed table and the dashboard's radial wind display — resolved: **Polar** is the boat's table only; the wind display is the **Wind Rose**. The two share no data and no purpose.
- "regatta" was used for what the data calls a race — resolved: **Race**, always. Layline models one race per **Recording** and no multi-race event, so "regatta" promises a fleet, a series, and results that do not exist here.
- A **Recording**'s `POL` column looks like a target speed and is one — but it is qtVlm's own computation, made against coefficients held in that installation and recorded nowhere in the export. Resolved: Layline ignores it and computes **Target Speed** from the stored **Polar** instead. Do not read `POL` for anything.
- `PRE` in a **Recording** reads like "performance" and is **atmospheric pressure** (and is empty in every row this boat has produced). The percent-of-polar channel qtVlm does have is `PPC`, which is absent from the export entirely. Code treating `PRE` as performance is silently wrong.
- "calibration" meant an action, a number a person programs into the boat, and a number derived from data — resolved into three terms: a **Calibration Event** is the action, a **Programmed Offset** is what was typed into the instrument, and a **Measured Offset** is what the data says is still wrong. Bare "calibration" is avoided, and so is bare "offset".
- A **Calibration Event** on `HDG` changes far more than heading. A **Recording**'s true wind direction is computed from the compass, so a heading error lands in the wind columns too — the archive's recordings from before July 2026 carry roughly 10-12° of it. That propagation is a fixed property of the recording format, documented once in `docs/research/qtvlm-csv-columns.md`, so an Event names only the **Calibration Channel** it was performed on and never lists the columns it goes on to contaminate.
- The navigation software's polar penalties are deliberately **not** stored. They are a pessimistic planning hedge for long offshore races — a tired crew trims less actively — not a description of how the boat sails, so feeding them into **Target Speed** would flatter every result. Worse, tuning a penalty until races read 100% is circular: it calibrates the yardstick to the measurement and destroys the only number that was informative. The honest figure is **Polar Efficiency** against the unpenalised **Polar**, and the penalty is something that goes *out* to the navigation software, never something that comes back in.
- A **Version** is immutable everywhere except an **Instrument Calibration** correction. Nothing else in a **Boat Setup** can be edited after minting — an upload can simply be re-uploaded, and a wrong **Rig Tune** is superseded by the right one. A calibration Version is different because it is a transcription off a display: left uncorrectable, a mistyped figure would stand permanently as what the boat ran, and every **Race** pointing at it would report against a number that never existed.
- "wind band" meant three different sets of edges for one boat. The dashboard classifies conditions at 0-8 / 9-15 / 16-22 / 23+ knots (`lib/utils/wind.ts`, shipped and used by four components), the mockup's analysis screens classify at ≤9 / ≤14 / 15+ (`classifyBin`), and the rig tune mockup used 0-8 / 9-14 / 15-20 / 21+. Resolved by separating concerns rather than picking a winner: the dashboard classification owns *display*, and a **Wind Band** is data on a **Rig Tune** Version, entered from whichever tuning guide the numbers came from. What is forbidden is sharing the *words*: the mockup keyed its rig bands `light` / `base` / `medium` / `heavy`, three of which are also `classifyBin` return values with different ranges — rig `medium` is 15-20 kt, which `classifyBin` calls `heavy`, and 9-14 kt has no `classifyBin` key at all. Indexing a tune by a classification result compiles and returns the wrong rig.
- "rig" meant both the boat's standing rigging and the trim advice on the dashboard. `RigRecommendation.tsx` renders a card headed "Rig setup" carrying backstay, cunningham and outhaul — which are running rigging, adjusted continuously while sailing, and generated per forecast. A **Rig Tune** is standing rigging, measured on the dock, and versioned. Resolved: "Rig Tune" is the artifact and "Rig setup" is not a phrase Layline uses; that card is trim and is renamed accordingly. It is currently hidden, so the rename is deferred rather than dropped.
- The boat's own tuning guide makes the **headstay** its dominant per-band adjustment — North's card swings it -6 to +12 turns where `V1` moves -1 to +1 — and a **Rig Tune** does not record it at all. This is deliberate, not an oversight: the headstay turnbuckle is not easily reachable on Handsome Pete, so the crew shifts gears on the shrouds alone, which is itself published practice (Doyle's guide for the sister boat prints `N/A` in its head stay column for every band). The consequence to understand is that the remaining per-band spread is only about one to three turns, so a **Rig Tune**'s value rests as much on its notes and on the per-race band record as on the numbers.
- Headstay *sag* has no target and no field, in any unit. No tuning guide in this family publishes one, and on a swept-spreader fractional rig it is governed dynamically by the backstay and statically by `D1` and `D2` stiffness — not, as is easy to assume, by cap shroud tension, whose published job is side bend. Nothing should be built expecting a sag or headstay-tension number to validate against.
- A **Rig Tune** looked like a file and is not one. The mockup gave it a filename (`Wayward_Wind.rig`), a Download action and an Upload action, for an artifact that has never existed as a file for this boat and is typed in by hand. Resolved: no filename, no upload, no download. It keeps its row alongside the uploaded artifacts, showing only its Version and date.
- Sail configurations were spelled three ways — `Main + Jib 1` in the design, `main+jib-1` in the analysis pipeline, `[main, jib-1]` in the annotations. Resolved: a **Sail Configuration** is the set of sails flown plus a reef state; the numbered form belongs to **Sail Definitions** and is the **Crossover Chart**'s identifier, not Layline's. The two schemes cannot express each other — the numbered list has no entry for mainsail alone (which was flown), and the set-based annotations have no reef token (though reefed entries cover a large share of the chart).
- The sail previously annotated `reaching-spin` is the **`A3`**, and that is its name from now on. The old annotations and two **Sail Definition** labels ("Main + Reaching Spin", "Reef + Reaching Spin") use the old word. Since nothing outside Layline reads those files, the **Sail Definitions** are authored correctly at seed time as **v1** — Layline's version history starts with the right names rather than recording a correction to a name it never used.
- **Polar Efficiency** and **VMG Efficiency** are different numbers and must never be shown as one. Polar Efficiency compares boat speed against the target *for the angle being sailed*, so it rewards a well-trimmed boat sailing the wrong course. VMG Efficiency compares progress against the best the boat could theoretically make, so it penalises the bad angle. A boat pinching or sailing too low can read high on the first and low on the second at the same instant — that gap is the useful signal, and collapsing the two into "percent of polar" destroys it.
- **Polar Efficiency**'s numerator is not yet decided. Speed through the water is the dimensionally correct choice, because the **Polar** is a through-water target — but that is the uncalibrated paddlewheel, whose calibration is known to vary between sessions. Speed over ground is trustworthy but measures a different quantity against a through-water target, which is wrong in any current. A related trap: recordings with a blank through-water speed also have their *wind* columns computed from GPS, so those rows change meaning in two ways at once.
- **Neither efficiency figure means anything below about 45° true wind angle.** The **Polar**'s 30° and 35° rows are manufactured filler rather than measurements — row 35 is exactly twice row 30 in every column — so a boat pinching at 28° computes to roughly 480% of target. Any display must suppress that range rather than render it.
- **Sea State** is not the Douglas scale. NOAA marine forecasts carry formal numeric sea state; Layline's four named bands are what a sailor can honestly report from the rail. Never join the two as if they were the same vocabulary.
- A **Polar**'s wind-speed axis is defined at 10 m above the water. **CHII2** measures at 85 ft (~26 m), where wind runs 20-30% stronger. Feeding a CHII2 reading into a Polar lookup overstates **Target Speed** by roughly that margin.
- "race time" was used to mean both a fixed weekly moment (Wednesday 7:00 PM) and "whenever the user cares about" — resolved: **Target Time**, always optional and always sailor-set. Layline assumes no schedule and no fleet. Wednesday-night series racing is one occasion among many (weekend regattas, distance races, or simply watching the lake).
