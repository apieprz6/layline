import { NextResponse } from 'next/server'

import { resolveAccount } from '@/lib/account/resolveAccount'
import { sniffBoatIconType } from '@/lib/boat/icon'
import { BOAT_BUCKET } from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /boat/icon
 *
 * The boat's icon, exactly as it was uploaded, for the signed-in header.
 *
 * Proxied rather than redirected to a signed URL, which is what the Boat Setup downloads do: a
 * signed URL changes on every request, so the browser could never cache it, and this is fetched on
 * every screen. The header asks for `/boat/icon?v={icon_updated_at}` instead, so the URL changes
 * exactly when the icon does and a long `private` max-age is safe. What `v` says is not checked —
 * the current icon is always the answer — but without one there is nothing to invalidate a cached
 * copy by, so a bare request is revalidated every time.
 *
 * Signed-in only. A **Guest** gets a 401: no signed-out screen names the boat (ADR 0015), and the
 * bucket is private for the same reason.
 */

/** A year: the `?v=` key is what invalidates, not the clock. */
const MAX_AGE_SECONDS = 31_536_000

export async function GET(request: Request): Promise<Response> {
  try {
    const account = await resolveAccount()

    if (!account) {
      return NextResponse.json({ error: 'Sign in to see the boat' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: boat, error } = await supabase
      .from('boats')
      .select('icon_path')
      .maybeSingle<{ icon_path: string | null }>()

    if (error) {
      console.error('Boat icon: boats read failed:', error.message)
      return NextResponse.json({ error: 'The boat could not be read' }, { status: 500 })
    }

    if (!boat?.icon_path) {
      return NextResponse.json({ error: 'The boat has no icon' }, { status: 404 })
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from(BOAT_BUCKET)
      .download(boat.icon_path)

    if (downloadError || !blob) {
      // A row naming bytes that are not there is the case ADR 0013 works to avoid, so it is logged.
      console.error(
        'Boat icon: could not fetch the object:',
        downloadError?.message ?? 'no bytes'
      )
      return NextResponse.json({ error: 'The icon could not be reached' }, { status: 502 })
    }

    const bytes = new Uint8Array(await blob.arrayBuffer())

    return new Response(bytes, {
      status: 200,
      headers: {
        // Read off the bytes again rather than trusting the object's metadata: only a signature
        // the upload accepted gets an image type, so nothing here is ever served as a document.
        'Content-Type': sniffBoatIconType(bytes) ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': new URL(request.url).searchParams.has('v')
          ? `private, max-age=${MAX_AGE_SECONDS}, immutable`
          : 'private, no-cache',
      },
    })
  } catch (thrown: unknown) {
    console.error('Boat icon error:', thrown)
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : 'Failed to serve the icon' },
      { status: 500 }
    )
  }
}
