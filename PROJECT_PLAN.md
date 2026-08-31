# Layline Development Plan

## Project Context

**Location**: COLYC Race Circle, Lake Michigan (41.8528333°N, -87.55683333°W) — ~2.5nm offshore of Navy Pier  
**Occasions**: Any race, any day — weeknight series, weekend regattas, distance races — plus plain conditions-watching with no race at all  
**Schedule**: None assumed. Current conditions by default; a **Target Time** is optional and sailor-set  
**Budget**: Low ($0-5/month target)  
**Goal**: Single dashboard replacing 4 weather apps + 3 websites

### Local Knowledge
- **Harrison Dever Crib (CHII2)**: Wind measurements at 85ft elevation
  - Excellent for wind direction and trend analysis
  - **Important**: Readings are at 85ft, NOT surface level
  - Typically 20-30% higher than on-water conditions
  - Great for wind shear analysis
  - **Note**: Display raw data as-is, never modify incoming measurements
  
- **Purdue Buoy (45198)**: Best on-water current conditions
  - Down for winter, back early May
  - Most accurate "on-water" wind speed when operational
  - Live data at: https://iiseagrant.org/45198/

## Phase 1: Foundation ✅ COMPLETE

- [x] Next.js + TypeScript + Tailwind setup
- [x] Supabase integration (auth + database)
- [x] Basic project structure
- [x] Dashboard layout
- [x] Auth pages (login/signup)
- [x] TypeScript types for race data
- [x] Claude API service setup
- [x] Mock API routes

## Phase 2: Weather Data Integration (IN PROGRESS)

### Free API Stack (Zero Cost)

All data sources below are FREE with no API keys or costs:

### Priority 1: NOAA Marine Forecast (Most Trusted Source)
**Why first**: User reports this is consistently most accurate for actual on-water conditions

**API**: NOAA NWS Weather.gov API  
**Endpoints**:
- `/points/41.8528,-87.5568` - Point forecast for the race circle
- Marine zone forecasts for Lake Michigan
- Hourly marine data

**Implementation**:
1. Create service: `services/weather/noaa-marine.ts`
2. Fetch point forecast and marine zone forecast
3. Parse JSON response (GeoJSON format)
4. Display text forecast + structured hourly data

**Documentation**: https://weather-gov.github.io/api/

### Priority 2: NOAA Buoy Data
**Why second**: Real-time on-water observations

**Harrison Dever Crib (CHII2)**:
- Station ID: `chii2`
- URL: https://www.ndbc.noaa.gov/station_page.php?station=chii2
- Data: Wind speed/direction (at 85ft), pressure, temperature
- Implementation: Parse NDBC real-time text format
- **Important**: Store raw data as-is. Tag metadata to indicate 85ft elevation

**Purdue Buoy (45198)** (Available May+):
- Station ID: `45198`
- Best on-water wind speed
- Scrape from: https://iiseagrant.org/45198/
- Fallback: NDBC THREDDS/OPeNDAP access

**Implementation**:
1. Create service: `services/buoys/ndbc.ts`
2. Fetch latest observations (real-time .txt files)
3. Parse space-separated value format
4. Display with 15-minute refresh while the user is actively monitoring

### Priority 3: Open-Meteo Multi-Model Forecasts
**Why third**: Free access to multiple forecast models for comparison

**API**: Open-Meteo  
**Free Tier**: 300,000 calls/month (more than enough)  
**Models Available**:
- NOAA GFS (US model)
- NOAA HRRR (high-resolution US, good for Lake Michigan)
- ECMWF (European model)

**Implementation**:
1. Create service: `services/weather/open-meteo.ts`
2. Fetch hourly forecast for the Forecast Location
3. Request multiple models in single API call
4. Compare model agreement/disagreement
5. Refresh every 6 hours

**Documentation**: https://open-meteo.com/

### Priority 4: NOAA Wave Data (if available)
**Research needed**: Check if Great Lakes wave models available for Lake Michigan

### Future Paid Options (If Budget Allows Later)

**PredictWind API** ($$$):
- Sailing-specific forecasts
- 1km resolution proprietary models
- Professional-grade (America's Cup proven)
- Consider if free sources prove insufficient

**Storm Glass API** (~$19-49/month):
- Wave heights, swell patterns
- Marine-specific data
- Good for sea state analysis

**Windy API** (pricing unclear):
- Beautiful visualizations
- ECMWF high-resolution
- Would need to replicate viz in our UI

## Phase 3: LLM Analysis Enhancement

### Current State
- Basic prompt template exists
- Returns structured JSON response

### Race Strategy Analysis (Core Value)

The LLM should analyze weather data and provide tactical guidance on:

1. **Course Selection**:
   - Which course will race committee likely call?
   - Wind range and direction considerations
   - Lake Michigan local patterns (shoreline effects, funneling)

2. **Boat Setup**:
   - **Rig tuning**: Heavy air vs light air settings
   - Mast prebend, shroud tension, backstay tension
   - When to change from standard settings

3. **Sail Trim Strategy**:
   - **Jib/Main trimmers**: Optimize for light/medium/heavy air?
   - Expected wind range throughout race
   - Sail shape recommendations based on sea state
   - Wave conditions affecting sail shape

4. **Tactical Positioning**:
   - Wind shifts expected during race window?
   - Favored side of course (left vs right)
   - Timing of expected shifts
   - Strategic positioning recommendations

5. **Conditions Summary**:
   - Aggregate view from multiple sources
   - Model agreement/disagreement highlights
   - Confidence level in forecast
   - Key changes from previous brief

### Enhancements
1. **Improve prompt with local knowledge**:
   - Add typical course setups for your race committee
   - Include Lake Michigan wind patterns:
     - Shoreline thermal effects
     - Evening wind trends
     - **Harrison Dever context**: Measurements at 85ft typically read 20-30% higher than surface
   - Your boat's optimal wind range
   - Crew skill level and experience
   - **Critical**: LLM interprets raw data, never modify source measurements

2. **Add caching** (save API costs):
   - Cache raw weather data for 15-30 minutes
   - Only regenerate briefing when data changes significantly
   - Target: <1000 Claude API calls/month (~$0.50-2/month)

3. **Historical context**:
   - Store past race conditions in database
   - Feed historical accuracy into prompts
   - "Over the last 3 southerly evenings, NOAA over-predicted by 3 knots..."
   - Track which sources are most accurate for this location
   - Learn race committee's course selection patterns

4. **Structured Output**:
   - JSON format for UI display
   - Sections: Conditions, Setup, Tactics, Confidence
   - Easy for crew to scan on mobile

## Phase 4: UI/UX Polish

### Dashboard Components to Build
1. **Wind rose visualization** (show direction distribution)
2. **Timeline graph** (wind speed/direction over next 6 hours)
3. **Comparison table** (all forecast sources side by side)
4. **Confidence indicators** (when models agree vs disagree)
5. **Mobile optimization** (most checking happens on phone)

### Interaction Features
- Manual refresh button
- Auto-refresh with timestamp
- Settings page for preferred sources
- Saved preferences per user

## Phase 5: Advanced Features

### Scheduled Updates

**Recommended: GitHub Actions + Vercel (Zero Cost)**

Since Vercel free tier only allows 1 cron job per day, use GitHub Actions to trigger your API endpoints on schedule.

**Cost**: $0 (GitHub Actions free tier: 2,000 minutes/month)

**Implementation**:
1. Create API endpoint: `app/api/cron/fetch-weather/route.ts`
2. Add cron secret to both `.env.local` and Vercel environment variables
3. Create GitHub Actions workflow (see below)
4. GitHub triggers your Vercel API on schedule

**Cadence**: Because Layline assumes no race schedule, background refresh follows **model run availability**, not a fleet calendar. Each model is worth re-fetching shortly after its run lands (HRRR hourly; GFS/ECMWF/ICON every 6h with availability delays of ~1.5–7h). See the forecast fetch-and-cache work for the authoritative cadence.

A simple every-6-hours sweep is a reasonable starting point, with on-demand fetches covering everything else. If a **Target Time** is set, tighten the cadence as it approaches rather than keying off a fixed day.

**GitHub Actions Workflow**:
```yaml
# .github/workflows/fetch-weather.yml
name: Scheduled Weather Updates

on:
  schedule:
    # Every 6 hours, shortly after the main synoptic runs land
    - cron: '0 5,11,17,23 * * *'
  # Allow manual trigger for testing
  workflow_dispatch:

jobs:
  fetch-weather:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch weather data and generate briefing
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/cron/fetch-weather \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

**API Endpoint**:
```typescript
// app/api/cron/fetch-weather/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch weather from all sources
  // Generate LLM briefing
  // Cache in database
  // (Optional) Send notifications if significant change

  return NextResponse.json({ success: true })
}
```

**Alternative: Upstash QStash** ($0-10/month if you need more reliability)
- More robust than GitHub Actions
- Better error handling and retries
- Overkill for a beer can race, but an option

### Notifications
- Email or SMS when forecast changes significantly
- "Wind shifted from 8-12 to 15-20 knots"
- Uses Supabase Functions + Resend/Twilio

### History & Analytics
- Store each race's forecast vs actual conditions
- Track which sources are most accurate for your location
- Post-race debrief showing what actually happened

## Phase 6: Crew Features

### Collaboration
- Comments/notes on the briefing
- Crew-specific roles see relevant info highlighted
- Shared checklist (did we rig for heavy air?)

### Race Day Mode
- Opt-in mode, activated by setting a **Target Time** — not by the calendar
- Countdown to the Target Time
- Live conditions foregrounded (de-emphasize long-range forecasts)
- Quick reference cards (rig settings, sail trim)

## Technical Debt / Optimization

### Performance
- Implement SWR or React Query for data fetching
- Add loading skeletons
- Progressive Web App (PWA) for offline access

### Testing
- E2E tests for critical flows (auth, data fetch)
- Unit tests for data parsers (weather APIs return weird formats)

### Monitoring
- Error tracking (Sentry)
- Analytics (which features get used most)
- API usage monitoring (don't blow through Claude credits)

## Estimated Timeline

**Week 1-2**: Weather API integration (ALL FREE)
- NOAA Marine Forecast integration: 2-3 hours
- Harrison Dever (CHII2) buoy data: 2-3 hours
- Purdue Buoy (45198) scraping: 2-3 hours
- Open-Meteo multi-model: 2-3 hours
- Test with real data: 2 hours
- **Total: 10-14 hours**

**Week 3**: LLM race strategy analysis + UI
- Customize prompts with local knowledge: 3-4 hours
- Build race strategy briefing format: 2-3 hours
- Data visualization components: 4-6 hours
- Mobile-first responsive design: 2-3 hours
- **Total: 11-16 hours**

**Week 4**: Deploy + crew testing
- Deploy to Vercel (free tier): 1 hour
- Set up Supabase crew access (invite-only): 1-2 hours
- Invite crew, gather feedback: ongoing
- Iterate based on what's actually useful

**Week 5+**: Refinement before season
- Test with pre-season forecasts
- Tune LLM prompts based on accuracy
- Add historical tracking
- Optimize caching to minimize Claude API costs

**Future**: Advanced features as needed (only if they prove valuable)

## Cost Estimates

**Development/Hosting** (Free Tiers):
- Vercel hosting: $0 (free tier)
- Supabase: $0 (free tier - 500MB DB, plenty for this)
- All weather APIs: $0 (public/free sources only)

**Operational Costs**:
- Claude API: ~$0.50-2/month (prompt caching + low volume)
- **Total: ~$0.50-2/month** ✅ Well within budget

## Measuring Success

- **Usage**: Do you check it before every race?
- **Accuracy**: How often are the AI recommendations helpful?
- **Time saved**: vs checking 4 apps + 3 websites
- **Crew adoption**: Does the crew find it valuable?

## Technical Implementation Notes

### API Details & Rate Limits

**NOAA NWS API**:
- No API key required
- Must include User-Agent header with contact info
- Rate limits enforced (unspecified, but reasonable use is fine)
- Returns GeoJSON by default
- 2.5km grid resolution

**NOAA NDBC Buoys**:
- Real-time data: Plain text format (space-separated values)
- Historical data: NetCDF via THREDDS/OPeNDAP
- Update frequency: Every 10 minutes (Harrison Dever)
- No API key needed

**Open-Meteo**:
- No API key for free tier
- 300,000 calls/month free
- Rate limits: 600/min, 5,000/hr, 10,000/day
- Can request multiple models in single call
- 15-minute resolution available

**Illinois-Indiana Sea Grant (Purdue Buoy)**:
- Not a REST API - need to scrape HTML
- Real-time updates when buoy is operational (May-October)
- Fallback to NDBC data if scraping fails

### Data Freshness Strategy

Freshness keys off **what the user is doing**, not what day it is.

**Browsing / planning (no Target Time, or one that's days out)**:
- Fetch forecasts every 6 hours
- Cache for 6 hours to minimize API calls
- Update LLM brief only when data changes

**Actively monitoring (Target Time within a few hours, or on a live data page)**:
- Fetch buoy data every 15 minutes
- Forecast data every 30 minutes (not changing that fast)
- Real-time display mode

**Off-season**:
- Manual refresh only
- No background jobs
- Saves API costs
- Note: "off-season" is about *lake* conditions (and Purdue Buoy being pulled), not about a race series ending. CHII2 runs year-round and the app stays useful

### Architecture Decisions

**Core Principle: Raw Data Integrity**
- NEVER modify incoming weather data
- Store all measurements exactly as received from source
- Include metadata (station elevation, measurement height, source)
- Interpretation/adjustment happens only in:
  - LLM analysis layer
  - UI display hints/annotations
  - User-facing documentation

**Next.js API Routes** (not separate Express server):
- `/api/weather/marine-forecast` - NOAA marine forecast
- `/api/weather/buoys` - Both CHII2 and 45198
- `/api/weather/models` - Open-Meteo multi-model
- `/api/race/briefing` - LLM-generated race strategy

**Supabase Tables**:
```sql
-- Store historical race conditions
races (id, date, forecast, actual_conditions, notes)

-- Store raw weather snapshots
weather_snapshots (id, timestamp, source, data_json)

-- Crew management
profiles (id, user_id, role, preferences)
```

**Caching Strategy**:
- Server-side: In-memory cache for API responses (15-30 min)
- Client-side: SWR with stale-while-revalidate
- Database: Store historical data for learning

## Notes

Remember:
- Start simple, validate with real races
- Better to have one excellent data source than five broken ones
- The LLM analysis is the unique value—focus on making that great
- Don't over-engineer before you know what's actually useful on the water
- **NEVER modify raw data** - Harrison Dever context (85ft elevation) is for LLM analysis and UI hints only
- Purdue buoy is seasonal (May-October) - handle gracefully when offline
- No assumed race schedule: the dashboard gets checked year-round, at all hours, with and without a race pending
- Mobile-first: Most checking happens on phones during the commute/before leaving for marina
