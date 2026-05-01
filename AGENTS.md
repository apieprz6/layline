# Layline AI Assistant Guide

Welcome! This guide helps AI coding assistants work effectively in the Layline codebase. Read this first before making any code changes.

## Critical Context

### This is NOT the Next.js You Know

**WARNING**: This project uses **Next.js 16.2.4** with breaking changes from your training data.

- **App Router only** (Pages Router removed)
- **Server Components by default** (explicit 'use client' for interactivity)
- **New API route syntax** (`export async function GET()` not `export default function handler()`)
- **Supabase SSR patterns** (separate server/client implementations)

📖 **Read**: `docs/references/nextjs16-llms.txt` for complete breaking changes guide

### Sailing Domain Knowledge Required

Layline is a **sailing race preparation dashboard** for competitive Wednesday night regattas on Lake Michigan. You need to understand sailing terminology and tactics to work effectively.

📖 **Read**: `docs/references/sailing-glossary-llms.txt` for complete terminology

### Core Principle: Raw Data Integrity

**NEVER modify incoming weather data.** Store measurements exactly as received, add metadata for context, and interpret only in LLM prompts or UI annotations.

Example: Harrison Dever (CHII2) reports 20 knots at 85ft elevation. Store 20, add metadata about elevation, and explain in UI that surface wind is typically 20-30% lower.

📖 **Read**: `docs/design-docs/core-beliefs.md` for complete principles

### Claude Sonnet 4 Integration

The core value proposition is **LLM-generated race briefings** that analyze weather data and provide tactical sailing advice.

- Current implementation: `services/llm/claude.ts`
- Model: Claude Sonnet 4 (claude-sonnet-4-20250514)
- Cost control: Cache aggressively, target <1000 calls/month (~$0.50-2/month)

📖 **Read**: `docs/design-docs/llm-integration.md` for prompt patterns (coming soon)

---

## Project Overview

### What is Layline?

A Next.js dashboard that replaces checking 4 weather apps + 3 websites before Wednesday night races. Provides:
- Real-time wind conditions from multiple sources
- AI-generated tactical race briefings
- Rig setup recommendations
- Course strategy advice

### Key Details

- **Location**: Navy Pier Racing Circle, Lake Michigan (~41.89°N, -87.60°W)
- **Schedule**: Wednesday nights, ~7:00 PM start
- **Race Format**: PHRF handicap racing (mixed boat types)
- **Users**: Recreational competitive sailors (not professionals)
- **Budget**: $0-5/month (free tier services only)
- **Primary Usage**: Mobile (390px viewport, checked on commute/dock)

### Weather Data Sources

1. **NOAA Marine Forecast** (most trusted by sailors)
2. **Harrison Dever Crib (CHII2)** - Wind at 85ft elevation, ~20-30% higher than surface
3. **Purdue Buoy (45198)** - Seasonal (May-Oct), best on-water data
4. **Open-Meteo** - Multi-model comparison (GFS, HRRR, ECMWF)

---

## Architecture Quick Reference

### Tech Stack

- **Framework**: Next.js 16.2.4 (App Router)
- **Language**: TypeScript 5 (strict mode)
- **Styling**: Tailwind CSS v4 with design tokens
- **Auth/Database**: Supabase (SSR mode)
- **LLM**: Claude Sonnet 4 (Anthropic API)
- **Hosting**: Vercel (free tier)
- **React**: 19.2.4 with Server Components

### Directory Structure

```
layline/
├── app/
│   ├── page.tsx                 # Home page (Server Component)
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Design tokens
│   ├── dashboard/
│   │   └── page.tsx             # Protected dashboard (Server Component)
│   ├── auth/
│   │   ├── login/page.tsx       # Login page (Client Component)
│   │   └── signup/page.tsx      # Signup page (Client Component)
│   └── api/
│       └── weather/route.ts     # API route (export GET/POST)
│
├── components/
│   └── dashboard/               # Dashboard-specific components
│       ├── WindCard.tsx
│       ├── ForecastChart.tsx
│       ├── TacticalBriefing.tsx
│       └── ...
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts            # Server Component client
│   │   ├── client.ts            # Client Component client
│   │   └── middleware.ts        # Session refresh
│   └── utils/                   # Utility functions
│
├── services/
│   ├── llm/
│   │   └── claude.ts            # Claude API integration
│   ├── weather/                 # Weather API services
│   └── buoys/                   # Buoy data parsers
│
├── types/
│   └── index.ts                 # Centralized TypeScript types
│
├── middleware.ts                # Supabase session refresh
│
└── docs/                        # Harness engineering docs
    ├── references/              # LLM-optimized .txt guides
    │   ├── nextjs16-llms.txt
    │   ├── sailing-glossary-llms.txt
    │   ├── wind-conditions-llms.txt
    │   └── supabase-ssr-llms.txt
    └── design-docs/             # Architectural decisions
        ├── core-beliefs.md
        └── llm-integration.md
```

### Key Patterns

**Server Components** (default):
```typescript
// app/dashboard/page.tsx
export default async function Dashboard() {
  const supabase = await createClient()  // Server client
  const { data: { user } } = await supabase.auth.getUser()
  return <div>{user.email}</div>
}
```

**Client Components** (only when needed):
```typescript
// components/RefreshButton.tsx
'use client'
export default function RefreshButton() {
  const [loading, setLoading] = useState(false)
  return <button onClick={...}>Refresh</button>
}
```

**API Routes**:
```typescript
// app/api/weather/route.ts
export async function GET(request: NextRequest) {
  return NextResponse.json(data)
}
```

**Supabase Auth**:
```typescript
// Server Component
import { createClient } from '@/lib/supabase/server'

// Client Component
import { createClient } from '@/lib/supabase/client'
```

**Path Alias**: Use `@/` for imports:
```typescript
import type { WindForecast } from '@/types'
import WindCard from '@/components/dashboard/WindCard'
```

---

## Domain Knowledge Essentials

### Wind Condition Classification

| Range | Classification | Color | Racing Implications |
|-------|---------------|-------|---------------------|
| 0-8 kts | Light Air | `#007A52` (teal) | Challenging, requires finesse |
| 9-15 kts | Medium Air | `#0055BB` (blue) | Optimal racing conditions |
| 16-22 kts | Heavy Air | `#C47000` (amber) | Physical, demanding |
| 23+ kts | Storm | `#CC1100` (red) | Dangerous, consider not racing |

📖 **Read**: `docs/references/wind-conditions-llms.txt` for complete guide

### Critical Buoy Context

**Harrison Dever (CHII2)**:
- Wind measured at **85 feet elevation**
- Readings typically **20-30% higher than surface wind**
- Excellent for **direction and trends**
- **NEVER adjust the raw data** - store 85ft reading, explain in UI/LLM

**Purdue Buoy (45198)**:
- **Seasonal**: May through October only
- **Best on-water wind speed** when operational
- Surface-level measurements (most accurate)

### Sailing Terminology Basics

Quick reference (see sailing-glossary-llms.txt for complete list):

- **Windward**: Upwind direction (toward wind)
- **Leeward**: Downwind direction (away from wind)
- **Tack**: Sailing with wind from port (left) or starboard (right)
- **Backstay**: Controls mast bend and sail shape
- **Cunningham**: Adjusts mainsail luff tension
- **VMG**: Velocity Made Good (speed component toward mark)
- **Layline**: Course angle to reach mark without additional tacks

Always use proper sailing terms in code, comments, and UI.

---

## Code Patterns & Conventions

### TypeScript

**Strict Mode Enabled** - No exceptions:
```typescript
// ✅ Good
export async function generateBriefing(
  input: RaceAnalysisInput
): Promise<RaceBriefing> {
  // ...
}

// ❌ Bad - Never use 'any'
export async function generateBriefing(input: any) {
  // ...
}
```

**Centralized Types**: All types in `/types/index.ts`
```typescript
import type { WindForecast, BuoyData, RaceBriefing } from '@/types'
```

### Error Handling

**API Routes** - Always wrap in try/catch:
```typescript
export async function GET(request: NextRequest) {
  try {
    // Validate env vars first
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const data = await fetchData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
```

### Dynamic Rendering

**Auth-protected pages** need fresh data:
```typescript
// app/dashboard/page.tsx
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  // Fresh auth check on every request
}
```

### Supabase Patterns

**Server Component**:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/auth/login')
  
  return <div>Protected content</div>
}
```

**Client Component**:
```typescript
'use client'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function ClientAuth() {
  const [user, setUser] = useState(null)
  const supabase = createClient()
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])
}
```

📖 **Read**: `docs/references/supabase-ssr-llms.txt` for complete patterns

### Design System

**Colors** (defined in `app/globals.css`):
```css
--sand-50: #F0EDE6;        /* Background */
--text-primary: #0A0A0A;   /* High contrast text */
--blue-500: #0044CC;       /* Accent */

--wind-light: #007A52;     /* Light air */
--wind-medium: #0055BB;    /* Medium air */
--wind-heavy: #C47000;     /* Heavy air */
--wind-storm: #CC1100;     /* Storm conditions */
```

**Typography**:
- **Display**: Space Grotesk (headings, data viz)
- **Body**: Inter (paragraphs, UI text)
- **Mono**: JetBrains Mono (data, numbers)

**Mobile-First**: Design for 390px viewport first:
```css
/* Mobile (default) */
.card { padding: 1rem; }

/* Desktop (enhancement) */
@media (min-width: 768px) {
  .card { padding: 1.5rem; }
}
```

---

## Common Tasks

### Adding a New Weather Data Source

1. Create service in `services/weather/` or `services/buoys/`
2. Define TypeScript types in `types/index.ts`
3. **Store raw data without modification** (add metadata for context)
4. Create API route in `app/api/weather/`
5. Add caching (15-30 min)
6. Update LLM prompt to include new source
7. Add to UI components

### Modifying LLM Prompts

1. Read current implementation: `services/llm/claude.ts`
2. Update prompt with sailing context
3. Test with real weather data
4. Verify cost impact (should stay <1000 calls/month)
5. Consider prompt caching for long system prompts

### Creating New Components

1. **Determine if Server or Client Component**:
   - Server if no interactivity (useState, onClick, etc.)
   - Client if needs hooks or events
   
2. **Define TypeScript interface for props**:
   ```typescript
   interface WindCardProps {
     windSpeed: number
     windDirection: number
     condition: WindCondition
   }
   ```

3. **Use design tokens from globals.css**:
   ```css
   color: var(--text-primary);
   background: var(--wind-medium);
   ```

4. **Add to appropriate directory**: `/components/dashboard/`

5. **Export with proper typing**:
   ```typescript
   export default function WindCard({ windSpeed, windDirection, condition }: WindCardProps) {
     // ...
   }
   ```

### Adding Auth Protection

1. Import server Supabase client
2. Check auth with `getUser()`
3. Redirect if not authenticated
4. Add `dynamic = 'force-dynamic'`

See: `app/dashboard/page.tsx` for reference implementation

---

## References & Documentation

### Must-Read Before Coding

1. **`docs/references/nextjs16-llms.txt`** - Next.js 16 breaking changes (CRITICAL)
2. **`docs/references/sailing-glossary-llms.txt`** - Domain terminology
3. **`docs/design-docs/core-beliefs.md`** - Foundational principles

### Additional References

4. **`docs/references/wind-conditions-llms.txt`** - Wind classification system
5. **`docs/references/supabase-ssr-llms.txt`** - Auth patterns
6. **`PROJECT_PLAN.md`** - Technical roadmap and weather API details
7. **`README.md`** - Design system overview
8. **`SETUP_GUIDE.md`** - Development environment setup

### For Deep Dives

- **Existing components**: Study `/components/dashboard/` for patterns
- **LLM integration**: Read `/services/llm/claude.ts`
- **Auth implementation**: Check `/lib/supabase/` and `/middleware.ts`
- **Type definitions**: Browse `/types/index.ts`

---

## Checklist for Code Changes

Before submitting code, verify:

- [ ] **TypeScript strict mode** - No `any` types, explicit return types
- [ ] **Server Component by default** - Only use 'use client' when needed
- [ ] **Raw data integrity** - Weather data stored unmodified
- [ ] **Mobile-first design** - Works on 390px viewport
- [ ] **Error handling** - Try/catch in API routes, graceful failures
- [ ] **Auth patterns** - Correct server/client Supabase client
- [ ] **Path alias** - Use `@/` for imports
- [ ] **Design tokens** - Use CSS variables from globals.css
- [ ] **Sailing terminology** - Use proper terms from glossary
- [ ] **Next.js 16 patterns** - No Pages Router code

---

## Getting Help

### When Stuck

1. **Check existing implementations** - Browse similar components
2. **Read the references** - Likely covered in docs/references/
3. **Review core beliefs** - Might violate a principle
4. **Check PROJECT_PLAN.md** - May have relevant context

### Common Issues

**"Module not found"** → Check path alias uses `@/` not relative paths

**"Auth not working"** → Verify using correct server/client Supabase client

**"Type errors"** → Check types are defined in `/types/index.ts`

**"Component not rendering"** → Check if needs 'use client' directive

**"Next.js error"** → Read docs/references/nextjs16-llms.txt for breaking changes

---

## Project Status

### Current Phase

**Phase 1 Complete**: Foundation (Next.js, TypeScript, Supabase, Claude API)

**Phase 2 In Progress**: Weather API Integration
- NOAA Marine Forecast (planned)
- Harrison Dever buoy data (planned)
- Purdue Buoy scraping (planned)
- Open-Meteo multi-model (planned)

See `PROJECT_PLAN.md` for complete roadmap.

### Known Limitations

- Mock weather data currently (Phase 2 will add real APIs)
- No tests yet (Phase 6)
- No PWA/offline support (Future)
- Single user (crew collaboration in Phase 6)

---

## Quick Start for Common Tasks

**Add a new UI component**:
```bash
# 1. Create component file
touch components/dashboard/NewComponent.tsx

# 2. Define types in types/index.ts
# 3. Implement component (Server Component by default)
# 4. Import and use in page
```

**Modify LLM prompt**:
```bash
# Edit services/llm/claude.ts
# Update prompt string with new context
# Test with real data
```

**Add API route**:
```bash
# Create app/api/your-route/route.ts
# Export async function GET/POST
# Return NextResponse.json(data)
```

**Protect a page**:
```typescript
// Add to page.tsx
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

// Check auth and redirect if needed
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/auth/login')
```

---

## Important Reminders

🚨 **NEVER modify raw weather data** - Store as-is, interpret separately

🚨 **Next.js 16 ≠ your training data** - Read nextjs16-llms.txt first

🚨 **Server Components by default** - Only use 'use client' when necessary

🚨 **TypeScript strict mode** - No 'any', explicit types required

🚨 **Mobile-first** - Design for 390px viewport first

🚨 **Cost control** - Cache API calls, stay under budget

🚨 **Sailing domain** - Use proper terminology from glossary

---

## Success Criteria

You're doing it right if:

✅ Code uses Next.js 16 App Router patterns (not Pages Router)
✅ Weather data stored without modification
✅ TypeScript has no `any` types
✅ Components are Server Components unless they need interactivity
✅ Auth uses correct server/client Supabase patterns
✅ UI uses design tokens from globals.css
✅ Sailing terminology is accurate
✅ Mobile layout works perfectly on 390px screen
✅ API costs stay under control with caching

---

## Summary

Layline is a sailing race preparation dashboard with:
- **Domain**: Sailing tactics and weather interpretation
- **Tech**: Next.js 16, TypeScript, Supabase, Claude API
- **Principles**: Raw data integrity, type safety, mobile-first
- **Goal**: Make Wednesday night racing easier with AI-powered briefings

Read the references, follow the patterns, respect the principles, and you'll ship great code.

Happy sailing! ⛵

---

## Agent skills

### Issue tracker

Issues tracked in Linear (workspace: layline-sailing, team: layline). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (CONTEXT.md + docs/adr/ at repo root). See `docs/agents/domain.md`.
