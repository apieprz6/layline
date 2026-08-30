# Layline Core Beliefs

This document establishes the foundational principles that guide all technical and design decisions in the Layline project. When in doubt about an implementation approach, refer back to these beliefs.

## Domain Principles

### 1. Raw Data Integrity (CRITICAL)

**Never modify incoming weather measurements.**

**Why**: Sailors trust original source data. Making adjustments hides the interpretation layer and breaks trust. When a sailor sees "20 knots at CHII2," they need to know that's what the station actually reported, not what we think it "should" be at surface level.

**How**:
- Store all measurements exactly as received from the source
- Add metadata fields to provide context (station elevation, measurement height, source)
- Interpretation happens ONLY in:
  - LLM analysis layer (context provided in prompts)
  - UI display hints and annotations
  - User-facing documentation

**Example - Harrison Dever (CHII2) at 85ft elevation**:

✅ **CORRECT**:
```typescript
interface BuoyReading {
  windSpeed: 20,  // Store exact raw value
  windDirection: 225,
  metadata: {
    station: 'CHII2',
    elevation: 85,  // feet above water
    source: 'NOAA NDBC',
    timestamp: '2026-04-27T18:00:00Z',
    adjustmentNote: 'Wind measured at 85ft typically reads 20-30% higher than surface'
  }
}

// LLM prompt includes context:
"Wind at CHII2 (Harrison Dever Crib) is measured at 85ft elevation, 
which typically reads 20-30% higher than surface wind. Adjust your 
expectations accordingly when providing tactical advice."

// UI displays both:
"CHII2: 20 kts at 85ft (expect ~14-16 kts on water)"
```

❌ **WRONG - Never do this**:
```typescript
interface BuoyReading {
  windSpeed: 15,  // ← Modified from 20 based on elevation
  windDirection: 225,
  source: 'CHII2'
}
// This destroys trust and hides the interpretation
```

**Applies to**: All weather data (wind speed, direction, pressure, temperature, wave height)

---

### 2. Mobile First

**Most usage happens on phones before and during races.**

**Why**: Sailors check the forecast during their commute, at the dock, and before leaving the office. The dashboard needs to work perfectly on a 390px screen in bright sunlight.

**How**:
- Design for 390px viewport first (iPhone 14 size)
- Use high-contrast Solar theme (readable in sunlight)
- Large touch targets (44px minimum)
- Critical information above the fold
- Progressive enhancement for larger screens

**Example**:
```css
/* Mobile first (default) */
.wind-card {
  font-size: 1rem;
  padding: 1rem;
}

/* Desktop enhancement */
@media (min-width: 768px) {
  .wind-card {
    font-size: 1.25rem;
    padding: 1.5rem;
  }
}
```

---

### 3. Confidence Over Precision

**Show model agreement/disagreement rather than false precision.**

**Why**: "All models predict 12-15 knots" is more valuable than "13.7 knots" because it conveys confidence. When models disagree, sailors need to know to prepare for a range of conditions.

**How**:
- Display ranges, not single values
- Highlight model agreement vs disagreement
- Use confidence indicators
- Don't imply precision where none exists

**Example**:
```typescript
// Good: Shows range and confidence
"Wind: 12-15 kts (all 3 models agree)"

// Better: Shows disagreement
"Wind: 10-16 kts (models disagree: GFS 10-12, HRRR 14-16)"

// Bad: False precision
"Wind: 13.742 kts"
```

---

### 4. Local Knowledge Matters

**Lake Michigan patterns, race committee tendencies, and shoreline effects are critical context.**

**Why**: Generic sailing advice is useless. The Chicago lakefront has unique characteristics that affect tactics, and encoding this local knowledge makes Layline valuable.

**How**:
- Encode Lake Michigan patterns in LLM prompts
- Reference race committee's typical course selections
- Account for shoreline thermal effects and lake-breeze timing
- Consider the time of day actually being asked about, rather than assuming one
- Include historical patterns from past races

**Local knowledge is about *place and physics*, not about a schedule.** Encode what the lake does at a given hour and season; do not encode "races start at 7:00 PM."

**Example**:
```
LLM Prompt context:
"The COLYC Race Circle sits ~2.5nm offshore of Navy Pier in an urban harbor 
setting. On summer afternoons a lake breeze often fills from the E/NE and can 
override a light gradient. Toward sunset, wind frequently goes lighter and 
shiftier as thermal forcing collapses. The race committee typically sets 
windward-leeward courses in medium air and may shorten in light or heavy 
conditions."
```

---

## Technical Principles

### 1. Server Components by Default

**Use Client Components only when interactivity is needed.**

**Why**: Server Components reduce JavaScript bundle size, improve performance, and enable direct data fetching. The majority of Layline's UI is static content that doesn't need client-side JavaScript.

**When to use Client Components**:
- `useState`, `useEffect`, or other React hooks needed
- Event handlers (`onClick`, `onChange`, etc.)
- Browser APIs (localStorage, geolocation)
- Real-time subscriptions (Supabase listeners)

**When to use Server Components** (default):
- Static content display
- Data fetching from APIs
- Authentication checks
- Database queries

**Example**:
```typescript
// Server Component (default) - No 'use client'
export default async function RaceBriefing() {
  const briefing = await fetchBriefing()
  return <div>{briefing.summary}</div>
}

// Client Component (only when needed)
'use client'
export default function RefreshButton() {
  const [loading, setLoading] = useState(false)
  return <button onClick={...}>Refresh</button>
}
```

---

### 2. Type Safety is Non-Negotiable

**TypeScript strict mode, no exceptions.**

**Why**: Sailing tactics require precision. Type safety catches errors at compile time rather than runtime, when a sailor is relying on the briefing before a race.

**Rules**:
- TypeScript strict mode enabled
- No `any` types (use `unknown` if truly uncertain)
- Explicit return types for exported functions
- Centralized types in `/types/index.ts`
- Interface over type for object shapes

**Example**:
```typescript
// ✅ Good
export async function generateBriefing(
  input: RaceAnalysisInput
): Promise<RaceBriefing> {
  // ...
}

// ❌ Bad
export async function generateBriefing(input: any) {
  // ...
}
```

---

### 3. API Cost Control

**Cache aggressively, regenerate strategically.**

**Why**: Budget is $0-5/month. Claude API costs can add up quickly if not managed. Caching is essential to stay within budget while still providing timely updates.

**Strategy**:
- Cache raw weather data for 15-30 minutes
- Only regenerate LLM briefings when data changes significantly
- Use prompt caching for long system prompts
- Target: <1000 Claude API calls/month (~$0.50-2/month)

**Caching rules**:
```typescript
// Weather data cache: 15 minutes when actively monitoring conditions
const ACTIVE_CACHE = 15 * 60 * 1000 // 15 min

// Weather data cache: 30 minutes for general forecast browsing
const BROWSE_CACHE = 30 * 60 * 1000 // 30 min

// LLM briefing regeneration threshold
const WIND_CHANGE_THRESHOLD = 3 // knots

// Only regenerate if:
if (Math.abs(newWind - cachedWind) > WIND_CHANGE_THRESHOLD) {
  regenerateBriefing()
}
```

---

### 4. Progressive Enhancement

**Core functionality works without JavaScript where possible.**

**Why**: Reliability matters more than flashy features. If JavaScript fails to load, sailors should still be able to see the forecast.

**How**:
- Server-rendered content by default
- Client-side enhancements added progressively
- No JavaScript required for reading static briefing
- Forms work with/without JavaScript

**Example**:
```typescript
// Server Component renders full content
export default async function Forecast() {
  const data = await fetchWeather()
  
  return (
    <div>
      {/* Works without JS */}
      <StaticForecastTable data={data} />
      
      {/* Enhanced with JS */}
      <ClientSideChart data={data} />
    </div>
  )
}
```

---

## UX Principles

### 1. Scannable in 30 Seconds

**Crew needs to get the gist during a quick check.**

**Why**: Sailors are busy. They're checking the dashboard while commuting, packing gear, or at the dock. They need to understand conditions in 30 seconds or less.

**How**:
- Clear visual hierarchy (most important info first)
- Concise language (no fluff)
- Use progressive disclosure (details hidden until needed)
- Bold critical information
- Color coding for conditions (light/medium/heavy/storm)

**Content hierarchy**:
1. **Wind conditions** (speed, direction, classification)
2. **Condition summary** (one sentence)
3. **Rig setup** (what to do before leaving)
4. **Tactical advice** (race strategy)
5. **Detailed forecast** (for deep dive)

---

### 2. Actionable Information

**Every piece of data should lead to a decision.**

**Why**: Sailors don't need data for data's sake. They need to know: What sails to bring? How to set up the rig? Which side of the course to favor?

**How**:
- Translate data into actions
- Provide specific recommendations
- Explain the "why" behind advice
- Prioritize decisions by impact

**Example**:
```
❌ Bad (data dump):
"Wind speed: 14 knots, Direction: 225°, Pressure: 1015 mb"

✅ Good (actionable):
"Medium air (14 kts) from SW. 
→ Standard rig settings, full sails
→ Favored side: Right side of course (wind expected to clock right)
→ Start strategy: Starboard tack start, work right"
```

---

### 3. Traceable Sources

**Always show data sources and timestamps.**

**Why**: Builds trust and allows verification. If the forecast is wrong, sailors want to know which source to blame and when the data was collected.

**How**:
- Timestamp all forecasts
- Show source for each data point
- Link to original source where possible
- Display data freshness ("Updated 15 minutes ago")

**Example**:
```
Wind: 12-15 kts
Sources: 
  - NOAA Marine: 14 kts (updated 3:00 PM)
  - CHII2 Buoy: 18 kts at 85ft (updated 3:15 PM)
  - Open-Meteo GFS: 12 kts (forecast for 7:00 PM)
```

---

### 4. Honest About Uncertainty

**Show when models disagree. Don't oversell confidence.**

**Why**: Sailors appreciate honesty. Weather is inherently uncertain. Hiding uncertainty leads to overconfidence and poor decisions.

**How**:
- Explicitly state when models disagree
- Use confidence indicators
- Provide ranges, not false precision
- Explain limitations of data sources

**Example**:
```
✅ Good (honest):
"Wind forecast: 10-16 kts (models disagree significantly)
- GFS: 10-12 kts
- HRRR: 14-16 kts
Confidence: Low. Prepare for a range of conditions."

❌ Bad (overconfident):
"Wind forecast: 13 kts
High confidence."
```

---

## Sailing Domain Context

### Race Format
- **PHRF handicap racing** (not one-design)
- **Recreational competitive** (beer can series through weekend regattas, not professional)
- **No assumed schedule.** Weeknight series, weekend regattas, and distance races are all in scope, as is simply watching conditions with no race at all

### Occasion & Time
- Layline opens on **Current Conditions**. A **Target Time** is optional and set by the sailor
- Never hardcode a race day, a start time, or a "race window" — the app is used year-round and at all hours
- Time-of-day reasoning is still valuable (lake breeze, sunset collapse), but it must key off the time actually being asked about

### Location
- **COLYC Race Circle**, Lake Michigan
- **Coordinates**: 41.8528333°N, 87.55683333°W (~2.5nm offshore of Navy Pier)
- Single canonical Forecast Location — see `lib/config/locations.ts`
- **Urban harbor setting** (wind influenced by buildings and shoreline thermals)

### Typical Conditions
- **Wind**: 8-15 knots most common
- **Occasional heavy air**: 16-22 knots
- **Rare storm conditions**: 23+ knots

### Course Options
- **Windward-leeward**: Most common
- **Triangle**: Less common
- **Course length**: 3-6 miles typical

### Crew Level
- **Recreational competitive** (not professional sailors)
- **Mixed experience levels**
- **Age range**: 25-65 typical
- **Boat types**: Variety of PHRF-rated boats (25-40 feet)

### Usage Pattern
- **Days out**: Is this regatta going to be sailable? Long-range forecast check
- **Morning of / day before**: Planning — what to bring, how to set up
- **Hours before**: Final forecast update against a **Target Time**
- **On the way / at the dock**: Quick conditions check
- **No race at all**: Watching a front move through, or checking whether it's worth going out

Usage is continuous and year-round, not clustered around one evening a week.

---

## Anti-Patterns to Avoid

These patterns violate our core beliefs and should never be used:

### ❌ Data Manipulation
- Modifying raw weather data
- "Correcting" measurements based on assumptions
- Hiding data source details
- Applying blanket adjustments

### ❌ Type Unsafety
- Using `any` types in TypeScript
- Skipping type definitions for interfaces
- Implicit return types
- Loose type checking

### ❌ Premature Client Components
- Adding 'use client' to static components
- Using Client Components for data fetching
- Unnecessary JavaScript for static content
- Overusing client-side state

### ❌ Pages Router Patterns
- Using Next.js Pages Router patterns (removed in Next.js 16)
- `getServerSideProps` / `getStaticProps`
- Old Supabase auth helpers
- Pages directory structure

### ❌ Unbounded API Usage
- Not caching API responses
- Regenerating briefings unnecessarily
- Ignoring rate limits
- No cost control measures

### ❌ Generic Sailing Advice
- Advice not specific to Lake Michigan
- Ignoring local wind patterns
- Generic tactics not tailored to PHRF handicap racing on the Chicago lakefront

### ❌ Assumed Schedule
- Hardcoding a race day or start time (e.g. Wednesday, 19:00)
- Treating a **Target Time** as always present
- Copy that presumes the user is preparing for a race right now
- "Race window" logic that only makes sense one evening a week

### ❌ Technical Jargon Overuse
- Overly technical language in UI
- Sailing terms not explained
- Assumptions about crew knowledge level
- Not progressive in complexity

### ❌ Desktop-Only Design
- Designing for desktop first
- Small touch targets (<44px)
- Poor readability in sunlight
- Horizontal scrolling on mobile

---

## Decision Framework

When making technical or design decisions, ask:

1. **Does this respect raw data integrity?** If modifying source data, stop.

2. **Does this work on mobile?** If not optimized for 390px screen, rework.

3. **Does this convey confidence appropriately?** If hiding model disagreement, revise.

4. **Does this encode local knowledge?** If generic advice, make it Lake Michigan-specific.

5. **Is this a Server Component?** If using 'use client' unnecessarily, reconsider.

6. **Is this type-safe?** If using `any`, define proper types.

7. **Does this control API costs?** If unbounded API calls, add caching.

8. **Is this scannable in 30 seconds?** If too much detail, use progressive disclosure.

9. **Is this actionable?** If just showing data, translate to decisions.

10. **Is this honest about uncertainty?** If overselling confidence, add caveats.

---

## Conflict Resolution

When beliefs conflict:

**Safety > Everything else**
If there's any question about safety (storm conditions, equipment failure, crew safety), err on the side of caution. Recommend not racing if conditions are dangerous.

**Raw data integrity > User experience**
Never compromise data integrity for convenience. If showing raw data is ugly, improve the presentation without modifying the data.

**Type safety > Development speed**
Take the time to define proper types. The upfront cost pays off in reliability.

**Mobile experience > Desktop features**
If a feature works great on desktop but poorly on mobile, it's not ready. Fix mobile first.

**Local knowledge > Generic advice**
Lake Michigan-specific advice > general sailing tactics. Always.

---

## Evolution of Beliefs

This document should evolve as we learn:

**Add new beliefs when**:
- A pattern emerges from multiple decisions
- User feedback reveals an implicit principle
- Technical constraints require new guidance

**Update existing beliefs when**:
- We discover a better way to achieve the goal
- Technology changes (e.g., new Next.js version)
- Usage patterns reveal flaws in assumptions

**Never compromise on**:
- Raw data integrity
- Type safety
- Mobile-first approach
- Safety-first recommendations

---

## Summary

Layline's core beliefs prioritize:

1. **Trust through transparency** (raw data integrity, traceable sources)
2. **Mobile-first accessibility** (390px design, high contrast)
3. **Honest uncertainty** (confidence over precision, model disagreement)
4. **Local expertise** (Lake Michigan patterns, place-specific advice)
5. **Technical quality** (Server Components, type safety, cost control)
6. **User-focused UX** (scannable, actionable, honest)

When in doubt, refer back to these principles. They exist to make Layline a trusted, reliable, and valuable tool for sailors racing on Lake Michigan — whatever is on the schedule, and whenever they look.
