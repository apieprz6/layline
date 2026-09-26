/**
 * PROTOTYPE — LAY-148. Throwaway route; delete it once the decision lands.
 *
 * Three answers to "what should the GPS-track heatmap look like", on one URL, switchable by
 * `?variant=`. They are not colour tweaks of each other: A says percent-of-target is a *polarity*
 * and colours the track divergently, B says it is a *magnitude* and colours it sequentially with
 * 100% as an annotation, C says the track should not carry the measurement at all.
 *
 * Real data throughout — a real qtVlm recording off disk and the boat's real ORC polar — because
 * the render states this ticket is about (Frozen, Low-Speed, in-manoeuvre, sub-45°, no target) only
 * look the way they really look when they arrive in the proportions a real race produces.
 *
 * It sits inside the `(app)` route group and so wears the real chrome. It is deliberately not
 * auth-gated: there is nothing of anybody's in it.
 */

import type { ReactElement } from 'react'
import { loadPrototypeRace } from './prototype-data'
import { RACE_FILES, type RaceFileKey } from './prototype-races'
import { PrototypeTokens } from './prototype-tokens'
import PrototypeSwitcher from './PrototypeSwitcher'
import VariantA from './VariantA'
import VariantB from './VariantB'
import VariantC from './VariantC'

export const dynamic = 'force-dynamic'

export default async function PrototypeHeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string; race?: string; theme?: string }>
}): Promise<ReactElement> {
  const { variant = 'a', race: raceKey, theme = 'day' } = await searchParams

  const key: RaceFileKey =
    RACE_FILES.find((entry) => entry.key === raceKey)?.key ?? RACE_FILES[0].key
  const race = await loadPrototypeRace(key)

  return (
    <div style={{ paddingBottom: 120 }}>
      <PrototypeTokens />

      {variant === 'b' ? (
        <VariantB race={race} />
      ) : variant === 'c' ? (
        <VariantC race={race} />
      ) : (
        <VariantA race={race} />
      )}

      {/* Surface the state, per the prototype rules: what got loaded and what it contained. */}
      <pre
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-muted)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {[
          `variant   ${variant}`,
          `race      ${race.file} — ${race.label}`,
          `rows      ${race.points.length}`,
          `polar     lowest trusted TWA row ${race.polarFloor}°`,
          `states    ${Object.entries(race.counts)
            .map(([state, count]) => `${state}=${count}`)
            .join('  ')}`,
        ].join('\n')}
      </pre>

      <PrototypeSwitcher variant={variant} theme={theme} />
    </div>
  )
}
