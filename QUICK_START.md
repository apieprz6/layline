# 🚀 Quick Start - Get Running in 5 Minutes

## What You Have Now

✅ Full Next.js + TypeScript + Tailwind setup  
✅ Supabase integration (auth + database)  
✅ Claude AI service configured  
✅ Dashboard UI with placeholders  
✅ Auth pages (login/signup)  
✅ Mock API endpoints  
✅ Project ready to run and build  

## Run It Right Now

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**What you'll see**: Login page (won't work yet - needs Supabase setup)

## To Actually Use It (30 min)

Follow **SETUP_GUIDE.md** for the complete walkthrough, or here's the speedrun:

### 1. Supabase (15 min)
- Create account at supabase.com
- Create new project
- Copy URL + API keys
- Run the SQL schema (in SETUP_GUIDE.md)
- Create your first user

### 2. Update .env.local (2 min)
Replace the placeholder values with your real keys:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-real-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-real-service-role-key
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Restart & Login (1 min)
```bash
# Stop the server (Ctrl+C)
npm run dev
# Login with your Supabase user
```

## What's Next?

The dashboard currently shows **mock data**. Time to add real data:

### Phase 2: Integrate Weather APIs
Start here: **PROJECT_PLAN.md - Phase 2**

1. **Pick a buoy** near your sailing location
   - Find it: [ndbc.noaa.gov](https://www.ndbc.noaa.gov)
   - Update `app/api/weather/route.ts` to fetch from that buoy

2. **Add a wind forecast source**
   - Easiest: NOAA (free)
   - Best for sailing: Windy or PredictWind (paid)
   - Create service in `services/weather/`

3. **Test the LLM analysis**
   - With real data flowing, the Claude API will generate race briefings
   - Customize the prompt in `services/llm/claude.ts`

## File Structure

```
layline/
├── app/
│   ├── api/weather/      ← Start here: integrate real APIs
│   ├── dashboard/        ← The main race strategy page
│   └── auth/            ← Login/signup (works after Supabase setup)
├── services/
│   ├── llm/claude.ts    ← Customize race analysis prompt
│   ├── weather/         ← Add your weather sources here
│   └── buoys/           ← Add buoy integrations here
├── components/dashboard/ ← Build new UI components here
└── types/index.ts       ← TypeScript types for all data
```

## Tips

- **Focus on one data source first** - get it working end-to-end before adding more
- **The AI analysis is the killer feature** - spend time refining that prompt
- **Test with real race conditions** - use it before an actual race to see what's useful
- **Keep it simple** - better to have one great feature than ten half-baked ones

## Common Issues

### Build fails
- Check that `.env.local` has valid URL format (even if placeholder)
- Run `rm -rf .next && npm run build`

### Can't log in
- Verify Supabase keys are correct
- Check that user exists in Supabase dashboard
- Verify user is in both `auth.users` AND `public.users` tables

### "Missing Supabase environment variables"
- Restart the dev server after changing `.env.local`
- Double-check no extra spaces in the env var values

## Ready to Deploy?

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# https://vercel.com/dashboard → Project → Settings → Environment Variables
```

---

**Have questions?** Check:
- **SETUP_GUIDE.md** - detailed setup walkthrough
- **PROJECT_PLAN.md** - development roadmap
- **README.md** - full documentation

**Good luck on the water! ⛵🏆**
