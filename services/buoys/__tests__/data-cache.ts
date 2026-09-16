/**
 * A stateful stand-in for Next's Data Cache, so the buoy suites can assert what
 * a second read actually does — hit or miss — rather than which options
 * `unstable_cache` was handed.
 *
 * Keyed the way Next keys it: the wrapper's key parts plus the serialized call
 * arguments, so `loadNDBCHistory('CHII2')` and `loadNDBCHistory('45198')` are
 * separate entries. `revalidate` is honoured against the current clock, which
 * lets a test advance past the freshness window and see the source hit again.
 *
 * Two simplifications, both harmless here: entries live in this process only,
 * and expiry is a hard miss rather than the real cache's serve-stale-then-
 * revalidate. Either way the question a test asks — was the source read
 * again? — gets the same answer.
 *
 * Like the real thing, a callback that throws writes nothing, so a failed read
 * is retried on the next call.
 */

type CacheEntry = { value: unknown; storedAt: number }

const entries = new Map<string, CacheEntry>()

export function unstable_cache<Args extends unknown[], Result>(
  callback: (...args: Args) => Promise<Result>,
  keyParts: string[] = [],
  options: { revalidate?: number | false } = {}
): (...args: Args) => Promise<Result> {
  const ttlMs =
    typeof options.revalidate === 'number' ? options.revalidate * 1000 : Infinity

  return async (...args: Args): Promise<Result> => {
    const key = JSON.stringify([keyParts, args])
    const entry = entries.get(key)

    if (entry && Date.now() - entry.storedAt < ttlMs) {
      return entry.value as Result
    }

    const value = await callback(...args)
    entries.set(key, { value, storedAt: Date.now() })
    return value
  }
}

/** Empty the cache between tests — the equivalent of a cold deployment. */
export function clearDataCache(): void {
  entries.clear()
}
