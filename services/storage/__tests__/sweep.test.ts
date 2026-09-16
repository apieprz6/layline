/**
 * The sweeper, against a fake bucket.
 *
 * ADR 0013 trades an orphaned object for a broken row on every write path in the archive, which makes
 * this the thing that keeps the trade tidy rather than merely safe. It has three jobs — abandoned
 * `tmp/` uploads, `recordings/` prefixes a failed commit left behind, and objects a failed delete left
 * behind — and one rule that outranks all three: **never remove an object whose `recordings` row
 * exists.**
 *
 * The two halves of that rule are separate tests, because they fail separately. An object whose row
 * exists must survive; an object whose row does not exist *yet* must also survive, because the bytes
 * move before the transaction commits and a sweep landing in that gap would manufacture exactly the
 * row-with-no-bytes state the ADR exists to avoid.
 */

import { RECORDING_GRACE_SECONDS, sweepOrphanedBytes, TMP_GRACE_SECONDS } from '../sweep'
import type { StorageEntry, SweepStorage } from '../sweep'

const NOW = new Date('2026-09-15T12:00:00Z')

const LIVE_RECORDING = '11111111-0000-4000-8000-000000000001'
const ORPHANED_RECORDING = '22222222-0000-4000-8000-000000000002'

/** A moment, as Storage stamps one. */
function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString()
}

/** An object as Storage lists one: an id, and two stamps it can be dated by. */
function object(name: string, agoSeconds: number): StorageEntry {
  return { name, id: `obj-${name}`, created_at: ago(agoSeconds), updated_at: ago(agoSeconds) }
}

/** A folder as Storage lists one: no id and no stamps, because it is only a prefix. */
function folder(name: string): StorageEntry {
  return { name, id: null, created_at: null, updated_at: null }
}

/**
 * A bucket that answers from a literal map of prefix to entries.
 *
 * `remove` records what it was asked for and, by default, removes all of it. A prefix that is not in
 * the map answers empty, which is what Storage does.
 */
function bucket(tree: Record<string, StorageEntry[]>): SweepStorage & {
  listed: string[]
  removed: string[]
} {
  const listed: string[] = []
  const removed: string[] = []

  return {
    listed,
    removed,
    async list(prefix: string): Promise<StorageEntry[]> {
      listed.push(prefix)
      return tree[prefix] ?? []
    },
    async remove(paths: string[]): Promise<string[]> {
      removed.push(...paths)
      return paths
    },
  }
}

describe('sweepOrphanedBytes', () => {
  it('removes an abandoned tmp/ upload, and says which one it was', async () => {
    const storage = bucket({
      'tmp/': [folder('user-1')],
      'tmp/user-1': [folder('upload-1')],
      'tmp/user-1/upload-1': [object('08-22-26-glr.csv', 3 * TMP_GRACE_SECONDS)],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set([LIVE_RECORDING]),
      now: NOW,
    })

    expect(storage.removed).toEqual(['tmp/user-1/upload-1/08-22-26-glr.csv'])
    expect(report.removed).toEqual([
      {
        path: 'tmp/user-1/upload-1/08-22-26-glr.csv',
        reason: 'abandoned-upload',
        age_seconds: 3 * TMP_GRACE_SECONDS,
      },
    ])
    expect(report.failed).toEqual([])
  })

  it('leaves an upload that is still in progress alone', async () => {
    const storage = bucket({
      'tmp/': [folder('user-1')],
      'tmp/user-1': [folder('upload-1')],
      // A wizard the sailor is looking at right now: charted, window not yet set, nothing written.
      'tmp/user-1/upload-1': [object('08-22-26-glr.csv', 90)],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set<string>(),
      now: NOW,
    })

    expect(storage.removed).toEqual([])
    expect(report.kept).toEqual([
      { path: 'tmp/user-1/upload-1/08-22-26-glr.csv', reason: 'too-recent', age_seconds: 90 },
    ])
  })

  it('removes a recordings/ prefix no row points at', async () => {
    const storage = bucket({
      'recordings/': [folder(ORPHANED_RECORDING)],
      // A commit that failed after the bytes moved, or a delete that failed after the commit. Both
      // look exactly like this, and both are answered the same way.
      [`recordings/${ORPHANED_RECORDING}`]: [
        object('08-22-26-glr.csv', 2 * RECORDING_GRACE_SECONDS),
      ],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set([LIVE_RECORDING]),
      now: NOW,
    })

    expect(storage.removed).toEqual([`recordings/${ORPHANED_RECORDING}/08-22-26-glr.csv`])
    expect(report.removed[0].reason).toBe('no-recording-row')
  })

  it('never touches an object whose recordings row exists, and does not even list it', async () => {
    const storage = bucket({
      'recordings/': [folder(LIVE_RECORDING)],
      [`recordings/${LIVE_RECORDING}`]: [object('08-22-26-glr.csv', 4_000_000)],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set([LIVE_RECORDING]),
      now: NOW,
    })

    expect(storage.removed).toEqual([])
    // The row is the whole answer, so the prefix is never opened — the anti-join is on the id in the
    // path and needs nothing else.
    expect(storage.listed).not.toContain(`recordings/${LIVE_RECORDING}`)
    expect(report.kept).toEqual([
      { path: `recordings/${LIVE_RECORDING}/`, reason: 'recording-exists', age_seconds: null },
    ])
  })

  it('leaves a recordings/ prefix alone while its transaction could still be committing', async () => {
    const storage = bucket({
      'recordings/': [folder(ORPHANED_RECORDING)],
      // The upload moves the bytes and *then* commits (ADR 0013), so for the length of one RPC there
      // is a prefix with no row. Sweeping it would produce the row-with-no-bytes state the whole
      // ordering exists to prevent.
      [`recordings/${ORPHANED_RECORDING}`]: [object('08-22-26-glr.csv', 5)],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set<string>(),
      now: NOW,
    })

    expect(storage.removed).toEqual([])
    expect(report.kept).toEqual([
      {
        path: `recordings/${ORPHANED_RECORDING}/08-22-26-glr.csv`,
        reason: 'too-recent',
        age_seconds: 5,
      },
    ])
  })

  it('dates an object from the moment it landed, not the moment it was staged', async () => {
    // Submit does not re-upload to the permanent path, it moves — and a move keeps the row the object
    // had under `tmp/`: same id, same `created_at`, `updated_at` bumped to the move. Verified against
    // the local stack; see docs/testing/race-delete-cascade.md.
    //
    // So a wizard staged at 18:00 and submitted at 18:20 lands under `recordings/` already twenty
    // minutes old by `created_at`, past the window, one instant before its row exists. Age has to be
    // the time since the bytes arrived *here*.
    const storage = bucket({
      'recordings/': [folder(ORPHANED_RECORDING)],
      [`recordings/${ORPHANED_RECORDING}`]: [
        {
          name: '08-22-26-glr.csv',
          id: 'obj-moved',
          created_at: ago(20 * 60),
          updated_at: ago(5),
        },
      ],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set<string>(),
      now: NOW,
    })

    expect(storage.removed).toEqual([])
    expect(report.kept).toEqual([
      {
        path: `recordings/${ORPHANED_RECORDING}/08-22-26-glr.csv`,
        reason: 'too-recent',
        age_seconds: 5,
      },
    ])
  })

  it('reads the recordings table after it has listed the bucket, never before', async () => {
    // The two reads cannot be one instant, so one of them has to be stale, and this is which. Read the
    // table last and a commit landing between the two reads is a row the sweep knows about, so its
    // bytes are kept. Read it first and that same commit is a row the sweep has never heard of, whose
    // bytes are already in the listing.
    const trace: string[] = []
    const inner = bucket({
      'tmp/': [],
      'recordings/': [folder(ORPHANED_RECORDING)],
      [`recordings/${ORPHANED_RECORDING}`]: [object('08-22-26-glr.csv', 900_000)],
    })
    const storage: SweepStorage = {
      async list(prefix: string) {
        trace.push(`list ${prefix}`)
        return inner.list(prefix)
      },
      async remove(paths: string[]) {
        trace.push('remove')
        return inner.remove(paths)
      },
    }

    await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => {
        trace.push('read recordings')
        return new Set<string>()
      },
      now: NOW,
    })

    expect(trace.indexOf('read recordings')).toBeGreaterThan(trace.indexOf('list recordings/'))
    expect(trace.indexOf('read recordings')).toBeLessThan(trace.indexOf('remove'))
    // Read once, so the whole sweep judges against one answer.
    expect(trace.filter((step) => step === 'read recordings')).toHaveLength(1)
  })

  it('keeps an object it cannot date', async () => {
    const storage = bucket({
      'recordings/': [folder(ORPHANED_RECORDING)],
      [`recordings/${ORPHANED_RECORDING}`]: [
        { name: '08-22-26-glr.csv', id: 'obj-undated', created_at: null, updated_at: null },
      ],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set<string>(),
      now: NOW,
    })

    // No age means the grace window cannot be applied, and an object that might be seconds old is
    // one this must not remove.
    expect(storage.removed).toEqual([])
    expect(report.kept[0].reason).toBe('undatable')
  })

  it('looks under tmp/ and recordings/ and nowhere else', async () => {
    const storage = bucket({
      'tmp/': [],
      'recordings/': [],
      // Boat Setup Versions are not this sweeper's business: they are referenced by
      // boat_setup_versions, which it knows nothing about, and a Version is never deleted.
      'boat-setup/': [folder('polar')],
    })

    await sweepOrphanedBytes({ storage, readRecordingIds: async () => new Set<string>(), now: NOW })

    expect(storage.listed).toEqual(['tmp/', 'recordings/'])
    expect(storage.removed).toEqual([])
  })

  it('reports an object Storage would not remove', async () => {
    const storage = bucket({
      'recordings/': [folder(ORPHANED_RECORDING)],
      [`recordings/${ORPHANED_RECORDING}`]: [object('08-22-26-glr.csv', 900_000)],
    })
    storage.remove = async () => []

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set<string>(),
      now: NOW,
    })

    // Asked for and not removed. Reported rather than counted as swept: the next run will find it
    // again, and a report that claimed it was gone would be the one thing worse than the orphan.
    expect(report.removed).toEqual([])
    expect(report.failed).toEqual([`recordings/${ORPHANED_RECORDING}/08-22-26-glr.csv`])
  })

  it('leaves a file it does not recognise the shape of where it is', async () => {
    const storage = bucket({
      // A file directly under the prefix, where the convention says there is a folder. Nothing in
      // Layline writes this, which is exactly why it is not deleted.
      'recordings/': [object('stray.csv', 900_000)],
      'tmp/': [object('stray.csv', 900_000)],
    })

    const report = await sweepOrphanedBytes({
      storage,
      readRecordingIds: async () => new Set<string>(),
      now: NOW,
    })

    expect(storage.removed).toEqual([])
    expect(report.kept.map((entry) => entry.reason)).toEqual(['unrecognised', 'unrecognised'])
  })
})
