'use client'

import type { ReactElement } from 'react'
import type { Channel, Race } from './data'
import DCompass from './DCompass'
import DSpeed from './DSpeed'
import DWind from './DWind'
import { RaceTile as CoverageTile, TRUST as COVERAGE } from './VariantB'

/**
 * PROTOTYPE — LAY-149 variant D, **Recommended mix**, second round after review:
 *
 * - `HDG` (`DCompass`): A's rose and D's strip as two views of one state — overlay and selected
 *   heading survive the toggle. Tap a heading for the Races and rows behind it.
 * - `AWA` (`DWind`): a new **tack dial** — bow up, starboard right, port left, port's average
 *   folded onto starboard so asymmetry reads as a wedge, upwind and downwind on one picture, for
 *   the season, either side of the autocompensation, or one Race over the season's rays.
 * - `STW` (`DSpeed`): A's scatter (the line the constants act on) and B's gap-by-speed (the U the
 *   line cannot follow) as two views of one state, the line drawn in both, fit method switchable.
 * - Trust: B's coverage verdict. Tile: B's numbers plus coverage bars.
 */
export const NAME = 'Recommended mix'

export const TRUST = COVERAGE

export function Drawer({ channel }: { channel: Channel }): ReactElement {
  if (channel === 'hdg') return <DCompass />
  if (channel === 'awa') return <DWind />
  return <DSpeed />
}

export function RaceTile({ race }: { race: Race }): ReactElement {
  return <CoverageTile race={race} />
}
