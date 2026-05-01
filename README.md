# Layline — Sailing Race Dashboard

A sailing race preparation dashboard for competitive sailors targeting Wednesday night races at Navy Pier on Lake Michigan.

## About

Layline consolidates weather data from multiple sources and uses AI to generate tactical race briefings. The dashboard provides wind forecasts, model comparisons, rig setup recommendations, and strategic race guidance.

**Target users:** Competitive recreational sailors, race crew and skippers, Wednesday night fleet racers.

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
