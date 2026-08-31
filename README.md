# Layline — Lake Michigan Sailing Weather

A sailing weather dashboard for Lake Michigan racers — multi-source wind observation, multi-model forecasts, and AI tactical briefings for any race, any day.

## About

Layline consolidates weather data from multiple sources and uses AI to generate tactical briefings. The dashboard provides live buoy observations, wind forecasts, model comparisons, rig setup recommendations, and strategic guidance.

Racing is the lens, not a schedule. Layline is built for whatever is actually on: a weeknight series, a weekend regatta, a distance race — or simply watching what the wind is doing on the lake. It opens on current conditions; a **Target Time** is optional, set by you when you have a start to prepare for.

Forecasts are anchored to the COLYC Race Circle (41.8528°N, 87.5568°W), roughly 2.5 nautical miles offshore from Navy Pier.

**Target users:** Competitive recreational sailors racing series, regattas, and distance events out of Chicago.

## Design System

This project implements the **Layline Design System** with:

- **Solar High Contrast** theme — warm off-white backgrounds with high-contrast text, optimized for bright outdoor/sunlight readability
- **Typography:** Space Grotesk (display), Inter (body), JetBrains Mono (data/numbers)
- **Mobile-first:** Designed for 390px viewport width, scales up to desktop
- **Color palette:** Wind condition colors (light/medium/heavy/storm), semantic states
- **Components:** WindCard, ForecastChart, TacticalBriefing, RigRecommendation, ModelComparison

See `app/globals.css` for the complete design token system.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The main dashboard is at `/dashboard` (requires authentication via Supabase).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
