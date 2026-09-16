import { boatSetupDownload } from '@/services/boat/boatSetupDownload'

/**
 * GET /api/boat-setup/polar/{versionId}/download
 *
 * The original bytes of one **Polar Version**, exactly as they were uploaded.
 *
 * The whole of the answer is in `boatSetupDownload`, which both file-backed kinds share: the
 * signed-in check, the private bucket, the derived path and the 302 are the same for a Polar and a
 * Crossover Chart. A Polar Version is backed by one file, so there is nothing to choose between.
 */
interface RouteContext {
  /** Next 16 hands route params as a promise. */
  params: Promise<{ versionId: string }>
}

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { versionId } = await params

  return boatSetupDownload({ kind: 'polar', label: 'Polar', versionId })
}
