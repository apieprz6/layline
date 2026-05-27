# ADR 0003: Unified Weather Model Fetch with Cache Abstraction

**Status:** Accepted  
**Date:** 2026-05-26  
**Deciders:** Architecture review following LAY-36 completion  
**Related:** LAY-36 (Multi-Model Weather Forecast Integration)

## Context

The initial weather model integration (LAY-36) implemented three separate fetch functions (`fetchGFS`, `fetchHRRR`, `fetchECMWF`) that were 99% identical, differing only in the model ID string. This created several friction points:

1. **Duplication:** 200+ lines of repeated cache logic, URL construction, response parsing, and error handling
2. **Maintainability:** Bug fixes required synchronized changes across three functions
3. **Testability:** Test suites were triplicated (750 lines, 41 tests × 3 models)
4. **Extensibility:** Adding new models (NAM, HRDPS) would require copy-pasting 80+ lines
5. **Cache coupling:** Global module-scoped `Map` prevented cache strategy swapping
6. **Error inconsistency:** Coordinate validation threw exceptions while API errors returned result objects

## Decision

We will:

1. **Extract unified `fetchWeatherModel(modelId, location)` function** that parameterizes all model-specific behavior via `MODEL_CONFIGS`. The three public exports become thin wrappers for backward compatibility.

2. **Create cache abstraction layer** with `WeatherModelCache` interface and `InMemoryWeatherCache` implementation. Future Redis/Vercel KV implementations can be swapped via `setCacheAdapter()` without touching fetch logic.

3. **Align error handling** by removing thrown exceptions. All error modes (validation, network, API) return `WeatherModelResult` with `status: 'error'` and optional `error` field, matching the buoy service pattern.

4. **Move API names to config** by extending `ModelConfig` with `openMeteoApiName` field, eliminating hardcoded `MODEL_API_NAMES` mapping in service layer.

5. **Parameterize tests** using `describe.each()` with model scenarios, reducing test duplication from 750 lines to ~400 lines while maintaining coverage.

6. **Add query parameters to routes** (`lat`, `lon`, `name`) to support multi-location forecasts without new endpoints.

## Consequences

### Positive

- **Locality:** Cache bugs, staleness logic, error handling all fixed in one place
- **Leverage:** Adding NAM/HRDPS is one config entry + one-line wrapper, not 80 lines of duplication
- **Tests:** Core fetch logic tested once with parameterized scenarios; adding models extends test matrix automatically
- **Cache flexibility:** Can swap to Redis/Vercel KV for multi-instance deployments without refactoring fetch logic
- **Consistent errors:** All error modes return result objects; callers use uniform error handling
- **Multi-location:** Routes support arbitrary coordinates via query params

### Negative

- **Breaking change (internal):** Tests that expected thrown exceptions now expect error results (fixed in same commit)
- **Indirection:** Three-function interface (`fetchGFS/HRRR/ECMWF`) now wraps one core function (acceptable tradeoff for DRY)
- **Cache adapter complexity:** Adds abstraction layer for a feature (Redis) we don't need yet (but architecture pays for itself in testability)

### Neutral

- **Backward compatibility:** Public exports (`fetchGFS`, etc.) remain unchanged for API consumers
- **Type system:** Added `status` and `error` fields to `WeatherModelResult` (aligns with `BuoyDataResult` pattern)

## Implementation Notes

### Before (duplication)

```typescript
// Three 80-line functions differing only in modelId
export async function fetchGFS(location) {
  const modelId = 'gfs'
  const apiName = MODEL_API_NAMES[modelId]
  // ... 75 lines of cache/fetch/parse logic ...
}
export async function fetchHRRR(location) { /* copy-paste */ }
export async function fetchECMWF(location) { /* copy-paste */ }
```

### After (unified)

```typescript
// One parameterized function
async function fetchWeatherModel(modelId: ModelId, location: ForecastLocation) {
  const config = getModelConfig(modelId)
  const cache = getCacheAdapter()
  // ... unified logic using config.openMeteoApiName, etc. ...
}

// Thin wrappers for backward compatibility
export async function fetchGFS(location) {
  return fetchWeatherModel('gfs', location)
}
```

### Cache abstraction

```typescript
interface WeatherModelCache {
  get(key: string): WeatherModelCacheEntry | undefined
  set(key: string, value: WeatherModelCacheEntry): void
  clear(): void
}

class InMemoryWeatherCache implements WeatherModelCache { /* ... */ }

// Swappable adapter
let cacheAdapter: WeatherModelCache = new InMemoryWeatherCache()
export function setCacheAdapter(adapter: WeatherModelCache) { /* ... */ }
```

## Alternatives Considered

1. **Keep duplication, extract helper functions** — Rejected because coordination logic (staleness → expiration → cache TTL) would still be duplicated across three functions

2. **Single route with `?model=gfs` query param** — Rejected because independent routes support progressive loading in UI (fetch models in parallel and display as they arrive)

3. **Global cache singleton without abstraction** — Rejected because it prevents testing with mock caches and locks us into in-memory strategy

## Related Decisions

- **ADR-0002 (In-memory cache for buoy data):** Weather model cache follows same pattern but adds abstraction layer for future extensibility
- **Future ADR:** If we adopt Redis/Vercel KV, create ADR documenting cache strategy selection (in-memory vs distributed)

## References

- PRD: LAY-36 (Multi-Model Weather Forecast Integration)
- Completed issues: LAY-37, LAY-38, LAY-39, LAY-40, LAY-41
- Code: `services/weather/open-meteo.ts`, `services/weather/cache.ts`
- Tests: `services/weather/__tests__/open-meteo.test.ts` (41 tests, all passing)
