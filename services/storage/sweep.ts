/**
 * The sweeper: the second half of ADR 0013.
 *
 * Every write path in the archive is ordered so that a crash leaves bytes nothing points at, never a
 * row pointing at bytes nobody kept — the upload moves the object and *then* commits, the delete
 * commits and *then* removes the object. That choice is only tolerable because something eventually
 * collects what the crashes leave behind. This is that something.
 *
 * Three cases, one mechanism. An abandoned wizard leaves `tmp/{user}/{upload}/…`; a commit that failed
 * after the move leaves `recordings/{id}/…` with no row; a delete that failed after the commit leaves
 * exactly the same thing. So there are two prefixes to walk and one question to ask — does a
 * `recordings` row exist for this id — and the last two cases collapse into a single answer.
 *
 * The rule that outranks everything: **an object whose `recordings` row exists is never removed.** The
 * sweeper only ever deletes what the database says nothing about, which is why it is safe to run at any
 * moment and why the anti-join is on the id in the path rather than on anything it reads from Storage.
 *
 * Two things make that rule hold against a sweep and an upload running at the same time.
 *
 * The table is read **after** the bucket is listed. The two reads cannot be one instant, so one of them
 * is stale, and this is the choice of which: a commit landing between them is a row the sweep knows
 * about and bytes it decides to keep. Read the other way round, the same commit is a row the sweep has
 * never heard of, whose bytes are already sitting in the listing.
 *
 * And an object younger than its grace window is left where it is, whatever the table said, because the
 * bytes exist before the row does. The age is the time since the bytes arrived at *this* path, which is
 * `updated_at`: submit moves the object rather than re-uploading it, so its `created_at` is still the
 * moment the wizard staged it, possibly hours before the race was written.
 */

import { RECORDINGS_PREFIX, TMP_PREFIX } from '@/lib/storage/paths'

/** An entry as Storage lists one. A folder has no `id` and no stamps — it is only a prefix. */
export interface StorageEntry {
  name: string
  id: string | null
  created_at: string | null
  /** When the object last changed at this path. A `move` bumps this and keeps `created_at`. */
  updated_at: string | null
}

/**
 * The bucket, narrowed to the two operations a sweep needs.
 *
 * A port rather than the Supabase client: `list` here is non-recursive and already paginated, and
 * `remove` answers with the paths it actually removed. Both differences live in the adapter, so the
 * decisions above are testable against a literal tree.
 */
export interface SweepStorage {
  /** The entries directly inside one prefix — folders and objects, every page of them. */
  list(prefix: string): Promise<StorageEntry[]>
  /** Removes objects by full path, answering with the paths that are actually gone. */
  remove(paths: string[]): Promise<string[]>
}

export interface SweepInput {
  storage: SweepStorage
  /**
   * Every `recordings.id` that exists: the other side of the anti-join.
   *
   * A function rather than a value because *when* it is read is part of the answer — the sweep calls
   * it once, after the bucket has been listed. See the ordering note above.
   */
  readRecordingIds(): Promise<Set<string>>
  /** Now, so the grace window is the caller's decision rather than the clock's. */
  now: Date
}

/** Why an object went. */
export type SweptReason = 'abandoned-upload' | 'no-recording-row'

/** Why an object stayed. Each of these is a case where removing it would be the wrong answer. */
export type KeptReason = 'recording-exists' | 'too-recent' | 'undatable' | 'unrecognised'

export interface SweptObject {
  path: string
  reason: SweptReason
  age_seconds: number
}

export interface KeptObject {
  path: string
  reason: KeptReason
  /** Null when there was nothing to measure: a live prefix, or an object Storage would not date. */
  age_seconds: number | null
}

export interface SweepReport {
  removed: SweptObject[]
  /** Everything the sweep looked at and left, with the reason. What makes the rule observable. */
  kept: KeptObject[]
  /** Asked for and still there. Reported rather than counted as swept; the next run tries again. */
  failed: string[]
  grace: { tmp_seconds: number; recording_seconds: number }
}

/**
 * How long an unsubmitted upload is left alone: a wizard opened before dinner and finished after it.
 * Nothing depends on `tmp/` being tidy, so this is generous on purpose.
 */
export const TMP_GRACE_SECONDS = 24 * 60 * 60

/**
 * How long a row-less `recordings/` prefix is left alone.
 *
 * The gap this covers is one RPC wide — the move has landed and the commit has not yet — so a minute
 * would do. Fifteen is chosen because being early here is the one failure the sweeper could cause on
 * its own: removing the bytes of a race that is mid-commit manufactures the row-with-no-bytes state
 * the whole ordering exists to prevent. Being late costs nothing but bucket space.
 */
export const RECORDING_GRACE_SECONDS = 15 * 60

const TMP_ROOT = `${TMP_PREFIX}/`
const RECORDINGS_ROOT = `${RECORDINGS_PREFIX}/`

/** Where a verdict lands: what stayed and why, and what is queued to go. */
interface SweepLedger {
  kept: KeptObject[]
  candidates: SweptObject[]
}

/**
 * Sweeps the bucket and reports what happened.
 *
 * Reads before it writes: everything is decided from the listing, and the removals go out in one
 * batch, so a run cannot see the consequences of its own deletions.
 */
export async function sweepOrphanedBytes({
  storage,
  now,
  readRecordingIds,
}: SweepInput): Promise<SweepReport> {
  const ledger: SweepLedger = { kept: [], candidates: [] }

  // `boat-setup/` is not walked at all. Those objects belong to Boat Setup Versions, which this knows
  // nothing about and which are never deleted — so there is no orphan to find and no risk worth taking.
  await sweepTmp(storage, now, ledger)
  // Where the `recordings` read happens, and it happens in there so that it happens after the listing.
  await sweepRecordings(storage, now, ledger, readRecordingIds)

  const { removed, failed } = await removeAll(storage, ledger.candidates)

  return {
    removed,
    kept: ledger.kept,
    failed,
    grace: { tmp_seconds: TMP_GRACE_SECONDS, recording_seconds: RECORDING_GRACE_SECONDS },
  }
}

/**
 * `tmp/{user}/{upload}/{filename}`: two levels of folder and then the bytes.
 *
 * No database question to ask here — an object under `tmp/` is by definition one no row has ever
 * pointed at, since submit moves it out of `tmp/` before the transaction runs. Age is the whole test,
 * which is why this half of the sweep is handed no ids to join against.
 */
async function sweepTmp(storage: SweepStorage, now: Date, ledger: SweepLedger): Promise<void> {
  for (const user of await storage.list(TMP_ROOT)) {
    if (!isFolder(user)) {
      ledger.kept.push({
        path: `${TMP_ROOT}${user.name}`,
        reason: 'unrecognised',
        age_seconds: null,
      })
      continue
    }

    for (const upload of await storage.list(`${TMP_ROOT}${user.name}`)) {
      if (!isFolder(upload)) {
        ledger.kept.push({
          path: `${TMP_ROOT}${user.name}/${upload.name}`,
          reason: 'unrecognised',
          age_seconds: null,
        })
        continue
      }

      const prefix = `${TMP_ROOT}${user.name}/${upload.name}`

      for (const entry of await storage.list(prefix)) {
        recordVerdict(
          entry,
          { prefix, graceSeconds: TMP_GRACE_SECONDS, reason: 'abandoned-upload' },
          now,
          ledger
        )
      }
    }
  }
}

/**
 * `recordings/{id}/{filename}`: one folder per Recording, and the folder's name is the question.
 *
 * If the id is in `recordingIds` the prefix is live and the loop moves on without opening it — the row
 * is the whole answer, so there is nothing inside worth listing. If it is not, the bytes are either a
 * commit that failed after the move or a delete that failed after the commit, and the grace window is
 * what separates those two from a commit still in progress.
 *
 * The listing comes first and the table second, deliberately: one of the two reads has to be the stale
 * one, and a sweep that knows about too many rows keeps too much, while a sweep that knows about too
 * few deletes a race.
 */
async function sweepRecordings(
  storage: SweepStorage,
  now: Date,
  ledger: SweepLedger,
  readRecordingIds: () => Promise<Set<string>>
): Promise<void> {
  const prefixes = await storage.list(RECORDINGS_ROOT)
  const recordingIds = await readRecordingIds()

  for (const recording of prefixes) {
    const prefix = `${RECORDINGS_ROOT}${recording.name}`

    if (!isFolder(recording)) {
      ledger.kept.push({ path: prefix, reason: 'unrecognised', age_seconds: null })
      continue
    }

    if (recordingIds.has(recording.name)) {
      // The trailing slash says this is the prefix and not an object: nothing under it was listed.
      ledger.kept.push({ path: `${prefix}/`, reason: 'recording-exists', age_seconds: null })
      continue
    }

    for (const entry of await storage.list(prefix)) {
      recordVerdict(
        entry,
        { prefix, graceSeconds: RECORDING_GRACE_SECONDS, reason: 'no-recording-row' },
        now,
        ledger
      )
    }
  }
}

/**
 * One object, one verdict, written into the ledger: old enough to go, or a reason it stayed.
 *
 * An object Storage will not date is kept. There is no defensible way to apply a grace window without
 * an age, and "it might be seconds old" is the case that matters.
 */
function recordVerdict(
  entry: StorageEntry,
  against: { prefix: string; graceSeconds: number; reason: SweptReason },
  now: Date,
  ledger: SweepLedger
): void {
  const path = `${against.prefix}/${entry.name}`

  if (isFolder(entry)) {
    // A folder where the convention says a file. Nothing in Layline writes one, so it is left.
    ledger.kept.push({ path, reason: 'unrecognised', age_seconds: null })
    return
  }

  const age = ageSeconds(entry, now)

  if (age === null) {
    ledger.kept.push({ path, reason: 'undatable', age_seconds: null })
    return
  }

  if (age < against.graceSeconds) {
    ledger.kept.push({ path, reason: 'too-recent', age_seconds: age })
    return
  }

  ledger.candidates.push({ path, reason: against.reason, age_seconds: age })
}

/** Storage marks a folder by giving it no id of its own. */
function isFolder(entry: StorageEntry): boolean {
  return entry.id === null
}

/**
 * How long the bytes have been at *this* path: the later of the two stamps Storage gives.
 *
 * `updated_at` is the one that answers the question — a `move` bumps it and leaves `created_at` at the
 * moment the wizard staged the file, hours earlier — but taking the later of the two is the reading
 * that cannot go wrong. It can only make an object look younger, and looking younger only ever means
 * keeping it.
 *
 * Null when Storage gave neither stamp, or gave nothing that parses.
 */
function ageSeconds(entry: StorageEntry, now: Date): number | null {
  const stamped = [entry.updated_at, entry.created_at]
    .map((stamp) => (stamp === null ? NaN : Date.parse(stamp)))
    .filter((milliseconds) => !Number.isNaN(milliseconds))

  if (stamped.length === 0) return null

  return Math.round((now.getTime() - Math.max(...stamped)) / 1000)
}

/**
 * Removes every candidate and sorts them into gone and still-there.
 *
 * One call, because the decisions are already made and a per-object round trip would only make a long
 * sweep longer. What Storage does not confirm is reported as failed rather than assumed removed.
 */
async function removeAll(
  storage: SweepStorage,
  candidates: SweptObject[]
): Promise<{ removed: SweptObject[]; failed: string[] }> {
  if (candidates.length === 0) return { removed: [], failed: [] }

  const gone = new Set(await storage.remove(candidates.map((candidate) => candidate.path)))

  return {
    removed: candidates.filter((candidate) => gone.has(candidate.path)),
    failed: candidates
      .filter((candidate) => !gone.has(candidate.path))
      .map((candidate) => candidate.path),
  }
}
