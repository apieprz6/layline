/**
 * Weather model cache abstraction
 * Provides interface for swappable cache strategies (in-memory, Redis, Vercel KV)
 */

import type { WeatherModelCacheEntry } from '@/types'

/**
 * Cache interface for weather model forecasts
 * Implementations can use different storage backends
 */
export interface WeatherModelCache {
  /**
   * Retrieve cached forecast data
   * @param key - Cache key (typically modelId:lat:lon)
   * @returns Cached entry or undefined if not found/expired
   */
  get(key: string): WeatherModelCacheEntry | undefined

  /**
   * Store forecast data in cache
   * @param key - Cache key
   * @param value - Cache entry with data and expiration
   */
  set(key: string, value: WeatherModelCacheEntry): void

  /**
   * Clear all cached data
   * Primarily used for testing
   */
  clear(): void
}

/**
 * In-memory cache implementation
 * Simple Map-based storage suitable for single-instance deployments
 */
export class InMemoryWeatherCache implements WeatherModelCache {
  private cache: Map<string, WeatherModelCacheEntry> = new Map()

  get(key: string): WeatherModelCacheEntry | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check if entry has expired
    const now = Date.now()
    if (now >= entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }

    return entry
  }

  set(key: string, value: WeatherModelCacheEntry): void {
    this.cache.set(key, value)
  }

  clear(): void {
    this.cache.clear()
  }
}

/**
 * Default cache instance
 * Can be replaced with alternative implementations via setCacheAdapter()
 */
let cacheAdapter: WeatherModelCache = new InMemoryWeatherCache()

/**
 * Get the current cache adapter
 */
export function getCacheAdapter(): WeatherModelCache {
  return cacheAdapter
}

/**
 * Set a custom cache adapter
 * Useful for testing or switching to Redis/Vercel KV
 */
export function setCacheAdapter(adapter: WeatherModelCache): void {
  cacheAdapter = adapter
}
