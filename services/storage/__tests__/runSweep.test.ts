/**
 * The sweep against a Supabase client: the adapter, not the decisions.
 *
 * `sweepOrphanedBytes` is tested on its own against a literal tree. What is left here is everything
 * that could make that logic answer a question about the wrong world — a listing that stopped at one
 * page, an anti-join whose other side never arrived — and in both of those cases the only safe answer
 * is to sweep nothing and say so.
 */

import { LIST_PAGE_SIZE, runSweep } from '../runSweep'

const NOW = new Date('2026-09-15T12:00:00Z')
const OLD = new Date('2026-09-01T12:00:00Z').toISOString()

const LIVE_RECORDING = '11111111-0000-4000-8000-000000000001'
const ORPHANED_RECORDING = '22222222-0000-4000-8000-000000000002'

interface Entry {
  name: string
  id: string | null
  created_at: string | null
  updated_at: string | null
}

function object(name: string, updatedAt: string = OLD): Entry {
  return { name, id: `obj-${name}`, created_at: OLD, updated_at: updatedAt }
}

function folder(name: string): Entry {
  return { name, id: null, created_at: null, updated_at: null }
}

/**
 * A Supabase client with a `recordings` table and a bucket, both literal.
 *
 * `list` honours limit and offset the way storage-api does, so a prefix with more entries than one
 * page really does need a second call to be seen whole.
 */
function client(options: {
  recordings?: { id: string }[]
  recordingsError?: { message: string }
  tree?: Record<string, Entry[]>
  listError?: { message: string }
}) {
  const listed: { prefix: string; offset: number }[] = []
  const removed: string[] = []

  const bucket = {
    async list(prefix: string, page: { limit: number; offset: number }) {
      listed.push({ prefix, offset: page.offset })

      if (options.listError) return { data: null, error: options.listError }

      const entries = options.tree?.[prefix] ?? []

      return { data: entries.slice(page.offset, page.offset + page.limit), error: null }
    },
    async remove(paths: string[]) {
      removed.push(...paths)
      // storage-api answers with the rows it deleted, whose `name` is the full object key.
      return { data: paths.map((path) => ({ name: path })), error: null }
    },
  }

  const supabase = {
    from: jest.fn(() => ({
      select: jest.fn(async () => ({
        data: options.recordingsError ? null : (options.recordings ?? []),
        error: options.recordingsError ?? null,
      })),
    })),
    storage: { from: jest.fn(() => bucket) },
  }

  return { supabase, listed, removed }
}

/** The client type is Supabase's; a fake that answers the three calls the sweep makes is enough. */
function asClient(fake: ReturnType<typeof client>['supabase']): Parameters<typeof runSweep>[0] {
  return fake as unknown as Parameters<typeof runSweep>[0]
}

describe('runSweep', () => {
  it('reads every page of a prefix before deciding anything', async () => {
    const first = Array.from({ length: LIST_PAGE_SIZE }, (_, index) => folder(`upload-${index}`))
    const tree: Record<string, Entry[]> = {
      tmp: [folder('user-1')],
      'tmp/user-1': [...first, folder('upload-last')],
      recordings: [],
    }

    for (const upload of tree['tmp/user-1']) {
      tree[`tmp/user-1/${upload.name}`] = [object('08-22-26-glr.csv')]
    }

    const fake = client({ tree })
    const report = await runSweep(asClient(fake.supabase), NOW)

    // The upload past the page boundary is the one a single unpaginated call would have missed, and
    // missing it means an orphan that is never collected and never reported.
    expect(fake.removed).toContain('tmp/user-1/upload-last/08-22-26-glr.csv')
    expect(report.removed).toHaveLength(LIST_PAGE_SIZE + 1)
    expect(fake.listed).toContainEqual({ prefix: 'tmp/user-1', offset: LIST_PAGE_SIZE })
  })

  it('keeps the objects of every recording the table knows about', async () => {
    const fake = client({
      recordings: [{ id: LIVE_RECORDING }],
      tree: {
        tmp: [],
        recordings: [folder(LIVE_RECORDING), folder(ORPHANED_RECORDING)],
        [`recordings/${ORPHANED_RECORDING}`]: [object('08-22-26-glr.csv')],
      },
    })

    const report = await runSweep(asClient(fake.supabase), NOW)

    expect(fake.supabase.from).toHaveBeenCalledWith('recordings')
    expect(fake.removed).toEqual([`recordings/${ORPHANED_RECORDING}/08-22-26-glr.csv`])
    expect(report.kept).toContainEqual({
      path: `recordings/${LIVE_RECORDING}/`,
      reason: 'recording-exists',
      age_seconds: null,
    })
  })

  it('carries the stamp a move bumps, so bytes that just landed are not swept', async () => {
    const justMoved = new Date(NOW.getTime() - 2 * 60 * 1000).toISOString()
    const fake = client({
      recordings: [],
      tree: {
        tmp: [],
        recordings: [folder(ORPHANED_RECORDING)],
        // Staged on 09-01 and moved into place two minutes ago: `created_at` says a fortnight,
        // `updated_at` says two minutes, and only one of those is the age of the bytes at this path.
        [`recordings/${ORPHANED_RECORDING}`]: [object('08-22-26-glr.csv', justMoved)],
      },
    })

    const report = await runSweep(asClient(fake.supabase), NOW)

    // The row is one RPC behind the bytes. Sweeping here is the sweeper causing the very state the
    // ordering in ADR 0013 exists to prevent, so the stamp has to survive the trip through the adapter.
    expect(fake.removed).toEqual([])
    expect(report.kept).toContainEqual({
      path: `recordings/${ORPHANED_RECORDING}/08-22-26-glr.csv`,
      reason: 'too-recent',
      age_seconds: 120,
    })
  })

  it('sweeps nothing when it cannot read the recordings it must not delete', async () => {
    const fake = client({
      recordingsError: { message: 'permission denied for table recordings' },
      tree: {
        tmp: [],
        recordings: [folder(LIVE_RECORDING)],
        [`recordings/${LIVE_RECORDING}`]: [object('08-22-26-glr.csv')],
      },
    })

    // Without the table there is no anti-join, only a bucket in which everything looks orphaned —
    // which is how a sweeper deletes the archive. It refuses instead.
    await expect(runSweep(asClient(fake.supabase), NOW)).rejects.toThrow(/recordings/)
    expect(fake.removed).toEqual([])
  })

  it('sweeps nothing when a prefix cannot be listed', async () => {
    const fake = client({
      recordings: [{ id: LIVE_RECORDING }],
      listError: { message: 'bucket unavailable' },
    })

    // An unlistable prefix is not an empty one. Reporting "nothing to remove" would be a lie that
    // reads exactly like a clean bucket.
    await expect(runSweep(asClient(fake.supabase), NOW)).rejects.toThrow(/bucket unavailable/)
    expect(fake.removed).toEqual([])
  })
})
