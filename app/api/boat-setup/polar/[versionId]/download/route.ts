import { NextResponse } from 'next/server'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { BOAT_BUCKET, boatSetupObjectPath } from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils/uuid'

/**
 * GET /api/boat-setup/polar/{versionId}/download
 *
 * The original bytes of one **Polar Version**, exactly as they were uploaded.
 *
 * A redirect to a short-lived signed URL rather than a proxy: the bucket is private, so the bytes
 * cannot be linked to directly, and streaming a few kilobytes through a serverless function to
 * achieve the same thing would spend the request budget for nothing.
 *
 * Signed-in only, and that is the whole of the check — every signed-in sailor reads every
 * Version, because the Role governs writes (ADR 0019). A **Guest** gets a 401 rather than a
 * redirect to the Auth Sheet: this is not a screen, and a browser following a download link has
 * nowhere to put a sign-in offer.
 *
 * The path is derived, never stored: `lib/storage/paths.ts` owns the convention, and the filename
 * it needs is the verbatim one on the row.
 */
interface RouteContext {
  /** Next 16 hands route params as a promise. */
  params: Promise<{ versionId: string }>
}

/** Long enough to click and download, short enough that a copied URL is not a lasting key. */
const SIGNED_URL_TTL_SECONDS = 60

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const account = await resolveAccount()

    if (!account) {
      return NextResponse.json({ error: 'Sign in to download a Polar' }, { status: 401 })
    }

    const { versionId } = await params

    // Asked before the query, not left to the database: a malformed id is a Version that does not
    // exist, and PostgREST would answer `id=eq.foo` with a 22P02 error that reads here as a 500
    // and a logged fault for what is only a stale link.
    if (!isUuid(versionId)) {
      return NextResponse.json({ error: 'No such Polar Version' }, { status: 404 })
    }

    const supabase = await createClient()

    // RLS decides whether this row is readable; the `kind` filter is what makes the derived path
    // right, since only a Polar Version lives under `boat-setup/polar/`.
    const { data: version, error } = await supabase
      .from('boat_setup_versions')
      .select('id, filename')
      .eq('kind', 'polar')
      .eq('id', versionId)
      .maybeSingle<{ id: string; filename: string | null }>()

    if (error) {
      console.error('Polar download: version read failed:', error.message)
      return NextResponse.json({ error: 'The Polar Version could not be read' }, { status: 500 })
    }

    if (!version || version.filename === null) {
      // A stale link, or an id belonging to something else. Both are the same answer.
      return NextResponse.json({ error: 'No such Polar Version' }, { status: 404 })
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BOAT_BUCKET)
      .createSignedUrl(boatSetupObjectPath('polar', version.id, version.filename), SIGNED_URL_TTL_SECONDS, {
        // So the browser saves the sailor's own filename rather than the uuid in the path. The
        // `download` attribute on the link does not survive a cross-origin redirect, which is
        // exactly what this response is.
        download: version.filename,
      })

    if (signError || !signed) {
      console.error(
        'Polar download: could not sign the object:',
        signError?.message ?? 'no signed URL'
      )
      // The row exists and the bytes do not, or Storage refused. ADR 0013 accepts bytes with no
      // row; a row with no bytes is the case it works to avoid, so it is worth logging loudly.
      return NextResponse.json({ error: 'The file could not be reached' }, { status: 502 })
    }

    // 302, not 307: this is a one-off location for one download and must never be cached.
    return NextResponse.redirect(signed.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (thrown: unknown) {
    console.error('Polar download error:', thrown)
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : 'Failed to download the Polar' },
      { status: 500 }
    )
  }
}
