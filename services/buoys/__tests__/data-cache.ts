/**
 * A stateful stand-in for Next's Data Cache, so the buoy suites can assert what a
 * second read actually does — hit, stale serve, retry — rather than which options
 * `unstable_cache` was handed.
 *
 * Modelled on `next/dist/server/web/spec-extension/unstable-cache.js`:
 *
 * - Keyed the way Next keys it: the wrapper's key parts plus the serialized call
 *   arguments, so `loadNDBCHistory('CHII2')` and `('45198')` are separate entries.
 * - Inside `revalidate`, the stored value is returned and the source is untouched.
 * - Past it, **the stored value is still returned** and the refresh runs behind the
 *   caller. This is the dynamic-render and route-handler path, which is every one
 *   of ours except an ISR regeneration; Next blocks for fresh data only during
 *   static generation. Reading it as a hard expiry would certify a freshness bound
 *   production does not provide.
 * - A refresh that throws leaves the stale entry in place, exactly as Next's
 *   `.catch` does.
 * - A callback that throws with nothing stored writes nothing, so a failed read is
 *   retried on the next call.
 *
 * One simplification: entries live in this process only. That is what the real
 * cache is *not*, and the point of the change under test — but a single Jest
 * process can't observe cross-instance sharing either way.
 */

type CacheEntry = { value: unknown; storedAt: number }

const entries = new Map<string, CacheEntry>()
const refreshing = new Map<string, Promise<unknown>>()

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

    if (entry) {
      if (Date.now() - entry.storedAt >= ttlMs && !refreshing.has(key)) {
        refreshing.set(
          key,
          callback(...args)
            .then((fresh) => entries.set(key, { value: fresh, storedAt: Date.now() }))
            .catch(() => {
              // Stale entry stands; the next read triggers another attempt.
            })
            .finally(() => refreshing.delete(key))
        )
      }

      return entry.value as Result
    }

    const value = await callback(...args)
    entries.set(key, { value, storedAt: Date.now() })
    return value
  }
}

/**
 * Wait for refreshes kicked off behind a stale serve. Nothing in the app awaits
 * these — that is the point of a background revalidation — so a test that wants to
 * see the refreshed entry has to.
 */
export async function flushRefreshes(): Promise<void> {
  while (refreshing.size > 0) {
    await Promise.all([...refreshing.values()])
  }
}

/** Empty the cache between tests — the equivalent of a cold deployment. */
export function clearDataCache(): void {
  entries.clear()
  refreshing.clear()
}
