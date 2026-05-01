# Quick Setup Guide

This guide will get you from zero to a working dashboard in ~30 minutes.

## Step 1: Install Dependencies (2 min)

```bash
npm install
```

## Step 2: Supabase Setup (10 min)

### Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name: `raceprep` or similar
3. Set a secure database password (save it!)
4. Choose a region close to you
5. Wait 2-3 minutes for provisioning

### Get API Keys
1. Go to Project Settings (⚙️ icon) → API
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJh...` (the long key)
   - **service_role key**: `eyJh...` (different long key, keep secret!)

### Set Up Database
1. In Supabase, go to SQL Editor
2. Click "New Query"
3. Paste this SQL:

```sql
-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('captain', 'crew', 'tactician', 'trimmer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Race events table
CREATE TABLE IF NOT EXISTS public.race_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT NOT NULL,
  start_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.race_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view races"
  ON public.race_events FOR SELECT
  TO authenticated
  USING (true);

-- Weather cache table (optional, for Phase 3)
CREATE TABLE IF NOT EXISTS public.weather_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view weather cache"
  ON public.weather_cache FOR SELECT
  TO authenticated
  USING (true);
```

4. Click "Run"
5. You should see "Success. No rows returned"

## Step 3: Claude API Key (5 min)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in
3. Go to API Keys
4. Click "Create Key"
5. Name it: "RacePrep Dashboard"
6. Copy the key (starts with `sk-ant-`)

⚠️ **Important**: This key gives access to your Claude account. Keep it secret!

## Step 4: Configure Environment (3 min)

1. In your project folder, open `.env.local`
2. Replace the placeholder values:

```bash
# Paste your Supabase values
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-role-key

# Paste your Claude API key
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Leave these for now
NOAA_API_KEY=
WINDY_API_KEY=
PREDICTWIND_API_KEY=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Save the file

## Step 5: Run the App (2 min)

```bash
npm run dev
```

You should see:
```
  ▲ Next.js 15.x.x
  - Local:        http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 6: Create Your First User (5 min)

### Option A: Through Supabase Dashboard (Recommended)
1. In Supabase, go to Authentication → Users
2. Click "Add User" → "Create new user"
3. Enter:
   - Email: your email
   - Password: a secure password
   - Check "Auto Confirm User"
4. Click "Create User"
5. Copy the user's UUID

6. Now add user details to the `users` table:
   - Go to Table Editor → `users` table
   - Click "Insert" → "Insert row"
   - Paste the UUID in `id`
   - Enter your email
   - Choose role: `captain` (or `tactician`)
   - Click "Save"

### Option B: Through the App (Alternative)
The signup page is currently set to invite-only, but you can manually sign up:

1. In Supabase, go to Authentication → Policies
2. Temporarily enable public signup (disable later!)
3. Use the signup flow in the app
4. Re-enable restrictions after your account is created

## Step 7: Log In

1. Go to [http://localhost:3000](http://localhost:3000)
2. You'll be redirected to `/auth/login`
3. Enter your email and password
4. Click "Sign In"
5. You should land on the dashboard! 🎉

## What You'll See

The dashboard is currently showing **mock data**:
- Weather forecasts (placeholder)
- Buoy data (placeholder)
- Race briefing (not yet generated)

This is expected! Phase 2 is integrating real data sources.

## Troubleshooting

### "Invalid API key" error
- Double-check your `.env.local` file
- Make sure there are no extra spaces
- Restart the dev server: `Ctrl+C`, then `npm run dev`

### "Authentication error" / Can't log in
- Verify user was created in Supabase Authentication
- Verify user details exist in `public.users` table
- Check that the UUID matches between tables

### "NEXT_PUBLIC_SUPABASE_URL is not defined"
- Make sure `.env.local` file exists
- Make sure keys start with `NEXT_PUBLIC_` for client-side access
- Restart the dev server

### Build errors
```bash
# Clear Next.js cache and rebuild
rm -rf .next
npm run dev
```

## Next Steps

Now that you have the foundation working:

1. **Customize the dashboard**
   - Edit `app/dashboard/page.tsx`
   - Add your race series name, boat name, etc.

2. **Add real weather data** (see PROJECT_PLAN.md)
   - Start with NOAA buoy data (free, easy)
   - Add your preferred wind forecast source

3. **Test the LLM analysis**
   - Once you have real data, the Claude API will generate briefings
   - Customize the prompt in `services/llm/claude.ts`

4. **Invite your crew**
   - Create accounts for crew members in Supabase
   - Assign appropriate roles (tactician, trimmer, crew)

5. **Deploy to production** (see README.md)

## Getting Help

- Check `PROJECT_PLAN.md` for the development roadmap
- Review `README.md` for architecture details
- Issues? Check the Next.js docs: [nextjs.org/docs](https://nextjs.org/docs)

---

**Estimated time to working dashboard**: 30 minutes

**Good luck on the water! 🏆⛵**
