/**
 * PROTOTYPE (LAY-165) — THROWAWAY ROUTE. Three variants of the picture under the Polar performance
 * filter rail, and the same three under the real per-Race page.
 *
 *     npm run prototype:lay165      → http://localhost:4165/dev/polar-picture
 *
 *     ?variant=A|B|C   which picture
 *     ?view=season     the Polar performance screen: real rail, real Coverage Ledger, real figures
 *     ?view=race       the real RaceDetailView, with a real Race Track Heatmap and the chart beside
 *     ?view=teaser     the Overall tab's card
 *     ?race=<id>       which race the race view is of (three are built; see `generate.test.ts`)
 *
 * `←`/`→` cycle the variant, `↑`/`↓` the view.
 *
 * ## Why `app/dev/` and not the real route
 *
 * `/boat-performance/polar` reads the archive out of Supabase, and there is no archive in any local
 * database — the owner hand-enters it through the finished UI, so nothing seeds one. The same
 * problem `app/dev/race-track` already solved for the track: put the real components in front of a
 * real browser over data read from the owner's files. This route follows it, including the env gate,
 * so it is unreachable in a deployed Layline.
 *
 * It is a Server Component for one reason: `archive.json` is read off disk. Everything it hands the
 * client is the same shape the real page hands `PolarPerformanceContent`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import Host from '@/components/analysis/prototype-lay165/Host'
import type { PrototypeArchive } from '@/components/analysis/prototype-lay165/data'
import type { Variant, View } from '@/components/analysis/prototype-lay165/Switcher'
import RaceTrackSection from '@/components/race/RaceTrackSection'
import { spacing } from '@/lib/utils/design'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { filterFromSearchParams } from '@/services/analysis/filter-url'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

const ARCHIVE = join(
  process.cwd(),
  'components',
  'analysis',
  'prototype-lay165',
  'archive.json'
)

export default async function PolarPicturePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  if (process.env.LAYLINE_LAY165 !== '1') notFound()

  const params = await searchParams
  const one = (key: string): string | undefined =>
    Array.isArray(params[key]) ? params[key]?.[0] : (params[key] as string | undefined)

  let archive: PrototypeArchive
  try {
    archive = JSON.parse(readFileSync(ARCHIVE, 'utf8')) as PrototypeArchive
  } catch {
    return (
      <Missing>
        <code>archive.json</code> is not there. It is gitignored — 1.5 MB of the owner&rsquo;s own
        rows — so build it first:
        <pre style={{ marginTop: 8 }}>npx jest components/analysis/prototype-lay165/generate</pre>
        It reads <code>~/git/Handsome-Pete</code> and takes about three seconds.
      </Missing>
    )
  }

  const dimensions = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, archive.vocabulary)
  const race = one('race') ?? Object.keys(archive.tracks)[0]
  const heatmap = archive.tracks[race] ?? null

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)', padding: spacing(4) }}>
      <div
        className="max-w-[1700px] 2xl:mx-auto"
        style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}
      >
        <header>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-xs)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--state-warning)',
            }}
          >
            Prototype · LAY-165 · throwaway
          </p>
          <h1
            style={{
              margin: `${spacing(1)} 0 0`,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              color: 'var(--text-primary)',
            }}
          >
            Polar performance
          </h1>
          <p style={{ margin: `4px 0 0`, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            13 races, read through the shipped pipeline. Races:{' '}
            {Object.keys(archive.tracks).map((id) => (
              <a
                key={id}
                href={`?race=${id}&view=race`}
                style={{
                  color: id === race ? 'var(--text-accent)' : 'var(--text-muted)',
                  marginRight: 8,
                }}
              >
                {id}
              </a>
            ))}
          </p>
        </header>

        <Host
          archive={archive}
          dimensions={dimensions}
          initialFilter={filterFromSearchParams(params, dimensions)}
          initialVariant={((one('variant') ?? 'A').toUpperCase() as Variant) ?? 'A'}
          initialView={(one('view') ?? 'season') as View}
          race={race}
          /* The real section, over the real heatmap the generator built with `raceTrackHeatmap`.
             Five overlays rather than six: the sail verdict needs the Crossover Chart, which lives
             in the database this route cannot reach. */
          trackSection={<RaceTrackSection track={{ heatmap, scoring: 'polar' }} />}
        />
      </div>
    </div>
  )
}

function Missing({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-body)', maxWidth: 560 }}>
      <h1 style={{ fontSize: 'var(--text-lg)' }}>Nothing to draw</h1>
      <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>{children}</p>
    </div>
  )
}
