import type { ReactElement } from 'react'
import CrossoverChartContent from '@/components/boat/CrossoverChartContent'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readCrossoverChartScreen } from '@/services/boat/readCrossoverChartVersions'

export const dynamic = 'force-dynamic'

/**
 * The **Crossover Chart** screen — a signed-in screen, and only that.
 *
 * A **Guest** who deep-links here is sent to the dashboard with the **Auth Sheet** open and this
 * route remembered, the same as `/boat-management` itself. The ticket calls this "the locked screen",
 * which was ADR 0015's original shape; LAY-104 replaced it with `signInFirst()` on the grounds that a
 * locked screen still serves the fact that there is a boat, and this page follows its siblings rather
 * than reintroducing the older one.
 *
 * A signed-in non-admin gets the whole screen bar the upload panel. Role governs writes only
 * (ADR 0019), so every Version is readable and every file downloadable by anyone signed in.
 */
export default async function CrossoverChartPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-management/crossover-chart')

  // The chart in force needs the payload, which the list deliberately does not carry — so the screen
  // is one list plus one chart, rather than every chart to render a list of names. Both come off a
  // single read of the artifact that holds the pointer.
  const screen = await readCrossoverChartScreen()

  return (
    <CrossoverChartContent
      list={screen?.list ?? null}
      current={screen?.current ?? null}
      canWrite={canWrite(account)}
    />
  )
}
