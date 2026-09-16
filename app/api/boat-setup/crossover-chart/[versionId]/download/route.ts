import { NextResponse } from 'next/server'

import { boatSetupDownload } from '@/services/boat/boatSetupDownload'

/**
 * GET /api/boat-setup/crossover-chart/{versionId}/download[?file=definitions]
 *
 * The original bytes of one **Crossover Chart Version** — either half of it, exactly as uploaded.
 *
 * A Crossover Chart Version is backed by *two* files, because the chart absorbs its Sail
 * Definitions rather than versioning them separately (ADR 0012). Both objects sit under the one
 * prefix `boat-setup/crossover_chart/{version_id}/`, so `?file=definitions` picks the second and no
 * argument picks the grid the artifact is named for.
 *
 * A query parameter rather than a second route because it is the same Version, the same permission
 * and the same 302 either way — everything but which filename to sign. The whole of that answer is
 * in `boatSetupDownload`, shared with the Polar.
 */
interface RouteContext {
  /** Next 16 hands route params as a promise. */
  params: Promise<{ versionId: string }>
}

const KIND = 'crossover_chart'
const LABEL = 'Crossover Chart'

/**
 * The Sail Definitions file's own name, read out of the payload's provenance.
 *
 * A narrow structural read rather than the payload schema. The bytes of both source files are kept
 * and stay downloadable, and a payload that the schema has come to refuse — a rule tightened years
 * later — must not take the sailor's own file down with it. The filename is provenance, not
 * validity, and this asks only whether it is there.
 */
function definitionsFilename(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null

  const { source } = payload as { source?: unknown }
  if (typeof source !== 'object' || source === null) return null

  const { definitions } = source as { definitions?: unknown }
  if (typeof definitions !== 'object' || definitions === null) return null

  const { filename } = definitions as { filename?: unknown }

  return typeof filename === 'string' && filename !== '' ? filename : null
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const { versionId } = await params
  const file = new URL(request.url).searchParams.get('file')

  if (file === 'definitions') {
    return boatSetupDownload({
      kind: KIND,
      label: LABEL,
      versionId,
      what: 'Sail Definitions file',
      choose: definitionsFilename,
    })
  }

  // Named rather than guessed: `?file=saildef` is a link that meant something and did not get it,
  // and answering it with the grid would hand the sailor the wrong file without saying so.
  if (file !== null && file !== 'grid') {
    return NextResponse.json(
      { error: `A Crossover Chart Version has two files: grid and definitions. Not ${file}.` },
      { status: 400 }
    )
  }

  return boatSetupDownload({ kind: KIND, label: LABEL, versionId })
}
