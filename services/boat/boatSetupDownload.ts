import { NextResponse } from 'next/server'

import { resolveAccount } from '@/lib/account/resolveAccount'
import { BOAT_BUCKET, boatSetupObjectPath } from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils/uuid'
import type { FileBackedBoatSetupKind } from '@/types'

/**
 * The original bytes of one file-backed **Boat Setup Version**, exactly as they were uploaded.
 *
 * A redirect to a short-lived signed URL rather than a proxy: the bucket is private, so the bytes
 * cannot be linked to directly, and streaming a few kilobytes through a serverless function to
 * achieve the same thing would spend the request budget for nothing.
 *
 * Signed-in only, and that is the whole of the check — every signed-in sailor reads every Version,
 * because the Role governs writes (ADR 0019). A **Guest** gets a 401 rather than a redirect to the
 * Auth Sheet: this is not a screen, and a browser following a download link has nowhere to put a
 * sign-in offer.
 *
 * The path is derived, never stored: `lib/storage/paths.ts` owns the convention, and the filename it
 * needs is the verbatim one the upload recorded.
 *
 * One body for both file-backed kinds, and for both of the Crossover Chart's two files. A Crossover
 * Chart Version is backed by two objects under one prefix — the grid, whose filename is the column
 * every file-backed Version has, and the Sail Definitions, whose filename lives in the payload
 * because a second file is not machinery all kinds share (ADR 0022). `choose` is how a caller says
 * which of the two it means, and everything after that is identical.
 */

export interface BoatSetupDownloadOptions {
  kind: FileBackedBoatSetupKind
  /** How the artifact names itself to the sailor and in a log line: `Polar`, `Crossover Chart`. */
  label: string
  versionId: string
  /**
   * Which of the Version's files. Absent means the `filename` column, which is the file the
   * artifact is named for. A function reads the name out of the payload, for the second file of a
   * kind that has one — and returns `null` when this Version does not carry it.
   */
  choose?: (payload: unknown) => string | null
  /** What the downloaded file is, for the 404 when there is none: `Version`, `Sail Definitions`. */
  what?: string
}

/** Long enough to click and download, short enough that a copied URL is not a lasting key. */
const SIGNED_URL_TTL_SECONDS = 60

interface VersionRow {
  id: string
  filename: string | null
  payload?: unknown
}

export async function boatSetupDownload(options: BoatSetupDownloadOptions): Promise<Response> {
  const { kind, label, versionId, choose } = options
  const what = options.what ?? `${label} Version`

  try {
    const account = await resolveAccount()

    if (!account) {
      return NextResponse.json({ error: `Sign in to download a ${label}` }, { status: 401 })
    }

    // Asked before the query, not left to the database: a malformed id is a Version that does not
    // exist, and PostgREST would answer `id=eq.foo` with a 22P02 error that reads here as a 500 and
    // a logged fault for what is only a stale link.
    if (!isUuid(versionId)) {
      return NextResponse.json({ error: `No such ${what}` }, { status: 404 })
    }

    const supabase = await createClient()

    // RLS decides whether this row is readable; the `kind` filter is what makes the derived path
    // right, since only this kind's Versions live under `boat-setup/{kind}/`.
    const { data: version, error } = await supabase
      .from('boat_setup_versions')
      .select(choose === undefined ? 'id, filename' : 'id, filename, payload')
      .eq('kind', kind)
      .eq('id', versionId)
      .maybeSingle<VersionRow>()

    if (error) {
      console.error(`${label} download: version read failed:`, error.message)
      return NextResponse.json(
        { error: `The ${label} Version could not be read` },
        { status: 500 }
      )
    }

    // A stale link, or an id belonging to something else. Both are the same answer.
    if (!version) {
      return NextResponse.json({ error: `No such ${what}` }, { status: 404 })
    }

    const filename = choose === undefined ? version.filename : choose(version.payload)

    if (filename === null || filename === '') {
      return NextResponse.json({ error: `No such ${what}` }, { status: 404 })
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BOAT_BUCKET)
      .createSignedUrl(boatSetupObjectPath(kind, version.id, filename), SIGNED_URL_TTL_SECONDS, {
        // So the browser saves the sailor's own filename rather than the uuid in the path. The
        // `download` attribute on the link does not survive a cross-origin redirect, which is
        // exactly what this response is.
        download: filename,
      })

    if (signError || !signed) {
      console.error(
        `${label} download: could not sign the object:`,
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
    console.error(`${label} download error:`, thrown)
    return NextResponse.json(
      { error: thrown instanceof Error ? thrown.message : `Failed to download the ${label}` },
      { status: 500 }
    )
  }
}
