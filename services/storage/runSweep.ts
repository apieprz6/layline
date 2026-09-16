/**
 * The sweep, wired to Supabase.
 *
 * `sweepOrphanedBytes` decides; this hands it a world to decide about. Two things stand between the
 * two, and both of them are ways to be wrong about the world rather than about the rules:
 *
 * - Storage lists one page at a time, and a prefix seen half-way is an orphan never collected.
 * - The anti-join needs `recordings`, and a bucket with no table to compare against is a bucket in
 *   which every object looks orphaned.
 *
 * So both are hard failures. Anything that leaves the sweep unsure what exists throws, because the
 * alternative is a run that reports a clean bucket it never actually read.
 *
 * Everything here runs as the caller's own session, so RLS and the Storage policies still apply: a
 * non-admin's sweep would list nothing it may not read and remove nothing at all. The route refuses
 * them first, and this is the second answer to the same question.
 */

import { BOAT_BUCKET } from '@/lib/storage/paths'
import type { createClient } from '@/lib/supabase/server'

import { sweepOrphanedBytes, type StorageEntry, type SweepReport } from './sweep'

/** storage-api's own maximum page, so a full bucket costs as few round trips as it can. */
export const LIST_PAGE_SIZE = 100

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Sweeps the `boat` bucket for orphaned objects and reports what happened.
 *
 * @param now Injected so a caller — a test, or a run being reasoned about — decides what "recent"
 *   means rather than inheriting it from the clock mid-sweep.
 * @throws When `recordings` cannot be read or a prefix cannot be listed. Nothing has been removed at
 *   that point: every decision is made from a complete listing before the first delete goes out.
 */
export async function runSweep(
  supabase: SupabaseServerClient,
  now: Date = new Date()
): Promise<SweepReport> {
  const bucket = supabase.storage.from(BOAT_BUCKET)

  return sweepOrphanedBytes({
    now,
    // Handed over unread. The sweep calls it once the bucket is listed, and that order is a decision
    // it makes rather than one the wiring imposes on it.
    readRecordingIds: () => readRecordingIds(supabase),
    storage: {
      async list(prefix: string): Promise<StorageEntry[]> {
        return listWholePrefix(bucket, prefix)
      },
      async remove(paths: string[]): Promise<string[]> {
        const { data, error } = await bucket.remove(paths)

        if (error) {
          // Not a throw: a delete that failed is the case the sweeper exists to survive, and the
          // report is more useful than an exception. The paths come back as `failed`.
          console.error('Sweep: Storage refused a delete:', error.message)
          return []
        }

        // What storage-api confirms, and only that — its rows carry the full object key as `name`.
        return (data ?? []).map((removed) => removed.name)
      },
    },
  })
}

/**
 * Every `recordings.id`, as a set.
 *
 * The whole table, deliberately: thirteen seasons of weeknight racing is a few hundred rows, and one
 * id per row is cheaper to fetch than it is to be clever about. There is no filter that could be
 * applied here without risking an id that exists being absent from the set, which is the one error
 * that turns this into a delete of the archive.
 */
async function readRecordingIds(supabase: SupabaseServerClient): Promise<Set<string>> {
  const { data, error } = await supabase.from('recordings').select('id')

  if (error || !data) {
    throw new Error(`the recordings table could not be read: ${error?.message ?? 'no rows returned'}`)
  }

  return new Set(data.map((row) => row.id as string))
}

/** One prefix, every page of it. A trailing slash is trimmed: storage-api keys have no empty segment. */
async function listWholePrefix(
  bucket: ReturnType<SupabaseServerClient['storage']['from']>,
  prefix: string
): Promise<StorageEntry[]> {
  const path = prefix.replace(/\/+$/, '')
  const entries: StorageEntry[] = []

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await bucket.list(path, {
      limit: LIST_PAGE_SIZE,
      offset,
      // Named rather than left to the default, because pagination over an unstable order can skip
      // an entry entirely — and a skipped entry here is an orphan nothing ever finds.
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error || !data) {
      throw new Error(`${prefix} could not be listed: ${error?.message ?? 'no entries returned'}`)
    }

    entries.push(
      ...data.map((entry) => ({
        name: entry.name,
        id: entry.id,
        created_at: entry.created_at,
        // The stamp the sweeper actually ages an object by: a `move` bumps this one and leaves
        // `created_at` at the moment the wizard staged the file.
        updated_at: entry.updated_at,
      }))
    )

    if (data.length < LIST_PAGE_SIZE) return entries
  }
}
