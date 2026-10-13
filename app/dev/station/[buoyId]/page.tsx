/**
 * TEST HARNESS — a station's page over synthetic history, for the browser suite only.
 *
 * Off unless `LAYLINE_STATION_HARNESS=1`, which `playwright.config.ts` sets on the server it
 * starts. A request without it gets the same 404 as any other unknown path, so this is unreachable
 * in a deployed Layline.
 *
 * It exists because the real route's data is live: whether CHII2 or 45198 has a gust or a wave
 * reading right now is NDBC's to decide, so "the station measures waves but has no current reading"
 * (LAY-171's footnote) can't be asked of `/station/[buoyId]` on demand. `?missing=1` blanks the
 * latest gust and wave readings to show it.
 *
 * Not a second renderer: it mounts `StationPageClient`, the component the real route mounts, with
 * the station's real metadata from `buoyMetadata` — the same height, note and Station Capability
 * the history fetch reports. Only the readings are a fixture.
 */

import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import StationPageClient from '@/app/station/[buoyId]/StationPageClient'
import { getStationInfo } from '@/lib/config/stations'
import { buoyMetadata } from '@/services/buoys/ndbc'
import { harnessHistory } from '../fixture'

/** So the env guard is read per request rather than baked into a build. */
export const dynamic = 'force-dynamic'

interface StationHarnessPageProps {
  params: Promise<{ buoyId: string }>
  searchParams: Promise<{ missing?: string }>
}

export default async function StationHarnessPage({
  params,
  searchParams,
}: StationHarnessPageProps): Promise<ReactElement> {
  if (process.env.LAYLINE_STATION_HARNESS !== '1') notFound()

  const { buoyId } = await params
  const { missing } = await searchParams
  if (buoyId !== 'CHII2' && buoyId !== '45198') notFound()

  const stationInfo = getStationInfo(buoyId)
  if (!stationInfo) notFound()

  const metadata = buoyMetadata(buoyId)
  // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
  const serverTime = Date.now()

  return (
    <StationPageClient
      buoyId={buoyId}
      stationName={stationInfo.name}
      metadata={metadata}
      data={harnessHistory(serverTime, metadata.capability, missing === '1')}
      serverTime={serverTime}
    />
  )
}
